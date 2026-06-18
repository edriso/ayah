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
  now?: Date;
}): Promise<CommitResult> {
  const { subscriberId, entry, scheduledFor, startedAt } = params;
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
  const nextEntry =
    nextPosition === null ? null : await getEntryAtPosition(entry.trackId, nextPosition);

  const moved = await prisma.subscriber.updateMany({
    where: { id: subscriberId, currentEntryId: entry.id },
    data: { currentEntryId: nextEntry ? nextEntry.id : null },
  });
  if (moved.count === 0) return 'already';
  // Mark this and any earlier unread days done, so "days since last review"
  // resets. (All unconfirmed rows are for the same current ayah.)
  await prisma.deliveryLog.updateMany({
    where: { subscriberId, status: 'sent', confirmedAt: null },
    data: { confirmedAt: now },
  });
  return 'advanced';
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
