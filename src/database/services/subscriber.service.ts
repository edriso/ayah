import { prisma } from '../client';
import { ALL_DAYS } from '../../core';
import { getTrackByKey } from './quran.service';
import { KIDS_TRACK } from '../reference/curriculum';

/** Find a subscriber by their Telegram user id, or null if new. */
export function getByTelegramId(telegramId: bigint) {
  return prisma.subscriber.findUnique({ where: { telegramId } });
}

// The default track id never changes after seeding, so we look it up once and
// cache it. This keeps ensureSubscriber to a single write per call.
let defaultTrackId: number | null = null;
async function getDefaultTrackId(): Promise<number> {
  if (defaultTrackId === null) {
    const track = await getTrackByKey(KIDS_TRACK.key);
    defaultTrackId = track.id;
  }
  return defaultTrackId;
}

/**
 * Make sure a subscriber row exists for this Telegram user, creating it on
 * the default kids track if it is their first time. Also clears blockedAt,
 * because the user messaging the bot is proof we can reach them again.
 *
 * Uses an upsert so two messages arriving at once from a brand-new user can
 * never race into a duplicate-key error. Returns the subscriber row.
 */
export async function ensureSubscriber(telegramId: bigint, timezone?: string) {
  const trackId = await getDefaultTrackId();
  try {
    return await prisma.subscriber.upsert({
      where: { telegramId },
      // Any interaction proves the user is reachable again.
      update: { blockedAt: null },
      create: {
        telegramId,
        trackId,
        activeDays: ALL_DAYS,
        ...(timezone ? { timezone } : {}),
      },
    });
  } catch (err) {
    // On MySQL, Prisma's upsert is select-then-insert, so two requests for a
    // brand-new user that land at the very same moment can both try to
    // insert and one loses with P2002. The row now exists, so just update it.
    if ((err as { code?: string }).code === 'P2002') {
      return prisma.subscriber.update({ where: { telegramId }, data: { blockedAt: null } });
    }
    throw err;
  }
}

/**
 * Move a subscriber to a chosen starting point by pointing currentEntryId at
 * a specific track entry (their track/order is unchanged). The entry must
 * belong to the subscriber's current track; the caller looks it up with
 * getEntryForAyah. From here the subscriber walks forward from this entry.
 */
export function setStartPosition(subscriberId: number, entryId: number) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { currentEntryId: entryId },
  });
}

/**
 * Switch a subscriber's order by moving them to another track.
 *   - currentEntryId is the matching entry in the NEW track (so changing
 *     order keeps their place within the current surah), or null to let the
 *     first send start at the new track's position 0 (a not-yet-started
 *     subscriber). The caller resolves it with getEntryForAyah.
 */
export function setOrder(subscriberId: number, trackId: number, currentEntryId: number | null) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { trackId, currentEntryId },
  });
}

/**
 * Flip one weekday on/off and return the new mask. The toggle is a single
 * atomic `active_days = active_days ^ bit` UPDATE at the database, so two fast
 * taps on the day picker can never lose each other's change the way an
 * app-side read-modify-write would. `isoWeekday` is 1 (Monday) .. 7 (Sunday);
 * bit (isoWeekday - 1) matches the mask layout in src/core/days.ts.
 */
export async function toggleActiveDay(subscriberId: number, isoWeekday: number): Promise<number> {
  if (!Number.isInteger(isoWeekday) || isoWeekday < 1 || isoWeekday > 7) {
    throw new Error(`isoWeekday must be 1..7, got ${isoWeekday}`);
  }
  const bit = 1 << (isoWeekday - 1);
  await prisma.$executeRaw`UPDATE subscribers SET active_days = active_days ^ ${bit} WHERE id = ${subscriberId}`;
  const row = await prisma.subscriber.findUniqueOrThrow({
    where: { id: subscriberId },
    select: { activeDays: true },
  });
  return row.activeDays;
}

/** Update the daily send time (local hour and minute). */
export function setDeliveryTime(subscriberId: number, hour: number, minute: number) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { deliveryHour: hour, deliveryMinute: minute },
  });
}

/** Update the subscriber's IANA timezone. */
export function setTimezone(subscriberId: number, timezone: string) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { timezone },
  });
}

/**
 * Update how many previous ayat the subscriber gets for review (0..20). The
 * caller is expected to have clamped the value with clampReviewCount.
 */
export function setReviewCount(subscriberId: number, reviewCount: number) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { reviewCount },
  });
}

/** Turn the daily tafseer (sent silently after the ayah) on or off. */
export function setTafseerEnabled(subscriberId: number, enabled: boolean) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { tafseerEnabled: enabled },
  });
}

/**
 * Mark a subscriber as unreachable (they blocked the bot, or a send failed
 * with a 403). Send loops skip blocked subscribers. Cleared automatically
 * the next time they message the bot (see ensureSubscriber).
 */
export function markBlocked(subscriberId: number) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { blockedAt: new Date() },
  });
}
