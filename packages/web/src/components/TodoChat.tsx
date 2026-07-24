import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Send, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { ApiError, api } from '../api';
import { Button, inputCls } from './ui';

/** micro-USD → a short "$0.0042" style string. */
function formatMicros(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(4)}`;
}

/**
 * The opening turn behind the suggest button. Sent as an ordinary user message
 * so it reuses the same billing, persistence and rate limiting as anything the
 * user types — the todo's own fields are already standing context server-side,
 * so this doesn't need to restate the task.
 */
const SUGGEST_PROMPT =
  "How should I approach this? Give me the concrete next steps, and flag anything that's likely to block me.";

/**
 * Per-todo AI assistant. The todo's own fields are sent as context server-side,
 * so the user can ask "what's blocking this?" without restating anything.
 */
export default function TodoChat({ todoId }: { todoId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Arriving from a row's sparkle affordance (/t/:id#assistant): React Router
  // does not scroll to a hash on its own, so bring the panel into view here.
  useEffect(() => {
    if (window.location.hash === '#assistant') {
      rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [todoId]);

  const messages = useQuery({
    queryKey: ['todo-messages', todoId],
    queryFn: () => api.todoMessages(todoId),
    // 503 = the assistant isn't configured on this deployment; don't hammer it.
    retry: (count, err) => !(err instanceof ApiError && err.status === 503) && count < 2,
  });

  const send = useMutation({
    mutationFn: (content: string) => api.sendTodoMessage(todoId, content),
    onSuccess: () => {
      setDraft('');
      void qc.invalidateQueries({ queryKey: ['todo-messages', todoId] });
      void qc.invalidateQueries({ queryKey: ['usage'] });
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.data?.messages.length, send.isPending]);

  const unavailable = messages.error instanceof ApiError && messages.error.status === 503;
  if (unavailable) return null; // feature not deployed — render nothing rather than a broken panel

  const list = messages.data?.messages ?? [];
  const sendError = send.error instanceof ApiError ? send.error : null;
  // The service refuses with 400 once the allowance is gone and no card is on file.
  const outOfCredit = sendError?.status === 400 && /allowance|card|payment/i.test(sendError.message);

  return (
    <div id="assistant" ref={rootRef} className="mt-4 scroll-mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-6">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-accent-400" />
        <h2 className="text-sm font-semibold text-zinc-100">AI assistant</h2>
      </div>

      {list.length === 0 && !send.isPending && (
        <div className="mb-4">
          <p className="text-[13px] leading-relaxed text-zinc-400">
            Ask how to break this down, what's likely blocking it, or how to word the next step.
          </p>
          {/* Deliberately a click, never automatic on open: every suggestion is a
              billed model call, and browsing a todo must stay free. */}
          {!outOfCredit && (
            <Button
              type="button"
              variant="secondary"
              className="mt-3"
              disabled={send.isPending}
              onClick={() => send.mutate(SUGGEST_PROMPT)}
            >
              <Sparkles size={14} className="text-accent-400" /> Suggest how to tackle this
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {list.map((m) => (
          <div
            key={m.id}
            className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            {m.role === 'user' ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-accent-500 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
                {m.content}
              </div>
            ) : (
              // The model answers in markdown — bold, numbered steps, the odd
              // code span. Rendered rather than printed, or the user reads
              // literal ** around every emphasis.
              <div className="chat-md max-w-[85%] rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-zinc-200">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {send.isPending && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-[13.5px] text-zinc-500">
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {outOfCredit ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.08] p-4 text-[13px] text-amber-200">
          {sendError?.message}{' '}
          <Link to="/settings/billing" className="font-semibold underline">
            Manage billing
          </Link>
        </div>
      ) : (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const content = draft.trim();
            if (content && !send.isPending) send.mutate(content);
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about this task…"
            maxLength={4000}
            className={inputCls}
          />
          <Button type="submit" className="shrink-0" disabled={send.isPending || !draft.trim()}>
            <Send size={14} /> Send
          </Button>
        </form>
      )}

      {sendError && !outOfCredit && (
        <p className="mt-2 text-xs text-red-400">{sendError.message}</p>
      )}
      {send.data && (
        <p className="mt-2 text-[11px] text-zinc-400">
          {send.data.usage.inputTokens + send.data.usage.outputTokens} tokens ·{' '}
          {formatMicros(send.data.usage.priceMicros)}
          {send.data.usage.billedMicros === 0 ? ' (free allowance)' : ''}
        </p>
      )}
    </div>
  );
}
