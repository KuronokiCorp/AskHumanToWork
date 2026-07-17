import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Flame,
  Sparkles,
  X,
} from 'lucide-react';
import type { Todo } from '@askhumantowork/shared';
import { api } from '../api';
import QuickAdd from '../components/QuickAdd';
import TodoItem from '../components/TodoItem';
import { EmptyState, PageHeader } from '../components/ui';

/** How often the web checks the server for remote changes (agents adding todos). */
const SYNC_INTERVAL_MS = 15_000;

const isOpen = (t: Todo) => t.status === 'open' || t.status === 'doing';

/** Local-timezone day key, e.g. "2026-07-17". */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function Section({
  icon,
  label,
  tone,
  todos,
  onClear,
}: {
  icon: React.ReactNode;
  label: string;
  tone: 'red' | 'zinc' | 'violet' | 'amber';
  todos: Todo[];
  onClear?: () => void;
}) {
  if (todos.length === 0) return null;
  const labelTone = {
    red: 'text-red-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
    zinc: 'text-zinc-500',
  }[tone];
  return (
    <div className="mb-6">
      <div className={`mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider ${labelTone}`}>
        {icon}
        {label}
        <span className="text-zinc-400">· {todos.length}</span>
        {onClear && (
          <button onClick={onClear} title="Clear day filter" className="text-zinc-400 hover:text-zinc-700">
            <X size={12} strokeWidth={3} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {todos.map((t) => (
          <TodoItem key={t.id} todo={t} />
        ))}
      </div>
    </div>
  );
}

/** Mini month calendar; days with due todos get a count badge. */
function MonthCalendar({
  cursor,
  onCursor,
  counts,
  selected,
  onSelect,
}: {
  cursor: Date;
  onCursor: (d: Date) => void;
  counts: Map<string, number>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const todayKey = dayKey(new Date());
  const monthLabel = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });

  // Grid starts on the Sunday on/before the 1st; 6 rows × 7 days.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  return (
    <div data-testid="agenda-calendar" className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <button
          aria-label="Previous month"
          onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="text-[13px] font-semibold">{monthLabel}</div>
        <button
          aria-label="Next month"
          onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={i} className="text-[10px] font-semibold uppercase text-zinc-400">
            {d}
          </div>
        ))}
        {cells.map((d) => {
          const key = dayKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const count = counts.get(key) ?? 0;
          const isToday = key === todayKey;
          const isSelected = key === selected;
          return (
            <button
              key={key}
              onClick={() => onSelect(isSelected ? null : key)}
              title={count ? `${count} due` : undefined}
              className={`relative mx-auto flex h-8 w-8 flex-col items-center justify-center rounded-lg text-[12px] transition-colors ${
                isSelected
                  ? 'bg-violet-600 font-semibold text-white'
                  : isToday
                    ? 'bg-violet-100 font-semibold text-violet-700'
                    : inMonth
                      ? 'text-zinc-700 hover:bg-zinc-100'
                      : 'text-zinc-300 hover:bg-zinc-50'
              }`}
            >
              {d.getDate()}
              {count > 0 && (
                <span
                  className={`absolute bottom-[3px] h-[3px] w-[3px] rounded-full ${
                    isSelected ? 'bg-white' : 'bg-violet-500'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function AgendaView() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Auto-sync: poll the server so remote changes (agents adding todos over
  // MCP) appear without a reload. React-query replaces by id — no duplicates.
  const query = useQuery({
    queryKey: ['todos', 'agenda-source'],
    queryFn: () => api.todos({ limit: '200' }), // API caps list queries at 200
    refetchInterval: SYNC_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });

  const now = new Date();
  const todayStr = dayKey(now);

  const { overdue, today, upcoming, undated, doneToday, counts } = useMemo(() => {
    const all = query.data?.todos ?? [];
    const open = all.filter(isOpen);
    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);
    const endOfWeek = new Date(endOfToday.getTime() + 7 * 24 * 3_600_000);

    const counts = new Map<string, number>();
    for (const t of open) {
      if (!t.dueAt) continue;
      const k = dayKey(new Date(t.dueAt));
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return {
      overdue: open.filter((t) => t.dueAt && new Date(t.dueAt) < now),
      today: open.filter((t) => {
        if (!t.dueAt) return false;
        const d = new Date(t.dueAt);
        return d >= now && d <= endOfToday;
      }),
      upcoming: open.filter((t) => {
        if (!t.dueAt) return false;
        const d = new Date(t.dueAt);
        return d > endOfToday && d <= endOfWeek;
      }),
      undated: open.filter((t) => !t.dueAt),
      doneToday: all.filter(
        (t) => t.status === 'done' && t.completedAt && dayKey(new Date(t.completedAt)) === todayStr,
      ),
      counts,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, todayStr]);

  const selectedTodos = useMemo(() => {
    if (!selectedDay) return [];
    return (query.data?.todos ?? []).filter(
      (t) => isOpen(t) && t.dueAt && dayKey(new Date(t.dueAt)) === selectedDay,
    );
  }, [query.data, selectedDay]);

  const dateLine = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const totalOpen = overdue.length + today.length + upcoming.length + undated.length;
  const selectedLabel =
    selectedDay &&
    new Date(`${selectedDay}T12:00:00`).toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

  return (
    <div className="mx-auto max-w-[1040px] px-8 py-10 animate-fade-in">
      <PageHeader title="Agenda" subtitle={dateLine} />
      <QuickAdd />

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: calendar */}
        <div className="shrink-0 lg:w-[300px]">
          <MonthCalendar
            cursor={cursor}
            onCursor={setCursor}
            counts={counts}
            selected={selectedDay}
            onSelect={setSelectedDay}
          />
          <p className="mt-2 px-1 text-[11px] leading-relaxed text-zinc-400">
            Dots mark days with due todos — click a day to see them. Updates automatically when
            your agents add todos.
          </p>
        </div>

        {/* Right: today first, then the rest */}
        <div className="min-w-0 flex-1">
          {query.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-[68px] animate-pulse rounded-2xl bg-zinc-200/50" />
              ))}
            </div>
          ) : query.isError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 text-[13px] text-red-700">
              Couldn't load your todos — {(query.error as Error).message}. Retrying automatically…
            </div>
          ) : totalOpen === 0 && doneToday.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={22} />}
              title="Nothing on your plate"
              hint="You're all caught up — enjoy the calm, or add something above."
            />
          ) : (
            <>
              {selectedDay && selectedDay !== todayStr && (
                <Section
                  icon={<CalendarDays size={13} strokeWidth={2.5} />}
                  label={selectedLabel ?? selectedDay}
                  tone="violet"
                  todos={selectedTodos}
                  onClear={() => setSelectedDay(null)}
                />
              )}
              <Section icon={<CalendarDays size={13} strokeWidth={2.5} />} label="Today" tone="zinc" todos={today} />
              <Section icon={<Flame size={13} strokeWidth={2.5} />} label="Overdue" tone="red" todos={overdue} />
              <Section
                icon={<CalendarRange size={13} strokeWidth={2.5} />}
                label="This week"
                tone="violet"
                todos={upcoming}
              />
              <Section
                icon={<CircleDashed size={13} strokeWidth={2.5} />}
                label="No due date"
                tone="amber"
                todos={undated}
              />
              {doneToday.length > 0 && (
                <div className="mt-1">
                  <div className="mb-2 flex items-center gap-3 px-1">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
                      Done today · {doneToday.length}
                    </span>
                    <span className="h-px flex-1 bg-zinc-200" />
                  </div>
                  <div className="flex flex-col gap-2">
                    {doneToday.map((t) => (
                      <TodoItem key={t.id} todo={t} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
