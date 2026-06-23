import { prisma } from '../client';
import { advancePosition } from '../../core';
import {
  getEntryAtPosition,
  getEntryById,
  getTrackById,
  type EntryWithAyah,
} from './quran.service';

// A subscriber row joined with its track (we need track.loops and the entry
// counts to walk the curriculum).
const deliverableInclude = { track: true } as const;

export type DeliverableSubscriber = Awaited<ReturnType<typeof listDeliverableSubscribers>>[number];

/**
 * Every subscriber the bot may send to right now: active (not on a break)
 * and reachable (not blocked). The caller still checks each one's own send
 * time and timezone before delivering; this query just trims the obvious
 * skips at the database level.
 */
export function listDeliverableSubscribers() {
  return prisma.subscriber.findMany({
    where: { pausedAt: null, blockedAt: null },
    include: deliverableInclude,
  });
}

/** True if this subscriber already has a delivery for the given local date. */
export async function hasDeliveryFor(subscriberId: number, scheduledFor: string): Promise<boolean> {
  const found = await prisma.deliveryLog.findUnique({
    where: { subscriberId_scheduledFor: { subscriberId, scheduledFor } },
    select: { id: true },
  });
  return found !== null;
}

/**
 * The track entry already delivered for this subscriber's local date, or null.
 * Used by /today to re-show exactly the ayah that was delivered: the
 * subscriber's currentEntryId has already advanced past it, so the recorded
 * trackEntryId is the only way back to the right ayah.
 */
export function getDeliveryFor(subscriberId: number, scheduledFor: string) {
  return prisma.deliveryLog.findUnique({
    where: { subscriberId_scheduledFor: { subscriberId, scheduledFor } },
    select: { trackEntryId: true },
  });
}

/**
 * Work out which entry to send to this subscriber next.
 *   - has a current entry      -> that entry
 *   - never started            -> the track's first entry (position 0)
 *   - finished a non-looping track -> null (nothing more to send)
 *
 * "Never started" vs "finished" is told apart by startedAt: a brand-new
 * subscriber has startedAt null, while a finished one has startedAt set but
 * currentEntryId null.
 */
export async function resolveTargetEntry(subscriber: {
  trackId: number;
  currentEntryId: number | null;
  startedAt: Date | null;
}): Promise<EntryWithAyah | null> {
  if (subscriber.currentEntryId !== null) {
    return getEntryById(subscriber.currentEntryId);
  }
  if (subscriber.startedAt === null) {
    return getEntryAtPosition(subscriber.trackId, 0);
  }
  return null;
}

/**
 * Where a subscriber stands right now, for display in /settings: the surah
 * and ayah they are ON (or would start at, if not yet started) plus their
 * order (the track key). Reuses resolveTargetEntry so "not started yet" shows
 * the default first ayah rather than nothing. Null only if a non-looping
 * track is finished (the shipped tracks both loop, so in practice never).
 */
export async function getProgressView(subscriber: {
  trackId: number;
  currentEntryId: number | null;
  startedAt: Date | null;
}): Promise<{
  surahNumber: number;
  numberInSurah: number;
  surahNameAr: string;
  /** The surah's total ayat, so the view can show "ayah N of M". */
  surahAyahCount: number;
  orderKey: string;
} | null> {
  const entry = await resolveTargetEntry(subscriber);
  if (!entry) return null;
  const track = await getTrackById(subscriber.trackId);
  return {
    surahNumber: entry.ayah.surah.number,
    numberInSurah: entry.ayah.numberInSurah,
    surahNameAr: entry.ayah.surah.nameAr,
    surahAyahCount: entry.ayah.surah.ayahCount,
    orderKey: track?.key ?? '',
  };
}

/**
 * How many ayat this subscriber has actually been delivered (one DeliveryLog
 * row per local day). A correct, repositioning-proof progress number for
 * /settings — unlike a track-position percentage, it reflects what the
 * subscriber really received, whatever surah they started from.
 */
export function countDeliveries(subscriberId: number): Promise<number> {
  return prisma.deliveryLog.count({ where: { subscriberId } });
}

export type CommitResult = 'sent' | 'duplicate';

/**
 * Record a successful delivery, all in one transaction. Call this ONLY after
 * the message was actually sent.
 *
 * Read-gated: this does NOT advance the position. It records the day (the
 * idempotency row) and sets `currentEntryId` to the delivered entry — "where
 * they are now". (That set matters for a brand-new subscriber whose pointer was
 * null, since resolveTargetEntry treats `startedAt set + currentEntryId null` as
 * "finished".) The position moves only later, on a confirmed done (confirmRead),
 * so the same ayah repeats each day until the subscriber marks it done — exactly
 * what hifz (and unhurried tafsir reading) want.
 *
 * The unique (subscriber, scheduledFor) index is the idempotency lock: if a
 * second call races in for the same local day, the insert fails and we report
 * 'duplicate' without recording twice.
 */
export async function commitDelivery(params: {
  subscriberId: number;
  entry: EntryWithAyah;
  scheduledFor: string;
  /** The subscriber's current startedAt, so we stamp it only the first time. */
  startedAt: Date | null;
  /** The distant-review rotation index to advance to (already wrapped/incremented).
   *  Omitted when no review went out, so the cursor only moves on a real review
   *  send — a daily drip, in the same transaction as the delivery. */
  nextReviewCursor?: number;
  now?: Date;
}): Promise<CommitResult> {
  const { subscriberId, entry, scheduledFor, startedAt, nextReviewCursor } = params;
  const now = params.now ?? new Date();

  try {
    await prisma.$transaction([
      prisma.deliveryLog.create({
        data: { subscriberId, trackEntryId: entry.id, scheduledFor, status: 'sent', sentAt: now },
      }),
      prisma.subscriber.update({
        where: { id: subscriberId },
        data: {
          // Mark where they are now (no advance — that happens on confirm).
          currentEntryId: entry.id,
          // Advance the distant-review rotation only when a review went out.
          ...(nextReviewCursor !== undefined ? { reviewCursor: nextReviewCursor } : {}),
          // Stamp the "member since" time on the very first delivery only.
          ...(startedAt === null ? { startedAt: now } : {}),
        },
      }),
    ]);
    return 'sent';
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return 'duplicate';
    throw err;
  }
}

// ─── Distant / consolidation review (التثبيت) corpus ─────────────────
//
// "Memorized" = the distinct track entries that have at least one CONFIRMED
// delivery for this subscriber. The distant review rotates through them in
// track (mushaf) order — EXCLUDING the surah the reader is currently in, since
// that surah's recent ayat are already shown with today's ayah (the in-surah
// passage). So it is genuinely OLD material: the surahs already completed. A
// reader still in their first surah therefore has an empty corpus.

/** Build the confirmed-corpus filter, excluding the reader's current surah. */
function confirmedCorpusWhere(subscriberId: number, excludeSurahNumber: number) {
  return {
    deliveries: { some: { subscriberId, confirmedAt: { not: null } } },
    ayah: { surahNumber: { not: excludeSurahNumber } },
  };
}

/** How many distinct OLD ayat the subscriber has confirmed (the review corpus
 *  size), excluding the surah they are currently in. */
export function countConfirmedAyat(
  subscriberId: number,
  excludeSurahNumber: number,
): Promise<number> {
  return prisma.trackEntry.count({ where: confirmedCorpusWhere(subscriberId, excludeSurahNumber) });
}

const revisionSelect = {
  ayah: {
    select: { numberInSurah: true, text: true, surah: { select: { nameAr: true } } },
  },
} as const;

/**
 * `count` confirmed ayat for the distant review, in track order, starting at
 * `offset` and wrapping past the end — EXCLUDING the reader's current surah. The
 * caller MUST pass `count <= total` (the corpus size) so the wrap never returns
 * a duplicate. Returns each ayah as { surahNameAr, numberInSurah, text }.
 */
export async function getRevisionAyat(
  subscriberId: number,
  offset: number,
  count: number,
  excludeSurahNumber: number,
): Promise<{ surahNameAr: string; numberInSurah: number; text: string }[]> {
  if (count <= 0) return [];
  const where = confirmedCorpusWhere(subscriberId, excludeSurahNumber);
  const head = await prisma.trackEntry.findMany({
    where,
    orderBy: { position: 'asc' },
    skip: offset,
    take: count,
    select: revisionSelect,
  });
  // Wrap: if the window ran off the end, take the remainder from the start.
  const rows =
    head.length < count
      ? [
          ...head,
          ...(await prisma.trackEntry.findMany({
            where,
            orderBy: { position: 'asc' },
            skip: 0,
            take: count - head.length,
            select: revisionSelect,
          })),
        ]
      : head;
  return rows.map((r) => ({
    surahNameAr: r.ayah.surah.nameAr,
    numberInSurah: r.ayah.numberInSurah,
    text: r.ayah.text,
  }));
}

export type ConfirmResult = 'advanced' | 'already';

/**
 * Mark a subscriber's current ayah DONE and move them one step forward, in one
 * transaction. Used by the "أتممتُها" button and /next.
 *
 * The advance is an atomic compare-and-set: `updateMany` only matches while
 * `currentEntryId` is still the entry being confirmed, so a double tap or a
 * stale button from an earlier day moves no one twice — the second call matches
 * no row and returns 'already'. That is what makes old buttons harmless.
 *
 * Returns 'advanced' on the real move (the caller then fires the surah
 * milestone if the confirmed entry finished a surah), or 'already' otherwise.
 */
export async function confirmRead(params: {
  subscriberId: number;
  /** The entry being confirmed — the one the subscriber is currently on. */
  entry: EntryWithAyah;
  totalEntries: number;
  loops: boolean;
  now?: Date;
}): Promise<ConfirmResult> {
  const { subscriberId, entry, totalEntries, loops } = params;
  const now = params.now ?? new Date();

  const nextPosition = advancePosition(entry.position, totalEntries, loops);
  // Resolve the next entry BEFORE the transaction: TrackEntry is read-only
  // seeded data, so this read needs no transactional guard and keeps the
  // transaction (which takes a row lock) as short as possible.
  const nextEntry =
    nextPosition === null ? null : await getEntryAtPosition(entry.trackId, nextPosition);

  // The advance and the "mark done" must be one atomic unit: if only the first
  // landed, the position would move while the just-completed delivery stayed
  // unconfirmed — a spurious "days since last review" nudge and a gap in the
  // distant-review corpus until the next confirm self-healed it. An interactive
  // transaction lets us keep the compare-and-set's conditional (return 'already'
  // when no row matched) between the two writes.
  return prisma.$transaction(async (tx) => {
    const moved = await tx.subscriber.updateMany({
      where: { id: subscriberId, currentEntryId: entry.id },
      data: { currentEntryId: nextEntry ? nextEntry.id : null },
    });
    if (moved.count === 0) return 'already';
    // Mark this and any earlier unread days done, so "days since last review"
    // resets. (All unconfirmed rows are for the same current ayah.)
    await tx.deliveryLog.updateMany({
      where: { subscriberId, status: 'sent', confirmedAt: null },
      data: { confirmedAt: now },
    });
    return 'advanced';
  });
}

/**
 * The track entry id of the most recent still-unconfirmed "sent" delivery, or
 * null. The source of truth for the "أتممتُها" button: it is the entry the
 * subscriber is currently on (the position only moves on confirm). Null means
 * there is nothing to confirm (already done, or nothing sent yet).
 */
export function getLatestUnconfirmedDelivery(subscriberId: number) {
  return prisma.deliveryLog.findFirst({
    where: { subscriberId, status: 'sent', confirmedAt: null },
    orderBy: { scheduledFor: 'desc' },
    select: { trackEntryId: true },
  });
}

/**
 * How many days BEFORE `today` this subscriber was sent an ayah and has not yet
 * marked done — the gentle "لم تُراجع منذ N يوم" number. Today is excluded so
 * the count reflects past misses, not the ayah just shown.
 */
export function countUnreadDeliveriesBefore(subscriberId: number, today: string): Promise<number> {
  return prisma.deliveryLog.count({
    where: { subscriberId, status: 'sent', confirmedAt: null, scheduledFor: { lt: today } },
  });
}
