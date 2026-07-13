import { useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import {
  Bell,
  Bot,
  CalendarCheck,
  KeyRound,
  LayoutList,
  LogOut,
  Plug,
  ShieldCheck,
} from 'lucide-react';
import { api, ApiError } from './api';
import { Logo } from './components/ui';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import TodosView from './pages/TodosView';
import TodoDetail from './pages/TodoDetail';
import SettingsTokens from './pages/SettingsTokens';
import SettingsIntegrations from './pages/SettingsIntegrations';
import SettingsNotifications from './pages/SettingsNotifications';
import SettingsAdmin from './pages/SettingsAdmin';

const nav = [
  { to: '/agenda', label: 'Agenda', Icon: CalendarCheck },
  { to: '/inbox-ai', label: 'AI Inbox', Icon: Bot },
  { to: '/all', label: 'All todos', Icon: LayoutList },
];

const settingsNav = [
  { to: '/settings/tokens', label: 'API tokens', Icon: KeyRound },
  { to: '/settings/integrations', label: 'Integrations', Icon: Plug },
  { to: '/settings/notifications', label: 'Notifications', Icon: Bell },
];

function SideLink({ to, label, Icon }: { to: string; label: string; Icon: typeof Bell }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `group flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors ${
          isActive ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
        }`
      }
    >
      <Icon size={16} strokeWidth={2} className="opacity-80" />
      {label}
    </NavLink>
  );
}

export default function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });

  if (me.isLoading) {
    return (
      <div className="flex h-screen items-center justify-center gap-3 text-zinc-400">
        <Logo size={26} /> Loading…
      </div>
    );
  }
  // Reset links arrive unauthenticated — handle before the login gate.
  if (location.pathname === '/reset-password') return <ResetPassword />;
  if (me.isError) return <Login onDone={() => me.refetch()} />;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 flex w-[232px] flex-col gap-0.5 bg-zinc-950 p-3">
        <div className="mb-4 flex items-center gap-2.5 px-2 pt-1.5">
          <Logo size={28} />
          <div className="leading-tight">
            <div className="text-[13.5px] font-bold text-white">AskHumanToWork</div>
            <div className="text-[10.5px] text-zinc-500">your AI asks · you do</div>
          </div>
        </div>

        {nav.map((n) => (
          <SideLink key={n.to} {...n} />
        ))}

        <div className="mb-1 mt-5 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-600">
          Projects
        </div>
        <ProjectNav />

        <div className="mb-1 mt-5 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-600">
          Settings
        </div>
        {settingsNav.map((n) => (
          <SideLink key={n.to} {...n} />
        ))}
        {me.data?.isAdmin && <SideLink to="/settings/admin" label="Admin" Icon={ShieldCheck} />}

        <div className="mt-auto border-t border-white/10 pt-3">
          <div className="truncate px-3 text-[11.5px] text-zinc-500">{me.data?.email}</div>
          <button
            className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-left text-[13.5px] font-medium text-zinc-400 transition-colors hover:bg-white/5 hover:text-zinc-200"
            onClick={async () => {
              await api.logout();
              location.href = '/';
            }}
          >
            <LogOut size={16} strokeWidth={2} className="opacity-80" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="ml-[232px] flex-1">
        <Routes>
          <Route path="/" element={<Navigate to="/agenda" replace />} />
          <Route path="/agenda" element={<TodosView view="agenda" />} />
          {/* Old time views now live inside Agenda; redirect for bookmarks + digest email links */}
          <Route path="/today" element={<Navigate to="/agenda" replace />} />
          <Route path="/upcoming" element={<Navigate to="/agenda" replace />} />
          <Route path="/overdue" element={<Navigate to="/agenda" replace />} />
          <Route path="/inbox-ai" element={<TodosView view="ai" />} />
          <Route path="/all" element={<TodosView view="all" />} />
          <Route path="/project/:name" element={<TodosView view="project" />} />
          <Route path="/t/:id" element={<TodoDetail />} />
          <Route path="/settings/tokens" element={<SettingsTokens />} />
          <Route path="/settings/integrations" element={<SettingsIntegrations />} />
          <Route path="/settings/notifications" element={<SettingsNotifications me={me.data!} />} />
          <Route path="/settings/admin" element={<SettingsAdmin />} />
        </Routes>
      </main>
    </div>
  );
}

function ProjectNav() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.projects });
  return (
    <>
      {(projects.data?.projects ?? []).map((p) => (
        <NavLink
          key={p.id}
          to={`/project/${encodeURIComponent(p.name)}`}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors ${
              isActive ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-200'
            }`
          }
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full ring-2 ring-white/10"
            style={{ background: p.color ?? '#71717a' }}
          />
          <span className="truncate">{p.name}</span>
        </NavLink>
      ))}
    </>
  );
}
