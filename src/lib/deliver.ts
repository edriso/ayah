import type { Bot, Context, InlineKeyboard } from 'grammy';
import {
  dueLocalDate,
  formatDailyMessages,
  formatTafseerMessages,
  getLocalContext,
  isDayActive,
} from '../core';
import {
  listDeliverableSubscribers,
  hasDeliveryFor,
  getDeliveryFor,
  resolveTargetEntry,
  commitDelivery,
  buildDailyContent,
  surahCompletionFor,
  countTrackEntries,
  getEntryById,
  getTrackById,
  markBlocked,
  getTrackByKey,
  getEntryForAyah,
  KIDS_TRACK,
  type DeliverableSubscriber,
  type EntryWithAyah,
} from '../database';
import { sendMessages } from './send';
import { buildCompletionKeyboard } from './completion-keyboard';
import { COPY } from './copy';
import { logger } from './logger';

export interface DeliveryStats {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * The tafseer message(s) to send after today's ayah, or [] when the subscriber
 * turned tafseer off or the ayah has no seeded tafseer. The caller sends these
 * SILENTLY (disable_notification) so they accompany the ayah without a second
 * notification sound.
 */
export function tafseerMessagesFor(entry: EntryWithAyah, enabled: boolean): string[] {
  if (!enabled || !entry.ayah.tafseer) return [];
  return formatTafseerMessages({
    surah: { number: entry.ayah.surah.number, nameAr: entry.ayah.surah.nameAr },
    numberInSurah: entry.ayah.numberInSurah,
    text: entry.ayah.tafseer,
  });
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

      // The ayah was delivered. Follow it with the tafseer as SILENT messages
      // (no notification sound) when the subscriber wants it. Wrapped so a
      // tafseer hiccup never blocks the commit/advance below: the ayah is the
      // delivery that matters, the tafseer is a quiet companion.
      try {
        for (const msg of tafseerMessagesFor(entry, sub.tafseerEnabled)) {
          await bot.api.sendMessage(Number(sub.telegramId), msg, { disable_notification: true });
        }
      } catch (err) {
        logger.error('Failed to send tafseer', { id: sub.id, error: String(err) });
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
      if (committed === 'sent') {
        stats.sent++;
        // If today's ayah finished a surah, follow it with the milestone
        // message + keyboard. Wrapped so a failure here never undoes the
        // delivery (already committed) or aborts the rest of the batch.
        try {
          const completion = await buildCompletionMessage(
            entry,
            await totalFor(sub.trackId),
            sub.track.loops,
            sub.id,
          );
          if (completion) {
            await bot.api.sendMessage(Number(sub.telegramId), completion.text, {
              reply_markup: completion.keyboard,
            });
          }
        } catch (err) {
          logger.error('Failed to send surah-completion message', {
            id: sub.id,
            error: String(err),
          });
        }
      } else stats.skipped++; // a race delivered the same day first
    } catch (err) {
      stats.failed++;
      logger.error('Delivery failed for subscriber', { id: sub.id, error: String(err) });
    }
  }

  return stats;
}

/** What /today should send the user, and whether to record it as the day's
 *  delivery so the scheduler does not send the same ayah again. */
export interface TodayView {
  /** The messages to reply (today's ayah + review), or empty when nothing can
   *  be prepared (a dangling entry, or a finished non-looping track). */
  messages: string[];
  /** The tafseer message(s) to send AFTER the ayah, silently (no notification
   *  sound). Empty when the subscriber turned tafseer off or the ayah has no
   *  seeded tafseer. The caller sends these with disable_notification. */
  tafseer: string[];
  /**
   * Set when this view should be COMMITTED as today's delivery (the user pulled
   * their ayah before the scheduled send). The caller records it AFTER the
   * messages are shown, so the scheduler skips the day. Null on an off day or
   * while paused (nothing scheduled to dedupe against), and null when today was
   * already delivered (re-show only).
   */
  claim: {
    scheduledFor: string;
    entry: EntryWithAyah;
    totalEntries: number;
    loops: boolean;
  } | null;
  /** True when today's ayah was already delivered and this is a re-show. */
  alreadyDelivered: boolean;
}

/** Fields buildTodayView needs off a subscriber row. */
export interface TodaySubscriber {
  id: number;
  timezone: string;
  activeDays: number;
  pausedAt: Date | null;
  trackId: number;
  currentEntryId: number | null;
  startedAt: Date | null;
  reviewCount: number;
  tafseerEnabled: boolean;
}

/**
 * Decide what /today shows and whether it counts as today's delivery.
 *
 * /today is "give me today's ayah now". If the user pulls it on an active day
 * before the scheduled send, that pull IS today's delivery: we show the ayah
 * and the caller records it (so the scheduler does not send it again). If today
 * was already delivered (by an earlier /today or the scheduler), we re-show the
 * exact ayah that was delivered (from the recorded trackEntryId, since the
 * subscriber's pointer has already advanced past it) without advancing again.
 * On an off day or while paused there is no scheduled send to dedupe against,
 * so /today stays a pure peek that never advances.
 */
export async function buildTodayView(
  sub: TodaySubscriber,
  now: Date,
  opts: { reposition?: boolean } = {},
): Promise<TodayView> {
  const local = getLocalContext(sub.timezone, now);
  const scheduledFor = local.date;
  const delivered = await getDeliveryFor(sub.id, scheduledFor);

  // /today on an already-delivered day re-shows exactly that ayah. A reposition
  // (/surah, a surah-pick button, onboarding) instead always shows the NEW ayah
  // the user just chose, so it skips this re-show and renders it below.
  if (delivered && !opts.reposition) {
    const entry = await getEntryById(delivered.trackEntryId);
    if (!entry) return { messages: [], tafseer: [], claim: null, alreadyDelivered: true };
    const content = await buildDailyContent(entry, sub.reviewCount);
    return {
      messages: formatDailyMessages(content),
      tafseer: tafseerMessagesFor(entry, sub.tafseerEnabled),
      claim: null,
      alreadyDelivered: true,
    };
  }

  // Show the current ayah (or the first, if not started).
  const entry = await resolveTargetEntry(sub);
  if (!entry)
    return { messages: [], tafseer: [], claim: null, alreadyDelivered: delivered !== null };
  const content = await buildDailyContent(entry, sub.reviewCount);
  const messages = formatDailyMessages(content);
  const tafseer = tafseerMessagesFor(entry, sub.tafseerEnabled);

  // Claim it as today's delivery only when today is genuinely free: not already
  // delivered, an active day, and not paused. A reposition on an
  // already-delivered (or off / paused) day just shows the new ayah as a
  // preview and leaves today's record and the position untouched.
  const claimable =
    delivered === null && sub.pausedAt === null && isDayActive(sub.activeDays, local.isoWeekday);
  let claim: TodayView['claim'] = null;
  if (claimable) {
    const track = await getTrackById(sub.trackId);
    claim = {
      scheduledFor,
      entry,
      totalEntries: await countTrackEntries(sub.trackId),
      loops: track?.loops ?? false,
    };
  }
  return { messages, tafseer, claim, alreadyDelivered: delivered !== null };
}

/**
 * Build the delivery message(s) for any (surah, ayah), independent of any
 * subscriber. For admin and dev testing (the /admin_preview command): see
 * exactly what the bot would send for a chosen ayah and review window.
 *
 * The default order's track (kids-hifz) is used only to resolve the ayah into
 * an entry; the rendered text depends on the ayah and the review count, not on
 * the order, so the choice of track does not affect the output. The ayah's
 * tafseer (if seeded) is appended, so the preview shows the full delivery the
 * way a subscriber sees it. Returns an empty array if that ayah is not seeded.
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
  return [...formatDailyMessages(content), ...tafseerMessagesFor(entry, true)];
}

/** The surah-completion milestone (text + keyboard) to send after a delivery,
 *  or null when the delivered ayah did not finish a surah. */
export interface CompletionMessage {
  text: string;
  keyboard: InlineKeyboard;
}

/**
 * Build the milestone message for a delivery, when its ayah completed a surah.
 * Shared by the scheduler and the /today (claim) path so both celebrate the
 * same way. Returns null on a non-boundary ayah (the common case).
 */
export async function buildCompletionMessage(
  entry: EntryWithAyah,
  totalEntries: number,
  loops: boolean,
  subscriberId: number,
): Promise<CompletionMessage | null> {
  const completion = await surahCompletionFor(entry, totalEntries, loops, subscriberId);
  if (!completion) return null;
  const text = completion.isQuranComplete
    ? COPY.quranCompleted(completion.nextSurahNameAr)
    : COPY.surahCompleted(completion.completedSurahNameAr, completion.nextSurahNameAr);
  return { text, keyboard: buildCompletionKeyboard(completion.completedSurahNumber) };
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
