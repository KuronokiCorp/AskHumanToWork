import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export * as schema from './schema.js';
export * from './schema.js';

export type Database = ReturnType<typeof createDb>;

export function createDb(url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/askhumantowork') {
  const client = postgres(url, { max: 10 });
  return drizzle(client, { schema });
}
