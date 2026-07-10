/**
 * Google Tasks adapter.
 * Docs: https://developers.google.com/tasks/reference/rest
 * Capability gaps vs us: due dates are DATE-ONLY (time is discarded by the API),
 * no priority, no reminders, no tags — the reminder engine stays ours.
 */
import type {
  ExternalChange,
  ExternalRef,
  ExternalTaskList,
  OAuthTokens,
  ProviderConnection,
  TodoProviderAdapter,
  TodoRow,
} from './adapter.js';

const API = 'https://tasks.googleapis.com/tasks/v1';
const SCOPE = 'https://www.googleapis.com/auth/tasks';

async function gFetch(conn: ProviderConnection, path: string, init?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${conn.tokens.accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Google Tasks ${init?.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

function toGoogleTask(todo: TodoRow, provenanceFooter: string) {
  // Priority has no field — surface high priority in the title instead.
  const title = todo.priority >= 3 ? `[!] ${todo.title}` : todo.title;
  const notes = [todo.notes, provenanceFooter].filter(Boolean).join('\n\n');
  return {
    title,
    notes,
    ...(todo.dueAt ? { due: todo.dueAt.toISOString() } : {}),
    status: todo.status === 'done' ? 'completed' : 'needsAction',
  };
}

async function defaultListId(conn: ProviderConnection): Promise<string> {
  if (conn.listId) return conn.listId;
  const data = (await gFetch(conn, '/users/@me/lists')) as { items: { id: string }[] };
  const first = data.items?.[0];
  if (!first) throw new Error('no Google Tasks list found');
  return first.id;
}

export const googleTasksAdapter: TodoProviderAdapter = {
  id: 'google-tasks',
  displayName: 'Google Tasks',
  capabilities: { dueTime: false, reminders: false, priority: false, tags: false, webhooks: false },

  authorizeUrl(clientId, redirectUri, state) {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPE,
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  },

  async exchangeCode(clientId, clientSecret, redirectUri, code) {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
      }),
    });
    if (!res.ok) throw new Error(`Google token exchange failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  },

  async refreshTokens(clientId, clientSecret, tokens): Promise<OAuthTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
      }),
    });
    if (!res.ok) throw new Error(`Google token refresh failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  },

  async listTaskLists(conn): Promise<ExternalTaskList[]> {
    const data = (await gFetch(conn, '/users/@me/lists')) as {
      items: { id: string; title: string }[];
    };
    return (data.items ?? []).map((l) => ({ id: l.id, name: l.title }));
  },

  async createTask(conn, todo, provenanceFooter): Promise<ExternalRef> {
    const listId = await defaultListId(conn);
    const created = (await gFetch(conn, `/lists/${listId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(toGoogleTask(todo, provenanceFooter)),
    })) as { id: string; etag?: string };
    return { externalId: created.id, externalListId: listId, etag: created.etag };
  },

  async updateTask(conn, ref, todo, provenanceFooter): Promise<ExternalRef> {
    const listId = ref.externalListId ?? (await defaultListId(conn));
    const updated = (await gFetch(conn, `/lists/${listId}/tasks/${ref.externalId}`, {
      method: 'PATCH',
      body: JSON.stringify(toGoogleTask(todo, provenanceFooter)),
    })) as { etag?: string } | null;
    return { ...ref, etag: updated?.etag ?? ref.etag };
  },

  async completeTask(conn, ref): Promise<void> {
    const listId = ref.externalListId ?? (await defaultListId(conn));
    await gFetch(conn, `/lists/${listId}/tasks/${ref.externalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
    });
  },

  async deleteTask(conn, ref): Promise<void> {
    const listId = ref.externalListId ?? (await defaultListId(conn));
    await gFetch(conn, `/lists/${listId}/tasks/${ref.externalId}`, { method: 'DELETE' });
  },

  /** Inbound: poll with updatedMin. Cursor = last poll ISO timestamp. */
  async listChanges(conn, cursor) {
    const listId = await defaultListId(conn);
    const params = new URLSearchParams({
      showCompleted: 'true',
      showHidden: 'true',
      showDeleted: 'true',
      maxResults: '100',
    });
    if (cursor) params.set('updatedMin', cursor);
    const data = (await gFetch(conn, `/lists/${listId}/tasks?${params}`)) as {
      items?: Array<{
        id: string;
        title?: string;
        notes?: string;
        status?: string;
        due?: string;
        deleted?: boolean;
        etag?: string;
      }>;
    } | null;
    const changes: ExternalChange[] = (data?.items ?? []).map((t) => ({
      externalId: t.id,
      externalListId: listId,
      title: t.title,
      notes: t.notes,
      completed: t.status === 'completed',
      dueAt: t.due ? new Date(t.due) : undefined,
      deleted: t.deleted,
      etag: t.etag,
    }));
    return { changes, cursor: new Date().toISOString() };
  },
};
