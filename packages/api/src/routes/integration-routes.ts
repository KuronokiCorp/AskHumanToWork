import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { integrations, syncJobs, todos, users } from '@askhumantowork/db';
import {
  adapters,
  canUseIntegrations,
  encryptSecret,
  getConnection,
  getProviderCredentials,
  getUserPlan,
  setProviderCredentials,
  type AppContext,
} from '@askhumantowork/core';
import { PROVIDERS, type Provider } from '@askhumantowork/shared';
import { requireAuth, requireScope } from '../auth.js';
import { env } from '../env.js';

function isProvider(p: string): p is Provider {
  return (PROVIDERS as readonly string[]).includes(p);
}

export function registerIntegrationRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = requireAuth(ctx);
  // in-memory OAuth state store (single-process dev server)
  const oauthStates = new Map<string, { userId: string; provider: Provider; expires: number }>();

  app.get(
    '/api/integrations',
    { preHandler: [auth, requireScope('integrations:read')] },
    async (req) => {
      const rows = await ctx.db.query.integrations.findMany({
        where: eq(integrations.userId, req.auth!.userId),
      });
      const configured = await Promise.all(
        PROVIDERS.map(async (p) => ({ p, creds: await getProviderCredentials(ctx, p) })),
      );
      const plan = await getUserPlan(ctx, req.auth!.userId);
      return {
        plan,
        integrationsEnabled: plan === 'pro',
        integrations: rows.map((r) => {
          const cfg = r.config as Record<string, unknown>;
          return {
            id: r.id,
            provider: r.provider,
            displayName: adapters[r.provider].displayName,
            capabilities: adapters[r.provider].capabilities,
            status: r.status,
            config: cfg,
            lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
            lastError: r.lastError,
          };
        }),
        availableProviders: configured
          .filter((c) => c.creds)
          .map((c) => ({
            provider: c.p,
            displayName: adapters[c.p].displayName,
            capabilities: adapters[c.p].capabilities,
          })),
      };
    },
  );

  // --- OAuth connect flow (web session only) ---

  app.get('/api/integrations/:provider/connect', { preHandler: auth }, async (req, reply) => {
    if (req.auth!.via !== 'session') return reply.code(403).send({ error: 'web session required' });
    const { provider } = req.params as { provider: string };
    if (!isProvider(provider)) return reply.code(404).send({ error: 'unknown provider' });
    if (!(await canUseIntegrations(ctx, req.auth!.userId))) {
      return reply
        .code(402)
        .send({ error: 'Third-party sync is a Pro feature. Upgrade to connect external apps.' });
    }
    const creds = await getProviderCredentials(ctx, provider);
    if (!creds) {
      return reply.code(400).send({
        error: `${provider} OAuth app not configured. Set client id/secret in Admin settings or env vars.`,
      });
    }
    const state = randomBytes(16).toString('hex');
    oauthStates.set(state, { userId: req.auth!.userId, provider, expires: Date.now() + 600_000 });
    const redirectUri = `${env.apiBaseUrl}/api/integrations/${provider}/callback`;
    return reply.redirect(adapters[provider].authorizeUrl(creds.clientId, redirectUri, state));
  });

  app.get('/api/integrations/:provider/callback', async (req, reply) => {
    const { provider } = req.params as { provider: string };
    const { code, state } = req.query as { code?: string; state?: string };
    if (!isProvider(provider) || !code || !state) {
      return reply.code(400).send({ error: 'invalid callback' });
    }
    const pending = oauthStates.get(state);
    oauthStates.delete(state);
    if (!pending || pending.expires < Date.now() || pending.provider !== provider) {
      return reply.code(400).send({ error: 'expired or invalid oauth state' });
    }
    const creds = await getProviderCredentials(ctx, provider);
    if (!creds) return reply.code(400).send({ error: 'provider not configured' });

    const redirectUri = `${env.apiBaseUrl}/api/integrations/${provider}/callback`;
    const tokens = await adapters[provider].exchangeCode(
      creds.clientId,
      creds.clientSecret,
      redirectUri,
      code,
    );
    await ctx.db
      .insert(integrations)
      .values({
        userId: pending.userId,
        provider,
        oauthTokensEnc: encryptSecret(JSON.stringify(tokens)),
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [integrations.userId, integrations.provider],
        set: { oauthTokensEnc: encryptSecret(JSON.stringify(tokens)), status: 'active', lastError: null },
      });
    return reply.redirect(`${env.webBaseUrl}/settings/integrations?connected=${provider}`);
  });

  // --- Config / lists / disconnect / resync ---

  app.get('/api/integrations/:id/lists', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await ctx.db.query.integrations.findFirst({
      where: and(eq(integrations.id, id), eq(integrations.userId, req.auth!.userId)),
    });
    if (!row) return reply.code(404).send({ error: 'not found' });
    const conn = await getConnection(ctx, row);
    return { lists: await adapters[row.provider].listTaskLists(conn) };
  });

  app.patch('/api/integrations/:id', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = req.body as { config?: Record<string, unknown> };
    const row = await ctx.db.query.integrations.findFirst({
      where: and(eq(integrations.id, id), eq(integrations.userId, req.auth!.userId)),
    });
    if (!row) return reply.code(404).send({ error: 'not found' });
    const merged = { ...(row.config as Record<string, unknown>), ...(body.config ?? {}) };
    await ctx.db.update(integrations).set({ config: merged }).where(eq(integrations.id, id));
    return { ok: true, config: merged };
  });

  app.delete('/api/integrations/:id', { preHandler: auth }, async (req) => {
    const { id } = req.params as { id: string };
    await ctx.db
      .update(integrations)
      .set({ status: 'revoked' })
      .where(and(eq(integrations.id, id), eq(integrations.userId, req.auth!.userId)));
    return { ok: true };
  });

  /** Force re-sync: enqueue outbound create/update for every open todo. */
  app.post('/api/integrations/:id/resync', { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await ctx.db.query.integrations.findFirst({
      where: and(eq(integrations.id, id), eq(integrations.userId, req.auth!.userId)),
    });
    if (!row) return reply.code(404).send({ error: 'not found' });
    const open = await ctx.db.query.todos.findMany({
      where: and(eq(todos.ownerId, req.auth!.userId), eq(todos.status, 'open')),
    });
    for (const todo of open) {
      const [job] = await ctx.db
        .insert(syncJobs)
        .values({ integrationId: row.id, todoId: todo.id, direction: 'outbound', action: 'update' })
        .returning();
      if (job) await ctx.queues.sync.add('outbound', { syncJobId: job.id }, { jobId: job.id });
    }
    return { ok: true, enqueued: open.length };
  });

  // --- Admin: provider OAuth app credentials ---

  app.post('/api/admin/provider-credentials', { preHandler: auth }, async (req, reply) => {
    const me = await ctx.db.query.users.findFirst({ where: eq(users.id, req.auth!.userId) });
    if (!me?.isAdmin) return reply.code(403).send({ error: 'admin only' });
    const { provider, clientId, clientSecret } = req.body as {
      provider: string;
      clientId: string;
      clientSecret: string;
    };
    if (!isProvider(provider)) return reply.code(400).send({ error: 'unknown provider' });
    await setProviderCredentials(ctx, provider, clientId, clientSecret);
    return { ok: true };
  });

  // Admin: set a user's plan (until real billing lands, this is the upgrade path).
  app.post('/api/admin/users/plan', { preHandler: auth }, async (req, reply) => {
    const me = await ctx.db.query.users.findFirst({ where: eq(users.id, req.auth!.userId) });
    if (!me?.isAdmin) return reply.code(403).send({ error: 'admin only' });
    const { email, plan } = req.body as { email: string; plan: 'free' | 'pro' };
    if (plan !== 'free' && plan !== 'pro') return reply.code(400).send({ error: 'invalid plan' });
    const [updated] = await ctx.db
      .update(users)
      .set({ plan })
      .where(eq(users.email, email))
      .returning();
    if (!updated) return reply.code(404).send({ error: 'user not found' });
    return { ok: true, email: updated.email, plan: updated.plan };
  });

  app.get('/api/admin/provider-credentials', { preHandler: auth }, async (req, reply) => {
    const me = await ctx.db.query.users.findFirst({ where: eq(users.id, req.auth!.userId) });
    if (!me?.isAdmin) return reply.code(403).send({ error: 'admin only' });
    const status = await Promise.all(
      PROVIDERS.map(async (p) => ({
        provider: p,
        displayName: adapters[p].displayName,
        configured: Boolean(await getProviderCredentials(ctx, p)),
      })),
    );
    return { providers: status };
  });
}
