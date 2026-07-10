import type { Database } from '@askhumantowork/db';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

export interface AppContext {
  db: Database;
  redis: Redis;
  queues: {
    /** Delayed jobs: fire a single reminder row. Job id = reminder id. */
    reminders: Queue;
    /** Integration sync outbox drain + inbound pollers. */
    sync: Queue;
  };
}

export function createContext(db: Database): AppContext {
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
  return {
    db,
    redis,
    queues: {
      reminders: new Queue('reminders', { connection: redis }),
      sync: new Queue('sync', { connection: redis }),
    },
  };
}
