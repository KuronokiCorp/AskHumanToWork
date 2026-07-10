import { useQuery } from '@tanstack/react-query';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { api, ApiError } from './api';
import Login from './pages/Login';
import TodosView from './pages/TodosView';
import TodoDetail from './pages/TodoDetail';
import SettingsTokens from './pages/SettingsTokens';
import SettingsIntegrations from './pages/SettingsIntegrations';
import SettingsNotifications from './pages/SettingsNotifications';
import SettingsAdmin from './pages/SettingsAdmin';

const nav = [
  { to: '/today', label: 'Today', icon: '📅' },
  { to: '/upcoming', label: 'Upcoming', icon: '🗓' },
  { to: '/overdue', label: 'Overdue', icon: '🔥' },
  { to: '/inbox-ai', label: 'AI Inbox', icon: '🤖' },
  { to: '/all', label: 'All todos', icon: '📋' },
];

const settingsNav = [
  { to: '/settings/tokens', label: 'API tokens (MCP)' },
  { to: '/settings/integrations', label: 'Integrations' },
  { to: '/settings/notifications', label: 'Notifications' },
];

export default function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
  });

  if (me.isLoading) {
    return <div className="flex h-screen items-center justify-center text-zinc-400">Loading…</div>;
  }
  if (me.isError) return <Login onDone={() => me.refetch()} />;

  const projects = <ProjectNav />;

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-zinc-200 bg-white p-4 flex flex-col gap-1">
        <div className="mb-4 flex items-center gap-2 px-2">
          <span className="text-xl">✅</span>
          <span className="font-bold">AskHumanToWork</span>
        </div>
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100'}`
            }
          >
            <span className="mr-2">{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
        <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Projects</div>
        {projects}
        <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Settings</div>
        {settingsNav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100'}`
            }
          >
            {n.label}
          </NavLink>
        ))}
        {me.data?.isAdmin && (
          <NavLink
            to="/settings/admin"
            className={({ isActive }) =>
              `rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100'}`
            }
          >
            Admin
          </NavLink>
        )}
        <div className="mt-auto pt-4">
          <div className="px-3 text-xs text-zinc-400">{me.data?.email}</div>
          <button
            className="mt-1 w-full rounded-lg px-3 py-1.5 text-left text-sm text-zinc-500 hover:bg-zinc-100"
            onClick={async () => {
              await api.logout();
              location.href = '/';
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodosView view="today" />} />
          <Route path="/upcoming" element={<TodosView view="upcoming" />} />
          <Route path="/overdue" element={<TodosView view="overdue" />} />
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
            `flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-50 font-medium text-indigo-700' : 'text-zinc-600 hover:bg-zinc-100'}`
          }
        >
          <span className="h-2 w-2 rounded-full" style={{ background: p.color ?? '#a1a1aa' }} />
          {p.name}
        </NavLink>
      ))}
    </>
  );
}
