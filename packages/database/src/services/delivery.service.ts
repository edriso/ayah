import { prisma } from '../client';
import { advancePosition } from '@ayah/core';
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
  orderKey: string;
} | null> {
  const entry = await resolveTargetEntry(subscriber);
  if (!entry) return null;
  const track = await getTrackById(subscriber.trackId);
  return {
    surahNumber: entry.ayah.surah.number,
    numberInSurah: entry.ayah.numberInSurah,
    surahNameAr: entry.ayah.surah.nameAr,
    orderKey: track?.key ?? '',
  };
}

export type CommitResult = 'sent' | 'duplicate';

/**
 * Record a successful delivery and move the subscriber forward by one step,
 * all in one transaction. Call this ONLY after the message was actually
 * sent, so a failed send never advances the position (the subscriber would
 * silently skip an ayah otherwise).
 *
 * The unique (subscriber, scheduledFor) index is the idempotency lock: if a
 * second call races in for the same local day, the insert fails and we
 * report 'duplicate' without advancing twice.
 */
export async function commitDelivery(params: {
  subscriberId: number;
  entry: EntryWithAyah;
  scheduledFor: string;
  totalEntries: number;
  loops: boolean;
  /** The subscriber's current startedAt, so we stamp it only the first time. */
  startedAt: Date | null;
  now?: Date;
}): Promise<CommitResult> {
  const { subscriberId, entry, scheduledFor, totalEntries, loops, startedAt } = params;
  const now = params.now ?? new Date();

  const nextPosition = advancePosition(entry.position, totalEntries, loops);
  const nextEntry =
    nextPosition === null ? null : await getEntryAtPosition(entry.trackId, nextPosition);

  try {
    await prisma.$transaction([
      prisma.deliveryLog.create({
        data: {
          subscriberId,
          trackEntryId: entry.id,
          scheduledFor,
          status: 'sent',
          sentAt: now,
        },
      }),
      prisma.subscriber.update({
        where: { id: subscriberId },
        data: {
          currentEntryId: nextEntry ? nextEntry.id : null,
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
