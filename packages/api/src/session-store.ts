import { and, eq, gt, lt } from 'drizzle-orm';
import { webSessions, type Database } from '@askhumantowork/db';
import type * as Fastify from 'fastify';

type Callback = (err?: unknown) => void;
type GetCallback = (err: unknown, session?: Fastify.Session | null) => void;

/**
 * Postgres-backed express-session-compatible store. Sessions survive API
 * restarts and are shared across instances — no Redis required.
 * Expired rows are cleaned by the worker's daily housekeeping job.
 */
export class PgSessionStore {
  constructor(
    private db: Database,
    private ttlSeconds = 30 * 24 * 3600,
  ) {}

  set(sessionId: string, session: Fastify.Session, callback: Callback) {
    const ttlMs = session.cookie?.maxAge ?? this.ttlSeconds * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);
    this.db
      .insert(webSessions)
      .values({ sid: sessionId, data: session, expiresAt })
      .onConflictDoUpdate({ target: webSessions.sid, set: { data: session, expiresAt } })
      .then(() => callback())
      .catch(callback);
  }

  get(sessionId: string, callback: GetCallback) {
    this.db.query.webSessions
      .findFirst({
        where: and(eq(webSessions.sid, sessionId), gt(webSessions.expiresAt, new Date())),
      })
      .then((row) => callback(null, row ? (row.data as Fastify.Session) : null))
      .catch((err) => callback(err));
  }

  destroy(sessionId: string, callback: Callback) {
    this.db
      .delete(webSessions)
      .where(eq(webSessions.sid, sessionId))
      .then(() => callback())
      .catch(callback);
  }
}

/** Delete expired sessions (worker housekeeping). */
export async function cleanupExpiredSessions(db: Database): Promise<void> {
  await db.delete(webSessions).where(lt(webSessions.expiresAt, new Date()));
}
