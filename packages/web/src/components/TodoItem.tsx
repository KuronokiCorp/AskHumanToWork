import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Check, Clock, Flag, Hash, Repeat, Sparkles, Zap } from 'lucide-react';
import type { Todo } from '@askhumantowork/shared';
import { api } from '../api';
import { Chip, StatusChip } from './ui';

const priorityTone = { 1: 'text-sky-400', 2: 'text-amber-400', 3: 'text-red-400' } as const;

export function dueLabel(t: Todo): { text: string; overdue: boolean } {
  if (!t.dueAt) return { text: '', overdue: false };
  const due = new Date(t.dueAt);
  const now = new Date();
  const overdue = due < now && (t.status === 'open' || t.status === 'doing');
  const sameDay = due.toDateString() === now.toDateString();
  const text = sameDay
    ? due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : due.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return { text, overdue };
}

export default function TodoItem({ todo }: { todo: Todo }) {
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['todos'] });
    void qc.invalidateQueries({ queryKey: ['agenda'] });
  };
  const complete = useMutation({ mutationFn: () => api.completeTodo(todo.id), onSuccess: invalidate });
  const reopen = useMutation({
    mutationFn: () => api.updateTodo(todo.id, { status: 'open' }),
    onSuccess: invalidate,
  });

  const done = todo.status === 'done';
  const due = dueLabel(todo);
  // Which device/app captured it — the token name is authoritative; fall back to agent type.
  const agentName = todo.createdByToken ?? todo.createdByAgent ?? 'agent';

  return (
    <div
      className={`group flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 transition-colors hover:border-white/20 hover:bg-white/[0.04] ${done ? 'opacity-60' : ''}`}
    >
      <button
        onClick={() => (done ? reopen.mutate() : complete.mutate())}
        title={done ? 'Reopen' : 'Complete'}
        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          done
            ? 'animate-pop border-emerald-500 bg-emerald-500 text-white'
            : 'border-white/25 text-transparent hover:border-accent-500 hover:bg-accent-500/10 hover:text-accent-400'
        }`}
      >
        <Check size={13} strokeWidth={3.5} />
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Link to={`/t/${todo.id}`} className="block min-w-0 flex-1">
            <div className={`flex items-center gap-1.5 truncate text-[14px] ${done ? 'text-zinc-500 line-through' : 'font-medium text-zinc-200 group-hover:text-white'}`}>
              {todo.priority > 0 && (
                <Flag
                  size={13}
                  strokeWidth={2.5}
                  className={`shrink-0 ${priorityTone[todo.priority as 1 | 2 | 3]}`}
                  fill="currentColor"
                />
              )}
              <span className="truncate">{todo.title}</span>
            </div>
          </Link>
          {/* Q3=B — surface the per-todo AI assistant right from the row. */}
          {!done && (
            <Link
              to={`/t/${todo.id}#assistant`}
              title="Ask AI about this"
              className="shrink-0 rounded-md p-1 text-zinc-600 opacity-0 transition-colors hover:bg-white/5 hover:text-accent-400 focus-visible:opacity-100 focus-visible:text-accent-400 group-hover:opacity-100"
            >
              <Sparkles size={14} />
            </Link>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {due.text && (
            <Chip tone={due.overdue ? 'red' : 'zinc'}>
              <Clock size={11} strokeWidth={2.5} />
              {due.text}
            </Chip>
          )}
          {(todo.status === 'doing' || todo.status === 'blocked') && (
            <span title={todo.status === 'blocked' ? (todo.blockedReason ?? 'Blocked') : undefined}>
              <StatusChip status={todo.status} />
            </span>
          )}
          {todo.recurrence && (
            <Chip tone="emerald" title={`Repeats ${todo.recurrence.display}`}>
              <Repeat size={11} strokeWidth={2.5} />
              {todo.recurrence.display}
            </Chip>
          )}
          {todo.projectName && (
            <Chip>
              <Hash size={11} strokeWidth={2.5} />
              {todo.projectName}
            </Chip>
          )}
          {todo.tags.map((tag) => (
            <Link key={tag} to={`/all?tag=${encodeURIComponent(tag)}`}>
              <Chip>{tag}</Chip>
            </Link>
          ))}
          {todo.source === 'ai' && (
            <Chip tone="accent" title={`Captured by ${agentName}`}>
              <Zap size={11} strokeWidth={2.5} fill="currentColor" />
              {agentName}
            </Chip>
          )}
        </div>

        {todo.source === 'ai' && todo.originContext && (
          <div className="mt-1.5 border-l-2 border-white/10 pl-2 text-[12px] leading-snug text-zinc-500">
            {todo.originContext}
          </div>
        )}
      </div>
    </div>
  );
}
