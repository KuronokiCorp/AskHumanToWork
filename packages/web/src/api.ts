import type { Agenda, Project, Todo } from '@askhumantowork/shared';

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? `HTTP ${res.status}`, res.status);
  }
  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export interface Me {
  id: string;
  email: string;
  timezone: string;
  notificationPrefs: {
    channels?: Record<string, boolean>;
    quietHours?: { start: string; end: string } | null;
    digest?: { enabled?: boolean; hour?: number };
  };
  isAdmin: boolean;
  plan: 'free' | 'pro';
}

export interface TokenRow {
  id: string;
  name: string;
  scopes: string[];
  kind: string;
  projectId: string | null;
  projectName: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface IntegrationRow {
  id: string;
  provider: string;
  displayName: string;
  capabilities: Record<string, boolean>;
  status: string;
  config: {
    defaultListId?: string;
    defaultListName?: string;
    direction?: string;
    filters?: { minPriority?: number; sourceOnly?: string; requireDueDate?: boolean };
  };
  lastSyncAt: string | null;
  lastError: string | null;
}

export const api = {
  // auth
  me: () => call<Me>('GET', '/api/auth/me'),
  login: (email: string, password: string) =>
    call('POST', '/api/auth/login', { email, password, mode: 'session' }),
  signup: (email: string, password: string, timezone: string) =>
    call('POST', '/api/auth/signup', { email, password, timezone }),
  logout: () => call('POST', '/api/auth/logout'),
  forgotPassword: (email: string) => call('POST', '/api/auth/forgot-password', { email }),
  resetPassword: (uid: string, exp: number, sig: string, password: string) =>
    call('POST', '/api/auth/reset-password', { uid, exp, sig, password }),
  updateMe: (patch: Partial<Pick<Me, 'timezone' | 'notificationPrefs'>>) =>
    call('PATCH', '/api/auth/me', patch),

  // todos
  agenda: () => call<Agenda>('GET', '/api/agenda'),
  todos: (params: Record<string, string>) =>
    call<{ todos: Todo[] }>('GET', `/api/todos?${new URLSearchParams(params)}`),
  todo: (id: string) => call<{ todo: Todo }>('GET', `/api/todos/${id}`),
  createTodo: (input: Record<string, unknown>) =>
    call<{ todo: Todo; deduplicated: boolean }>('POST', '/api/todos', input),
  updateTodo: (id: string, patch: Record<string, unknown>) =>
    call<{ todo: Todo }>('PATCH', `/api/todos/${id}`, patch),
  completeTodo: (id: string) => call<{ todo: Todo }>('POST', `/api/todos/${id}/complete`),
  snoozeTodo: (id: string, until: string) => call('POST', `/api/todos/${id}/snooze`, { until }),
  deleteTodo: (id: string) => call('DELETE', `/api/todos/${id}`),

  // projects
  projects: () => call<{ projects: Project[] }>('GET', '/api/projects'),
  createProject: (name: string, color?: string) =>
    call<{ project: Project }>('POST', '/api/projects', { name, color }),

  // tokens
  tokens: () => call<{ tokens: TokenRow[] }>('GET', '/api/tokens'),
  createToken: (name: string, scopes: string[], projectId?: string | null) =>
    call<{ id: string; token: string; mcpConfig: unknown }>('POST', '/api/tokens', {
      name,
      scopes,
      projectId: projectId ?? null,
    }),
  deleteToken: (id: string) => call('DELETE', `/api/tokens/${id}`),

  // integrations
  integrations: () =>
    call<{
      plan: 'free' | 'pro';
      integrationsEnabled: boolean;
      integrations: IntegrationRow[];
      availableProviders: { provider: string; displayName: string; capabilities: Record<string, boolean> }[];
    }>('GET', '/api/integrations'),
  integrationLists: (id: string) => call<{ lists: { id: string; name: string }[] }>('GET', `/api/integrations/${id}/lists`),
  updateIntegration: (id: string, config: Record<string, unknown>) =>
    call('PATCH', `/api/integrations/${id}`, { config }),
  disconnectIntegration: (id: string) => call('DELETE', `/api/integrations/${id}`),
  resyncIntegration: (id: string) => call<{ enqueued: number }>('POST', `/api/integrations/${id}/resync`),

  // admin
  adminProviders: () =>
    call<{ providers: { provider: string; displayName: string; configured: boolean }[] }>('GET', '/api/admin/provider-credentials'),
  setAdminProvider: (provider: string, clientId: string, clientSecret: string) =>
    call('POST', '/api/admin/provider-credentials', { provider, clientId, clientSecret }),
  setUserPlan: (email: string, plan: 'free' | 'pro') =>
    call<{ ok: boolean; email: string; plan: string }>('POST', '/api/admin/users/plan', { email, plan }),

  // push
  vapidKey: () => call<{ key: string }>('GET', '/api/push/vapid-public-key'),
  subscribePush: (sub: PushSubscriptionJSON) => call('POST', '/api/push-subscriptions', sub),
};
