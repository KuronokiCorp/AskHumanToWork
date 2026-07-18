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
 * Per-todo AI assistant. The todo's own fields are sent as context server-side,
 * so the user can ask "what's blocking this?" without restating anything.
 */
export default function TodoChat({ todoId }: { todoId: string }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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
    <div className="mt-4 rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-card">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles size={16} className="text-violet-500" />
        <h2 className="text-sm font-semibold">Ask about this task</h2>
      </div>

      {list.length === 0 && !send.isPending && (
        <p className="mb-4 text-[13px] leading-relaxed text-zinc-500">
          Ask how to break this down, what's likely blocking it, or how to word the next step.
        </p>
      )}

      <div className="space-y-3">
        {list.map((m) => (
          <div
            key={m.id}
            className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
          >
            {m.role === 'user' ? (
              <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-violet-600 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white">
                {m.content}
              </div>
            ) : (
              // The model answers in markdown — bold, numbered steps, the odd
              // code span. Rendered rather than printed, or the user reads
              // literal ** around every emphasis.
              <div className="chat-md max-w-[85%] rounded-2xl bg-zinc-100 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-zinc-700">
                <ReactMarkdown>{m.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {send.isPending && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-100 px-3.5 py-2.5 text-[13.5px] text-zinc-400">
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {outOfCredit ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-[13px] text-amber-800">
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
        <p className="mt-2 text-xs text-red-600">{sendError.message}</p>
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
