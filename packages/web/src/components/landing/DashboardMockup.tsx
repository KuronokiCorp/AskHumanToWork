import {
  Bot,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Copy,
  Grid,
  LayoutList,
  Monitor,
  PanelLeft,
  Plus,
  RotateCw,
  Share,
  Sparkles,
} from 'lucide-react';
import { Logo } from '../ui';

/**
 * A still of the product, dressed as a browser window. Every figure below is
 * illustrative copy, not live data — it exists to show what an agenda filled
 * by agents looks like, including the provenance that is the whole point.
 */

const STATS = [
  { label: 'CAPTURED', value: '62', sub: 'By your agents' },
  { label: 'PROJECTS', value: '12', sub: 'Across your work' },
  { label: 'BLOCKED', value: '4', sub: 'Waiting on someone' },
  { label: 'REACH', value: '1,204', sub: 'Reminders sent' },
];

const PROJECTS = [
  { name: 'Platform', count: '18 open', tone: 'bg-violet-500' },
  { name: 'Release 2.4', count: '9 open', tone: 'bg-emerald-500' },
  { name: 'Research', count: '6 open', tone: 'bg-amber-500' },
];

const INBOX = [
  { title: 'Review the auth PR', agent: 'claude-code', due: 'Today 15:00', status: 'Open' },
  { title: 'Reply to the DBA about the migration', agent: 'claude-desktop', due: 'Today 17:30', status: 'Open' },
  { title: 'Ship the release notes', agent: 'claude-code', due: 'Fri 17:00', status: 'Blocked' },
  { title: 'Follow up on the flaky CI test', agent: 'claude-code', due: 'Mon 09:00', status: 'Open' },
  { title: 'Send the Q3 architecture doc', agent: 'claude-desktop', due: 'Overdue', status: 'Overdue' },
];

const STATUS_TONE: Record<string, string> = {
  Open: 'text-white/45',
  Blocked: 'text-[#febc2e]/80',
  Overdue: 'text-[#ff5f57]/80',
};

export default function DashboardMockup() {
  return (
    <div className="overflow-hidden rounded-t-2xl bg-[#1a1a1c] text-left shadow-[0_-20px_80px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
      {/* Title bar */}
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#242427] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div className="ml-2 flex items-center gap-2">
          <PanelLeft className="h-3.5 w-3.5 text-white/40" />
          <ChevronLeft className="h-3.5 w-3.5 text-white/40" />
          <ChevronRight className="h-3.5 w-3.5 text-white/25" />
        </div>
        <div className="mx-auto flex items-center gap-1.5 rounded-md bg-[#1a1a1c] px-6 py-1 text-[10px] text-white/60">
          <Monitor className="h-3 w-3" />
          askhumantowork.app
        </div>
        <div className="flex items-center gap-2">
          <RotateCw className="h-3.5 w-3.5 text-white/40" />
          <Share className="h-3.5 w-3.5 text-white/40" />
          <Plus className="h-3.5 w-3.5 text-white/40" />
          <Copy className="h-3.5 w-3.5 text-white/40" />
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-[22%] border-r border-white/5 bg-[#1e1e21] px-3 py-3.5">
          <div className="mb-4 flex items-center justify-between">
            <Logo size={16} />
            <Grid className="h-3.5 w-3.5 text-white/30" />
          </div>

          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-violet-600 text-[8px] font-bold text-white">
              A
            </span>
            <span className="text-[10px] text-white/80">Your agenda</span>
          </div>

          <nav className="space-y-2">
            {[
              { Icon: CalendarCheck, label: 'Agenda' },
              { Icon: Bot, label: 'AI Inbox' },
              { Icon: LayoutList, label: 'All todos' },
            ].map(({ Icon, label }) => (
              <div key={label} className="flex items-center gap-2 text-[10px] text-white/60">
                <Icon className="h-3 w-3" />
                {label}
              </div>
            ))}
          </nav>

          <div className="mt-5 space-y-2">
            <div className="text-[8px] uppercase tracking-wider text-white/30">Projects</div>
            {PROJECTS.map((p) => (
              <div key={p.name} className="flex items-center gap-2 text-[10px] text-white/55">
                <span className={`h-1.5 w-1.5 rounded-full ${p.tone}`} />
                {p.name}
              </div>
            ))}
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 px-4 py-3.5">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">
              A
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium text-white">Today</div>
              <div className="text-[10px] text-white/45">
                6 captured by your agents · 4 blocked · 1 overdue
              </div>
            </div>
            <button className="flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1.5 text-[10px] text-white/80">
              <Sparkles className="h-3 w-3" />
              Briefing
            </button>
          </div>

          {/* Stats */}
          <div className="mb-4 grid grid-cols-4 divide-x divide-white/5 rounded-xl bg-white/[0.03] ring-1 ring-white/5">
            {STATS.map((s) => (
              <div key={s.label} className="px-3 py-2.5">
                <div className="text-[8px] tracking-wider text-white/35">{s.label}</div>
                <div className="text-xl font-medium text-white">{s.value}</div>
                <div className="text-[8px] text-white/35">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Projects */}
          <div className="mb-4 grid grid-cols-3 gap-2">
            {PROJECTS.map((p) => (
              <div key={p.name} className="rounded-lg bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/5">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${p.tone}`} />
                  <span className="text-[10px] text-white/80">{p.name}</span>
                </div>
                <div className="mt-1 text-[9px] text-white/35">{p.count}</div>
              </div>
            ))}
          </div>

          {/* Inbox */}
          <div className="rounded-lg bg-white/[0.03] ring-1 ring-white/5">
            <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
              <span className="text-[10px] text-white/70">AI Inbox</span>
              <span className="text-[8px] tracking-wider text-white/30">CAPTURED BY AGENTS</span>
            </div>
            {INBOX.map((row) => (
              <div
                key={row.title}
                className="flex items-center gap-3 border-b border-white/5 px-3 py-2 last:border-b-0"
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/20" />
                <span className="flex-1 truncate text-[10px] text-white/80">{row.title}</span>
                <span className="flex items-center gap-1 text-[9px] text-violet-300/70">
                  <Bot className="h-2.5 w-2.5" />
                  {row.agent}
                </span>
                <span className="w-20 text-right text-[9px] text-white/40">{row.due}</span>
                <span className={`w-14 text-right text-[9px] ${STATUS_TONE[row.status]}`}>
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
