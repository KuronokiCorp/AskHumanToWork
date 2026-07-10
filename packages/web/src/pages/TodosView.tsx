import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import type { Todo } from '@askhumantowork/shared';
import { api } from '../api';
import QuickAdd from '../components/QuickAdd';
import TodoItem from '../components/TodoItem';

type View = 'today' | 'upcoming' | 'overdue' | 'ai' | 'all' | 'project';

const titles: Record<View, string> = {
  today: 'Today',
  upcoming: 'Upcoming (7 days)',
  overdue: 'Overdue',
  ai: 'AI Inbox',
  all: 'All todos',
  project: 'Project',
};

export default function TodosView({ view }: { view: View }) {
  const { name } = useParams();
  const agenda = useQuery({ queryKey: ['agenda'], queryFn: api.agenda });
  const listQuery = useQuery({
    queryKey: ['todos', view, name],
    queryFn: () => {
      if (view === 'ai') return api.todos({ source: 'ai', limit: '100' });
      if (view === 'all') return api.todos({ limit: '200' });
      if (view === 'project') return api.todos({ project: name ?? '', limit: '200' });
      return Promise.resolve({ todos: [] });
    },
    enabled: view === 'ai' || view === 'all' || view === 'project',
  });

  let todos: Todo[] = [];
  let loading = false;
  if (view === 'today') {
    todos = agenda.data?.today ?? [];
    loading = agenda.isLoading;
  } else if (view === 'upcoming') {
    todos = agenda.data?.upcoming ?? [];
    loading = agenda.isLoading;
  } else if (view === 'overdue') {
    todos = agenda.data?.overdue ?? [];
    loading = agenda.isLoading;
  } else {
    todos = listQuery.data?.todos ?? [];
    loading = listQuery.isLoading;
  }

  const openTodos = todos.filter((t) => t.status === 'open' || t.status === 'doing');
  const doneTodos = todos.filter((t) => t.status === 'done');

  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-1 text-2xl font-bold">{view === 'project' ? `#${name}` : titles[view]}</h1>
      {view === 'today' && agenda.data && (
        <p className="mb-4 text-sm text-zinc-500">{agenda.data.summary}</p>
      )}
      {view === 'ai' && (
        <p className="mb-4 text-sm text-zinc-500">
          Todos your AI agents captured for you — each shows why it exists.
        </p>
      )}
      {view !== 'ai' && <QuickAdd defaultProject={view === 'project' ? name : undefined} />}

      {view === 'today' && (agenda.data?.overdue.length ?? 0) > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          🔥 {agenda.data!.overdue.length} overdue — check the Overdue view.
        </div>
      )}

      {loading ? (
        <div className="text-zinc-400">Loading…</div>
      ) : openTodos.length === 0 && doneTodos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400">
          Nothing here. {view === 'ai' ? 'Connect an AI agent via MCP (Settings → API tokens).' : 'Enjoy the calm.'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {openTodos.map((t) => (
            <TodoItem key={t.id} todo={t} />
          ))}
          {doneTodos.length > 0 && (
            <>
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Done ({doneTodos.length})
              </div>
              {doneTodos.map((t) => (
                <TodoItem key={t.id} todo={t} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
