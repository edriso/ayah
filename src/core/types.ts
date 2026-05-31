// Plain domain types used by the pure logic in this package.
//
// These are deliberately NOT the Prisma model types. Keeping them
// separate means the core logic can be unit-tested with tiny hand-made
// objects and never has to import the database package. The database
// package maps its rows onto these shapes when it calls into here.

/** The few subscriber fields the scheduling math actually needs. */
export interface DeliverySchedule {
  /** IANA timezone name, e.g. "Africa/Cairo". Drives the local day/time. */
  timezone: string;
  /** Hour of the daily send in the subscriber's local time (0-23). */
  deliveryHour: number;
  /** Minute of the daily send in the subscriber's local time (0-59). */
  deliveryMinute: number;
  /**
   * 7-bit mask of the days the subscriber wants ayat on. Bit 0 is Monday
   * and bit 6 is Sunday (ISO weekday order). See days.ts.
   */
  activeDays: number;
}

/** The inclusive range of previous ayat to review (excludes today's ayah). */
export interface ReviewRange {
  /** First ayah number in the surah to review (>= 1). */
  from: number;
  /** Last ayah number to review, which is the ayah just before today's. */
  to: number;
}

/** The subscriber's local calendar context at a given instant. */
export interface LocalContext {
  /** Local date as "YYYY-MM-DD". Safe to compare as a string. */
  date: string;
  /** ISO weekday: Monday is 1 ... Sunday is 7. */
  isoWeekday: number;
  /** Minutes since local midnight (0-1439). */
  minutesSinceMidnight: number;
}

/** A single ayah ready to be shown to a subscriber. */
export interface DisplayAyah {
  /** Ayah number inside its surah (1-based). */
  numberInSurah: number;
  /** The Uthmani text of the ayah. */
  text: string;
}

/** The surah an ayah belongs to. */
export interface DisplaySurah {
  /** Surah number (1-114). */
  number: number;
  /** Arabic name, e.g. "البقرة". */
  nameAr: string;
}
