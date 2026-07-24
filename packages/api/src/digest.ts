import Anthropic from '@anthropic-ai/sdk';
import { AgendaService, type AppContext } from '@askhumantowork/core';
import { timezoneOffsetMinutes, type Agenda, type Todo } from '@askhumantowork/shared';
import type { users } from '@askhumantowork/db';

type UserRow = typeof users.$inferSelect;

export interface DigestPrefs {
  enabled?: boolean;
  /** Local hour (0-23) to deliver, default 8. */
  hour?: number;
  /**
   * User-local date (YYYY-MM-DD) the digest was last sent. Once-per-day guard so
   * the frequent cron tick (every 5-15 min) sends at most one digest per local
   * day — `isLocalHour` alone is true for the whole target hour.
   */
  lastSentOn?: string;
}

export function digestPrefsOf(user: UserRow): DigestPrefs {
  return ((user.notificationPrefs as { digest?: DigestPrefs } | null)?.digest ?? {}) as DigestPrefs;
}

/** Is it currently `hour` o'clock in the user's timezone? */
export function isLocalHour(timezone: string, hour: number, at = new Date()): boolean {
  const offset = timezoneOffsetMinutes(timezone, at);
  const local = new Date(at.getTime() + offset * 60_000);
  return local.getUTCHours() === hour;
}

/** The user's local calendar date as YYYY-MM-DD (for the once-per-day digest guard). */
export function localDateOf(timezone: string, at = new Date()): string {
  const offset = timezoneOffsetMinutes(timezone, at);
  return new Date(at.getTime() + offset * 60_000).toISOString().slice(0, 10);
}

function line(t: Todo): string {
  const time = t.dueAt
    ? new Date(t.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const who = t.source === 'ai' ? ` (added by ${t.createdByAgent ?? 'AI'})` : '';
  return `- ${t.title}${time ? ` — ${time}` : ''}${who}`;
}

export function templateDigest(agenda: Agenda): string {
  const parts: string[] = [`Good morning! ${agenda.summary}`, ''];
  if (agenda.overdue.length) {
    parts.push('🔥 Overdue:', ...agenda.overdue.slice(0, 5).map(line), '');
  }
  if (agenda.today.length) {
    parts.push('📅 Today:', ...agenda.today.slice(0, 8).map(line), '');
  }
  if (agenda.upcoming.length) {
    parts.push('🗓 Coming up this week:', ...agenda.upcoming.slice(0, 5).map(line));
  }
  return parts.join('\n').trim();
}

/**
 * Compose the morning digest. When ANTHROPIC_API_KEY is configured, Claude
 * writes it (short, motivating, provenance-aware); otherwise a deterministic
 * template is used so the feature works without any AI configuration.
 */
export async function composeDigest(
  ctx: AppContext,
  user: UserRow,
): Promise<{ subject: string; body: string } | null> {
  const agenda = await new AgendaService(ctx).forUser(user.id);
  const total = agenda.overdue.length + agenda.today.length + agenda.upcoming.length;
  if (total === 0) return null; // nothing to say — skip the email entirely

  const subject = `Your day: ${agenda.summary}`;

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return { subject, body: templateDigest(agenda) };
  }

  try {
    const client = new Anthropic();
    const compact = (t: Todo) => ({
      title: t.title,
      due: t.dueAt,
      priority: t.priority,
      project: t.projectName,
      addedBy: t.source === 'ai' ? (t.createdByAgent ?? 'an AI agent') : 'you',
      why: t.originContext ?? undefined,
    });
    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 700,
      thinking: { type: 'adaptive' },
      system:
        'You write a short morning digest email for a todo app called AskHumanToWork, where AI agents ' +
        'capture todos for their human. Voice: warm, direct, lightly witty — never corporate, never guilt-trippy. ' +
        'Structure: one-line opener sizing up the day, then overdue items (if any) with gentle urgency, then ' +
        "today's items in a sensible attack order, then at most one line about the week ahead. " +
        'Mention when an AI agent added something and why, if that context helps. Plain text only, no markdown ' +
        'headers, under 150 words. Do not invent todos or details not in the data.',
      messages: [
        {
          role: 'user',
          content: JSON.stringify({
            date: agenda.date,
            overdue: agenda.overdue.map(compact),
            today: agenda.today.map(compact),
            upcoming: agenda.upcoming.slice(0, 5).map(compact),
          }),
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (text) return { subject, body: text };
  } catch (err) {
    console.error('[digest] Claude call failed, using template:', err);
  }
  return { subject, body: templateDigest(agenda) };
}
