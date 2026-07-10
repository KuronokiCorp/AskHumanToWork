import { eq } from 'drizzle-orm';
import { integrations, providerCredentials } from '@askhumantowork/db';
import type { Provider } from '@askhumantowork/shared';
import type { AppContext } from '../context.js';
import { decryptSecret, encryptSecret } from '../crypto.js';
import type { OAuthTokens, ProviderConnection, TodoProviderAdapter } from './adapter.js';
import { msTodoAdapter } from './ms-todo.js';
import { googleTasksAdapter } from './google-tasks.js';

export const adapters: Record<Provider, TodoProviderAdapter> = {
  'ms-todo': msTodoAdapter,
  'google-tasks': googleTasksAdapter,
};

const ENV_KEYS: Record<Provider, { id: string; secret: string }> = {
  'ms-todo': { id: 'MS_TODO_CLIENT_ID', secret: 'MS_TODO_CLIENT_SECRET' },
  'google-tasks': { id: 'GOOGLE_TASKS_CLIENT_ID', secret: 'GOOGLE_TASKS_CLIENT_SECRET' },
};

/** OAuth app credentials: admin-configured DB row wins, env vars as fallback. */
export async function getProviderCredentials(
  ctx: AppContext,
  provider: Provider,
): Promise<{ clientId: string; clientSecret: string } | null> {
  const row = await ctx.db.query.providerCredentials.findFirst({
    where: eq(providerCredentials.provider, provider),
  });
  if (row) return { clientId: row.clientId, clientSecret: decryptSecret(row.clientSecretEnc) };
  const keys = ENV_KEYS[provider];
  const clientId = process.env[keys.id];
  const clientSecret = process.env[keys.secret];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export async function setProviderCredentials(
  ctx: AppContext,
  provider: Provider,
  clientId: string,
  clientSecret: string,
): Promise<void> {
  await ctx.db
    .insert(providerCredentials)
    .values({ provider, clientId, clientSecretEnc: encryptSecret(clientSecret) })
    .onConflictDoUpdate({
      target: providerCredentials.provider,
      set: { clientId, clientSecretEnc: encryptSecret(clientSecret), updatedAt: new Date() },
    });
}

type IntegrationRow = typeof integrations.$inferSelect;

/**
 * Build a live connection for an integration, refreshing the access token if
 * it expires within 2 minutes (refreshed tokens are persisted).
 */
export async function getConnection(
  ctx: AppContext,
  integration: IntegrationRow,
): Promise<ProviderConnection> {
  let tokens = JSON.parse(decryptSecret(integration.oauthTokensEnc)) as OAuthTokens;
  if (tokens.expiresAt && tokens.expiresAt < Date.now() + 120_000 && tokens.refreshToken) {
    const creds = await getProviderCredentials(ctx, integration.provider);
    if (!creds) throw new Error(`no OAuth credentials configured for ${integration.provider}`);
    tokens = await adapters[integration.provider].refreshTokens(
      creds.clientId,
      creds.clientSecret,
      tokens,
    );
    await ctx.db
      .update(integrations)
      .set({ oauthTokensEnc: encryptSecret(JSON.stringify(tokens)) })
      .where(eq(integrations.id, integration.id));
  }
  const cfg = integration.config as { defaultListId?: string };
  return { integrationId: integration.id, tokens, listId: cfg.defaultListId };
}
