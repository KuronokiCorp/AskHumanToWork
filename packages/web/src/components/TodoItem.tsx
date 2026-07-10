import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Todo } from '@askhumantowork/shared';
import { api } from '../api';

const priorityColors = ['', 'text-sky-600', 'text-amber-600', 'text-red-600'];

export function dueLabel(t: Todo): { text: string; cls: string } {
  if (!t.dueAt) return { text: '', cls: '' };
  const due = new Date(t.dueAt);
  const now = new Date();
  const overdue = due < now && t.status === 'open';
  const sameDay = due.toDateString() === now.toDateString();
  const text = sameDay
    ? due.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : due.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return { text, cls: overdue ? 'text-red-600 font-medium' : 'text-zinc-500' };
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
    <div className="group flex items-start gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 hover:shadow-sm">
      <button
        onClick={() => (done ? reopen.mutate() : complete.mutate())}
        className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 ${done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-zinc-300 hover:border-indigo-500'}`}
        title={done ? 'Reopen' : 'Complete'}
      >
        {done && <span className="block text-xs leading-4">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <Link to={`/t/${todo.id}`} className="block">
          <div className={`truncate text-sm ${done ? 'text-zinc-400 line-through' : 'font-medium'}`}>
            {todo.priority > 0 && (
              <span className={`mr-1 ${priorityColors[todo.priority]}`}>{'!'.repeat(todo.priority)}</span>
            )}
            {todo.title}
          </div>
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
          {due.text && <span className={due.cls}>⏰ {due.text}</span>}
          {todo.projectName && <span className="text-zinc-400">#{todo.projectName}</span>}
          {todo.tags.map((tag) => (
            <span key={tag} className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500">
              {tag}
            </span>
          ))}
          {todo.source === 'ai' && (
            <span
              className="rounded bg-violet-100 px-1.5 py-0.5 text-violet-700"
              title={todo.originContext ?? undefined}
            >
              🤖 {todo.createdByAgent ?? 'AI'}
            </span>
          )}
        </div>
        {todo.source === 'ai' && todo.originContext && (
          <div className="mt-1 text-xs italic text-violet-600/70">“{todo.originContext}”</div>
        )}
      </div>
    </div>
  );
}
