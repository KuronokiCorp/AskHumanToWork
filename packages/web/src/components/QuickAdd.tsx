import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Hash, Plus } from 'lucide-react';
import { api } from '../api';
import { projectAutoColor } from './ui';

/**
 * Quick-add with natural-language dates. Syntax sugar:
 *   "Send report @friday 5pm #Work !2"  → due, project, priority
 * Project names may contain spaces ("#Listen Everywhere") — the token runs
 * until the next @/#/! marker or the end of the input.
 */
function parseQuickAdd(text: string) {
  let title = text;
  let dueNatural: string | undefined;
  let repeat: string | undefined;
  let project: string | undefined;
  let priority: number | undefined;

  const at = title.match(/@([^#!]+?)(?=\s+[#!]|$)/);
  if (at?.[1]) {
    const token = at[1].trim();
    // "@every monday" → recurrence (server schedules the first occurrence)
    if (/^every\s/i.test(token)) repeat = token;
    else dueNatural = token;
    title = title.replace(at[0], ' ');
  }
  const hash = title.match(/#([^@!#]+?)(?=\s+[@!#]|$)/);
  if (hash?.[1]) {
    project = hash[1].trim();
    title = title.replace(hash[0], ' ');
  }
  const bang = title.match(/!([1-3])/);
  if (bang?.[1]) {
    priority = Number(bang[1]);
    title = title.replace(bang[0], ' ');
  }
  return { title: title.replace(/\s+/g, ' ').trim(), dueNatural, repeat, project, priority };
}

/** Due-date candidates offered when the user types "@". */
const DUE_SUGGESTIONS = [
  'today 5pm',
  'tomorrow 9am',
  'tomorrow 5pm',
  'friday 5pm',
  'next monday 9am',
  'in 3 days',
  'next week',
  'every monday',
  'every friday',
];

type Suggestion = { label: string; insert: string; color?: string };

export default function QuickAdd({ defaultProject }: { defaultProject?: string }) {
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [selIdx, setSelIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects });

  const create = useMutation({
    mutationFn: (input: Record<string, unknown>) => api.createTodo(input),
    onSuccess: () => {
      setText('');
      setError(null);
      void qc.invalidateQueries({ queryKey: ['todos'] });
      void qc.invalidateQueries({ queryKey: ['agenda'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'failed'),
  });

  // Autocomplete: does the text before the caret end in a "#…" or "@…" token?
  const upToCaret = text.slice(0, caret);
  const hashMatch = upToCaret.match(/(^|\s)#([^@!#]*)$/);
  const atMatch = hashMatch ? null : upToCaret.match(/(^|\s)@([^@!#]*)$/);
  const trigger = hashMatch
    ? { kind: 'project' as const, query: hashMatch[2] ?? '' }
    : atMatch
      ? { kind: 'due' as const, query: atMatch[2] ?? '' }
      : null;
  const tokenStart = trigger ? upToCaret.length - trigger.query.length : 0;

  const suggestions: Suggestion[] = !trigger
    ? []
    : trigger.kind === 'project'
      ? (projects.data?.projects ?? [])
          .filter((p) => !p.archived && p.name.toLowerCase().includes(trigger.query.trim().toLowerCase()))
          .slice(0, 6)
          .map((p) => ({ label: p.name, insert: p.name, color: p.color ?? projectAutoColor(p.name) }))
      : DUE_SUGGESTIONS.filter((s) => s.startsWith(trigger.query.toLowerCase().replace(/^\s+/, '')))
          .slice(0, 6)
          .map((s) => ({ label: s, insert: s }));
  const open = focused && !dismissed && trigger !== null && suggestions.length > 0;

  const accept = (s: Suggestion) => {
    const next = `${text.slice(0, tokenStart)}${s.insert} ${text.slice(caret)}`;
    const pos = tokenStart + s.insert.length + 1;
    setText(next);
    setCaret(pos);
    setSelIdx(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(pos, pos);
    });
  };

  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? 0);

  return (
    <div className="relative mb-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const parsed = parseQuickAdd(text);
          create.mutate({
            title: parsed.title,
            dueNatural: parsed.dueNatural,
            repeat: parsed.repeat,
            project: parsed.project ?? defaultProject,
            priority: parsed.priority,
          });
        }}
        className={`flex items-center gap-2.5 rounded-2xl border bg-white px-4 py-1 shadow-card transition-all ${
          focused ? 'border-violet-400 ring-4 ring-violet-500/10' : 'border-zinc-200/80'
        }`}
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-500 text-white">
          <Plus size={14} strokeWidth={3} />
        </span>
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setCaret(e.target.selectionStart ?? e.target.value.length);
            setDismissed(false);
            setSelIdx(0);
          }}
          onKeyUp={syncCaret}
          onClick={syncCaret}
          onKeyDown={(e) => {
            if (!open) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelIdx((i) => (i + 1) % suggestions.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelIdx((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              const s = suggestions[selIdx] ?? suggestions[0];
              if (s) accept(s);
            } else if (e.key === 'Escape') {
              setDismissed(true);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Add a todo…"
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-zinc-400"
        />
        {focused && (
          <div className="hidden shrink-0 items-center gap-1 text-[10.5px] text-zinc-400 sm:flex">
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-px">@due</kbd>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-px">#project</kbd>
            <kbd className="rounded border border-zinc-200 bg-zinc-50 px-1 py-px">!1-3</kbd>
          </div>
        )}
      </form>

      {open && (
        <div className="absolute left-10 top-full z-20 mt-1.5 min-w-[240px] rounded-xl border border-zinc-200/80 bg-white p-1 shadow-card-hover">
          <div className="px-2.5 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
            {trigger?.kind === 'project' ? 'Projects' : 'Due date'}
          </div>
          {suggestions.map((s, i) => (
            <button
              key={s.label}
              type="button"
              // mousedown, not click: accept before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                accept(s);
              }}
              onMouseEnter={() => setSelIdx(i)}
              className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors ${
                i === selIdx ? 'bg-violet-50 text-violet-800' : 'text-zinc-700'
              }`}
            >
              {s.color ? (
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              ) : trigger?.kind === 'project' ? (
                <Hash size={12} className="shrink-0 text-zinc-400" />
              ) : (
                <Clock size={12} className="shrink-0 text-zinc-400" />
              )}
              {s.label}
            </button>
          ))}
          <div className="border-t border-zinc-100 px-2.5 pb-1 pt-1.5 text-[10.5px] text-zinc-400">
            ↑↓ choose · Enter/Tab accept · Esc dismiss
          </div>
        </div>
      )}

      {error && <div className="mt-1.5 px-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}
