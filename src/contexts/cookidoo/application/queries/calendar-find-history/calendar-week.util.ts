/**
 * Date helpers working on ISO `YYYY-MM-DD` strings in UTC, so results never
 * shift with the server's time zone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIsoDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatIsoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Adds (or subtracts) whole days to an ISO date. */
export function addDays(day: string, days: number): string {
  return formatIsoDay(new Date(parseIsoDay(day).getTime() + days * DAY_MS));
}

/** Monday of the ISO week containing `day`. */
export function weekStart(day: string): string {
  const date = parseIsoDay(day);
  const offset = (date.getUTCDay() + 6) % 7; // Monday = 0 … Sunday = 6
  return addDays(day, -offset);
}

/** Today's date as seen by the server's local clock (set TZ=Europe/Paris). */
export function localToday(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Mondays of the `weeks` weeks ending with the week containing `until`,
 * most recent first.
 */
export function weekStartsBackFrom(until: string, weeks: number): string[] {
  const last = weekStart(until);
  return Array.from({ length: weeks }, (_, i) => addDays(last, -7 * i));
}
