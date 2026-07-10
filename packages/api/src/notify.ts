import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { pushSubscriptions, users, type Database } from '@askhumantowork/db';
import { timezoneOffsetMinutes } from '@askhumantowork/shared';
import { env } from './env.js';

const transport = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: false,
});

if (env.vapid.publicKey && env.vapid.privateKey) {
  webpush.setVapidDetails(env.vapid.subject, env.vapid.publicKey, env.vapid.privateKey);
}

export interface NotifyPayload {
  title: string;
  body: string;
  url?: string;
  /** Pre-signed one-click action URLs (complete / snooze). */
  actions?: { complete: string; snooze1h: string; snooze1d: string };
}

interface QuietHours {
  start: string; // "22:00"
  end: string; // "08:00"
}

/** Is the user's local time inside their quiet hours window? */
export function inQuietHours(prefs: unknown, timezone: string, at = new Date()): boolean {
  const quiet = (prefs as { quietHours?: QuietHours | null } | null)?.quietHours;
  if (!quiet?.start || !quiet.end) return false;
  const offset = timezoneOffsetMinutes(timezone, at);
  const local = new Date(at.getTime() + offset * 60_000);
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  const [sh, sm] = quiet.start.split(':').map(Number);
  const [eh, em] = quiet.end.split(':').map(Number);
  const start = (sh ?? 0) * 60 + (sm ?? 0);
  const end = (eh ?? 0) * 60 + (em ?? 0);
  // window may cross midnight
  return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export async function sendEmail(to: string, payload: NotifyPayload): Promise<void> {
  const btn = (href: string, label: string, primary = false) =>
    `<a href="${href}" style="display:inline-block;margin-right:8px;padding:9px 16px;border-radius:10px;font-size:13px;font-weight:600;text-decoration:none;${
      primary
        ? 'background:#7c3aed;color:#fff'
        : 'background:#f4f4f5;color:#3f3f46;border:1px solid #e4e4e7'
    }">${label}</a>`;
  const actionsHtml = payload.actions
    ? `<p style="margin-top:16px">${btn(payload.actions.complete, '✓ Mark done', true)}${btn(payload.actions.snooze1h, '💤 Snooze 1h')}${btn(payload.actions.snooze1d, '💤 Tomorrow')}</p>`
    : '';
  const actionsText = payload.actions
    ? `\n\nMark done: ${payload.actions.complete}\nSnooze 1h: ${payload.actions.snooze1h}`
    : '';
  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject: payload.title,
    text: payload.body + (payload.url ? `\n\n${payload.url}` : '') + actionsText,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px"><p style="font-size:14px;color:#27272a">${payload.body}</p>${
      payload.url ? `<p><a href="${payload.url}" style="color:#7c3aed;font-size:13px">Open in AskHumanToWork →</a></p>` : ''
    }${actionsHtml}</div>`,
  });
}

export async function sendWebPush(db: Database, userId: string, payload: NotifyPayload): Promise<void> {
  if (!env.vapid.publicKey) return; // web push not configured
  const subs = await db.query.pushSubscriptions.findMany({
    where: eq(pushSubscriptions.userId, userId),
  });
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify(payload),
        );
      } catch (err: unknown) {
        // 404/410 = subscription gone; clean it up
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }),
  );
}

export async function getUserForNotify(db: Database, userId: string) {
  return db.query.users.findFirst({ where: eq(users.id, userId) });
}
