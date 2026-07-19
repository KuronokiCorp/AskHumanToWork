import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite: landing page (logged-out) + agenda (logged-in).
 *
 * Two servers boot automatically:
 *  - the real API on :3100 against a dedicated `askhumantowork_e2e` Postgres
 *    database (created + migrated by the server command itself), and
 *  - Vite on :5175 proxying /api to it.
 * Requires local Postgres (same prerequisite as the core test suite).
 */
const E2E_DB = 'askhumantowork_e2e';
const E2E_DATABASE_URL = `postgres://localhost:5432/${E2E_DB}`;
const API_PORT = 3100;
/** Local stand-in for MiniMax so the chat suite is free, offline and deterministic. */
const MINIMAX_STUB_PORT = 9110;
const SUPABASE_STUB_PORT = 9120;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5175',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
      },
      testIgnore: /landing\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      // Pixel 5 is chromium-based — no extra browser download needed.
      use: { ...devices['Pixel 5'] },
      testMatch: /landing\.mobile\.spec\.ts/,
    },
  ],
  webServer: [
    {
      // createdb is idempotent-ish (|| true), migrate.js is drizzle's runtime
      // migrator (idempotent), then the API boots from source.
      command: `pnpm --filter @askhumantowork/api exec sh -c "createdb ${E2E_DB} 2>/dev/null || true; node ../db/dist/migrate.js && exec tsx src/index.ts"`,
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        API_PORT: String(API_PORT),
        // Points the assistant at the stub below. Without a key the chat
        // endpoints 503 and the panel hides itself, so the suite needs one.
        MINIMAX_API_KEY: 'e2e-stub-key',
        MINIMAX_BASE_URL: `http://localhost:${MINIMAX_STUB_PORT}/v1`,
        // Every test signs up an isolated user from one IP, which trips the
        // production 10/min credential limit once the suite is large enough.
        AUTH_RATE_LIMIT_MAX: '1000',
        // The whole suite hits the API from one IP; the production
        // 300/min budget runs out mid-run and 429s unrelated tests.
        RATE_LIMIT_MAX: '100000',
        // Social sign-in against the stub below; without these the
        // provider list is empty and no buttons render.
        SUPABASE_URL: `http://localhost:${SUPABASE_STUB_PORT}`,
        SUPABASE_ANON_KEY: 'e2e-stub-anon-key',
        WEB_BASE_URL: 'http://localhost:5175',
      },
    },
    {
      command: `node tests/e2e/minimax-stub.mjs`,
      url: `http://localhost:${MINIMAX_STUB_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      env: { MINIMAX_STUB_PORT: String(MINIMAX_STUB_PORT) },
    },
    {
      command: `node tests/e2e/supabase-stub.mjs`,
      url: `http://localhost:${SUPABASE_STUB_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
      env: { SUPABASE_STUB_PORT: String(SUPABASE_STUB_PORT) },
    },
    {
      command: 'pnpm exec vite --port 5175 --strictPort',
      url: 'http://localhost:5175',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        VITE_API_PROXY: `http://localhost:${API_PORT}`,
      },
    },
  ],
});
