import { prisma } from '../client';
import { ALL_DAYS } from '@ayah/core';
import { getTrackByKey } from './quran.service';
import { KIDS_TRACK } from '../reference/curriculum';

/** Find a subscriber by their Telegram user id, or null if new. */
export function getByTelegramId(telegramId: bigint) {
  return prisma.subscriber.findUnique({ where: { telegramId } });
}

/**
 * Make sure a subscriber row exists for this Telegram user, creating it on
 * the default kids track if it is their first time. Also clears blockedAt,
 * because the user messaging the bot is proof we can reach them again.
 * Returns the subscriber row.
 */
export async function ensureSubscriber(telegramId: bigint, timezone?: string) {
  const existing = await getByTelegramId(telegramId);
  if (existing) {
    if (existing.blockedAt) {
      return prisma.subscriber.update({
        where: { id: existing.id },
        data: { blockedAt: null },
      });
    }
    return existing;
  }

  const track = await getTrackByKey(KIDS_TRACK.key);
  return prisma.subscriber.create({
    data: {
      telegramId,
      trackId: track.id,
      activeDays: ALL_DAYS,
      ...(timezone ? { timezone } : {}),
    },
  });
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
