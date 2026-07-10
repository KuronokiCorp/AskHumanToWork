import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

/**
 * Quick-add with natural-language dates. Syntax sugar:
 *   "Send report @friday 5pm #Work !2"  → due, project, priority
 */
function parseQuickAdd(text: string) {
  let title = text;
  let dueNatural: string | undefined;
  let project: string | undefined;
  let priority: number | undefined;

  const at = title.match(/@([^#!]+?)(?=\s+[#!]|$)/);
  if (at?.[1]) {
    dueNatural = at[1].trim();
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
  return { title: title.replace(/\s+/g, ' ').trim(), dueNatural, project, priority };
}

export default function QuickAdd({ defaultProject }: { defaultProject?: string }) {
  const [text, setText] = useState('');
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
    <div className="mb-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          const parsed = parseQuickAdd(text);
          create.mutate({
            title: parsed.title,
            dueNatural: parsed.dueNatural,
            project: parsed.project ?? defaultProject,
            priority: parsed.priority,
          });
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Add a todo…  e.g. "Send report @friday 5pm #Work !2"'
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none"
        />
      </form>
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}
