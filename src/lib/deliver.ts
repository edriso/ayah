import { InlineKeyboard, InputFile } from 'grammy';
import type { Bot, Context } from 'grammy';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ayahAudioUrl,
  dueLocalDate,
  formatDailyMessages,
  formatRevisionMessages,
  formatTafseerMessages,
  tafseerLink,
  isTafseerFormat,
  clampOldReviewCount,
  getLocalContext,
  isDayActive,
  toArabicDigits,
  type TafseerMessage,
} from '../core';
import {
  listDeliverableSubscribers,
  hasDeliveryFor,
  getDeliveryFor,
  countUnreadDeliveriesBefore,
  countConfirmedAyat,
  getRevisionAyat,
  resolveTargetEntry,
  commitDelivery,
  surahCompletionFor,
  getEntryById,
  markBlocked,
  getTrackByKey,
  getEntryForAyah,
  getAyahText,
  buildDailyContent,
  getCachedAyahAudioId,
  cacheAyahAudioId,
  reciterByKey,
  getTafseerText,
  tafseerOrDefault,
  pickQuranVirtue,
  DEFAULT_TAFSEER,
  KIDS_TRACK,
  type DeliverableSubscriber,
  type EntryWithAyah,
} from '../database';
import { config } from '../config';
import { sendMessages } from './send';
import { sendAudio } from './send-audio';
import { buildCompletionKeyboard } from './completion-keyboard';
import { COPY } from './copy';
import { logger } from './logger';

/** Callback-data PREFIX for the "أتممتُها — التالية" button under each ayah.
 *  The shown entry's id is appended ("ayah:done:<entryId>") so a tap names the
 *  exact ayah it was sent for: handleDone confirms only while that entry is
 *  still the reader's current position, and a tap on an old button (from an
 *  ayah already passed) is a gentle no-op. The numeric suffix never collides
 *  with the completion buttons in the same namespace (ayah:done:continue /
 *  pick / restart:<n>), which are not bare numbers. */
export const READ_CONFIRM = 'ayah:done';

/** A constant cover for the recitation clips. The everyayah audio files carry no
 *  embedded art, so a phone's player would otherwise show a random cached image
 *  (it once showed a kids-songs cover). We never store the audio bytes (one
 *  reciter is ~1 GB), so we cannot embed art in the file; instead we attach this
 *  small image as Telegram's thumbnail on the first (fresh) send. Resolved from
 *  the committed asset; null if missing, so a misplaced file never breaks audio.
 *  Replace assets/audio-thumb.jpg to rebrand. */
const AUDIO_THUMB_PATH = fileURLToPath(new URL('../../assets/audio-thumb.jpg', import.meta.url));
const AUDIO_THUMB: string | null = existsSync(AUDIO_THUMB_PATH) ? AUDIO_THUMB_PATH : null;

/** Build the callback data for an ayah's "done" button (carries the entry id
 *  so stale taps are detectable). See READ_CONFIRM. */
export function readConfirmData(entryId: number): string {
  return `${READ_CONFIRM}:${entryId}`;
}

/** Callback-data PREFIXES for the on-demand action buttons that can ride the
 *  prompt: show the tafseer for, or play the recitation of, a specific ayah. The
 *  shown entry's id is appended ("ayah:taf:now:<entryId>") so a tap names the
 *  exact ayah that prompt displayed — even one scrolled back to after advancing —
 *  matching the id-pinned "done" button. They appear on a /next reveal or a
 *  /today re-show, where the tafseer/audio were not auto-sent. Distinct from the
 *  picker-confirmation "sample" buttons and the other "ayah:taf:*" /
 *  "ayah:reciter*" callbacks, so they never clash. */
export const AYAH_TAFSEER_NOW = 'ayah:taf:now';
export const AYAH_AUDIO_NOW = 'ayah:rec:now';

/** Whether to offer the on-demand tafseer / recitation buttons under a prompt.
 *  Set for a showing that did NOT auto-send them (a reveal, or a re-show/peek);
 *  omitted for a fresh delivery, which already sent whatever the reader enabled. */
export interface PromptActions {
  tafseer: boolean;
  audio: boolean;
}

export interface DeliveryStats {
  due: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** The tafseer settings the message builder reads off a subscriber. */
export interface TafseerSettings {
  tafseerEnabled: boolean;
  /** The chosen edition key (see reference/tafseers.ts). */
  tafseerEdition: string;
  /** "text" (inline) or "link". */
  tafseerFormat: string;
}

/**
 * The tafseer message(s) to send after today's ayah, in the subscriber's chosen
 * edition and format, or [] when they turned tafseer off (or, in text format,
 * the chosen edition has no seeded text for this ayah). The caller sends these
 * SILENTLY (disable_notification) so they accompany the ayah without a second
 * notification sound.
 *
 * Reads the subscriber's CURRENT settings every time, so a change of edition or
 * format is honoured on the very next delivery. In "link" format no stored text
 * is read at all — the message is just the header and the link.
 */
export async function tafseerMessagesFor(
  entry: EntryWithAyah,
  sub: TafseerSettings,
): Promise<TafseerMessage[]> {
  if (!sub.tafseerEnabled) return [];

  const edition = tafseerOrDefault(sub.tafseerEdition);
  const format = isTafseerFormat(sub.tafseerFormat) ? sub.tafseerFormat : 'text';
  const { ayah } = entry;
  const link = tafseerLink(edition.linkHost, edition.linkRef, ayah.surahNumber, ayah.numberInSurah);

  // Link format needs no committed text: just the header and the pointer.
  if (format === 'link') {
    return formatTafseerMessages({
      numberInSurah: ayah.numberInSurah,
      editionLabel: edition.nameAr,
      kind: edition.kind,
      format,
      link,
    });
  }

  // Text format: read the committed text for the chosen edition (null = not
  // seeded, which formatTafseerMessages turns into no message).
  const text = await getTafseerText(edition.key, ayah.surahNumber, ayah.numberInSurah);
  return formatTafseerMessages({
    numberInSurah: ayah.numberInSurah,
    editionLabel: edition.nameAr,
    kind: edition.kind,
    format,
    text,
    link,
  });
}

/** The inline keyboard for a tafseer message: a single "read in full" button
 *  when the message points to the web (link format, or a preview's "read the
 *  rest"), or undefined for a plain inline-text message. Shared by the
 *  scheduler and /today so both render the button the same way. */
export function tafseerReplyMarkup(message: TafseerMessage): InlineKeyboard | undefined {
  return message.readMoreUrl
    ? new InlineKeyboard().url(COPY.tafsirReadMoreBtn, message.readMoreUrl)
    : undefined;
}

/**
 * Send the ayah's recitation audio SILENTLY (no notification sound) in the
 * subscriber's chosen reciter's voice, or do nothing when they chose "none".
 * Reuses the cached Telegram file_id when present; otherwise sends the CDN URL
 * and caches the file_id Telegram returns, so later sends are instant and never
 * re-fetch. Best-effort: any failure is logged and swallowed so it never
 * affects the delivery (the ayah is already sent and committed). The caller
 * invokes this only on a real 'sent' commit, so the audio goes out once, with
 * the day the ayah is delivered.
 */
export async function deliverAyahAudio(
  bot: Bot<Context>,
  chatId: bigint,
  entry: EntryWithAyah,
  reciterKey: string,
): Promise<void> {
  const reciter = reciterByKey(reciterKey);
  if (!reciter) return; // "none" or an unknown key: no audio
  try {
    const { surahNumber, numberInSurah, surah } = entry.ayah;
    const cachedId = await getCachedAyahAudioId(surahNumber, numberInSurah, reciter.key);
    const audio =
      cachedId ?? ayahAudioUrl(config.audioBaseUrl, reciter.folder, surahNumber, numberInSurah);
    const caption = `سورة ${surah.nameAr}، آية ${toArabicDigits(numberInSurah)} (${reciter.nameAr})`;
    // Title + performer name the clip in Telegram's music player. Telegram
    // auto-advances through the chat's audio when one ends (the sender cannot
    // disable this), so a labeled track keeps the player and lock screen
    // showing which ayah is playing instead of an unlabeled clip.
    const title = `سورة ${surah.nameAr}، آية ${toArabicDigits(numberInSurah)}`;
    const { result, fileId } = await sendAudio(bot, chatId, audio, {
      caption,
      silent: true,
      title,
      performer: reciter.nameAr,
      // Attach the cover only on a fresh send (cache miss): a cached file_id
      // already carries the media+thumbnail Telegram stored on the first send.
      ...(!cachedId && AUDIO_THUMB ? { thumbnail: new InputFile(AUDIO_THUMB) } : {}),
    });
    if (result === 'ok' && fileId && fileId !== cachedId) {
      await cacheAyahAudioId(surahNumber, numberInSurah, reciter.key, fileId);
    }
  } catch (err) {
    logger.warn('Failed to send ayah audio', { chatId: String(chatId), error: String(err) });
  }
}

// ─── Read confirmation (the "أتممتُها — التالية" button) ─────────────

/**
 * Send the small "done?" prompt that carries the "أتممتُها — التالية" button
 * for `entryId` (the ayah being shown). Silent (disable_notification): the ayah
 * itself is the day's one notification, and this is its quiet companion. Best
 * effort — a failure is logged and swallowed; the reader can still advance with
 * /next. The button names the entry so a tap on a stale (already-passed) button
 * is a no-op (see handleDone).
 */
export async function sendConfirmPrompt(
  bot: Bot<Context>,
  chatId: bigint,
  entryId: number,
  actions?: PromptActions,
): Promise<void> {
  try {
    const keyboard = new InlineKeyboard().text(COPY.doneBtn, readConfirmData(entryId));
    // When the tafseer / recitation were not auto-sent with this showing, offer
    // them one tap away (progressive disclosure) on a second row.
    if (actions && (actions.tafseer || actions.audio)) {
      keyboard.row();
      // Pin each action to this entry, so a tap names the ayah this prompt shows.
      if (actions.tafseer) keyboard.text(COPY.showTafsirBtn, `${AYAH_TAFSEER_NOW}:${entryId}`);
      if (actions.audio) keyboard.text(COPY.listenBtn, `${AYAH_AUDIO_NOW}:${entryId}`);
    }
    await bot.api.sendMessage(Number(chatId), COPY.confirmPrompt, {
      reply_markup: keyboard,
      disable_notification: true,
    });
  } catch (err) {
    logger.warn('Could not send the done prompt', { chatId: String(chatId), error: String(err) });
  }
}

/**
 * When the ayah has gone unconfirmed for one or more days, lead with a gentle
 * "you have not reviewed for N days" note and a rotating ayah on the virtue of
 * the Qur'an (its text read from the verified database, never typed). Silent
 * (the ayah that follows is the notification) and best effort — never blocks
 * the delivery. Does nothing when nothing was missed.
 */
export async function sendMissedDaysNudge(
  bot: Bot<Context>,
  chatId: bigint,
  subscriberId: number,
  timezone: string,
  now: Date,
): Promise<void> {
  try {
    const { date: today } = getLocalContext(timezone, now);
    const missed = await countUnreadDeliveriesBefore(subscriberId, today);
    if (missed === 0) return;
    const virtue = pickQuranVirtue(missed);
    const ayah = await getAyahText(virtue.surah, virtue.ayah);
    if (!ayah) {
      logger.error('Encouragement ayah not seeded; skipping the nudge', { ...virtue });
      return;
    }
    await bot.api.sendMessage(Number(chatId), COPY.missedDaysMessage(missed, ayah), {
      disable_notification: true,
    });
  } catch (err) {
    logger.warn('Could not send the missed-days nudge', {
      chatId: String(chatId),
      error: String(err),
    });
  }
}

/** Fields revisionMessagesFor needs off a subscriber row. */
export interface RevisionSubscriber {
  id: number;
  oldReviewCount: number;
  reviewCursor: number;
}

/**
 * The distant-review («مراجعة للتثبيت») message(s) for today, plus the cursor
 * to persist. Rotates `oldReviewCount` ayat through the subscriber's confirmed
 * corpus in track order, looping — EXCLUDING `currentSurahNumber` (the surah of
 * today's ayah), so it is genuinely OLD material and never duplicates today's
 * in-surah passage. Empty (cursor unchanged) when the feature is off or nothing
 * OLD has been confirmed yet (e.g. a reader still in their first surah). The
 * caller sends the messages SILENTLY on a real delivery and passes `nextCursor`
 * into commitDelivery, so the rotation advances exactly once per recorded day.
 */
export async function revisionMessagesFor(
  sub: RevisionSubscriber,
  currentSurahNumber: number,
): Promise<{ messages: string[]; nextCursor: number }> {
  const want = clampOldReviewCount(sub.oldReviewCount);
  if (want === 0) return { messages: [], nextCursor: sub.reviewCursor };
  const total = await countConfirmedAyat(sub.id, currentSurahNumber);
  if (total === 0) return { messages: [], nextCursor: sub.reviewCursor };
  const count = Math.min(want, total);
  const offset = ((sub.reviewCursor % total) + total) % total; // safe modulo
  const ayat = await getRevisionAyat(sub.id, offset, count, currentSurahNumber);
  return { messages: formatRevisionMessages(ayat), nextCursor: sub.reviewCursor + count };
}

/** Fields sendAyahNow needs off a subscriber row. */
export interface AyahNowSubscriber {
  telegramId: bigint;
  reviewCount: number;
}

/**
 * Show an ayah (its passage + in-surah review) right now, WITHOUT recording a
 * delivery. Used to REVEAL the upcoming ayah after a confirmed done (/next or
 * the "أتممتُها" button): the position has already advanced, and this is just
 * the read-ahead view. `todayLabel` titles it (e.g. "الآية التالية") so it is
 * not mistaken for today's scheduled delivery.
 *
 * It deliberately does NOT send the recitation audio or the tafseer: those are
 * tied to a real delivery (the scheduled push, or a /today that records the
 * day), not to merely showing an ayah — so a reader who races ahead with /next
 * is not buried under a clip and a tafseer for every ayah. They arrive with the
 * ayah's actual delivery. Returns false when the ayah text could not be sent.
 */
export async function sendAyahNow(
  bot: Bot<Context>,
  sub: AyahNowSubscriber,
  entry: EntryWithAyah,
  todayLabel?: string,
): Promise<boolean> {
  const content = await buildDailyContent(entry, sub.reviewCount);
  const result = await sendMessages(bot, sub.telegramId, formatDailyMessages(content, todayLabel));
  return result === 'ok';
}

/**
 * The heart of the bot: find every subscriber whose ayah is due right now
 * and send it. Safe to run every minute and safe to run twice for the same
 * minute, because:
 *   - dueLocalDate decides per-subscriber (their own timezone + send time).
 *   - a (subscriber, local date) delivery record makes it send at most once
 *     per local day, even on a restart catch-up or a double cron fire.
 *   - one subscriber failing is caught and never stops the rest.
 *
 * Read-gated: the send records the day but does NOT advance the position. The
 * same ayah repeats each day until the subscriber marks it done ("أتممتُها" or
 * /next) — so a missed day never skips an ayah, and the surah-completion
 * milestone fires on confirm (handleDone), not here. A repeat is led by a gentle
 * "days since last review" nudge.
 */
export async function deliverDueSubscribers(
  bot: Bot<Context>,
  now: Date = new Date(),
): Promise<DeliveryStats> {
  const subscribers = await listDeliverableSubscribers();
  const stats: DeliveryStats = { due: 0, sent: 0, skipped: 0, failed: 0 };

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

      // If the ayah has been repeating unconfirmed, lead with a gentle nudge +
      // an encouragement ayah (silent, best effort, never blocks the send).
      await sendMissedDaysNudge(bot, sub.telegramId, sub.id, sub.timezone, now);

      const content = await buildDailyContent(entry, sub.reviewCount);
      const result = await sendMessages(bot, sub.telegramId, formatDailyMessages(content));

      if (result === 'blocked') {
        await markBlocked(sub.id);
        stats.failed++;
        continue;
      }
      if (result === 'failed') {
        stats.failed++;
        continue; // nothing recorded; retried next tick
      }

      // Compute the distant review BEFORE the commit (it reads only past
      // confirmations, never today's), so its cursor advances in the same
      // transaction — exactly once per recorded day. It excludes today's surah.
      const revision = await revisionMessagesFor(sub, entry.ayah.surahNumber);

      // Record the day (no advance — the position moves on a confirmed done).
      const committed = await commitDelivery({
        subscriberId: sub.id,
        entry,
        scheduledFor,
        startedAt: sub.startedAt,
        nextReviewCursor: revision.messages.length > 0 ? revision.nextCursor : undefined,
        now,
      });
      if (committed === 'sent') {
        stats.sent++;

        // Follow the ayah, in reading order, all SILENT: the recitation, then
        // the tafseer, then the distant-review block — so each arrives once, the
        // day it is delivered.
        await deliverAyahAudio(bot, sub.telegramId, entry, sub.reciter);
        try {
          for (const msg of await tafseerMessagesFor(entry, sub)) {
            await bot.api.sendMessage(Number(sub.telegramId), msg.text, {
              disable_notification: true,
              reply_markup: tafseerReplyMarkup(msg),
            });
          }
        } catch (err) {
          logger.error('Failed to send tafseer', { id: sub.id, error: String(err) });
        }
        try {
          for (const msg of revision.messages) {
            await bot.api.sendMessage(Number(sub.telegramId), msg, { disable_notification: true });
          }
        } catch (err) {
          logger.error('Failed to send revision', { id: sub.id, error: String(err) });
        }

        // Finally, the "أتممتُها — التالية" button for THIS ayah. Tapping it
        // advances, reveals the next ayah, and (if this ayah finished a surah)
        // fires the milestone — see handleDone.
        await sendConfirmPrompt(bot, sub.telegramId, entry.id);
      } else stats.skipped++; // a race delivered the same day first
    } catch (err) {
      stats.failed++;
      logger.error('Delivery failed for subscriber', { id: sub.id, error: String(err) });
    }
  }

  return stats;
}

/** What /today (and /surah) shows, and whether to record it as the day's
 *  delivery so the scheduler does not send the same ayah again. Read-gated: the
 *  ayah is always the LIVE current one (a view never advances the position), so
 *  a re-show or a just-repositioned ayah is shown straight from
 *  resolveTargetEntry — there is no frozen "delivered" ayah to fetch. */
export interface TodayView {
  /** The messages to reply (today's ayah + review), or empty when nothing can
   *  be prepared (a dangling entry, or a finished non-looping track). */
  messages: string[];
  /**
   * The tafseer message(s) to send AFTER the ayah, silently, ONLY when this view
   * is RECORDED as today's delivery (a real, fresh delivery). A re-show, or a
   * peek on an off/paused day, sends no tafseer, so each ayah's tafseer arrives
   * once — the day it is delivered. Also empty when tafseer is off or the ayah
   * has none.
   */
  tafseer: TafseerMessage[];
  /**
   * Set when this view should be RECORDED as today's delivery (today is free:
   * active day, not paused, not already delivered). The caller records it AFTER
   * the messages are shown, so the scheduler skips the day. Recording does NOT
   * advance the position (the subscriber advances on a confirmed done). Null on
   * a re-show, an off day, or while paused.
   */
  record: { scheduledFor: string; entry: EntryWithAyah } | null;
  /** True when today's ayah was already delivered and this is a re-show. */
  alreadyDelivered: boolean;
  /** The LIVE current entry being shown (null when none could be prepared). The
   *  caller uses its id for the "done" button so a later tap names this exact
   *  ayah. Unlike `record.entry` it is present even on a re-show or off-day peek. */
  entry: EntryWithAyah | null;
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
  tafseerEdition: string;
  tafseerFormat: string;
}

/**
 * Decide what /today shows and whether it counts as today's delivery.
 *
 * The ayah is always the LIVE current one (the position only moves on a
 * confirmed done), so a re-show of an already-delivered day, and a just-set
 * ayah after /surah, both render straight from resolveTargetEntry. When today
 * is still free (active day, not paused, not delivered) the show RECORDS today's
 * delivery so the scheduler skips it — without advancing.
 */
export async function buildTodayView(sub: TodaySubscriber, now: Date): Promise<TodayView> {
  const local = getLocalContext(sub.timezone, now);
  const scheduledFor = local.date;
  const delivered = await getDeliveryFor(sub.id, scheduledFor);

  const entry = await resolveTargetEntry(sub);
  if (!entry)
    return {
      messages: [],
      tafseer: [],
      record: null,
      alreadyDelivered: delivered !== null,
      entry: null,
    };
  const content = await buildDailyContent(entry, sub.reviewCount);
  const messages = formatDailyMessages(content);

  // Record today only when it is genuinely free: not already delivered, an
  // active day, and not paused. Recording does NOT advance — the subscriber
  // advances on a confirmed done.
  const recordable =
    delivered === null && sub.pausedAt === null && isDayActive(sub.activeDays, local.isoWeekday);
  const record = recordable ? { scheduledFor, entry } : null;
  // Tafseer accompanies a real (recorded) delivery only, so each ayah's tafseer
  // arrives once — the day it is actually delivered (here, or at the next send).
  const tafseer = record ? await tafseerMessagesFor(entry, sub) : [];
  return { messages, tafseer, record, alreadyDelivered: delivered !== null, entry };
}

/**
 * Build the delivery message(s) for any (surah, ayah), independent of any
 * subscriber. For admin and dev testing (the /admin_preview command): see
 * exactly what the bot would send for a chosen ayah and review window.
 *
 * The default order's track (kids-hifz) is used only to resolve the ayah into
 * an entry; the rendered text depends on the ayah and the review count, not on
 * the order, so the choice of track does not affect the output. The default
 * edition's tafseer (التفسير الميسر, inline) is appended, so the preview shows
 * the text a subscriber sees. The recitation audio is NOT included (it is a
 * live send, not a text render). Returns an empty array if that ayah is not
 * seeded.
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
  const tafseer = await tafseerMessagesFor(entry, {
    tafseerEnabled: true,
    tafseerEdition: DEFAULT_TAFSEER,
    tafseerFormat: 'text',
  });
  // Admin preview is text-only: fold any read-more URL into the text so the
  // single ayah render still shows it (the live send uses a button instead).
  const tafseerText = tafseer.map((m) => (m.readMoreUrl ? `${m.text}\n${m.readMoreUrl}` : m.text));
  return [...formatDailyMessages(content), ...tafseerText];
}

/** Fields sampleEntryFor needs off a subscriber row. */
export interface SampleSubscriber {
  id: number;
  timezone: string;
  trackId: number;
  currentEntryId: number | null;
  startedAt: Date | null;
}

/**
 * The ayah a "try it on today's ayah" preview should use: today's DELIVERED
 * ayah when there is one (so the sample matches what they last received), else
 * the ayah they are currently on, or null if they have not started. A pure read
 * — it never records a delivery, advances the position, or fires a milestone,
 * so a subscriber can tap "try it" as often as they like. The caller renders
 * the sample (audio via deliverAyahAudio, tafseer via tafseerMessagesFor) and
 * sends it silently.
 */
export async function sampleEntryFor(
  sub: SampleSubscriber,
  now: Date = new Date(),
): Promise<EntryWithAyah | null> {
  const local = getLocalContext(sub.timezone, now);
  const delivered = await getDeliveryFor(sub.id, local.date);
  if (delivered) {
    const entry = await getEntryById(delivered.trackEntryId);
    if (entry) return entry;
  }
  return resolveTargetEntry(sub);
}

/** The surah-completion milestone (text + keyboard) to send after a delivery,
 *  or null when the delivered ayah did not finish a surah. */
export interface CompletionMessage {
  text: string;
  keyboard: InlineKeyboard;
}

/**
 * Build the milestone message for a confirmed ayah, when it completed a surah.
 * Read-gated, so it fires on the DONE confirm (handleDone / /next), not on the
 * send. Returns null on a non-boundary ayah (the common case).
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
