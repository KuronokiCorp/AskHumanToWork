import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Ban,
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
import { EmptyState, PageHeader, projectAutoColor as autoColor } from '../components/ui';

/** How often the web checks the server for remote changes (agents adding todos). */
const SYNC_INTERVAL_MS = 15_000;

const isOpen = (t: Todo) => t.status === 'open' || t.status === 'doing' || t.status === 'blocked';

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

/** A todo's scheduling window: assigned (created) → deadline (due). */
type TodoSpan = { todo: Todo; start: Date; end: Date };

const DAY_MS = 86_400_000;
const BAR_H = 22; // vertical rhythm per bar lane (bar + gap)
const BAR_TOP = 34; // space reserved above bars for the date number
const MAX_LANES = 3; // bar rows per week before "+N more"


/**
 * Full-width month calendar with todo titles visible in each day cell
 * (Google Calendar style). Clicking a day shows its todos below the grid.
 */
function BigMonthCalendar({
  cursor,
  onCursor,
  spans,
  projectColors,
  selected,
  onSelect,
}: {
  cursor: Date;
  onCursor: (d: Date) => void;
  spans: TodoSpan[];
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

      {Array.from({ length: weeks }, (_, w) => {
        const ws = new Date(start);
        ws.setDate(start.getDate() + w * 7);
        const we = new Date(ws);
        we.setDate(ws.getDate() + 6);

        // Segments of todo windows crossing this week, packed into lanes
        // (Google Calendar style: first free row that has no overlap).
        const segs = spans
          .filter((s) => s.start <= we && s.end >= ws)
          .map((s) => ({
            ...s,
            sCol: Math.max(0, Math.round((s.start.getTime() - ws.getTime()) / DAY_MS)),
            eCol: Math.min(6, Math.round((s.end.getTime() - ws.getTime()) / DAY_MS)),
            startsHere: s.start >= ws,
            endsHere: s.end <= we,
          }))
          .sort((a, b) => a.sCol - b.sCol || b.eCol - b.sCol - (a.eCol - a.sCol));
        const lanes: [number, number][][] = [];
        const placed = segs.map((seg) => {
          let lane = 0;
          while ((lanes[lane] ?? []).some(([s, e]) => seg.sCol <= e && seg.eCol >= s)) lane++;
          (lanes[lane] ??= []).push([seg.sCol, seg.eCol]);
          return { ...seg, lane };
        });
        const hidden = Array(7).fill(0) as number[];
        for (const p of placed)
          if (p.lane >= MAX_LANES)
            for (let c = p.sCol; c <= p.eCol; c++) hidden[c] = (hidden[c] ?? 0) + 1;

        return (
          <div
            key={w}
            className={`relative grid grid-cols-7 ${w > 0 ? 'border-t border-zinc-100' : ''}`}
            style={{ minHeight: BAR_TOP + MAX_LANES * BAR_H + 24 }}
          >
            {Array.from({ length: 7 }, (_, c) => {
              const d = new Date(ws);
              d.setDate(ws.getDate() + c);
              const key = dayKey(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selected;
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(isSelected ? null : key)}
                  onKeyDown={(e) => e.key === 'Enter' && onSelect(isSelected ? null : key)}
                  className={`relative cursor-pointer border-zinc-100 transition-colors ${
                    c > 0 ? 'border-l' : ''
                  } ${
                    isSelected
                      ? 'bg-violet-50/80 ring-2 ring-inset ring-violet-400'
                      : inMonth
                        ? 'bg-white hover:bg-zinc-50/70'
                        : 'bg-zinc-50/50 hover:bg-zinc-50'
                  }`}
                >
                  <span
                    className={`absolute left-1/2 top-1.5 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full text-[12px] ${
                      isToday
                        ? 'bg-violet-600 font-semibold text-white'
                        : inMonth
                          ? 'font-medium text-zinc-700'
                          : 'text-zinc-300'
                    }`}
                  >
                    {d.getDate()}
                  </span>
                  {(hidden[c] ?? 0) > 0 && (
                    <span className="absolute bottom-1 left-1.5 text-[10.5px] font-medium text-zinc-400">
                      +{hidden[c]} more
                    </span>
                  )}
                </div>
              );
            })}

            {placed
              .filter((p) => p.lane < MAX_LANES)
              .map((p) => {
                const isOverdue = new Date(p.todo.dueAt!) < now;
                const color =
                  p.todo.status === 'blocked'
                    ? '#d97706'
                    : isOverdue
                      ? '#dc2626'
                      : (p.todo.projectName && projectColors.get(p.todo.projectName)) ||
                        autoColor(p.todo.projectName);
                const dueStr = new Date(p.todo.dueAt!).toLocaleString([], {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                });
                const insetL = p.startsHere ? 3 : 0;
                const insetR = p.endsHere ? 3 : 0;
                return (
                  <Link
                    key={`${p.todo.id}-${w}`}
                    to={`/t/${p.todo.id}`}
                    onClick={(e) => e.stopPropagation()}
                    title={`${p.todo.title} — assigned ${p.start.toLocaleDateString([], { month: 'short', day: 'numeric' })}, finish by ${dueStr}`}
                    className={`absolute z-[5] flex items-center overflow-hidden px-1.5 text-[11px] font-medium leading-none text-white shadow-sm transition-[filter] hover:brightness-110 ${
                      p.startsHere ? 'rounded-l-md' : ''
                    } ${p.endsHere ? 'rounded-r-md' : ''}`}
                    style={{
                      left: `calc(${(p.sCol / 7) * 100}% + ${insetL}px)`,
                      width: `calc(${((p.eCol - p.sCol + 1) / 7) * 100}% - ${insetL + insetR}px)`,
                      top: BAR_TOP + p.lane * BAR_H,
                      height: BAR_H - 4,
                      background: color,
                    }}
                  >
                    <span className="truncate">{p.todo.title}</span>
                    {p.endsHere && (
                      <span className="ml-auto shrink-0 pl-1.5 text-[10px] opacity-80">
                        {new Date(p.todo.dueAt!).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </span>
                    )}
                  </Link>
                );
              })}
          </div>
        );
      })}
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

  const { blocked, overdue, undated, doneToday, byDay, spans } = useMemo(() => {
    const all = query.data?.todos ?? [];
    const open = all.filter(isOpen);

    // Each dated todo is a scheduling window: assigned (created) → deadline.
    // The calendar draws it as a continuous bar across those days.
    const spans: TodoSpan[] = [];
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
      spans.push({ todo: t, start: new Date(d), end });
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
      blocked: open.filter((t) => t.status === 'blocked'),
      overdue: open.filter((t) => t.status !== 'blocked' && t.dueAt && new Date(t.dueAt) < now),
      undated: open.filter((t) => t.status !== 'blocked' && !t.dueAt),
      doneToday: all.filter(
        (t) => t.status === 'done' && t.completedAt && dayKey(new Date(t.completedAt)) === todayStr,
      ),
      byDay,
      spans,
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
    byDay.size === 0 &&
    overdue.length === 0 &&
    blocked.length === 0 &&
    undated.length === 0 &&
    doneToday.length === 0;

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
            spans={spans}
            projectColors={projectColors}
            selected={selectedDay}
            onSelect={selectDay}
          />
          <p className="mb-6 mt-2 px-1 text-[11px] leading-relaxed text-zinc-400">
            Each bar is a todo's working window — it starts the day it was assigned and ends at
            its deadline (time shown on the bar) · red = overdue · click a day for details below.
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
              <Section icon={<Ban size={13} strokeWidth={2.5} />} label="Blocked" tone="amber" todos={blocked} />
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
