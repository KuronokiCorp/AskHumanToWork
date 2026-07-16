import type { FastifyInstance } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { agentTokens, projects, pushSubscriptions } from '@askhumantowork/db';
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
    const projectRows = await ctx.db.query.projects.findMany({
      where: eq(projects.ownerId, req.auth!.userId),
    });
    const projectName = new Map(projectRows.map((p) => [p.id, p.name]));
    return {
      tokens: rows.map((t) => ({
        id: t.id,
        name: t.name,
        scopes: t.scopes,
        kind: t.kind,
        projectId: t.projectId ?? null,
        projectName: t.projectId ? (projectName.get(t.projectId) ?? null) : null,
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
    // A scoped token must reference a project the caller actually owns.
    if (input.projectId) {
      const owned = await ctx.db.query.projects.findFirst({
        where: and(eq(projects.id, input.projectId), eq(projects.ownerId, req.auth!.userId)),
      });
      if (!owned) return reply.code(400).send({ error: 'project not found' });
    }
    const raw = generateToken('tfa');
    const [row] = await ctx.db
      .insert(agentTokens)
      .values({
        userId: req.auth!.userId,
        name: input.name,
        tokenHash: hashToken(raw),
        scopes: input.scopes,
        projectId: input.projectId ?? null,
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
