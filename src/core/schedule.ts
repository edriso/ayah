// Scheduling math. All pure functions, no clock of their own: the caller
// always passes `now`, which makes every case testable.
//
// The big idea: the bot's cron ticks once a minute in real time, but each
// subscriber has their OWN timezone and send time. So we translate the
// single real instant into the subscriber's local calendar, then decide
// whether a delivery is due for their local day.

import type { DeliverySchedule, LocalContext } from './types';
import { isDayActive } from './days';

/**
 * Work out the subscriber's local date, weekday, and minutes-past-midnight
 * for a real instant. Uses Intl so it follows the timezone's real DST
 * rules without us hand-coding any offsets.
 */
export function getLocalContext(timezone: string, now: Date): LocalContext {
  // "en-CA" formats dates as YYYY-MM-DD, which sorts and compares cleanly.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const year = parseInt(get('year'), 10);
  const month = parseInt(get('month'), 10);
  const day = parseInt(get('day'), 10);
  let hour = parseInt(get('hour'), 10);
  // Intl can return "24" for midnight in some engines; fold it back to 0.
  if (hour === 24) hour = 0;
  const minute = parseInt(get('minute'), 10);

  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    isoWeekday: isoWeekdayOf(year, month, day),
    minutesSinceMidnight: hour * 60 + minute,
  };
}

/**
 * ISO weekday (Monday 1 ... Sunday 7) for a local calendar date. We build a
 * UTC date from the local Y-M-D and read its day of week. This avoids parsing
 * localized weekday names, which can vary between Node/ICU versions.
 */
function isoWeekdayOf(year: number, month: number, day: number): number {
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  return dow === 0 ? 7 : dow;
}

/** The send time as minutes past local midnight. */
export function scheduledMinutes(schedule: DeliverySchedule): number {
  return schedule.deliveryHour * 60 + schedule.deliveryMinute;
}

/**
 * Decide which local date (if any) a delivery is due for, at instant `now`.
 *
 * Returns the local "YYYY-MM-DD" when ALL of these hold:
 *   - today is one of the subscriber's active days, and
 *   - the local time has reached (or passed) their send time.
 * Otherwise returns null.
 *
 * Why "reached or passed" instead of "exactly equals": if the bot was
 * asleep or busy at the exact send minute, we still want to deliver later
 * the same day rather than skip it. The caller pairs this with a
 * once-per-(subscriber, local date) idempotency record, so a late catch-up
 * can never double-send.
 */
export function dueLocalDate(schedule: DeliverySchedule, now: Date): string | null {
  const local = getLocalContext(schedule.timezone, now);
  if (!isDayActive(schedule.activeDays, local.isoWeekday)) return null;
  if (local.minutesSinceMidnight < scheduledMinutes(schedule)) return null;
  return local.date;
}
