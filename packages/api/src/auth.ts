import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { agentTokens } from '@askhumantowork/db';
import { hashToken } from '@askhumantowork/core';
import type { TokenScope } from '@askhumantowork/shared';
import type { AppContext } from '@askhumantowork/core';

declare module 'fastify' {
  interface Session {
    userId?: string;
  }
  interface FastifyRequest {
    auth?: AuthInfo;
  }
}

export interface AuthInfo {
  userId: string;
  via: 'session' | 'token';
  scopes: TokenScope[] | null; // null = full access (session)
  agentName?: string;
}

const ALL_SCOPES: TokenScope[] = ['todos:read', 'todos:write', 'projects:read', 'integrations:read'];

/** Resolve a bearer token (PAT or device token) to a user. */
export async function resolveBearer(ctx: AppContext, raw: string): Promise<AuthInfo | null> {
  const row = await ctx.db.query.agentTokens.findFirst({
    where: eq(agentTokens.tokenHash, hashToken(raw)),
  });
  if (!row) return null;
  void ctx.db
    .update(agentTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentTokens.id, row.id))
    .then(() => {});
  return {
    userId: row.userId,
    via: 'token',
    scopes: row.kind === 'device' ? ALL_SCOPES : (row.scopes as TokenScope[]),
    agentName: row.name,
  };
}

/** preHandler: allow cookie session OR bearer token. */
export function requireAuth(ctx: AppContext) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const info = await resolveBearer(ctx, header.slice(7));
      if (info) {
        req.auth = info;
        return;
      }
      return reply.code(401).send({ error: 'invalid token' });
    }
    if (req.session.userId) {
      req.auth = { userId: req.session.userId, via: 'session', scopes: null };
      return;
    }
    return reply.code(401).send({ error: 'unauthenticated' });
  };
}

export function requireScope(scope: TokenScope) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = req.auth;
    if (!auth) return reply.code(401).send({ error: 'unauthenticated' });
    if (auth.scopes !== null && !auth.scopes.includes(scope)) {
      return reply.code(403).send({ error: `missing scope ${scope}` });
    }
  };
}
