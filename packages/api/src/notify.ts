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
  await transport.sendMail({
    from: env.smtp.from,
    to,
    subject: payload.title,
    text: payload.body + (payload.url ? `\n\n${payload.url}` : ''),
    html: `<p>${payload.body}</p>${payload.url ? `<p><a href="${payload.url}">Open todo</a></p>` : ''}`,
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
