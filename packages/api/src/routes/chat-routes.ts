import type { FastifyInstance } from 'fastify';
import {
  MiniMaxChatClient,
  StripeBillingService,
  TodoChatService,
  UserFacingError,
  stripeConfigFromEnv,
  usageSummary,
  type AppContext,
} from '@askhumantowork/core';
import { sendTodoMessageInputSchema } from '@askhumantowork/shared';
import { env } from '../env.js';
import { requireAuth, requireScope, tokenProjectScope } from '../auth.js';

/**
 * Per-todo AI chat + the billing surface behind it.
 *
 * Both are optional deployments: without MINIMAX_API_KEY the chat endpoints
 * return 503, and without Stripe keys the billing endpoints do the same. The
 * rest of the app runs unchanged either way.
 */
export async function registerChatRoutes(app: FastifyInstance, ctx: AppContext) {
  const auth = requireAuth(ctx);
  const stripeConfig = stripeConfigFromEnv();
  const billing = stripeConfig ? new StripeBillingService(ctx, stripeConfig) : null;
  const chat = env.minimax.apiKey
    ? new TodoChatService(
        ctx,
        new MiniMaxChatClient({
          apiKey: env.minimax.apiKey,
          baseUrl: env.minimax.baseUrl,
          model: env.minimax.model,
        }),
      )
    : null;

  app.get(
    '/api/todos/:id/messages',
    { preHandler: [auth, requireScope('todos:read')] },
    async (req, reply) => {
      if (!chat) return reply.code(503).send({ error: 'AI assistant is not configured' });
      const { id } = req.params as { id: string };
      return { messages: await chat.list(req.auth!.userId, id, tokenProjectScope(req.auth)) };
    },
  );

  app.post(
    '/api/todos/:id/messages',
    {
      preHandler: [auth, requireScope('todos:write')],
      // Model calls are slow and cost money — much tighter than the global limit.
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      if (!chat) return reply.code(503).send({ error: 'AI assistant is not configured' });
      const { id } = req.params as { id: string };
      const { content } = sendTodoMessageInputSchema.parse(req.body);
      const result = await chat.send(req.auth!.userId, id, content, tokenProjectScope(req.auth));
      return reply.code(201).send(result);
    },
  );

  app.get('/api/usage', { preHandler: [auth, requireScope('todos:read')] }, async (req) => {
    const summary = await usageSummary(ctx, req.auth!.userId);
    return { usage: summary, billingEnabled: billing !== null };
  });

  /** Start checkout to put a card on file and enable overage. */
  app.post('/api/billing/checkout', { preHandler: [auth] }, async (req, reply) => {
    if (!billing) return reply.code(503).send({ error: 'billing is not configured' });
    if (req.auth!.via !== 'session') {
      return reply.code(403).send({ error: 'billing must be managed from the web app' });
    }
    const url = await billing.createCheckoutSession(
      req.auth!.userId,
      `${env.webBaseUrl}/settings/billing`,
    );
    return { url };
  });

  /** Stripe-hosted portal for updating the card or cancelling. */
  app.post('/api/billing/portal', { preHandler: [auth] }, async (req, reply) => {
    if (!billing) return reply.code(503).send({ error: 'billing is not configured' });
    if (req.auth!.via !== 'session') {
      return reply.code(403).send({ error: 'billing must be managed from the web app' });
    }
    const url = await billing.createPortalSession(
      req.auth!.userId,
      `${env.webBaseUrl}/settings/billing`,
    );
    return { url };
  });

  /**
   * Stripe webhook. Registered inside an encapsulated plugin so its
   * raw-buffer body parser applies here only — signature verification needs
   * the exact bytes Stripe signed, which the global JSON parser would destroy.
   */
  await app.register(async (instance) => {
    instance.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_req, body, done) => done(null, body),
    );

    instance.post(
      '/api/billing/webhook',
      { config: { rateLimit: false } },
      async (req, reply) => {
        if (!billing) return reply.code(503).send({ error: 'billing is not configured' });
        const signature = req.headers['stripe-signature'];
        if (typeof signature !== 'string') {
          return reply.code(400).send({ error: 'missing stripe-signature' });
        }
        try {
          const type = await billing.handleWebhook(req.body as Buffer, signature);
          return { received: true, type };
        } catch (err) {
          if (err instanceof UserFacingError) throw err;
          // A bad signature is an untrusted caller, not our bug.
          req.log.warn({ err }, 'stripe webhook rejected');
          return reply.code(400).send({ error: 'invalid signature' });
        }
      },
    );
  });
}
