import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { agentTokens, users, webSessions } from '@askhumantowork/db';
import { generateToken, hashToken, signAction, verifyAction, type AppContext } from '@askhumantowork/core';
import { loginInputSchema, signupInputSchema } from '@askhumantowork/shared';
import { requireAuth } from '../auth.js';
import { sendEmail } from '../notify.js';
import { env } from '../env.js';

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  // Credential endpoints get strict limits (brute-force protection).
  const strictLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/api/auth/signup', strictLimit, async (req, reply) => {
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

  app.post('/api/auth/login', strictLimit, async (req, reply) => {
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

  // --- Password reset (HMAC-signed link, 1h expiry, no user enumeration) ---

  app.post('/api/auth/forgot-password', strictLimit, async (req) => {
    const { email } = req.body as { email: string };
    const user = await ctx.db.query.users.findFirst({ where: eq(users.email, email ?? '') });
    if (user) {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      const sig = signAction(user.id, 'pwreset', exp);
      const link = `${env.webBaseUrl}/reset-password?uid=${user.id}&exp=${exp}&sig=${sig}`;
      await sendEmail(user.email, {
        title: 'Reset your AskHumanToWork password',
        body: `Someone (hopefully you) requested a password reset. The link below is valid for 1 hour. If you didn't request this, ignore this email.`,
        url: link,
      }).catch((err) => app.log.error({ err }, 'reset email failed'));
    }
    // Always the same response — never reveal whether the email exists.
    return { ok: true };
  });

  app.post('/api/auth/reset-password', strictLimit, async (req, reply) => {
    const { uid, exp, sig, password } = req.body as {
      uid: string;
      exp: number;
      sig: string;
      password: string;
    };
    if (!uid || !sig || !verifyAction(uid, 'pwreset', Number(exp), sig)) {
      return reply.code(403).send({ error: 'Reset link is invalid or expired.' });
    }
    if (!password || password.length < 8) {
      return reply.code(400).send({ error: 'Password must be at least 8 characters.' });
    }
    const [user] = await ctx.db
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10) })
      .where(eq(users.id, uid))
      .returning();
    if (!user) return reply.code(404).send({ error: 'user not found' });
    // Invalidate every existing web session for this account.
    await ctx.db.delete(webSessions).where(sql`data->>'userId' = ${uid}`);
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
