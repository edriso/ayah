import { Bot, InlineKeyboard, type Context } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import {
  activeDaysList,
  clampReviewCount,
  clampOldReviewCount,
  MAX_REVIEW_COUNT,
  toAsciiDigits,
  advancePosition,
} from './core';
import {
  ensureSubscriber,
  toggleActiveDay,
  setDeliveryTime,
  setTimezone,
  setReviewCount,
  setOldReviewCount,
  setTafseerEnabled,
  setTafseerEdition,
  setTafseerFormat,
  setReciter,
  pauseSubscriber,
  resumeSubscriber,
  setStartPosition,
  setOrder,
  commitDelivery,
  confirmRead,
  resolveTargetEntry,
  getEntryById,
  getEntryForAyah,
  getEntryAtPosition,
  countTrackEntries,
  getTrackById,
  getProgressView,
  countDeliveries,
  getTrackByKey,
  ORDERS,
  KIDS_TRACK,
  MUSHAF_TRACK,
  SURAHS,
  RECITERS,
  RECITER_NONE,
  reciterByKey,
  isReciterChoice,
  TAFSEERS,
  tafseerOrDefault,
  isTafseerEdition,
  ayahCountFor,
  type EntryWithAyah,
  type Subscriber,
} from './database';
import { config } from './config';
import { logger } from './lib/logger';
import { COPY, settingsSummary, formatTimeAr, daysSummaryAr, orderSummaryAr } from './lib/copy';
import {
  buildTodayView,
  buildCompletionMessage,
  deliverAyahAudio,
  previewAyah,
  tafseerMessagesFor,
  tafseerReplyMarkup,
  sampleEntryFor,
  sendConfirmPrompt,
  sendAyahNow,
  revisionMessagesFor,
  READ_CONFIRM,
  AYAH_TAFSEER_NOW,
  AYAH_AUDIO_NOW,
  type PromptActions,
  type TodayView,
} from './lib/deliver';
import {
  COMPLETE_CONTINUE,
  COMPLETE_PICK,
  COMPLETE_RESTART_PREFIX,
} from './lib/completion-keyboard';
import { runDeliveryOnce } from './scheduler';
import { buildDaysKeyboard, DAY_TOGGLE_PREFIX, DAYS_DONE } from './lib/days-keyboard';
import { buildTimeKeyboard, TIME_PICK_PREFIX } from './lib/time-keyboard';
import { buildTimezoneKeyboard, TZ_PICK_PREFIX, COMMON_TIMEZONES } from './lib/timezone-keyboard';
import {
  buildSurahKeyboard,
  SURAH_PICK_PREFIX,
  SURAH_PAGE_PREFIX,
  SURAH_NOOP,
} from './lib/surah-keyboard';
import { buildReciterKeyboard, RECITER_PICK_PREFIX } from './lib/reciter-keyboard';
import {
  buildReviewKeyboard,
  REVIEW_RECENT_PREFIX,
  REVIEW_OLD_PREFIX,
} from './lib/review-keyboard';
import { buildTafseerKeyboard, TAFSEER_PICK_PREFIX } from './lib/tafseer-keyboard';
import { parseTime, isValidTimezone, parseSurahArg, parseAyahPreview } from './lib/parse';

const bot = new Bot<Context>(config.botToken);

// Smooth Telegram's rate limits. The daily batch sends to every due subscriber
// in one minute-tick, and each delivery is several messages (ayah, audio,
// tafseer, review, prompt), so a moment when many subscribers share a send time
// can briefly burst past Telegram's flood limit and earn a 429. auto-retry
// catches that at the transformer layer for EVERY api call (text, audio, photo,
// callback answers), waits the server's retry_after, and retries — instead of
// dropping the message. Bounded (3 tries, ≤30s wait) so a long retry_after never
// stalls the run, and scoped to rate limits only (other errors rethrow, so the
// per-send wrappers still classify 403/blocked and transient failures as before).
// grammY recommends auto-retry over the throttler plugin.
bot.api.config.use(
  autoRetry({
    maxRetryAttempts: 3,
    maxDelaySeconds: 30,
    rethrowInternalServerErrors: true,
    rethrowHttpErrors: true,
  }),
);

// Callback data for the onboarding chooser, the order picker, and the
// settings keyboard. Namespaced like the other pickers so they never clash.
const ONBOARD_DEFAULT = 'ayah:onb:default';
const ONBOARD_PICK = 'ayah:onb:pick';
const ONBOARD_MUSHAF = 'ayah:onb:mushaf';
const ORDER_PICK_PREFIX = 'ayah:order:';
const PAUSE_TOGGLE = 'ayah:pause:toggle';
// The tafseer card (on/off, edition, format) and its controls. The pick prefix
// "ayah:taf:src:" (see tafseer-keyboard.ts) is distinct from these exact-match
// strings, so a "srcopen" button never matches the "src:<key>" pick handler.
const TAFSEER_OPEN = 'ayah:taf:card'; // open the tafseer card from /settings
const TAFSEER_TOGGLE = 'ayah:taf:onoff'; // turn the tafseer on/off
const TAFSEER_FORMAT_TOGGLE = 'ayah:taf:fmt'; // switch text <-> link
const TAFSEER_SOURCE_OPEN = 'ayah:taf:srcopen'; // open the edition picker
const TAFSEER_SAMPLE = 'ayah:taf:sample'; // "try it on today's ayah" (tafseer)
// Opens the reciter picker from the /settings keyboard, and the reciter sample
// button. Distinct strings (no "ayah:reciter:" prefix) so they never match the
// reciter-pick handler's `^ayah:reciter:(.+)$`.
const RECITER_OPEN = 'ayah:reciter-open';
const RECITER_SAMPLE = 'ayah:reciter-sample'; // "try it on today's ayah" (audio)

// Default review window for /admin_preview when the admin does not give one.
// Small on purpose: enough to show the review block renders, without a wall
// of text. The admin can pass any 0..20 to test a specific window.
const ADMIN_PREVIEW_REVIEW = 3;

/** Make sure we have a subscriber row for whoever sent this update. */
async function subscriberFor(ctx: Context) {
  if (!ctx.from) return null;
  return ensureSubscriber(BigInt(ctx.from.id), config.defaultTimezone);
}

/**
 * Swallow Telegram's "message is not modified" 400 and rethrow anything else.
 * That 400 happens when an edit would change nothing (e.g. a stale or
 * double-tapped page button re-rendering the same page); it is harmless.
 */
function ignoreNotModified(err: unknown): void {
  const description = (err as { description?: string }).description ?? '';
  if (!description.includes('message is not modified')) throw err;
}

// ─── Shared helpers ─────────────────────────────────────────────────

/** The settings summary for a subscriber, enriched with their current
 *  position (surah + ayah) and order, both fetched from the track. */
async function settingsText(sub: Subscriber): Promise<string> {
  const [progress, deliveredCount] = await Promise.all([
    getProgressView(sub),
    countDeliveries(sub.id),
  ]);
  return settingsSummary({
    ...sub,
    position: progress
      ? {
          surahNameAr: progress.surahNameAr,
          numberInSurah: progress.numberInSurah,
          surahAyahCount: progress.surahAyahCount,
        }
      : undefined,
    orderKey: progress?.orderKey,
    deliveredCount,
    tafseerLabel: tafseerLabelFor(sub.tafseerEdition),
    tafseerModeLabel: tafseerModeLabelFor(sub.tafseerFormat),
    reciterLabel: reciterLabelFor(sub.reciter),
  });
}

/** The Arabic label for a subscriber's reciter choice: the reciter's name, or
 *  the "no recitation" label for "none" (or any unknown key). */
function reciterLabelFor(reciter: string): string {
  return reciterByKey(reciter)?.nameAr ?? COPY.reciterNoneLabel;
}

/** Which on-demand prompt buttons (tafseer / audio) a subscriber should see, by
 *  their current settings: a tafseer button only when tafseer is on, an audio
 *  button only when a reciter is chosen. Used for a showing that did not auto-send
 *  them (a /next reveal, or a /today re-show), so the reader can pull them. */
function promptActionsFor(sub: Subscriber): PromptActions {
  return { tafseer: sub.tafseerEnabled, audio: reciterByKey(sub.reciter) !== undefined };
}

/** The Arabic name of a subscriber's tafseer edition (falls back to the default
 *  for an unknown/dropped key, so the label never goes blank). */
function tafseerLabelFor(edition: string): string {
  return tafseerOrDefault(edition).nameAr;
}

/** The Arabic label for a subscriber's tafseer delivery format. */
function tafseerModeLabelFor(format: string): string {
  return format === 'link' ? COPY.tafsirModeLink : COPY.tafsirModeText;
}

/** Set a subscriber's reciter (already validated by the caller) and reply with
 *  the matching confirmation. A real reciter's confirmation carries a "try it on
 *  today's ayah" button (a silent audio preview); "none" gets a plain reply.
 *  Shared by /reciter and the picker buttons. */
async function applyReciter(ctx: Context, subscriberId: number, choice: string): Promise<void> {
  await setReciter(subscriberId, choice);
  const reciter = reciterByKey(choice);
  if (!reciter) {
    await ctx.reply(COPY.reciterDisabled);
    return;
  }
  await ctx.reply(COPY.reciterSet(reciter.nameAr), {
    reply_markup: new InlineKeyboard().text(COPY.reciterSampleBtn, RECITER_SAMPLE),
  });
}

/** The small keyboard under /settings: a pause/resume toggle, a shortcut to the
 *  tafseer card, a shortcut to the reciter picker, and one to pick the starting
 *  surah. (The tafseer on/off toggle lives inside the tafseer card now.) */
function buildSettingsKeyboard(paused: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text(paused ? COPY.resumeBtn : COPY.pauseBtn, PAUSE_TOGGLE)
    .row()
    .text(COPY.settingsTafsirBtn, TAFSEER_OPEN)
    .row()
    .text(COPY.settingsReciterBtn, RECITER_OPEN)
    .row()
    .text(COPY.settingsSurahBtn, ONBOARD_PICK);
}

/** The reciter picker keyboard for a subscriber, with their current choice
 *  marked. Shared by /reciter and the /settings reciter button. */
function buildReciterPicker(currentReciter: string): InlineKeyboard {
  return buildReciterKeyboard(RECITERS, currentReciter, RECITER_NONE, COPY.reciterNoneLabel);
}

/** The tafseer card text: the current on/off state, edition, and format. */
function tafseerCardText(sub: Subscriber): string {
  return COPY.tafsirCard(
    sub.tafseerEnabled,
    tafseerLabelFor(sub.tafseerEdition),
    tafseerModeLabelFor(sub.tafseerFormat),
  );
}

/** The tafseer card keyboard: on/off, choose edition, switch text<->link. The
 *  "try it on today's ayah" preview is NOT here; like the reciter's, it appears
 *  on the edition-chosen confirmation instead (see replyTafseerChosen). */
function buildTafseerCardKeyboard(sub: Subscriber): InlineKeyboard {
  const toLink = sub.tafseerFormat !== 'link'; // tapping switches to the other format
  return new InlineKeyboard()
    .text(sub.tafseerEnabled ? COPY.tafsirOffBtn : COPY.tafsirOnBtn, TAFSEER_TOGGLE)
    .row()
    .text(COPY.tafsirSourceBtn, TAFSEER_SOURCE_OPEN)
    .row()
    .text(toLink ? COPY.tafsirToLinkBtn : COPY.tafsirToTextBtn, TAFSEER_FORMAT_TOGGLE);
}

/** Confirm a just-set tafseer edition (shared by /tafsir <edition> and the
 *  picker). Mirrors the reciter confirmation: a "تم اختيار …" reply that carries
 *  the "try it on today's ayah" preview button — but only when the tafseer is
 *  on (a preview makes no sense while it is off; then we nudge to turn it on). */
async function replyTafseerChosen(ctx: Context, enabled: boolean, choice: string): Promise<void> {
  if (enabled) {
    await ctx.reply(COPY.tafsirSourceSet(tafseerLabelFor(choice)), {
      reply_markup: new InlineKeyboard().text(COPY.tafsirSampleBtn, TAFSEER_SAMPLE),
    });
  } else {
    await ctx.reply(`${COPY.tafsirSourceSet(tafseerLabelFor(choice))}\n${COPY.tafsirOffReminder}`);
  }
}

/** The tafseer edition picker for a subscriber, with their current choice
 *  marked and a hint on the long (preview) edition. Shared by /tafsir and the
 *  card's "choose tafseer" button. */
function buildTafseerPicker(currentEdition: string): InlineKeyboard {
  const editions = TAFSEERS.map((t) => ({
    key: t.key,
    nameAr: t.nameAr,
    note: t.kind === 'preview' ? COPY.tafsirPreviewNote : undefined,
  }));
  return buildTafseerKeyboard(editions, currentEdition);
}

/** The onboarding chooser shown to a brand-new subscriber on /start. */
function buildOnboardingKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text(COPY.startDefaultBtn, ONBOARD_DEFAULT)
    .row()
    .text(COPY.pickSurahBtn, ONBOARD_PICK)
    .row()
    .text(COPY.mushafOrderBtn, ONBOARD_MUSHAF);
}

/** The order picker: one button per order, labelled in Arabic. */
function buildOrderKeyboard(): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (const order of ORDERS)
    kb.text(orderSummaryAr(order.key), `${ORDER_PICK_PREFIX}${order.key}`).row();
  return kb;
}

/** Move the subscriber to an order (track) and start them at its beginning
 *  (position 0: An-Nas for the reverse order, Al-Fatihah for the Mushaf
 *  order). Used by the onboarding buttons. Returns the chosen entry. */
async function applyOrderAtStart(subscriberId: number, trackKey: string): Promise<EntryWithAyah> {
  const track = await getTrackByKey(trackKey);
  const entry = await getEntryAtPosition(track.id, 0);
  if (!entry) throw new Error(`Track ${trackKey} has no entry at position 0`);
  await setOrder(subscriberId, track.id, entry.id);
  return entry;
}

/** Flip a subscriber's break state and reply. Shared by /pause and the
 *  settings toggle button. */
async function togglePause(ctx: Context, sub: Subscriber): Promise<void> {
  if (sub.pausedAt) {
    await resumeSubscriber(sub.id);
    await ctx.reply(COPY.resumed);
    // If they have no active days they still get nothing; point at the real blocker.
    if (activeDaysList(sub.activeDays).length === 0) await ctx.reply(COPY.daysNone);
  } else {
    await pauseSubscriber(sub.id);
    await ctx.reply(COPY.paused);
  }
}

/** Admin gate: a private-chat message from the one configured admin id. */
function isAdmin(ctx: Context): boolean {
  if (config.adminTelegramId === null) return false;
  if (ctx.chat?.type !== 'private') return false;
  return ctx.from ? BigInt(ctx.from.id) === config.adminTelegramId : false;
}

/**
 * Reply a TodayView's messages and, if it carries a `record`, record it as
 * today's delivery so the scheduler does not send the same ayah again. Shared by
 * /today and the reposition flow. Read-gated: recording does NOT advance the
 * position (the subscriber advances on a confirmed done), and is committed only
 * AFTER the messages are shown, so a failed reply leaves the day unrecorded; the
 * unique (subscriber, date) index makes it safe even if the scheduler races. The
 * "أتممتُها" button rides every shown ayah (unless paused). The missed-days nudge
 * is NOT sent here: it leads the SCHEDULED daily push only (deliverDueSubscribers),
 * so a manual /today or a /surah reposition — where the reader is already engaged —
 * is never interrupted by it, and it can never repeat within one session.
 */
export async function sendTodayView(
  ctx: Context,
  sub: Subscriber,
  view: TodayView,
  now: Date,
): Promise<void> {
  for (const message of view.messages) await ctx.reply(message);

  // The distant review is computed BEFORE the commit (reads only past
  // confirmations) so its cursor advances in the same transaction, once per day.
  const revision = view.record
    ? await revisionMessagesFor(sub, view.record.entry.ayah.surahNumber)
    : { messages: [], nextCursor: 0 };

  // Record today's delivery (no advance — the position moves on a confirmed
  // done). Only on a free day (view.record). 'duplicate' = the scheduler beat
  // us to it; then we send no tafseer/audio/review (each arrives once, with the day).
  let recorded = false;
  if (view.record) {
    const committed = await commitDelivery({
      subscriberId: sub.id,
      entry: view.record.entry,
      scheduledFor: view.record.scheduledFor,
      startedAt: sub.startedAt,
      nextReviewCursor: revision.messages.length > 0 ? revision.nextCursor : undefined,
      now,
    });
    recorded = committed === 'sent';
  }
  if (recorded && view.record) {
    // In reading order, all SILENT: the recitation, then the tafseer, then the
    // distant-review block.
    await deliverAyahAudio(bot, sub.telegramId, view.record.entry, sub.reciter);
    try {
      for (const message of view.tafseer) {
        await ctx.reply(message.text, {
          disable_notification: true,
          reply_markup: tafseerReplyMarkup(message),
        });
      }
      for (const message of revision.messages) {
        await ctx.reply(message, { disable_notification: true });
      }
    } catch (err) {
      logger.warn('Failed to send tafseer/review for /today', {
        subscriberId: sub.id,
        error: String(err),
      });
    }
  }

  // The "أتممتُها — التالية" button rides every shown ayah so the reader can
  // mark it done and advance — unless paused (a resting reader is not nudged on).
  // It carries the shown entry's id, so a later tap names this exact ayah. On a
  // fresh delivery the tafseer/audio were just auto-sent (no extra buttons); on a
  // re-show or off-day peek they were not, so offer them one tap away.
  if (!sub.pausedAt && view.entry) {
    const actions = recorded ? undefined : promptActionsFor(sub);
    await sendConfirmPrompt(bot, sub.telegramId, view.entry.id, actions);
  }
}

/**
 * After the user repositions (/surah, a surah-pick button, the onboarding
 * "start from An-Nas"), set the position to the chosen ayah and show it (like
 * /today). Read-gated: this is a jump, not an advance — `entry` is the NEW entry
 * the position was set to; confirming (or /next) is what moves on. On a free day
 * the show is recorded as today's delivery so the scheduler does not also send it
 * (without advancing); otherwise it is a preview (buildTodayView decides).
 */
export async function sendAfterReposition(
  ctx: Context,
  sub: Subscriber,
  entry: EntryWithAyah,
): Promise<void> {
  const now = new Date();
  const repositioned = { ...sub, trackId: entry.trackId, currentEntryId: entry.id };
  const view = await buildTodayView(repositioned, now);
  if (view.messages.length === 0) {
    logger.warn('reposition produced no ayah', { subscriberId: sub.id, entryId: entry.id });
    await ctx.reply(COPY.brokenOrNotStarted);
    return;
  }
  const { nameAr } = entry.ayah.surah;
  const { numberInSurah } = entry.ayah;
  await ctx.reply(
    view.record
      ? COPY.repositionClaimed(nameAr, numberInSurah)
      : COPY.repositionPreview(nameAr, numberInSurah),
  );
  await sendTodayView(ctx, repositioned, view, now);
  if (sub.pausedAt) await ctx.reply(COPY.pausedHint);
}

// ─── User commands ──────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  // Brand-new: never received an ayah and has not chosen a start yet. Offer
  // the chooser. Every chooser button sets currentEntryId, so the prompt does
  // not reappear once they have picked (even the "default" button is explicit).
  if (sub.startedAt === null && sub.currentEntryId === null) {
    await ctx.reply(COPY.welcomeNew, { reply_markup: buildOnboardingKeyboard() });
    return;
  }
  await ctx.reply(COPY.welcome(await settingsText(sub)));
});

bot.command('help', (ctx) => ctx.reply(COPY.help));

bot.command('settings', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  await ctx.reply(await settingsText(sub), {
    reply_markup: buildSettingsKeyboard(sub.pausedAt !== null),
  });
});

// /surah: with an argument, set the starting point directly; with none, open
// the surah picker. The argument is "<surah>" (ayah 1) or "<surah> <ayah>".
bot.command('surah', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'surah');
  if (!arg) {
    await ctx.reply(COPY.surahPrompt, { reply_markup: buildSurahKeyboard(SURAHS) });
    return;
  }
  const parsed = parseSurahArg(arg, ayahCountFor);
  if (!parsed) {
    await ctx.reply(COPY.surahInvalid);
    return;
  }
  // Reposition within the subscriber's CURRENT order (track), so /surah does
  // not silently change their forward/reverse choice.
  const entry = await getEntryForAyah(sub.trackId, parsed.surah, parsed.ayah);
  if (!entry) {
    await ctx.reply(COPY.surahInvalid);
    return;
  }
  await setStartPosition(sub.id, entry.id);
  await sendAfterReposition(ctx, sub, entry);
});

// /order: choose the memorization order (forward Mushaf or reverse hifz).
bot.command('order', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  await ctx.reply(COPY.orderPrompt, { reply_markup: buildOrderKeyboard() });
});

// /pause: a single toggle for taking / ending a break. /break and /resume
// remain as explicit aliases below for anyone who learned them.
bot.command('pause', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  await togglePause(ctx, sub);
});

// /today: read today's ayah now. Pulling it before the scheduled send RECORDS
// today's delivery (so the bot does not send the same ayah again at the user's
// time) but does NOT advance — the position moves only on a confirmed done.
// Pulling it again the same day re-shows it. On an off day or while paused it
// stays a pure peek. The "أتممتُها" button rides the shown ayah either way.
//
// We record AFTER the messages are shown, so a failed reply leaves the day
// unrecorded and the scheduler still delivers next tick. The unique
// (subscriber, date) index keeps it safe even if the scheduler races at the
// same minute (the loser's commit returns 'duplicate'); the only residual
// artifact of that sub-second race is one duplicate message. See scheduler.ts.
bot.command('today', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const now = new Date();
  const view = await buildTodayView(sub, now);
  if (view.messages.length === 0) {
    // On the looping kids track this should never happen for a real user; if
    // it does, it is a data fault (a dangling currentEntryId). Log it so it is
    // visible rather than silent.
    logger.warn('buildTodayView returned no messages', {
      subscriberId: sub.id,
      trackId: sub.trackId,
      currentEntryId: sub.currentEntryId,
    });
    await ctx.reply(COPY.brokenOrNotStarted);
    return;
  }
  if (view.alreadyDelivered) await ctx.reply(COPY.todayAlready);
  await sendTodayView(ctx, sub, view, now);
  // Remind a paused user of their state, since /today works while paused.
  if (sub.pausedAt) await ctx.reply(COPY.pausedHint);
});

/**
 * Reveal an ayah right now — the read-ahead view after a confirmed done — with
 * its own "أتممتُها" button (unless paused). `label` titles it; the upcoming
 * ayah uses "الآية التالية" so it is never mistaken for today's scheduled
 * delivery. No delivery is recorded and the audio/tafseer are not re-sent here
 * (they ride the ayah's real delivery); see sendAyahNow.
 */
async function revealAyah(sub: Subscriber, entry: EntryWithAyah, label?: string): Promise<void> {
  const ok = await sendAyahNow(bot, sub, entry, label);
  // The button carries this entry's id (so a tap names this exact ayah), plus the
  // on-demand tafseer / listen buttons — the reveal does not auto-send those, so
  // a reader racing ahead can still pull them for the ayah they are on.
  if (ok && !sub.pausedAt) {
    await sendConfirmPrompt(bot, sub.telegramId, entry.id, promptActionsFor(sub));
  }
}

/**
 * Mark the current ayah done and REVEAL the next one now — the shared action
 * behind both /next and the "أتممتُها — التالية" button, so the command and the
 * button behave identically. A reader who has memorized (or finished reflecting
 * on) the ayah they are looking at confirms it and immediately sees what comes
 * next; tapping again walks forward one ayah at a time (catch up, or go faster).
 * The revealed ayah carries its own button but records no delivery — its
 * recitation and tafseer arrive with its real daily delivery. Exported for
 * testing; /next is a thin wrapper.
 */
export async function advanceAndShowNext(ctx: Context, sub: Subscriber, now: Date): Promise<void> {
  const current = await resolveTargetEntry(sub);
  if (!current) {
    await ctx.reply(COPY.brokenOrNotStarted);
    return;
  }
  // Not started yet: begin at the first ayah (no advance, no skip) and show it.
  if (sub.currentEntryId === null) {
    await setStartPosition(sub.id, current.id);
    await revealAyah(sub, current);
    return;
  }
  const [totalEntries, track] = await Promise.all([
    countTrackEntries(sub.trackId),
    getTrackById(sub.trackId),
  ]);
  const loops = track?.loops ?? false;
  const result = await confirmRead({
    subscriberId: sub.id,
    entry: current,
    totalEntries,
    loops,
    now,
  });
  // A concurrent confirm already advanced us: show wherever we are now so a
  // follow-up never skips an unseen ayah.
  if (result === 'already') {
    const live = await resolveTargetEntry(sub);
    if (live) await revealAyah(sub, live);
    else await ctx.reply(COPY.trackFinished);
    return;
  }
  // Advanced. Work out the new position and what (if anything) was completed.
  const completion = await buildCompletionMessage(current, totalEntries, loops, sub.id);
  const nextPosition = advancePosition(current.position, totalEntries, loops);
  const nextEntry =
    nextPosition === null ? null : await getEntryAtPosition(current.trackId, nextPosition);
  // End of a non-looping track (the shipped tracks both loop, so rare): the
  // milestone is the khatma message, with nothing more to reveal.
  if (!nextEntry) {
    if (completion) await ctx.reply(completion.text, { reply_markup: completion.keyboard });
    else await ctx.reply(COPY.trackFinished);
    return;
  }
  // Lead with the milestone (it announces the next surah, so it replaces the
  // plain ack) or a short ack, then reveal the upcoming ayah right under it.
  if (completion) await ctx.reply(completion.text, { reply_markup: completion.keyboard });
  else await ctx.reply(COPY.doneAck);
  await revealAyah(sub, nextEntry, COPY.nextAyahLabel);
}

// /next: mark the current ayah done and reveal the next now (go faster / catch
// up). Each /next advances exactly one ayah; the daily "أتممتُها" button does
// the same, one tap at a time.
bot.command('next', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  await advanceAndShowNext(ctx, sub, new Date());
});

// /review N: set how many previous ayat to include for review (0..20).
bot.command('review', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'review');
  if (!arg) {
    // The review card: both the recent (in-surah) and the تثبيت (distant) knobs.
    await ctx.reply(COPY.reviewCard(sub.reviewCount, sub.oldReviewCount), {
      reply_markup: buildReviewKeyboard(sub.reviewCount, sub.oldReviewCount),
    });
    return;
  }
  // Accept Arabic-Indic digits, and only a plain 1-2 digit number (no hex,
  // exponent, or sign sneaking through Number()).
  const normalized = toAsciiDigits(arg.trim());
  if (!/^\d{1,2}$/.test(normalized) || Number(normalized) > MAX_REVIEW_COUNT) {
    await ctx.reply(COPY.reviewInvalid);
    return;
  }
  const count = clampReviewCount(Number(normalized));
  await setReviewCount(sub.id, count);
  await ctx.reply(COPY.reviewUpdated(count));
});

// Review card: pick the RECENT (in-surah) count.
bot.callbackQuery(new RegExp(`^${REVIEW_RECENT_PREFIX}(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const recent = clampReviewCount(Number(ctx.match![1]));
  await setReviewCount(sub.id, recent);
  await ctx
    .editMessageReplyMarkup({ reply_markup: buildReviewKeyboard(recent, sub.oldReviewCount) })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery({ text: COPY.reviewRecentSet(recent) });
});

// Review card: pick the تثبيت (distant/consolidation) count.
bot.callbackQuery(new RegExp(`^${REVIEW_OLD_PREFIX}(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const old = clampOldReviewCount(Number(ctx.match![1]));
  await setOldReviewCount(sub.id, old);
  await ctx
    .editMessageReplyMarkup({ reply_markup: buildReviewKeyboard(sub.reviewCount, old) })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery({ text: COPY.reviewOldSet(old) });
});

// /tafsir [on|off|<edition>]: the tafseer (sent silently after the ayah). With
// no argument, open the tafseer card (on/off + edition + format). "on"/"off"
// are quick toggles; an edition key (e.g. "/tafsir saadi") is a power-user
// shortcut to switch tafseer.
bot.command('tafsir', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'tafsir')?.toLowerCase();
  if (!arg) {
    await ctx.reply(tafseerCardText(sub), { reply_markup: buildTafseerCardKeyboard(sub) });
    return;
  }
  const on = ['on', '1', 'تشغيل', 'نعم'].includes(arg);
  const off = ['off', '0', 'إيقاف', 'ايقاف', 'لا'].includes(arg);
  if (on || off) {
    await setTafseerEnabled(sub.id, on);
    await ctx.reply(COPY.tafsirUpdated(on));
    return;
  }
  if (isTafseerEdition(arg)) {
    await setTafseerEdition(sub.id, arg);
    await replyTafseerChosen(ctx, sub.tafseerEnabled, arg);
    return;
  }
  await ctx.reply(COPY.tafsirInvalid);
});

// /reciter [key|none]: choose the reciter for the daily ayah's recitation audio
// (sent silently after the ayah), or turn it off. With no (or an unrecognised)
// argument, open the reciter picker. A key arg (e.g. "/reciter husary") is a
// shortcut for power users.
bot.command('reciter', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'reciter')?.toLowerCase();
  if (arg && isReciterChoice(arg)) {
    await applyReciter(ctx, sub.id, arg);
    return;
  }
  await ctx.reply(COPY.reciterPrompt, { reply_markup: buildReciterPicker(sub.reciter) });
});

// /time: with an argument, set the time directly; with none, offer buttons.
bot.command('time', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'time');
  if (!arg) {
    await ctx.reply(COPY.timePrompt, { reply_markup: buildTimeKeyboard() });
    return;
  }
  const parsed = parseTime(arg);
  if (!parsed) {
    await ctx.reply(COPY.timeInvalid);
    return;
  }
  await setDeliveryTime(sub.id, parsed.hour, parsed.minute);
  await ctx.reply(COPY.timeUpdated(formatTimeAr(parsed.hour, parsed.minute), sub.timezone));
});

// /timezone: with an argument, set it directly; with none, offer city buttons.
bot.command('timezone', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'timezone');
  if (!arg) {
    await ctx.reply(COPY.tzPrompt, { reply_markup: buildTimezoneKeyboard() });
    return;
  }
  if (!isValidTimezone(arg)) {
    await ctx.reply(COPY.tzInvalid);
    return;
  }
  await setTimezone(sub.id, arg);
  await ctx.reply(COPY.tzUpdated(arg));
});

// /days: open the day picker.
bot.command('days', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  await ctx.reply(COPY.daysPrompt, { reply_markup: buildDaysKeyboard(sub.activeDays) });
});

bot.command('break', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const started = await pauseSubscriber(sub.id);
  await ctx.reply(started ? COPY.paused : COPY.alreadyPaused);
});

bot.command('resume', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const cleared = await resumeSubscriber(sub.id);
  if (cleared) {
    await ctx.reply(COPY.resumed);
    return;
  }
  // Not paused. If they will still get nothing because they have no active
  // days, point them at the real blocker instead of claiming "already active".
  if (activeDaysList(sub.activeDays).length === 0) {
    await ctx.reply(COPY.daysNone);
    return;
  }
  await ctx.reply(COPY.alreadyActive);
});

// ─── Day-picker buttons ─────────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${DAY_TOGGLE_PREFIX}([1-7])$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const iso = Number(ctx.match![1]);
  // Toggle atomically at the database and redraw from the returned mask, so
  // two fast taps can never read the same stale mask and cancel each other.
  const newMask = await toggleActiveDay(sub.id, iso);
  await ctx.editMessageReplyMarkup({ reply_markup: buildDaysKeyboard(newMask) });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(DAYS_DONE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (activeDaysList(sub.activeDays).length === 0) {
    // Keep the keyboard up so they can pick a day right here, instead of
    // dismissing it and forcing them to run /days again.
    await ctx.reply(COPY.daysNone);
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
  await ctx.reply(COPY.daysUpdated(daysSummaryAr(sub.activeDays)));
  await ctx.answerCallbackQuery();
});

// ─── Time-picker buttons ────────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${TIME_PICK_PREFIX}(\\d{2})(\\d{2})$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const hour = Number(ctx.match![1]);
  const minute = Number(ctx.match![2]);
  await setDeliveryTime(sub.id, hour, minute);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
  await ctx.reply(COPY.timeUpdated(formatTimeAr(hour, minute), sub.timezone));
  await ctx.answerCallbackQuery();
});

// ─── Timezone-picker buttons ────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${TZ_PICK_PREFIX}(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const tz = COMMON_TIMEZONES[Number(ctx.match![1])]?.iana;
  if (!tz) {
    await ctx.answerCallbackQuery();
    return;
  }
  await setTimezone(sub.id, tz);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
  await ctx.reply(COPY.tzUpdated(tz));
  await ctx.answerCallbackQuery();
});

// ─── Onboarding-chooser buttons ─────────────────────────────────────

// "Start from An-Nas (default)": set the reverse order, position 0 (An-Nas).
bot.callbackQuery(ONBOARD_DEFAULT, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const entry = await applyOrderAtStart(sub.id, KIDS_TRACK.key);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
  await ctx.answerCallbackQuery();
  await sendAfterReposition(ctx, sub, entry);
});

// "Pick a starting surah": open the surah picker in place. Also reached from
// the /settings shortcut button.
bot.callbackQuery(ONBOARD_PICK, async (ctx) => {
  await ctx
    .editMessageText(COPY.surahPrompt, { reply_markup: buildSurahKeyboard(SURAHS) })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
});

// "Mushaf order": switch to forward order (starting at Al-Fatihah) and then
// offer the surah picker, so they can still choose where in that order to begin.
bot.callbackQuery(ONBOARD_MUSHAF, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  await applyOrderAtStart(sub.id, MUSHAF_TRACK.key);
  await ctx
    .editMessageText(`${COPY.orderSet(MUSHAF_TRACK.key)}\n\n${COPY.surahPrompt}`, {
      reply_markup: buildSurahKeyboard(SURAHS),
    })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
});

// ─── Surah-picker buttons ───────────────────────────────────────────

// Page navigation: redraw the keyboard at the requested page. A stale or
// double-tapped button can re-render the same page, so ignore the harmless
// "not modified" error that would cause.
bot.callbackQuery(new RegExp(`^${SURAH_PAGE_PREFIX}(\\d+)$`), async (ctx) => {
  const page = Number(ctx.match![1]);
  await ctx
    .editMessageReplyMarkup({ reply_markup: buildSurahKeyboard(SURAHS, page) })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
});

// The page indicator does nothing but acknowledge the tap.
bot.callbackQuery(SURAH_NOOP, (ctx) => ctx.answerCallbackQuery());

// Pick a surah: start at that surah, ayah 1, in the subscriber's current order.
bot.callbackQuery(new RegExp(`^${SURAH_PICK_PREFIX}(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const surah = Number(ctx.match![1]);
  const entry = await getEntryForAyah(sub.trackId, surah, 1);
  if (!entry) {
    await ctx.answerCallbackQuery();
    return;
  }
  await setStartPosition(sub.id, entry.id);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
  await ctx.answerCallbackQuery();
  await sendAfterReposition(ctx, sub, entry);
});

// ─── Order-picker buttons ───────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${ORDER_PICK_PREFIX}(.+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const key = ctx.match![1];
  if (!ORDERS.some((o) => o.key === key)) {
    await ctx.answerCallbackQuery();
    return;
  }
  const track = await getTrackByKey(key);
  if (track.id === sub.trackId) {
    await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
    await ctx.reply(COPY.orderUnchanged(key));
    await ctx.answerCallbackQuery();
    return;
  }
  // Carry their place across: find the same (surah, ayah) in the new track.
  // A not-yet-started subscriber (no current entry) keeps null so their first
  // send begins at the new order's position 0.
  let newEntryId: number | null = null;
  if (sub.currentEntryId !== null) {
    const progress = await getProgressView(sub);
    const carried = progress
      ? await getEntryForAyah(track.id, progress.surahNumber, progress.numberInSurah)
      : null;
    // Both tracks hold every ayah, so the carry normally resolves. If it does
    // not (only possible from a dangling current entry), fall back to the new
    // order's start rather than writing null: a STARTED subscriber reads a null
    // current entry as "finished" and would stop receiving ayat entirely.
    newEntryId = carried?.id ?? (await getEntryAtPosition(track.id, 0))?.id ?? null;
  }
  await setOrder(sub.id, track.id, newEntryId);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
  await ctx.reply(COPY.orderSet(key));
  await ctx.answerCallbackQuery();
});

// ─── Surah-completion buttons ───────────────────────────────────────
// Shown under the milestone message when a subscriber finishes a surah. The
// bot already auto-continues to the next surah, so these only let them change
// course without ever blocking the daily send.

// "Continue": nothing to do (the position already advanced); just reassure and
// drop the keyboard so it cannot be tapped again.
bot.callbackQuery(COMPLETE_CONTINUE, async (ctx) => {
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.answerCallbackQuery({ text: COPY.completionContinueAck });
});

// "Pick another surah": open the surah picker in place, reusing the normal
// surah-pick flow (its button handler repositions and previews).
bot.callbackQuery(COMPLETE_PICK, async (ctx) => {
  await ctx
    .editMessageText(COPY.surahPrompt, { reply_markup: buildSurahKeyboard(SURAHS) })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
});

// "Repeat this surah": point back at ayah 1 of the surah just finished, in the
// subscriber's current order. Today's ayah was already delivered, so we do not
// re-send now; the first ayah arrives at the next scheduled time.
bot.callbackQuery(new RegExp(`^${COMPLETE_RESTART_PREFIX}(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const surah = Number(ctx.match![1]);
  const entry = await getEntryForAyah(sub.trackId, surah, 1);
  if (!entry) {
    await ctx.answerCallbackQuery();
    return;
  }
  await setStartPosition(sub.id, entry.id);
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // drop the keyboard
  await ctx.reply(COPY.completionRestarted(entry.ayah.surah.nameAr));
  await ctx.answerCallbackQuery();
});

// ─── "أتممتُها — التالية" (mark done) button ─────────────────────────
//
// The button is the same action as /next: confirm the CURRENT (visible) ayah,
// advance, and reveal the next one (see advanceAndShowNext). It is idempotent:
//   - The button carries the id of the ayah it was sent for. A tap whose id no
//     longer matches the current position is a STALE button from an ayah already
//     passed — a gentle no-op (we just drop it and toast), so old buttons left in
//     the chat can never advance the reader a second time.
//   - With no unconfirmed delivery there is nothing to confirm — also a no-op.
// `buttonEntryId` is undefined only for legacy bare "ayah:done" buttons sent
// before the id was added; those fall back to acting on the current ayah.
export async function handleDone(
  ctx: Context,
  sub: Subscriber,
  buttonEntryId?: number,
): Promise<void> {
  const current = await resolveTargetEntry(sub);
  // A stale button from an ayah already passed (its id is no longer current), or
  // nothing to confirm (a finished non-looping track). Gentle no-op: drop the
  // button so it cannot be tapped again, and reassure.
  if (!current || (buttonEntryId !== undefined && current.id !== buttonEntryId)) {
    await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
    await ctx.answerCallbackQuery({ text: COPY.alreadyDone });
    return;
  }
  // Confirm + reveal the next ayah, exactly as /next does, so the button and the
  // command stay in lockstep — including on a /next reveal's button, which rides
  // an ayah with NO recorded delivery. The idempotency guard is confirmRead's
  // atomic compare-and-set on the current entry (a stale/double tap matches no row
  // and is a harmless no-op), not the presence of a pending delivery. Drop the
  // tapped button first (it is single-use).
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
  await advanceAndShowNext(ctx, sub, new Date());
}

// New "done" buttons carry the shown ayah's id ("ayah:done:<entryId>"): confirm
// only while that ayah is still current (so a stale tap is a no-op). The numeric
// suffix never collides with the completion buttons (ayah:done:continue / pick /
// restart:<n>), which are matched by their own handlers above.
bot.callbackQuery(new RegExp(`^${READ_CONFIRM}:(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  await handleDone(ctx, sub, Number(ctx.match![1]));
});

// Legacy bare "ayah:done" buttons (sent before the id was added) still work:
// they act on the current ayah.
bot.callbackQuery(READ_CONFIRM, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  await handleDone(ctx, sub);
});

// ─── On-demand tafseer / recitation (the prompt's "📖 التفسير" / "🎧 الاستماع") ──
// These ride the prompt on a showing that did NOT auto-send the tafseer/audio (a
// /next reveal, or a /today re-show). The button carries the id of the ayah that
// prompt shows, so it acts on THAT ayah (even one scrolled back to after
// advancing). Pure: they send silently and never record a delivery or advance,
// so they are safe to tap repeatedly.

// Show the tafseer for the ayah this prompt displayed.
bot.callbackQuery(new RegExp(`^${AYAH_TAFSEER_NOW}:(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!sub.tafseerEnabled) {
    await ctx.answerCallbackQuery({ text: COPY.sampleTafsirOff });
    return;
  }
  const entry = await getEntryById(Number(ctx.match![1]));
  if (!entry) {
    await ctx.answerCallbackQuery({ text: COPY.sampleNoAyah });
    return;
  }
  const messages = await tafseerMessagesFor(entry, sub);
  if (messages.length === 0) {
    await ctx.answerCallbackQuery({ text: COPY.sampleNoTafsir });
    return;
  }
  await ctx.answerCallbackQuery();
  for (const m of messages) {
    await ctx.reply(m.text, { disable_notification: true, reply_markup: tafseerReplyMarkup(m) });
  }
});

// Play the recitation for the ayah this prompt displayed.
bot.callbackQuery(new RegExp(`^${AYAH_AUDIO_NOW}:(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!reciterByKey(sub.reciter)) {
    await ctx.answerCallbackQuery({ text: COPY.sampleReciterOff });
    return;
  }
  const entry = await getEntryById(Number(ctx.match![1]));
  if (!entry) {
    await ctx.answerCallbackQuery({ text: COPY.sampleNoAyah });
    return;
  }
  await ctx.answerCallbackQuery();
  // Best-effort: deliverAyahAudio swallows its own send errors.
  await deliverAyahAudio(bot, sub.telegramId, entry, sub.reciter);
});

// ─── Settings pause/resume toggle ───────────────────────────────────

bot.callbackQuery(PAUSE_TOGGLE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const wasPaused = sub.pausedAt !== null;
  if (wasPaused) await resumeSubscriber(sub.id);
  else await pauseSubscriber(sub.id);
  // Re-render the whole settings card in place so the status line and the
  // toggle button both reflect the new state, and toast the change. A fresh
  // read reflects the row we just updated.
  const fresh = await subscriberFor(ctx);
  if (fresh) {
    await ctx
      .editMessageText(await settingsText(fresh), {
        reply_markup: buildSettingsKeyboard(fresh.pausedAt !== null),
      })
      .catch(ignoreNotModified);
  }
  await ctx.answerCallbackQuery({ text: wasPaused ? 'عُدت من الراحة ✅' : 'في وضع الراحة ⏸️' });
});

// ─── Tafseer card ───────────────────────────────────────────────────

/** Re-render the tafseer card in place from a fresh read, so its status lines
 *  and buttons reflect the change just made. Shared by the card's buttons. */
async function rerenderTafseerCard(ctx: Context): Promise<void> {
  const fresh = await subscriberFor(ctx);
  if (!fresh) return;
  await ctx
    .editMessageText(tafseerCardText(fresh), { reply_markup: buildTafseerCardKeyboard(fresh) })
    .catch(ignoreNotModified);
}

// Open the tafseer card in place from the /settings keyboard.
bot.callbackQuery(TAFSEER_OPEN, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx
    .editMessageText(tafseerCardText(sub), { reply_markup: buildTafseerCardKeyboard(sub) })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
});

// Turn the tafseer on/off, then re-render the card.
bot.callbackQuery(TAFSEER_TOGGLE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const enabled = !sub.tafseerEnabled;
  await setTafseerEnabled(sub.id, enabled);
  await rerenderTafseerCard(ctx);
  await ctx.answerCallbackQuery({ text: COPY.tafsirToggleAck(enabled) });
});

// Switch the delivery format (text <-> link), then re-render the card.
bot.callbackQuery(TAFSEER_FORMAT_TOGGLE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const toLink = sub.tafseerFormat !== 'link';
  await setTafseerFormat(sub.id, toLink ? 'link' : 'text');
  await rerenderTafseerCard(ctx);
  await ctx.answerCallbackQuery({ text: COPY.tafsirFormatAck(toLink) });
});

// Open the tafseer edition picker in place from the card.
bot.callbackQuery(TAFSEER_SOURCE_OPEN, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx
    .editMessageText(COPY.tafsirSourcePrompt, {
      reply_markup: buildTafseerPicker(sub.tafseerEdition),
    })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
});

// Pick a tafseer edition: set it, then return to the card showing the new choice.
bot.callbackQuery(new RegExp(`^${TAFSEER_PICK_PREFIX}(.+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const choice = ctx.match![1];
  if (!isTafseerEdition(choice)) {
    await ctx.answerCallbackQuery();
    return;
  }
  await setTafseerEdition(sub.id, choice);
  await rerenderTafseerCard(ctx);
  await ctx.answerCallbackQuery();
  // Confirm with the "try it on today's ayah" button, like the reciter pick.
  await replyTafseerChosen(ctx, sub.tafseerEnabled, choice);
});

// "Try it on today's ayah": send the tafseer for today's (or the current) ayah
// in the subscriber's CURRENT settings, as a silent peek. It never records a
// delivery or advances the position, so it is safe to tap repeatedly.
bot.callbackQuery(TAFSEER_SAMPLE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!sub.tafseerEnabled) {
    await ctx.answerCallbackQuery({ text: COPY.sampleTafsirOff });
    return;
  }
  const entry = await sampleEntryFor(sub);
  if (!entry) {
    await ctx.answerCallbackQuery({ text: COPY.sampleNoAyah });
    return;
  }
  const messages = await tafseerMessagesFor(entry, sub);
  if (messages.length === 0) {
    await ctx.answerCallbackQuery({ text: COPY.sampleNoTafsir });
    return;
  }
  await ctx.answerCallbackQuery({ text: COPY.sampleSentAck });
  for (const m of messages) {
    await ctx.reply(m.text, { disable_notification: true, reply_markup: tafseerReplyMarkup(m) });
  }
});

// ─── Reciter picker ─────────────────────────────────────────────────

// Open the reciter picker in place from the /settings keyboard.
bot.callbackQuery(RECITER_OPEN, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx
    .editMessageText(COPY.reciterPrompt, { reply_markup: buildReciterPicker(sub.reciter) })
    .catch(ignoreNotModified);
  await ctx.answerCallbackQuery();
});

// Pick a reciter (or "none"): set it, drop the keyboard, and confirm.
bot.callbackQuery(new RegExp(`^${RECITER_PICK_PREFIX}(.+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  const choice = ctx.match![1];
  if (!isReciterChoice(choice)) {
    await ctx.answerCallbackQuery();
    return;
  }
  await ctx.editMessageReplyMarkup().catch(ignoreNotModified); // remove the keyboard
  await ctx.answerCallbackQuery();
  await applyReciter(ctx, sub.id, choice);
});

// "Try it on today's ayah": send the recitation audio for today's (or the
// current) ayah in the subscriber's chosen voice, as a silent peek. Never
// records a delivery or advances the position, so it is safe to tap repeatedly.
bot.callbackQuery(RECITER_SAMPLE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) {
    await ctx.answerCallbackQuery();
    return;
  }
  if (!reciterByKey(sub.reciter)) {
    await ctx.answerCallbackQuery({ text: COPY.sampleReciterOff });
    return;
  }
  const entry = await sampleEntryFor(sub);
  if (!entry) {
    await ctx.answerCallbackQuery({ text: COPY.sampleNoAyah });
    return;
  }
  await ctx.answerCallbackQuery({ text: COPY.sampleSentAck });
  // Best-effort: deliverAyahAudio swallows its own send errors.
  await deliverAyahAudio(bot, sub.telegramId, entry, sub.reciter);
});

// ─── Admin commands ─────────────────────────────────────────────────

bot.command('admin_health', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const uptime = Math.floor(process.uptime());
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const mins = Math.floor((uptime % 3600) / 60);
  await ctx.reply(
    [
      'Health',
      '------',
      `Uptime: ${days}d ${hours}h ${mins}m`,
      `Now: ${new Date().toISOString()}`,
    ].join('\n'),
  );
});

// /admin_send: fire the delivery batch by hand, the exact path the cron
// uses. Handy for a smoke test right after deploy.
bot.command('admin_send', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const stats = await runDeliveryOnce(bot);
  if (!stats) {
    await ctx.reply('A delivery run is already in progress. Try again in a moment.');
    return;
  }
  await ctx.reply(
    `Delivery run done.\nDue: ${stats.due}\nSent: ${stats.sent}\nSkipped: ${stats.skipped}\nFailed: ${stats.failed}`,
  );
});

// /admin_preview <surah> <ayah> [review]: render exactly what the bot would
// send for a given ayah, with an optional review window, and reply it to the
// admin's DM. A manual end-to-end test (database read + format) for any ayah,
// without changing any subscriber or posting anywhere. The ayah defaults to 1
// and the review window to ADMIN_PREVIEW_REVIEW when omitted.
bot.command('admin_preview', async (ctx) => {
  if (!isAdmin(ctx)) return;
  const arg = commandArg(ctx, 'admin_preview');
  if (!arg) {
    await ctx.reply(
      'Usage: /admin_preview <surah> <ayah> [review]\nExample: /admin_preview 2 255 3',
    );
    return;
  }
  const parsed = parseAyahPreview(arg, ayahCountFor);
  if (!parsed) {
    await ctx.reply('Bad input. Surah 1..114, ayah within the surah, review 0..20.');
    return;
  }
  const review = parsed.review ?? ADMIN_PREVIEW_REVIEW;
  const messages = await previewAyah(parsed.surah, parsed.ayah, review);
  if (messages.length === 0) {
    await ctx.reply('That ayah is not seeded. Run "pnpm db:seed".');
    return;
  }
  for (const message of messages) await ctx.reply(message);
});

bot.catch((err) => {
  logger.error('Bot error', { error: String(err.error), update: err.ctx.update.update_id });
});

async function setBotProfile() {
  // The visible menu stays small. /break and /resume still work as aliases
  // (the /pause toggle replaces them in the menu), and the picker buttons
  // cover the rest, matching the "fewer commands" goal.
  // Order = the natural daily flow, grouped for clarity, and aligned with the
  // tilawah bot so the two feel the same: read now -> what/where you memorize ->
  // review knob -> how the ayah reaches you, in DELIVERY order (hear then
  // understand: reciter before tafsir) -> schedule -> account.
  await bot.api.setMyCommands([
    // Read now
    { command: 'today', description: 'عرض آية اليوم' },
    { command: 'next', description: 'إتمام الآية والانتقال إلى التالية' },
    // What / where you memorize
    { command: 'surah', description: 'اختيار سورة البداية' },
    { command: 'order', description: 'اختيار الترتيب (المصحف أو الحفظ)' },
    { command: 'review', description: 'المراجعة: القريبة ومراجعة التثبيت' },
    // How it reaches you (silent companions, in delivery order: hear -> understand)
    { command: 'reciter', description: 'اختيار القارئ (التلاوة الصوتية)' },
    { command: 'tafsir', description: 'التفسير: تشغيله واختياره وطريقة وصوله' },
    // Schedule
    { command: 'time', description: 'ضبط وقت الإرسال' },
    { command: 'days', description: 'اختيار أيام الإرسال' },
    { command: 'timezone', description: 'ضبط المنطقة الزمنية' },
    // Account
    { command: 'pause', description: 'أخذ راحة أو العودة منها' },
    { command: 'settings', description: 'عرض إعداداتك' },
    { command: 'help', description: 'المساعدة' },
  ]);
  // Set the About (short description) and Description the same way as the
  // commands, so the bot is self-describing on deploy — no manual @BotFather
  // step. (The name, profile photo, and description picture cannot be set via
  // the Bot API; those stay in @BotFather.)
  await bot.api.setMyShortDescription(COPY.botAbout);
  await bot.api.setMyDescription(COPY.botDescription);
}

export { bot, setBotProfile };

// ─── Small parsing helpers ──────────────────────────────────────────

/** Get the text after a "/command" (e.g. the "07:00" in "/time 07:00"). */
function commandArg(ctx: Context, command: string): string | null {
  const raw = ctx.message?.text ?? '';
  const stripped = raw.replace(new RegExp(`^/${command}(@\\S+)?\\s*`), '').trim();
  return stripped === '' ? null : stripped;
}
