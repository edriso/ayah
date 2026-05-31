import type { Bot, Context } from 'grammy';
import { dueLocalDate, formatDailyMessages } from '../core';
import {
  listDeliverableSubscribers,
  hasDeliveryFor,
  resolveTargetEntry,
  commitDelivery,
  buildDailyContent,
  countTrackEntries,
  markBlocked,
  getTrackByKey,
  getEntryForAyah,
  KIDS_TRACK,
  type DeliverableSubscriber,
} from '../database';
import { sendMessages } from './send';
import { logger } from './logger';

export interface DeliveryStats {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * The heart of the bot: find every subscriber whose ayah is due right now
 * and send it. Safe to run every minute and safe to run twice for the same
 * minute, because:
 *   - dueLocalDate decides per-subscriber (their own timezone + send time).
 *   - a (subscriber, local date) delivery record makes it send at most once
 *     per local day, even on a restart catch-up or a double cron fire.
 *   - one subscriber failing is caught and never stops the rest.
 *   - the position only advances AFTER a successful send, so a failed send
 *     re-sends the same ayah next time instead of skipping it.
 */
export async function deliverDueSubscribers(
  bot: Bot<Context>,
  now: Date = new Date(),
): Promise<DeliveryStats> {
  const subscribers = await listDeliverableSubscribers();
  const stats: DeliveryStats = { due: 0, sent: 0, skipped: 0, failed: 0 };

  // Cache total entries per track so we do not re-count for every subscriber.
  const totalsByTrack = new Map<number, number>();
  const totalFor = async (trackId: number): Promise<number> => {
    const cached = totalsByTrack.get(trackId);
    if (cached !== undefined) return cached;
    const total = await countTrackEntries(trackId);
    totalsByTrack.set(trackId, total);
    return total;
  };

  for (const sub of subscribers) {
    try {
      const scheduledFor = dueLocalDate(scheduleOf(sub), now);
      if (scheduledFor === null) continue; // not their day, or before their time
      stats.due++;

      if (await hasDeliveryFor(sub.id, scheduledFor)) {
        stats.skipped++; // already delivered today
        continue;
      }

      const entry = await resolveTargetEntry(sub);
      if (!entry) {
        stats.skipped++; // finished a non-looping track
        continue;
      }

      const content = await buildDailyContent(entry, sub.reviewCount);
      const result = await sendMessages(bot, sub.telegramId, formatDailyMessages(content));

      if (result === 'blocked') {
        await markBlocked(sub.id);
        stats.failed++;
        continue;
      }
      if (result === 'failed') {
        stats.failed++;
        continue; // do NOT advance; retried next tick
      }

      const committed = await commitDelivery({
        subscriberId: sub.id,
        entry,
        scheduledFor,
        totalEntries: await totalFor(sub.trackId),
        loops: sub.track.loops,
        startedAt: sub.startedAt,
        now,
      });
      if (committed === 'sent') stats.sent++;
      else stats.skipped++; // a race delivered the same day first
    } catch (err) {
      stats.failed++;
      logger.error('Delivery failed for subscriber', { id: sub.id, error: String(err) });
    }
  }

  return stats;
}

/**
 * Build the message(s) for a subscriber's CURRENT ayah without sending or
 * advancing. Used by /today so a user can peek at where they are. Returns an
 * empty array if there is nothing to show (finished a non-looping track).
 */
export async function previewCurrent(sub: {
  trackId: number;
  currentEntryId: number | null;
  startedAt: Date | null;
  reviewCount: number;
}): Promise<string[]> {
  const entry = await resolveTargetEntry(sub);
  if (!entry) return [];
  const content = await buildDailyContent(entry, sub.reviewCount);
  return formatDailyMessages(content);
}

/**
 * Build the delivery message(s) for any (surah, ayah), independent of any
 * subscriber. For admin and dev testing (the /admin_preview command): see
 * exactly what the bot would send for a chosen ayah and review window.
 *
 * The default order's track (kids-hifz) is used only to resolve the ayah into
 * an entry; the rendered text depends on the ayah and the review count, not on
 * the order, so the choice of track does not affect the output. Returns an
 * empty array if that ayah is not seeded.
 */
export async function previewAyah(
  surahNumber: number,
  numberInSurah: number,
  reviewCount: number,
): Promise<string[]> {
  const track = await getTrackByKey(KIDS_TRACK.key);
  const entry = await getEntryForAyah(track.id, surahNumber, numberInSurah);
  if (!entry) return [];
  const content = await buildDailyContent(entry, reviewCount);
  return formatDailyMessages(content);
}

/** Pull the scheduling fields the core math needs out of a subscriber row. */
function scheduleOf(sub: DeliverableSubscriber) {
  return {
    timezone: sub.timezone,
    deliveryHour: sub.deliveryHour,
    deliveryMinute: sub.deliveryMinute,
    activeDays: sub.activeDays,
  };
}
