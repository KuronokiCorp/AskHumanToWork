import './env.js';
import { createDb } from '@askhumantowork/db';
import { createContext } from '@askhumantowork/core';
import { buildServer } from './server.js';
import { env } from './env.js';

const db = createDb();
const ctx = createContext(db);
const app = await buildServer(ctx);

await app.listen({ port: env.port, host: '0.0.0.0' });
console.log(`API listening on ${env.apiBaseUrl}  (MCP HTTP endpoint: ${env.apiBaseUrl}/mcp)`);
