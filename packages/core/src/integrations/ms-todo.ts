/**
 * Microsoft To Do adapter — Microsoft Graph API.
 * Docs: https://learn.microsoft.com/en-us/graph/api/resources/todo-overview
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

const GRAPH = 'https://graph.microsoft.com/v1.0';
const AUTH_BASE = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const SCOPES = 'offline_access Tasks.ReadWrite';

async function graphFetch(conn: ProviderConnection, path: string, init?: RequestInit) {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${conn.tokens.accessToken}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Graph ${init?.method ?? 'GET'} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

function toGraphTask(todo: TodoRow, provenanceFooter: string) {
  const importance = todo.priority >= 3 ? 'high' : todo.priority >= 1 ? 'normal' : 'low';
  const body = [todo.notes, provenanceFooter].filter(Boolean).join('\n\n');
  return {
    title: todo.title,
    importance,
    body: { content: body, contentType: 'text' },
    ...(todo.dueAt
      ? {
          dueDateTime: { dateTime: todo.dueAt.toISOString().replace('Z', ''), timeZone: 'UTC' },
          isReminderOn: true,
          reminderDateTime: { dateTime: todo.dueAt.toISOString().replace('Z', ''), timeZone: 'UTC' },
        }
      : {}),
    ...(todo.tags.length ? { categories: todo.tags } : {}),
  };
}

async function defaultListId(conn: ProviderConnection): Promise<string> {
  if (conn.listId) return conn.listId;
  const data = (await graphFetch(conn, '/me/todo/lists')) as { value: { id: string; wellknownListName?: string }[] };
  const def = data.value.find((l) => l.wellknownListName === 'defaultList') ?? data.value[0];
  if (!def) throw new Error('no MS To Do list found');
  return def.id;
}

export const msTodoAdapter: TodoProviderAdapter = {
  id: 'ms-todo',
  displayName: 'Microsoft To Do',
  capabilities: { dueTime: true, reminders: true, priority: true, tags: true, webhooks: false },

  authorizeUrl(clientId, redirectUri, state) {
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      state,
    });
    return `${AUTH_BASE}/authorize?${params}`;
  },

  async exchangeCode(clientId, clientSecret, redirectUri, code) {
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code,
        scope: SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`MS token exchange failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  },

  async refreshTokens(clientId, clientSecret, tokens): Promise<OAuthTokens> {
    const res = await fetch(`${AUTH_BASE}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken ?? '',
        scope: SCOPES,
      }),
    });
    if (!res.ok) throw new Error(`MS token refresh failed: ${await res.text()}`);
    const data = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? tokens.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  },

  async listTaskLists(conn): Promise<ExternalTaskList[]> {
    const data = (await graphFetch(conn, '/me/todo/lists')) as {
      value: { id: string; displayName: string }[];
    };
    return data.value.map((l) => ({ id: l.id, name: l.displayName }));
  },

  async createTask(conn, todo, provenanceFooter): Promise<ExternalRef> {
    const listId = await defaultListId(conn);
    const created = (await graphFetch(conn, `/me/todo/lists/${listId}/tasks`, {
      method: 'POST',
      body: JSON.stringify(toGraphTask(todo, provenanceFooter)),
    })) as { id: string; '@odata.etag'?: string };
    return { externalId: created.id, externalListId: listId, etag: created['@odata.etag'] };
  },

  async updateTask(conn, ref, todo, provenanceFooter): Promise<ExternalRef> {
    const listId = ref.externalListId ?? (await defaultListId(conn));
    const updated = (await graphFetch(conn, `/me/todo/lists/${listId}/tasks/${ref.externalId}`, {
      method: 'PATCH',
      body: JSON.stringify(toGraphTask(todo, provenanceFooter)),
    })) as { '@odata.etag'?: string } | null;
    return { ...ref, etag: updated?.['@odata.etag'] ?? ref.etag };
  },

  async completeTask(conn, ref): Promise<void> {
    const listId = ref.externalListId ?? (await defaultListId(conn));
    await graphFetch(conn, `/me/todo/lists/${listId}/tasks/${ref.externalId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed' }),
    });
  },

  async deleteTask(conn, ref): Promise<void> {
    const listId = ref.externalListId ?? (await defaultListId(conn));
    await graphFetch(conn, `/me/todo/lists/${listId}/tasks/${ref.externalId}`, { method: 'DELETE' });
  },

  /**
   * Inbound changes via Graph delta query on the target list.
   * Cursor = deltaLink. First call does a full sync.
   */
  async listChanges(conn, cursor) {
    const listId = await defaultListId(conn);
    let url = cursor ?? `${GRAPH}/me/todo/lists/${listId}/tasks/delta`;
    const changes: ExternalChange[] = [];
    let nextCursor: string | null = cursor;

    for (let page = 0; page < 20; page++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${conn.tokens.accessToken}` },
      });
      if (!res.ok) throw new Error(`Graph delta failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as {
        value: Array<{
          id: string;
          title?: string;
          status?: string;
          dueDateTime?: { dateTime: string; timeZone: string } | null;
          '@removed'?: unknown;
          '@odata.etag'?: string;
        }>;
        '@odata.nextLink'?: string;
        '@odata.deltaLink'?: string;
      };
      for (const t of data.value) {
        changes.push({
          externalId: t.id,
          externalListId: listId,
          title: t.title,
          completed: t.status === 'completed' ? true : t.status ? false : undefined,
          dueAt: t.dueDateTime === null ? null : t.dueDateTime ? new Date(t.dueDateTime.dateTime + 'Z') : undefined,
          deleted: '@removed' in t ? true : undefined,
          etag: t['@odata.etag'],
        });
      }
      if (data['@odata.nextLink']) {
        url = data['@odata.nextLink'];
        continue;
      }
      nextCursor = data['@odata.deltaLink'] ?? null;
      break;
    }
    return { changes, cursor: nextCursor };
  },
};
