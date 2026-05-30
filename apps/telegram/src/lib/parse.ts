// Small pure parsers for command arguments. Kept apart from bot.ts so they
// can be unit-tested without loading grammY or the database client.

/** Parse "HH:MM" (24-hour) into hour/minute, or null if invalid. */
export function parseTime(raw: string): { hour: number; minute: number } | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** True if a string is a timezone that Intl accepts. */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
