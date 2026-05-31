// Active-days bitmask helpers.
//
// MySQL has no array type, so the days a subscriber wants ayat on are
// stored as one small integer (a 7-bit mask). Each bit is one weekday:
//
//   bit 0 -> Monday      (ISO weekday 1)
//   bit 1 -> Tuesday     (ISO weekday 2)
//   ...
//   bit 6 -> Sunday      (ISO weekday 7)
//
// We use ISO weekday numbering (Monday = 1 ... Sunday = 7) everywhere so
// it lines up with what getLocalContext() returns.

/** Mask with every day turned on (1111111 in binary = 127). */
export const ALL_DAYS = 0b1111111;

/** Mask with no day turned on. A subscriber here never gets a send. */
export const NO_DAYS = 0;

/** Turn an ISO weekday (1-7) into its bit position (0-6). */
function bitFor(isoWeekday: number): number {
  if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    throw new Error(`isoWeekday must be 1..7, got ${isoWeekday}`);
  }
  return isoWeekday - 1;
}

/** True if the given ISO weekday (1-7) is switched on in the mask. */
export function isDayActive(mask: number, isoWeekday: number): boolean {
  return (mask & (1 << bitFor(isoWeekday))) !== 0;
}

/** Return a new mask with the given ISO weekday switched on. */
export function withDayOn(mask: number, isoWeekday: number): number {
  return mask | (1 << bitFor(isoWeekday));
}

/** Return a new mask with the given ISO weekday switched off. */
export function withDayOff(mask: number, isoWeekday: number): number {
  return mask & ~(1 << bitFor(isoWeekday));
}

/** Flip the given ISO weekday on/off and return the new mask. */
export function toggleDay(mask: number, isoWeekday: number): number {
  return isDayActive(mask, isoWeekday) ? withDayOff(mask, isoWeekday) : withDayOn(mask, isoWeekday);
}

/** List the active ISO weekdays (1-7) in order, e.g. [1, 3, 5]. */
export function activeDaysList(mask: number): number[] {
  const days: number[] = [];
  for (let isoWeekday = 1; isoWeekday <= 7; isoWeekday++) {
    if (isDayActive(mask, isoWeekday)) days.push(isoWeekday);
  }
  return days;
}

/** Build a mask from a list of ISO weekdays, e.g. [1, 3, 5] -> mask. */
export function maskFromDays(isoWeekdays: number[]): number {
  return isoWeekdays.reduce((mask, day) => withDayOn(mask, day), NO_DAYS);
}
