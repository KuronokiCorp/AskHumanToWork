import './env.js';
import { createDb } from '@askhumantowork/db';
import { createContext } from '@askhumantowork/core';
import { buildServer } from './server.js';
import { env } from './env.js';

const db = createDb();
const ctx = await createContext(db);
const app = await buildServer(ctx);

// Single-service deployments (Firebase App Hosting): run the pg-boss workers
// inside the API process instead of a separate container.
if (process.env.RUN_WORKER === 'true') {
  const { registerWorkers } = await import('./worker.js');
  await registerWorkers(ctx);
}

await app.listen({ port: Number(process.env.PORT ?? env.port), host: '0.0.0.0' });
console.log(`API listening on ${env.apiBaseUrl}  (MCP HTTP endpoint: ${env.apiBaseUrl}/mcp)`);
