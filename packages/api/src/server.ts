import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { IoredisSessionStore } from './session-store.js';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { users } from '@askhumantowork/db';
import { formatInTimezone, resolveNaturalDate } from '@askhumantowork/shared';
import type { AppContext } from '@askhumantowork/core';
import { env } from './env.js';
import { registerAuthRoutes } from './routes/auth-routes.js';
import { registerTodoRoutes } from './routes/todo-routes.js';
import { registerTokenRoutes } from './routes/token-routes.js';
import { registerIntegrationRoutes } from './routes/integration-routes.js';
import { registerMcpHttp } from './mcp-http.js';
import { requireAuth } from './auth.js';

export async function buildServer(ctx: AppContext) {
  const app = Fastify({
    logger: { level: 'info' },
    trustProxy: env.trustProxy,
  });

  await app.register(cors, { origin: env.webBaseUrl, credentials: true });
  await app.register(cookie);
  await app.register(session, {
    secret: env.sessionSecret,
    // Redis-backed: sessions survive API restarts and scale horizontally.
    store: new IoredisSessionStore(ctx.redis) as never,
    cookie: {
      secure: env.cookieSecure,
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 30 * 24 * 3_600_000,
    },
    saveUninitialized: false,
  });

  // Baseline abuse protection; auth endpoints get stricter limits below.
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    redis: ctx.redis,
    nameSpace: 'rl:',
    allowList: () => false,
  });

  app.get('/api/health', { config: { rateLimit: false } }, async () => ({ ok: true }));

  // Natural-language time resolution (used by MCP resolve_time and clients).
  app.post('/api/resolve-time', { preHandler: requireAuth(ctx) }, async (req, reply) => {
    const { text } = req.body as { text: string };
    const user = await ctx.db.query.users.findFirst({ where: eq(users.id, req.auth!.userId) });
    if (!user) return reply.code(404).send({ error: 'user not found' });
    const resolved = resolveNaturalDate(text, user.timezone);
    if (!resolved) return reply.code(400).send({ error: `cannot parse "${text}"` });
    return {
      iso: resolved.toISOString(),
      display: formatInTimezone(resolved, user.timezone),
      timezone: user.timezone,
    };
  });

  registerAuthRoutes(app, ctx);
  registerTodoRoutes(app, ctx);
  registerTokenRoutes(app, ctx);
  registerIntegrationRoutes(app, ctx);
  registerMcpHttp(app, ctx);

  // Production: serve the built web app from this process (single-container deploy).
  if (env.serveWeb) {
    const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist');
    if (existsSync(webDist)) {
      await app.register(fastifyStatic, { root: webDist, wildcard: false });
      // SPA fallback for client-side routes
      app.setNotFoundHandler((req, reply) => {
        if (req.method === 'GET' && !req.url.startsWith('/api') && !req.url.startsWith('/mcp')) {
          return reply.sendFile('index.html');
        }
        return reply.code(404).send({ error: 'not found' });
      });
      app.log.info(`serving web app from ${webDist}`);
    } else {
      app.log.warn(`SERVE_WEB=true but ${webDist} not found — did you build the web package?`);
    }
  }

  return app;
}
