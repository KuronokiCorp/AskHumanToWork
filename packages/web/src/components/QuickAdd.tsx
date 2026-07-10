import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../api';

/**
 * Quick-add with natural-language dates. Syntax sugar:
 *   "Send report @friday 5pm #Work !2"  → due, project, priority
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
  const hash = title.match(/#(\S+)/);
  if (hash?.[1]) {
    project = hash[1];
    title = title.replace(hash[0], ' ');
  }
  const bang = title.match(/!([1-3])/);
  if (bang?.[1]) {
    priority = Number(bang[1]);
    title = title.replace(bang[0], ' ');
  }
  return { title: title.replace(/\s+/g, ' ').trim(), dueNatural, repeat, project, priority };
}

export default function QuickAdd({ defaultProject }: { defaultProject?: string }) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();

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

  return (
    <div className="mb-5">
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
          value={text}
          onChange={(e) => setText(e.target.value)}
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
      {error && <div className="mt-1.5 px-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}
