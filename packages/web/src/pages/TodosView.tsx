import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Inbox, Search, X } from 'lucide-react';
import type { Todo } from '@askhumantowork/shared';
import { api } from '../api';
import QuickAdd from '../components/QuickAdd';
import TodoItem from '../components/TodoItem';
import { Chip, EmptyState, PageHeader, inputCls } from '../components/ui';

/** Debounce a value. */
function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

type View = 'all' | 'project';
type SourceFilter = 'all' | 'human' | 'ai';

const titles: Record<View, string> = {
  all: 'All todos',
  project: 'Project',
};

const open = (t: Todo) => t.status === 'open' || t.status === 'doing';

/** Poll cadence so remote changes (agents adding todos over MCP) appear live. */
const SYNC_INTERVAL_MS = 15_000;

export default function TodosView({ view }: { view: View }) {
  const { name } = useParams();
  const [params, setParams] = useSearchParams();
  const tag = params.get('tag') ?? '';
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const debouncedSearch = useDebounced(search, 250);

  const listQuery = useQuery({
    queryKey: ['todos', view, name, debouncedSearch, tag],
    queryFn: () => {
      const extra: Record<string, string> = {};
      if (debouncedSearch.trim()) extra.search = debouncedSearch.trim();
      if (tag) extra.tags = tag;
      if (view === 'project') return api.todos({ project: name ?? '', limit: '200', ...extra });
      return api.todos({ limit: '200', ...extra });
    },
    refetchInterval: SYNC_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const all = listQuery.data?.todos ?? [];
  const todos =
    view === 'all' && sourceFilter !== 'all'
      ? all.filter((t) => (sourceFilter === 'ai' ? t.source === 'ai' : t.source !== 'ai'))
      : all;
  const loading = listQuery.isLoading;
  const openTodos = todos.filter(open);
  const doneTodos = todos.filter((t) => t.status === 'done');

  return (
    <div className="mx-auto max-w-[720px] px-8 py-10 animate-fade-in">
      <PageHeader title={view === 'project' ? `#${name}` : titles[view]} />

      <QuickAdd defaultProject={view === 'project' ? name : undefined} />

      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search titles and notes…"
            className={`${inputCls} pl-9`}
          />
        </div>
        {tag && (
          <button onClick={() => setParams({}, { replace: true })} className="shrink-0" title="Clear tag filter">
            <Chip tone="accent">
              #{tag} <X size={11} strokeWidth={3} />
            </Chip>
          </button>
        )}
      </div>

      {view === 'all' && (
        <div className="mb-4 flex items-center gap-1" data-testid="source-filter">
          {(['all', 'human', 'ai'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSourceFilter(s)}
              className={`rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                sourceFilter === s
                  ? 'bg-accent-500/15 text-accent-300'
                  : 'text-zinc-500 hover:bg-white/5 hover:text-zinc-300'
              }`}
            >
              {s === 'all' ? 'All' : s === 'human' ? 'Human' : 'AI'}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[68px] animate-pulse rounded-xl bg-white/[0.03]" />
          ))}
        </div>
      ) : openTodos.length === 0 && doneTodos.length === 0 ? (
        <EmptyState icon={<Inbox size={22} />} title="Nothing here" hint="Enjoy the calm — or add something above." />
      ) : (
        <div className="flex flex-col gap-2">
          {openTodos.map((t) => (
            <TodoItem key={t.id} todo={t} />
          ))}
          {doneTodos.length > 0 && (
            <>
              <div className="mt-5 flex items-center gap-3 px-1">
                <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">
                  Done · {doneTodos.length}
                </span>
                <span className="h-px flex-1 bg-white/10" />
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
