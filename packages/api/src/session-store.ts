import type { Redis } from 'ioredis';
import type * as Fastify from 'fastify';

type Callback = (err?: unknown) => void;
type GetCallback = (err: unknown, session?: Fastify.Session | null) => void;

/**
 * Minimal express-session-compatible store on ioredis (connect-redis targets
 * node-redis and sends option objects ioredis can't parse). Sessions survive
 * API restarts and are shared across instances.
 */
export class IoredisSessionStore {
  constructor(
    private redis: Redis,
    private prefix = 'sess:',
    private ttlSeconds = 30 * 24 * 3600,
  ) {}

  set(sessionId: string, session: Fastify.Session, callback: Callback) {
    const ttl = session.cookie?.maxAge
      ? Math.ceil(session.cookie.maxAge / 1000)
      : this.ttlSeconds;
    this.redis
      .set(this.prefix + sessionId, JSON.stringify(session), 'EX', ttl)
      .then(() => callback())
      .catch(callback);
  }

  get(sessionId: string, callback: GetCallback) {
    this.redis
      .get(this.prefix + sessionId)
      .then((raw) => callback(null, raw ? (JSON.parse(raw) as Fastify.Session) : null))
      .catch((err) => callback(err));
  }

  destroy(sessionId: string, callback: Callback) {
    this.redis
      .del(this.prefix + sessionId)
      .then(() => callback())
      .catch(callback);
  }
}
