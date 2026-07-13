import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { agentTokens, pushSubscriptions } from '@askhumantowork/db';
import { generateToken, hashToken, type AppContext } from '@askhumantowork/core';
import { createTokenInputSchema } from '@askhumantowork/shared';
import { requireAuth } from '../auth.js';
import { env } from '../env.js';

export function registerTokenRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = requireAuth(ctx);

  // --- Personal Access Tokens (MCP) ---

  app.get('/api/tokens', { preHandler: auth }, async (req) => {
    const rows = await ctx.db.query.agentTokens.findMany({
      where: and(eq(agentTokens.userId, req.auth!.userId)),
      orderBy: (t, { desc }) => desc(t.createdAt),
    });
    return {
      tokens: rows.map((t) => ({
        id: t.id,
        name: t.name,
        scopes: t.scopes,
        kind: t.kind,
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
        createdAt: t.createdAt.toISOString(),
      })),
    };
  });

  app.post('/api/tokens', { preHandler: auth }, async (req, reply) => {
    if (req.auth!.via !== 'session') {
      return reply.code(403).send({ error: 'tokens can only be created from a web session' });
    }
    const input = createTokenInputSchema.parse(req.body);
    const raw = generateToken('tfa');
    const [row] = await ctx.db
      .insert(agentTokens)
      .values({
        userId: req.auth!.userId,
        name: input.name,
        tokenHash: hashToken(raw),
        scopes: input.scopes,
        kind: 'pat',
      })
      .returning();
    return {
      id: row!.id,
      token: raw, // shown once
      mcpConfig: {
        stdio: {
          command: 'npx',
          args: ['-y', 'heyhuman-mcp'],
          env: { TODO_API_TOKEN: raw, TODO_API_URL: env.apiBaseUrl },
        },
        http: { url: `${env.apiBaseUrl}/mcp`, headers: { Authorization: `Bearer ${raw}` } },
      },
    };
  });

  app.delete('/api/tokens/:id', { preHandler: auth }, async (req) => {
    const { id } = req.params as { id: string };
    await ctx.db
      .delete(agentTokens)
      .where(and(eq(agentTokens.id, id), eq(agentTokens.userId, req.auth!.userId)));
    return { ok: true };
  });

  // --- Web push subscriptions ---

  app.get('/api/push/vapid-public-key', async () => ({ key: env.vapid.publicKey }));

  app.post('/api/push-subscriptions', { preHandler: auth }, async (req) => {
    const body = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
    await ctx.db
      .insert(pushSubscriptions)
      .values({ userId: req.auth!.userId, endpoint: body.endpoint, keys: body.keys })
      .onConflictDoNothing();
    return { ok: true };
  });
}
