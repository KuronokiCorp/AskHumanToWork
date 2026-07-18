import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { AlarmClock, ArrowLeft, Bot, Check, Moon, Pencil, Repeat, RotateCcw, Sun, Trash2 } from 'lucide-react';
import { api } from '../api';
import { Button, Chip, inputCls } from '../components/ui';
import TodoChat from '../components/TodoChat';

export default function TodoDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['todo', id], queryFn: () => api.todo(id!), enabled: !!id });
  const [dueText, setDueText] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', notes: '', repeat: '', priority: 0, project: '', tags: '' });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['todo', id] });
    void qc.invalidateQueries({ queryKey: ['todos'] });
    void qc.invalidateQueries({ queryKey: ['agenda'] });
    // editing a todo's project field can create a brand-new project
    void qc.invalidateQueries({ queryKey: ['projects'] });
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

  if (query.isLoading)
    return <div className="mx-auto max-w-[680px] px-8 py-10"><div className="h-64 animate-pulse rounded-2xl bg-zinc-200/50" /></div>;
  if (query.isError || !query.data)
    return <div className="p-10 text-sm text-red-600">Todo not found.</div>;
  const t = query.data.todo;
  const statusTone = t.status === 'done' ? 'emerald' : t.status === 'cancelled' ? 'zinc' : 'violet';

  return (
    <div className="mx-auto max-w-[680px] px-8 py-10 animate-fade-in">
      <button
        onClick={() => navigate(-1)}
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div className="rounded-2xl border border-zinc-200/80 bg-white p-7 shadow-card">
        {editing ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              update.mutate(
                {
                  title: draft.title.trim() || t.title,
                  notes: draft.notes.trim() || null,
                  repeat: draft.repeat.trim() ? draft.repeat.trim() : t.recurrence ? null : undefined,
                  priority: draft.priority,
                  project: draft.project.trim() || null,
                  tags: draft.tags.split(',').map((s) => s.trim()).filter(Boolean),
                },
                { onSuccess: () => setEditing(false) },
              );
            }}
            className="space-y-3"
          >
            <input
              autoFocus
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className={`${inputCls} text-[17px] font-semibold`}
            />
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              rows={4}
              placeholder="Notes…"
              className={inputCls}
            />
            <div className="flex items-center gap-2">
              <Repeat size={15} className="shrink-0 text-zinc-400" />
              <input
                value={draft.repeat}
                onChange={(e) => setDraft({ ...draft, repeat: e.target.value })}
                placeholder='Repeat… e.g. "every monday" (leave empty for none)'
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                className={inputCls}
              >
                {['No priority', '! Low', '!! Medium', '!!! High'].map((label, i) => (
                  <option key={i} value={i}>{label}</option>
                ))}
              </select>
              <input
                value={draft.project}
                onChange={(e) => setDraft({ ...draft, project: e.target.value })}
                placeholder="Project"
                className={inputCls}
              />
              <input
                value={draft.tags}
                onChange={(e) => setDraft({ ...draft, tags: e.target.value })}
                placeholder="Tags (comma-separated)"
                className={inputCls}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit">Save</Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              {update.isError && <span className="self-center text-xs text-red-600">{String((update.error as Error).message)}</span>}
            </div>
          </form>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <h1 className={`text-[21px] font-bold leading-snug tracking-tight ${t.status === 'done' ? 'text-zinc-400 line-through' : ''}`}>
              {t.title}
            </h1>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setDraft({
                    title: t.title,
                    notes: t.notes ?? '',
                    repeat: t.recurrence?.display ?? '',
                    priority: t.priority,
                    project: t.projectName ?? '',
                    tags: t.tags.join(', '),
                  });
                  setEditing(true);
                }}
                title="Edit"
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <Pencil size={15} />
              </button>
              <Chip tone={statusTone}>{t.status}</Chip>
            </div>
          </div>
        )}

        {t.source === 'ai' && (
          <div className="mt-5 rounded-xl border border-violet-200/70 bg-gradient-to-r from-violet-50 to-indigo-50/60 p-4">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-violet-800">
              <Bot size={15} /> Captured from {t.createdByToken ?? t.createdByAgent ?? 'an AI agent'}
              {t.createdByToken && t.createdByAgent && t.createdByAgent !== t.createdByToken && (
                <span className="font-normal text-violet-500/70">({t.createdByAgent})</span>
              )}
            </div>
            {t.originContext && (
              <div className="mt-1.5 text-[13px] italic leading-relaxed text-violet-700/90">“{t.originContext}”</div>
            )}
          </div>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          {[
            ['Due', t.dueAt ? new Date(t.dueAt).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'],
            ['Project', t.projectName ?? '—'],
            ['Priority', ['None', 'Low', 'Medium', 'High'][t.priority]],
            ['Repeats', t.recurrence?.display ?? '—'],
            ['Tags', t.tags.length ? t.tags.join(', ') : '—'],
          ].map(([k, v]) => (
            <div key={k as string}>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{k}</dt>
              <dd className="mt-0.5 font-medium text-zinc-700">{v}</dd>
            </div>
          ))}
        </dl>

        {!editing && t.notes && (
          <div className="mt-5 whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-[13.5px] leading-relaxed text-zinc-600">
            {t.notes}
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-5">
          {t.status !== 'done' ? (
            <Button onClick={() => complete.mutate()}>
              <Check size={15} strokeWidth={2.5} /> Complete
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => update.mutate({ status: 'open' })}>
              <RotateCcw size={14} /> Reopen
            </Button>
          )}
          <Button variant="secondary" onClick={() => snooze.mutate('in 1 hour')}>
            <Moon size={14} /> Snooze 1h
          </Button>
          <Button variant="secondary" onClick={() => snooze.mutate('tomorrow 9am')}>
            <Sun size={14} /> Tomorrow
          </Button>
          <Button variant="danger" className="ml-auto" onClick={() => del.mutate()}>
            <Trash2 size={14} /> Delete
          </Button>
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
            className={inputCls}
          />
          <Button variant="secondary" type="submit" className="shrink-0">
            <AlarmClock size={14} /> Reschedule
          </Button>
        </form>
      </div>

      <TodoChat todoId={t.id} />
    </div>
  );
}
