// Plain domain types used by the pure logic in this package.
//
// These are deliberately NOT the Prisma model types. Keeping them
// separate means the core logic can be unit-tested with tiny hand-made
// objects and never has to import the database package. The database
// package maps its rows onto these shapes when it calls into here.

// The scheduling types live in the shared kernel; re-exported so existing
// imports of '../core' (and './types') keep working unchanged.
export type { DeliverySchedule, LocalContext } from 'telegram-bot-kit';

/** The inclusive range of previous ayat to review (excludes today's ayah). */
export interface ReviewRange {
  /** First ayah number in the surah to review (>= 1). */
  from: number;
  /** Last ayah number to review, which is the ayah just before today's. */
  to: number;
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
