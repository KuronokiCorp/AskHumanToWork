import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Load the repo-root .env regardless of cwd.
const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, '../../../.env') });

export const env = {
  port: Number(process.env.API_PORT ?? 3000),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3000',
  webBaseUrl: process.env.WEB_BASE_URL ?? 'http://localhost:5173',
  sessionSecret: process.env.SESSION_SECRET ?? 'dev-session-secret-change-me-32chars!',
  /** Set COOKIE_SECURE=true behind HTTPS in production. */
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  /** Set TRUST_PROXY=true when behind a reverse proxy / load balancer. */
  trustProxy: process.env.TRUST_PROXY === 'true',
  /** Serve the built web app (packages/web/dist) from the API process. */
  serveWeb: process.env.SERVE_WEB === 'true',
  smtp: {
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    from: process.env.SMTP_FROM ?? 'reminders@askhumantowork.local',
  },
  /**
   * Per-minute cap on credential endpoints (signup/login/reset) — brute-force
   * protection. Configurable only so the e2e suite, which signs up a fresh
   * user per test from one IP, can raise it; leave it alone in production.
   */
  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX ?? 10),
  /** Per-todo AI assistant. Without a key the chat endpoints report unavailable. */
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY ?? '',
    /** Mainland-China accounts use https://api.minimaxi.com/v1 (separate key). */
    baseUrl: process.env.MINIMAX_BASE_URL ?? 'https://api.minimax.io/v1',
    model: process.env.MINIMAX_MODEL ?? 'MiniMax-M3',
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    subject: process.env.VAPID_SUBJECT ?? 'mailto:admin@askhumantowork.local',
  },
};
