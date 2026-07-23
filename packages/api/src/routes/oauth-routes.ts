import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '@askhumantowork/db';
import type { AppContext } from '@askhumantowork/core';
import { z } from 'zod';
import { env } from '../env.js';

/**
 * Social sign-in brokered by Supabase Auth.
 *
 * Supabase runs the OAuth dance with Google/GitHub and hands the browser an
 * access token. We verify that token against Supabase, then mint one of *our*
 * own sessions — so everything downstream (password login, mobile device
 * tokens, MCP personal access tokens) keeps working untouched. Supabase is a
 * sign-in broker here, not the session authority.
 *
 * The whole feature is optional: without SUPABASE_URL + SUPABASE_ANON_KEY the
 * provider list comes back empty and the web app renders no social buttons.
 */

const PROVIDERS = ['google', 'github'] as const;
type Provider = (typeof PROVIDERS)[number];

/**
 * Which of PROVIDERS Supabase will actually accept, per its public settings
 * endpoint — a provider we list but Supabase has disabled renders a button
 * that dead-ends mid-dance. Cached briefly so the login page doesn't cost a
 * Supabase round trip per view; `null` means the lookup failed, in which case
 * we offer everything rather than hide sign-in over a transient error.
 */
let enabledCache: { at: number; enabled: Set<Provider> | null } = { at: 0, enabled: null };
const SETTINGS_TTL_MS = 5 * 60_000;

async function enabledProviders(log: {
  warn: (obj: unknown, msg: string) => void;
}): Promise<Set<Provider> | null> {
  const now = Date.now();
  if (enabledCache.at && now - enabledCache.at < SETTINGS_TTL_MS) return enabledCache.enabled;
  try {
    const res = await fetch(`${env.supabase.url}/auth/v1/settings`, {
      headers: { apikey: env.supabase.anonKey },
    });
    if (!res.ok) throw new Error(`settings returned ${res.status}`);
    const body = (await res.json()) as { external?: Record<string, boolean> };
    enabledCache = {
      at: now,
      enabled: new Set(PROVIDERS.filter((p) => body.external?.[p])),
    };
  } catch (err) {
    log.warn({ err }, 'could not read supabase auth settings; offering all providers');
    enabledCache = { at: now, enabled: null };
  }
  return enabledCache.enabled;
}

const callbackSchema = z.object({
  accessToken: z.string().min(1).max(4096),
});

/** Shape of Supabase's GET /auth/v1/user, narrowed to what we consume. */
interface SupabaseUser {
  id?: string;
  email?: string;
  app_metadata?: { provider?: string };
}

export function registerOAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  const configured = Boolean(env.supabase.url && env.supabase.anonKey);

  /**
   * Which providers the deployment can actually offer, plus the URL to send
   * the browser to. The web app renders buttons from this, so an unconfigured
   * deployment shows nothing rather than a button that dead-ends.
   */
  app.get('/api/auth/oauth/providers', async (req) => {
    if (!configured) return { providers: [] };
    const enabled = await enabledProviders(req.log);
    return {
      providers: PROVIDERS.filter((p) => !enabled || enabled.has(p)).map((provider) => ({
        provider,
        // Supabase bounces the browser back to the web app with the token in
        // the URL fragment; the SPA reads it and posts it to the callback.
        url:
          `${env.supabase.url}/auth/v1/authorize?provider=${provider}` +
          `&redirect_to=${encodeURIComponent(`${env.webBaseUrl}/auth/callback`)}`,
      })),
    };
  });

  /**
   * Exchange a Supabase access token for one of our sessions.
   *
   * The token is verified by calling Supabase rather than by decoding it
   * locally: a JWT this endpoint merely parsed would be trivially forgeable,
   * and Supabase is the only party that can confirm the token is live and
   * says what it claims.
   */
  app.post(
    '/api/auth/oauth/callback',
    { config: { rateLimit: { max: env.authRateLimitMax, timeWindow: '1 minute' } } },
    async (req, reply) => {
      if (!configured) {
        return reply.code(503).send({ error: 'social sign-in is not configured' });
      }
      const { accessToken } = callbackSchema.parse(req.body);

      const res = await fetch(`${env.supabase.url}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${accessToken}`, apikey: env.supabase.anonKey },
      });
      if (!res.ok) {
        req.log.warn({ status: res.status }, 'supabase rejected the access token');
        return reply.code(401).send({ error: 'sign-in failed, please try again' });
      }

      const profile = (await res.json()) as SupabaseUser;
      const email = profile.email?.trim().toLowerCase();
      // A provider account with no email can't be matched to a user, and
      // inventing a placeholder would collide across providers.
      if (!email) {
        return reply.code(400).send({
          error: 'your provider did not share an email address, so we cannot sign you in',
        });
      }

      // Match on email so a user who signed up with a password and later uses
      // Google lands on the same account instead of a silent duplicate.
      const existing = await ctx.db.query.users.findFirst({ where: eq(users.email, email) });
      const user =
        existing ??
        (
          await ctx.db
            .insert(users)
            .values({
              email,
              // No password: this account can only ever sign in through a
              // provider, unless the user later sets one via password reset.
              passwordHash: null,
              timezone: 'UTC',
            })
            .returning()
        )[0]!;

      req.session.userId = user.id;
      return {
        id: user.id,
        email: user.email,
        timezone: user.timezone,
        created: !existing,
      };
    },
  );
}

export type { Provider };
