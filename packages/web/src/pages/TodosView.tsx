import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Bot, Flame, Inbox, PartyPopper } from 'lucide-react';
import type { Todo } from '@askhumantowork/shared';
import { api } from '../api';
import QuickAdd from '../components/QuickAdd';
import TodoItem from '../components/TodoItem';
import { EmptyState, PageHeader } from '../components/ui';

type View = 'today' | 'upcoming' | 'overdue' | 'ai' | 'all' | 'project';

const titles: Record<View, string> = {
  today: 'Today',
  upcoming: 'Upcoming',
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

  const dateLine = new Date().toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="mx-auto max-w-[720px] px-8 py-10 animate-fade-in">
      <PageHeader
        title={view === 'project' ? `#${name}` : titles[view]}
        subtitle={
          view === 'today'
            ? `${dateLine} — ${agenda.data?.summary ?? ''}`
            : view === 'ai'
              ? 'Todos your AI agents captured for you — each shows why it exists.'
              : view === 'upcoming'
                ? 'Due in the next 7 days.'
                : undefined
        }
      />

      {view !== 'ai' && <QuickAdd defaultProject={view === 'project' ? name : undefined} />}

      {view === 'today' && (agenda.data?.overdue.length ?? 0) > 0 && (
        <a
          href="/overdue"
          className="mb-4 flex items-center gap-2.5 rounded-2xl border border-red-200/80 bg-gradient-to-r from-red-50 to-orange-50 px-4 py-3 text-sm font-medium text-red-700 shadow-card transition-all hover:-translate-y-px hover:shadow-card-hover"
        >
          <Flame size={16} className="shrink-0" />
          {agenda.data!.overdue.length} overdue — jump to the Overdue view
        </a>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-zinc-200/50" />
          ))}
        </div>
      ) : openTodos.length === 0 && doneTodos.length === 0 ? (
        view === 'ai' ? (
          <EmptyState
            icon={<Bot size={22} />}
            title="No AI-captured todos yet"
            hint="Connect an agent via MCP (Settings → API tokens) and Claude will start filing follow-ups here."
          />
        ) : view === 'overdue' ? (
          <EmptyState icon={<PartyPopper size={22} />} title="Nothing overdue" hint="You're all caught up." />
        ) : (
          <EmptyState icon={<Inbox size={22} />} title="Nothing here" hint="Enjoy the calm — or add something above." />
        )
      ) : (
        <div className="flex flex-col gap-2">
          {openTodos.map((t) => (
            <TodoItem key={t.id} todo={t} />
          ))}
          {doneTodos.length > 0 && (
            <>
              <div className="mt-5 flex items-center gap-3 px-1">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
                  Done · {doneTodos.length}
                </span>
                <span className="h-px flex-1 bg-zinc-200" />
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
