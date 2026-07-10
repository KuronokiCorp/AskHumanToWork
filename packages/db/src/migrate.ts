/**
 * Runtime migration runner (production containers, where drizzle-kit — a dev
 * dependency — is pruned). Applies packages/db/migrations idempotently.
 * Run: node packages/db/dist/migrate.js
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL ?? 'postgres://localhost:5432/askhumantowork';
const sql = postgres(url, { max: 1 });
const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../migrations');

await migrate(drizzle(sql), { migrationsFolder });
await sql.end();
console.log('migrations applied');
