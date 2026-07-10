import type { Provider } from '@askhumantowork/shared';
import type { todos } from '@askhumantowork/db';

export type TodoRow = typeof todos.$inferSelect;

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt?: number;
}

export interface ProviderConnection {
  integrationId: string;
  tokens: OAuthTokens;
  /** Provider-specific target list/folder id. */
  listId?: string;
}

export interface ExternalRef {
  externalId: string;
  externalListId?: string;
  etag?: string;
}

export interface ExternalChange {
  externalId: string;
  externalListId?: string;
  /** Only fields the provider reports; undefined = unchanged/unknown. */
  title?: string;
  notes?: string;
  dueAt?: Date | null;
  completed?: boolean;
  deleted?: boolean;
  etag?: string;
}

export interface ExternalTaskList {
  id: string;
  name: string;
}

export interface AdapterCapabilities {
  dueTime: boolean; // due dates with a time component
  reminders: boolean;
  priority: boolean;
  tags: boolean;
  webhooks: boolean; // false → inbound via polling
}

/**
 * Contract every external todo provider implements.
 * Adding a provider = one new file implementing this + registry entry.
 */
export interface TodoProviderAdapter {
  id: Provider;
  displayName: string;
  capabilities: AdapterCapabilities;

  authorizeUrl(clientId: string, redirectUri: string, state: string): string;
  exchangeCode(
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string,
  ): Promise<OAuthTokens>;
  refreshTokens(clientId: string, clientSecret: string, tokens: OAuthTokens): Promise<OAuthTokens>;

  listTaskLists(conn: ProviderConnection): Promise<ExternalTaskList[]>;
  createTask(conn: ProviderConnection, todo: TodoRow, provenanceFooter: string): Promise<ExternalRef>;
  updateTask(conn: ProviderConnection, ref: ExternalRef, todo: TodoRow, provenanceFooter: string): Promise<ExternalRef>;
  completeTask(conn: ProviderConnection, ref: ExternalRef): Promise<void>;
  deleteTask(conn: ProviderConnection, ref: ExternalRef): Promise<void>;
  /** Incremental inbound changes since the cursor; returns new cursor. */
  listChanges(
    conn: ProviderConnection,
    cursor: string | null,
  ): Promise<{ changes: ExternalChange[]; cursor: string | null }>;
}
