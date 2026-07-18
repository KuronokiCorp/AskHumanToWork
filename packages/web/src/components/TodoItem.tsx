import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Ban, Bot, Check, Clock, Flag, Hash, Repeat } from 'lucide-react';
import type { Todo } from '@askhumantowork/shared';
import { api } from '../api';
import { Chip } from './ui';

const priorityTone = { 1: 'text-sky-500', 2: 'text-amber-500', 3: 'text-red-500' } as const;

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

  return (
    <div
      className={`group flex items-start gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 py-3.5 shadow-card transition-all hover:-translate-y-px hover:shadow-card-hover ${done ? 'opacity-70' : ''}`}
    >
      <button
        onClick={() => (done ? reopen.mutate() : complete.mutate())}
        title={done ? 'Reopen' : 'Complete'}
        className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 transition-all ${
          done
            ? 'animate-pop border-emerald-500 bg-emerald-500 text-white'
            : 'border-zinc-300 text-transparent hover:border-violet-500 hover:bg-violet-50 hover:text-violet-400'
        }`}
      >
        <Check size={13} strokeWidth={3.5} />
      </button>

      <div className="min-w-0 flex-1">
        <Link to={`/t/${todo.id}`} className="block">
          <div className={`flex items-center gap-1.5 truncate text-[14.5px] ${done ? 'text-zinc-400 line-through' : 'font-medium text-zinc-800 group-hover:text-zinc-950'}`}>
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

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {due.text && (
            <Chip tone={due.overdue ? 'red' : 'zinc'}>
              <Clock size={11} strokeWidth={2.5} />
              {due.text}
            </Chip>
          )}
          {todo.status === 'blocked' && (
            <Chip tone="amber" title={todo.blockedReason ?? 'Blocked'}>
              <Ban size={11} strokeWidth={2.5} />
              blocked{todo.blockedReason ? `: ${todo.blockedReason}` : ''}
            </Chip>
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
          {todo.source === 'ai' &&
            (() => {
              // Which device/app this came from — the token name is authoritative;
              // fall back to the client-reported agent type.
              const device = todo.createdByToken ?? todo.createdByAgent ?? 'AI';
              const agentType =
                todo.createdByAgent && todo.createdByAgent !== todo.createdByToken
                  ? todo.createdByAgent
                  : null;
              return (
                <Chip tone="violet" title={`Captured from ${device}${agentType ? ` (${agentType})` : ''}`}>
                  <Bot size={11} strokeWidth={2.5} />
                  {device}
                  {agentType && <span className="font-normal text-violet-400">· {agentType}</span>}
                </Chip>
              );
            })()}
        </div>

        {todo.source === 'ai' && todo.originContext && (
          <div className="mt-1.5 border-l-2 border-zinc-200 pl-2 text-[12px] leading-snug text-zinc-500">
            {todo.originContext}
          </div>
        )}
      </div>
    </div>
  );
}
