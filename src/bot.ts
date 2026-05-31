import { Bot, InlineKeyboard, type Context } from 'grammy';
import {
  toggleDay,
  activeDaysList,
  clampReviewCount,
  MAX_REVIEW_COUNT,
  toAsciiDigits,
} from './core';
import {
  ensureSubscriber,
  setActiveDays,
  setDeliveryTime,
  setTimezone,
  setReviewCount,
  pauseSubscriber,
  resumeSubscriber,
  setStartPosition,
  setOrder,
  getEntryForAyah,
  getEntryAtPosition,
  getProgressView,
  getTrackByKey,
  ORDERS,
  KIDS_TRACK,
  MUSHAF_TRACK,
  SURAHS,
  ayahCountFor,
  type EntryWithAyah,
  type Subscriber,
} from './database';
import { config } from './config';
import { logger } from './lib/logger';
import { COPY, settingsSummary, formatTimeAr, daysSummaryAr, orderSummaryAr } from './lib/copy';
import { previewCurrent } from './lib/deliver';
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
import { parseTime, isValidTimezone, parseSurahArg } from './lib/parse';

const bot = new Bot<Context>(config.botToken);

// Callback data for the onboarding chooser, the order picker, and the
// settings keyboard. Namespaced like the other pickers so they never clash.
const ONBOARD_DEFAULT = 'ayah:onb:default';
const ONBOARD_PICK = 'ayah:onb:pick';
const ONBOARD_MUSHAF = 'ayah:onb:mushaf';
const ORDER_PICK_PREFIX = 'ayah:order:';
const PAUSE_TOGGLE = 'ayah:pause:toggle';

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
  const progress = await getProgressView(sub);
  return settingsSummary({
    ...sub,
    position: progress
      ? { surahNameAr: progress.surahNameAr, numberInSurah: progress.numberInSurah }
      : undefined,
    orderKey: progress?.orderKey,
  });
}

/** The small keyboard under /settings: a pause/resume toggle and a shortcut
 *  to pick the starting surah. */
function buildSettingsKeyboard(paused: boolean): InlineKeyboard {
  return new InlineKeyboard()
    .text(paused ? COPY.resumeBtn : COPY.pauseBtn, PAUSE_TOGGLE)
    .row()
    .text(COPY.settingsSurahBtn, ONBOARD_PICK);
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
  if (!arg) return void ctx.reply(COPY.surahPrompt, { reply_markup: buildSurahKeyboard(SURAHS) });
  const parsed = parseSurahArg(arg, ayahCountFor);
  if (!parsed) return void ctx.reply(COPY.surahInvalid);
  // Reposition within the subscriber's CURRENT order (track), so /surah does
  // not silently change their forward/reverse choice.
  const entry = await getEntryForAyah(sub.trackId, parsed.surah, parsed.ayah);
  if (!entry) return void ctx.reply(COPY.surahInvalid);
  await setStartPosition(sub.id, entry.id);
  await ctx.reply(COPY.startSet(entry.ayah.surah.nameAr, entry.ayah.numberInSurah));
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

// /today: show the current ayah without sending the daily push or moving
// the subscriber forward. A pure peek. May be more than one message when the
// review is long.
bot.command('today', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const messages = await previewCurrent(sub);
  if (messages.length === 0) {
    // On the looping kids track this should never happen for a real user; if
    // it does, it is a data fault (a dangling currentEntryId). Log it so it is
    // visible rather than silent.
    logger.warn('previewCurrent returned no messages', {
      subscriberId: sub.id,
      trackId: sub.trackId,
      currentEntryId: sub.currentEntryId,
    });
    return void ctx.reply(COPY.brokenOrNotStarted);
  }
  for (const message of messages) await ctx.reply(message);
  // Remind a paused user of their state, since /today works while paused.
  if (sub.pausedAt) await ctx.reply(COPY.pausedHint);
});

// /review N: set how many previous ayat to include for review (0..20).
bot.command('review', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'review');
  if (!arg) return void ctx.reply(COPY.reviewUsage(sub.reviewCount));
  // Accept Arabic-Indic digits, and only a plain 1-2 digit number (no hex,
  // exponent, or sign sneaking through Number()).
  const normalized = toAsciiDigits(arg.trim());
  if (!/^\d{1,2}$/.test(normalized) || Number(normalized) > MAX_REVIEW_COUNT) {
    return void ctx.reply(COPY.reviewInvalid);
  }
  const count = clampReviewCount(Number(normalized));
  await setReviewCount(sub.id, count);
  await ctx.reply(COPY.reviewUpdated(count));
});

// /time: with an argument, set the time directly; with none, offer buttons.
bot.command('time', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'time');
  if (!arg) return void ctx.reply(COPY.timePrompt, { reply_markup: buildTimeKeyboard() });
  const parsed = parseTime(arg);
  if (!parsed) return void ctx.reply(COPY.timeInvalid);
  await setDeliveryTime(sub.id, parsed.hour, parsed.minute);
  await ctx.reply(COPY.timeUpdated(formatTimeAr(parsed.hour, parsed.minute), sub.timezone));
});

// /timezone: with an argument, set it directly; with none, offer city buttons.
bot.command('timezone', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'timezone');
  if (!arg) return void ctx.reply(COPY.tzPrompt, { reply_markup: buildTimezoneKeyboard() });
  if (!isValidTimezone(arg)) return void ctx.reply(COPY.tzInvalid);
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
  if (cleared) return void ctx.reply(COPY.resumed);
  // Not paused. If they will still get nothing because they have no active
  // days, point them at the real blocker instead of claiming "already active".
  if (activeDaysList(sub.activeDays).length === 0) return void ctx.reply(COPY.daysNone);
  await ctx.reply(COPY.alreadyActive);
});

// ─── Day-picker buttons ─────────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${DAY_TOGGLE_PREFIX}([1-7])$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
  const iso = Number(ctx.match![1]);
  const newMask = toggleDay(sub.activeDays, iso);
  await setActiveDays(sub.id, newMask);
  // Redraw the keyboard with the new checkmarks.
  await ctx.editMessageReplyMarkup({ reply_markup: buildDaysKeyboard(newMask) });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(DAYS_DONE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
  if (activeDaysList(sub.activeDays).length === 0) {
    // Keep the keyboard up so they can pick a day right here, instead of
    // dismissing it and forcing them to run /days again.
    await ctx.reply(COPY.daysNone);
    return void ctx.answerCallbackQuery();
  }
  await ctx.editMessageReplyMarkup(); // remove the keyboard
  await ctx.reply(COPY.daysUpdated(daysSummaryAr(sub.activeDays)));
  await ctx.answerCallbackQuery();
});

// ─── Time-picker buttons ────────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${TIME_PICK_PREFIX}(\\d{2})(\\d{2})$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
  const hour = Number(ctx.match![1]);
  const minute = Number(ctx.match![2]);
  await setDeliveryTime(sub.id, hour, minute);
  await ctx.editMessageReplyMarkup(); // remove the keyboard
  await ctx.reply(COPY.timeUpdated(formatTimeAr(hour, minute), sub.timezone));
  await ctx.answerCallbackQuery();
});

// ─── Timezone-picker buttons ────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${TZ_PICK_PREFIX}(\\d+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
  const tz = COMMON_TIMEZONES[Number(ctx.match![1])]?.iana;
  if (!tz) return void ctx.answerCallbackQuery();
  await setTimezone(sub.id, tz);
  await ctx.editMessageReplyMarkup(); // remove the keyboard
  await ctx.reply(COPY.tzUpdated(tz));
  await ctx.answerCallbackQuery();
});

// ─── Onboarding-chooser buttons ─────────────────────────────────────

// "Start from An-Nas (default)": set the reverse order, position 0 (An-Nas).
bot.callbackQuery(ONBOARD_DEFAULT, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
  const entry = await applyOrderAtStart(sub.id, KIDS_TRACK.key);
  await ctx.editMessageReplyMarkup(); // remove the keyboard
  await ctx.reply(COPY.startSet(entry.ayah.surah.nameAr, entry.ayah.numberInSurah));
  await ctx.answerCallbackQuery();
});

// "Pick a starting surah": open the surah picker in place. Also reached from
// the /settings shortcut button.
bot.callbackQuery(ONBOARD_PICK, async (ctx) => {
  await ctx.editMessageText(COPY.surahPrompt, { reply_markup: buildSurahKeyboard(SURAHS) });
  await ctx.answerCallbackQuery();
});

// "Mushaf order": switch to forward order (starting at Al-Fatihah) and then
// offer the surah picker, so they can still choose where in that order to begin.
bot.callbackQuery(ONBOARD_MUSHAF, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
  await applyOrderAtStart(sub.id, MUSHAF_TRACK.key);
  await ctx.editMessageText(`${COPY.orderSet(MUSHAF_TRACK.key)}\n\n${COPY.surahPrompt}`, {
    reply_markup: buildSurahKeyboard(SURAHS),
  });
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
  if (!sub) return void ctx.answerCallbackQuery();
  const surah = Number(ctx.match![1]);
  const entry = await getEntryForAyah(sub.trackId, surah, 1);
  if (!entry) return void ctx.answerCallbackQuery();
  await setStartPosition(sub.id, entry.id);
  await ctx.editMessageReplyMarkup(); // remove the keyboard
  await ctx.reply(COPY.startSet(entry.ayah.surah.nameAr, entry.ayah.numberInSurah));
  await ctx.answerCallbackQuery();
});

// ─── Order-picker buttons ───────────────────────────────────────────

bot.callbackQuery(new RegExp(`^${ORDER_PICK_PREFIX}(.+)$`), async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
  const key = ctx.match![1];
  if (!ORDERS.some((o) => o.key === key)) return void ctx.answerCallbackQuery();
  const track = await getTrackByKey(key);
  if (track.id === sub.trackId) {
    await ctx.editMessageReplyMarkup(); // remove the keyboard
    await ctx.reply(COPY.orderUnchanged(key));
    return void ctx.answerCallbackQuery();
  }
  // Carry their place across: find the same (surah, ayah) in the new track.
  // A not-yet-started subscriber (no current entry) keeps null so their first
  // send begins at the new order's position 0.
  let newEntryId: number | null = null;
  if (sub.currentEntryId !== null) {
    const progress = await getProgressView(sub);
    if (progress) {
      const entry = await getEntryForAyah(track.id, progress.surahNumber, progress.numberInSurah);
      newEntryId = entry?.id ?? null;
    }
  }
  await setOrder(sub.id, track.id, newEntryId);
  await ctx.editMessageReplyMarkup(); // remove the keyboard
  await ctx.reply(COPY.orderSet(key));
  await ctx.answerCallbackQuery();
});

// ─── Settings pause/resume toggle ───────────────────────────────────

bot.callbackQuery(PAUSE_TOGGLE, async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return void ctx.answerCallbackQuery();
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

bot.catch((err) => {
  logger.error('Bot error', { error: String(err.error), update: err.ctx.update.update_id });
});

async function setBotCommands() {
  // The visible menu stays small. /break and /resume still work as aliases
  // (the /pause toggle replaces them in the menu), and the picker buttons
  // cover the rest, matching the "fewer commands" goal.
  await bot.api.setMyCommands([
    { command: 'today', description: 'عرض آية اليوم' },
    { command: 'surah', description: 'اختيار سورة البداية' },
    { command: 'order', description: 'اختيار الترتيب (المصحف أو الحفظ)' },
    { command: 'time', description: 'ضبط وقت الإرسال' },
    { command: 'days', description: 'اختيار أيام الإرسال' },
    { command: 'review', description: 'عدد آيات المراجعة' },
    { command: 'timezone', description: 'ضبط المنطقة الزمنية' },
    { command: 'pause', description: 'أخذ راحة أو العودة منها' },
    { command: 'settings', description: 'عرض إعداداتك' },
    { command: 'help', description: 'المساعدة' },
  ]);
}

export { bot, setBotCommands };

// ─── Small parsing helpers ──────────────────────────────────────────

/** Get the text after a "/command" (e.g. the "07:00" in "/time 07:00"). */
function commandArg(ctx: Context, command: string): string | null {
  const raw = ctx.message?.text ?? '';
  const stripped = raw.replace(new RegExp(`^/${command}(@\\S+)?\\s*`), '').trim();
  return stripped === '' ? null : stripped;
}
