import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

export default function TodoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['todo', id], queryFn: () => api.todo(id!), enabled: !!id });
  const [dueText, setDueText] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['todo', id] });
    void qc.invalidateQueries({ queryKey: ['todos'] });
    void qc.invalidateQueries({ queryKey: ['agenda'] });
  };
  const update = useMutation({
    mutationFn: (patch: Record<string, unknown>) => api.updateTodo(id!, patch),
    onSuccess: invalidate,
  });
  const complete = useMutation({ mutationFn: () => api.completeTodo(id!), onSuccess: invalidate });
  const snooze = useMutation({
    mutationFn: (until: string) => api.snoozeTodo(id!, until),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => api.deleteTodo(id!),
    onSuccess: () => navigate('/today'),
  });

  if (query.isLoading) return <div className="p-8 text-zinc-400">Loading…</div>;
  if (query.isError || !query.data) return <div className="p-8 text-red-600">Todo not found.</div>;
  const t = query.data.todo;

  return (
    <div className="mx-auto max-w-2xl p-8">
      <button onClick={() => navigate(-1)} className="mb-4 text-sm text-zinc-500 hover:text-zinc-800">
        ← Back
      </button>
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <h1 className={`text-xl font-bold ${t.status === 'done' ? 'text-zinc-400 line-through' : ''}`}>
            {t.title}
          </h1>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
            t.status === 'done' ? 'bg-emerald-100 text-emerald-700'
            : t.status === 'cancelled' ? 'bg-zinc-100 text-zinc-500'
            : 'bg-indigo-100 text-indigo-700'
          }`}>
            {t.status}
          </span>
        </div>

        {t.source === 'ai' && (
          <div className="mt-4 rounded-xl bg-violet-50 p-4 text-sm">
            <div className="font-medium text-violet-800">🤖 Added by {t.createdByAgent ?? 'an AI agent'}</div>
            {t.originContext && <div className="mt-1 text-violet-700">“{t.originContext}”</div>}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-zinc-400">Due</dt>
            <dd>{t.dueAt ? new Date(t.dueAt).toLocaleString() : '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-400">Project</dt>
            <dd>{t.projectName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-zinc-400">Priority</dt>
            <dd>{['None', 'Low', 'Medium', 'High'][t.priority]}</dd>
          </div>
          <div>
            <dt className="text-zinc-400">Tags</dt>
            <dd>{t.tags.length ? t.tags.join(', ') : '—'}</dd>
          </div>
        </dl>

        {t.notes && <div className="mt-4 whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-sm">{t.notes}</div>}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {t.status !== 'done' && (
            <button
              onClick={() => complete.mutate()}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              ✓ Complete
            </button>
          )}
          {t.status === 'done' && (
            <button
              onClick={() => update.mutate({ status: 'open' })}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
            >
              Reopen
            </button>
          )}
          <button
            onClick={() => snooze.mutate('in 1 hour')}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            💤 Snooze 1h
          </button>
          <button
            onClick={() => snooze.mutate('tomorrow 9am')}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50"
          >
            💤 Tomorrow
          </button>
          <button
            onClick={() => del.mutate()}
            className="ml-auto rounded-lg px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (dueText.trim()) update.mutate({ dueNatural: dueText.trim() });
            setDueText('');
          }}
        >
          <input
            value={dueText}
            onChange={(e) => setDueText(e.target.value)}
            placeholder='Reschedule… e.g. "next tuesday 3pm"'
            className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50">
            Reschedule
          </button>
        </form>
      </div>
    </div>
  );
}
