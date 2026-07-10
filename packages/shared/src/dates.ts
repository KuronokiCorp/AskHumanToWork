import * as chrono from 'chrono-node';

/**
 * Offset in minutes of an IANA timezone at a given instant (DST-aware).
 */
export function timezoneOffsetMinutes(timezone: string, at: Date = new Date()): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? '0' : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUTC - at.getTime()) / 60_000);
}

/**
 * Resolve natural language like "friday 5pm", "in 3 days", "tomorrow morning"
 * into an absolute Date, interpreted in the user's IANA timezone.
 * Returns null if the text can't be parsed.
 *
 * This runs SERVER-SIDE so AI agents never do date math themselves.
 */
export function resolveNaturalDate(
  text: string,
  timezone: string,
  reference: Date = new Date(),
): Date | null {
  const offset = timezoneOffsetMinutes(timezone, reference);
  const results = chrono.parse(text, { instant: reference, timezone: offset }, { forwardDate: true });
  const first = results[0];
  if (!first) return null;
  const component = first.start;
  // chrono implies a time when none is stated: bare dates ("next tuesday") get
  // 12:00, while relative phrases ("in 3 days") carry the current time-of-day.
  // Re-default only the bare-date case to 09:00 local — a friendlier due time.
  // `assign` exists on the concrete ParsedComponents implementation but not the interface.
  if (!component.isCertain('hour') && component.get('hour') === 12 && component.get('minute') === 0) {
    const assignable = component as unknown as { assign(unit: string, value: number): void };
    assignable.assign('hour', 9);
    assignable.assign('minute', 0);
  }
  return component.date();
}

/** Format a Date as an ISO string in the user's timezone for display back to agents. */
export function formatInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).format(date);
}
