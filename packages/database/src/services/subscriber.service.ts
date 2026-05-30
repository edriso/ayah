import { prisma } from '../client';
import { ALL_DAYS } from '@ayah/core';
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

/** Update which weekdays a subscriber receives ayat on (a 7-bit mask). */
export function setActiveDays(subscriberId: number, activeDays: number) {
  return prisma.subscriber.update({
    where: { id: subscriberId },
    data: { activeDays },
  });
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
