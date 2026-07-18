import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CalendarDays,
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

/** Max entry rows per day cell before collapsing into "+N more". */
const MAX_CELL_ENTRIES = 3;

const FALLBACK_DOT = '#a1a1aa'; // zinc-400 — projects without a color

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

/** A todo occupying a calendar day: on its due day, or in flight (created → due). */
type DayItem = { todo: Todo; isDue: boolean };

/** One todo title inside a calendar day cell — Google Calendar style entry. */
function CellEntry({
  todo,
  color,
  overdue,
  isDue,
}: {
  todo: Todo;
  color: string;
  overdue: boolean;
  isDue: boolean;
}) {
  const time = todo.dueAt
    ? new Date(todo.dueAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';
  return (
    <Link
      to={`/t/${todo.id}`}
      onClick={(e) => e.stopPropagation()}
      title={`due ${time} — ${todo.title}`}
      className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-[3px] text-[11.5px] leading-tight transition-colors hover:bg-zinc-100"
    >
      <span
        className="h-[7px] w-[7px] shrink-0 rounded-[3px]"
        style={{
          background: overdue && isDue ? '#dc2626' : color,
          opacity: isDue ? 1 : 0.4,
        }}
      />
      <span
        className={`truncate ${
          isDue ? (overdue ? 'font-medium text-red-600' : 'text-zinc-700') : 'text-zinc-400'
        }`}
      >
        {todo.title}
      </span>
    </Link>
  );
}

/**
 * Full-width month calendar with todo titles visible in each day cell
 * (Google Calendar style). Clicking a day shows its todos below the grid.
 */
function BigMonthCalendar({
  cursor,
  onCursor,
  byDay,
  projectColors,
  selected,
  onSelect,
}: {
  cursor: Date;
  onCursor: (d: Date) => void;
  byDay: Map<string, DayItem[]>;
  projectColors: Map<string, string>;
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const now = new Date();
  const todayKey = dayKey(now);
  const monthLabel = cursor.toLocaleDateString([], { month: 'long', year: 'numeric' });

  // Grid starts on the Sunday on/before the 1st; only as many weeks as the month needs.
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((first.getDay() + daysInMonth) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });

  const navBtn = 'rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700';

  return (
    <div data-testid="agenda-calendar" className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-card">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-3">
        <div className="text-[15px] font-semibold tracking-tight">{monthLabel}</div>
        <div className="ml-auto flex items-center gap-1">
          <button
            aria-label="Previous month"
            onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className={navBtn}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => {
              onCursor(new Date());
              onSelect(null);
            }}
            className="rounded-lg border border-zinc-200 px-2.5 py-1 text-[12px] font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
          >
            Today
          </button>
          <button
            aria-label="Next month"
            onClick={() => onCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className={navBtn}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-zinc-100">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-2 text-center text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = dayKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const items = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isSelected = key === selected;
          const hidden = items.length - MAX_CELL_ENTRIES;
          return (
            <div
              key={key}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(isSelected ? null : key)}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(isSelected ? null : key)}
              className={`flex min-h-[104px] cursor-pointer flex-col gap-0.5 border-zinc-100 p-1 pt-1.5 transition-colors ${
                i % 7 !== 0 ? 'border-l' : ''
              } ${i >= 7 ? 'border-t' : ''} ${
                isSelected
                  ? 'bg-violet-50/80 ring-2 ring-inset ring-violet-400'
                  : inMonth
                    ? 'bg-white hover:bg-zinc-50/70'
                    : 'bg-zinc-50/50 hover:bg-zinc-50'
              }`}
            >
              <span
                className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-[12px] ${
                  isToday
                    ? 'bg-violet-600 font-semibold text-white'
                    : inMonth
                      ? 'font-medium text-zinc-700'
                      : 'text-zinc-300'
                }`}
              >
                {d.getDate()}
              </span>
              {items.slice(0, MAX_CELL_ENTRIES).map(({ todo: t, isDue }) => (
                <CellEntry
                  key={t.id}
                  todo={t}
                  isDue={isDue}
                  color={(t.projectName && projectColors.get(t.projectName)) || FALLBACK_DOT}
                  overdue={!!t.dueAt && new Date(t.dueAt) < now}
                />
              ))}
              {hidden > 0 && (
                <span className="px-1.5 text-[11px] font-medium text-zinc-400">+{hidden} more</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AgendaView() {
  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const dayListRef = useRef<HTMLDivElement>(null);

  // Selecting a day scrolls its todo list into view — the list sits below
  // the (tall) calendar, so without this a click looks like a no-op.
  const selectDay = (key: string | null) => {
    setSelectedDay(key);
    if (key)
      requestAnimationFrame(() =>
        dayListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
  };

  // Auto-sync: poll the server so remote changes (agents adding todos over
  // MCP) appear without a reload. React-query replaces by id — no duplicates.
  const query = useQuery({
    queryKey: ['todos', 'agenda-source'],
    queryFn: () => api.todos({ limit: '200' }), // API caps list queries at 200
    refetchInterval: SYNC_INTERVAL_MS,
    refetchOnWindowFocus: true,
  });
  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: api.projects });

  const now = new Date();
  const todayStr = dayKey(now);

  const projectColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projectsQuery.data?.projects ?? []) if (p.color) m.set(p.name, p.color);
    return m;
  }, [projectsQuery.data]);

  const { overdue, undated, doneToday, byDay } = useMemo(() => {
    const all = query.data?.todos ?? [];
    const open = all.filter(isOpen);

    // A todo occupies every day from its creation to its due date (muted),
    // with the due day itself rendered solid — like a multi-day event.
    const byDay = new Map<string, DayItem[]>();
    for (const t of open) {
      if (!t.dueAt) continue;
      const due = new Date(t.dueAt);
      const dueK = dayKey(due);
      const end = new Date(due);
      end.setHours(0, 0, 0, 0);
      let d = new Date(t.createdAt);
      if (Number.isNaN(d.getTime()) || d > end) d = new Date(end);
      d.setHours(0, 0, 0, 0);
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        const k = dayKey(d);
        const item = { todo: t, isDue: k === dueK };
        const list = byDay.get(k);
        if (list) list.push(item);
        else byDay.set(k, [item]);
      }
    }
    // Due-that-day entries first, then in-flight ones, each by due time.
    for (const list of byDay.values())
      list.sort(
        (a, b) =>
          Number(b.isDue) - Number(a.isDue) ||
          new Date(a.todo.dueAt!).getTime() - new Date(b.todo.dueAt!).getTime(),
      );

    return {
      overdue: open.filter((t) => t.dueAt && new Date(t.dueAt) < now),
      undated: open.filter((t) => !t.dueAt),
      doneToday: all.filter(
        (t) => t.status === 'done' && t.completedAt && dayKey(new Date(t.completedAt)) === todayStr,
      ),
      byDay,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, todayStr]);

  // Day list shown under the calendar — the selected day, defaulting to today.
  // Includes in-flight todos (created before, due later) so the list matches the cell.
  const focusDay = selectedDay ?? todayStr;
  const focusTodos = (byDay.get(focusDay) ?? []).map((i) => i.todo);
  const focusLabel = new Date(`${focusDay}T12:00:00`).toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const dateLine = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const nothingAtAll =
    byDay.size === 0 && overdue.length === 0 && undated.length === 0 && doneToday.length === 0;

  return (
    <div className="mx-auto max-w-[1200px] px-8 py-10 animate-fade-in">
      <PageHeader title="Agenda" subtitle={dateLine} />
      <QuickAdd />

      {query.isLoading ? (
        <div className="h-[560px] animate-pulse rounded-2xl bg-zinc-200/50" />
      ) : query.isError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/60 p-5 text-[13px] text-red-700">
          Couldn't load your todos — {(query.error as Error).message}. Retrying automatically…
        </div>
      ) : (
        <>
          <BigMonthCalendar
            cursor={cursor}
            onCursor={setCursor}
            byDay={byDay}
            projectColors={projectColors}
            selected={selectedDay}
            onSelect={selectDay}
          />
          <p className="mb-6 mt-2 px-1 text-[11px] leading-relaxed text-zinc-400">
            Click a day to see its todos below · todos run from creation (faded) to due date
            (solid, colored by project) · updates automatically when your agents add todos.
          </p>

          {nothingAtAll ? (
            <EmptyState
              icon={<Sparkles size={22} />}
              title="Nothing on your plate"
              hint="You're all caught up — enjoy the calm, or add something above."
            />
          ) : (
            <>
              <div ref={dayListRef} className="scroll-mt-6">
                <Section
                  icon={<CalendarDays size={13} strokeWidth={2.5} />}
                  label={focusDay === todayStr ? `Today — ${focusLabel}` : focusLabel}
                  tone={focusDay === todayStr ? 'zinc' : 'violet'}
                  todos={focusTodos}
                  onClear={selectedDay ? () => setSelectedDay(null) : undefined}
                />
                {focusTodos.length === 0 && (
                  <p className="mb-6 px-1 text-[13px] text-zinc-400">
                    Nothing due {focusDay === todayStr ? 'today' : `on ${focusLabel}`}.
                    {selectedDay && (
                      <button
                        onClick={() => setSelectedDay(null)}
                        className="ml-2 font-medium text-violet-600 hover:underline"
                      >
                        Back to today
                      </button>
                    )}
                  </p>
                )}
              </div>
              <Section icon={<Flame size={13} strokeWidth={2.5} />} label="Overdue" tone="red" todos={overdue} />
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
        </>
      )}
    </div>
  );
}
