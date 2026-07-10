import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { agentTokens, users } from '@askhumantowork/db';
import { generateToken, hashToken, type AppContext } from '@askhumantowork/core';
import { loginInputSchema, signupInputSchema } from '@askhumantowork/shared';
import { requireAuth } from '../auth.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  app.post('/api/auth/signup', async (req, reply) => {
    const input = signupInputSchema.parse(req.body);
    const existing = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (existing) return reply.code(409).send({ error: 'email already registered' });
    const [user] = await ctx.db
      .insert(users)
      .values({
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        timezone: input.timezone,
      })
      .returning();
    req.session.userId = user!.id;
    return { id: user!.id, email: user!.email, timezone: user!.timezone };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const input = loginInputSchema.parse(req.body);
    const user = await ctx.db.query.users.findFirst({ where: eq(users.email, input.email) });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      return reply.code(401).send({ error: 'invalid credentials' });
    }
    if (input.mode === 'token') {
      // Mobile: long-lived device token via the agent_tokens table.
      const raw = generateToken('tfd');
      await ctx.db.insert(agentTokens).values({
        userId: user.id,
        name: input.deviceName ?? 'mobile-device',
        tokenHash: hashToken(raw),
        scopes: ['todos:read', 'todos:write', 'projects:read', 'integrations:read'],
        kind: 'device',
      });
      return { token: raw, user: { id: user.id, email: user.email, timezone: user.timezone } };
    }
    req.session.userId = user.id;
    return { id: user.id, email: user.email, timezone: user.timezone };
  });

  app.post('/api/auth/logout', async (req) => {
    await req.session.destroy();
    return { ok: true };
  });

  app.get('/api/auth/me', { preHandler: requireAuth(ctx) }, async (req, reply) => {
    const user = await ctx.db.query.users.findFirst({
      where: eq(users.id, req.auth!.userId),
    });
    if (!user) return reply.code(404).send({ error: 'not found' });
    return {
      id: user.id,
      email: user.email,
      timezone: user.timezone,
      notificationPrefs: user.notificationPrefs,
      isAdmin: user.isAdmin,
      plan: user.plan,
    };
  });

  app.patch('/api/auth/me', { preHandler: requireAuth(ctx) }, async (req) => {
    const body = req.body as { timezone?: string; notificationPrefs?: unknown };
    const patch: Record<string, unknown> = {};
    if (body.timezone) patch.timezone = body.timezone;
    if (body.notificationPrefs) patch.notificationPrefs = body.notificationPrefs;
    const [user] = await ctx.db
      .update(users)
      .set(patch)
      .where(eq(users.id, req.auth!.userId))
      .returning();
    return { id: user!.id, timezone: user!.timezone, notificationPrefs: user!.notificationPrefs };
  });
}
