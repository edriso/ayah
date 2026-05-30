import { Bot, type Context } from 'grammy';
import {
  toggleDay,
  activeDaysList,
  clampReviewCount,
  MAX_REVIEW_COUNT,
  toAsciiDigits,
} from '@ayah/core';
import {
  ensureSubscriber,
  setActiveDays,
  setDeliveryTime,
  setTimezone,
  setReviewCount,
  pauseSubscriber,
  resumeSubscriber,
} from '@ayah/database';
import { config } from './config';
import { logger } from './lib/logger';
import { COPY, settingsSummary, formatTimeAr, daysSummaryAr } from './lib/copy';
import { previewCurrent } from './lib/deliver';
import { runDeliveryOnce } from './scheduler';
import { buildDaysKeyboard, DAY_TOGGLE_PREFIX, DAYS_DONE } from './lib/days-keyboard';
import { buildTimeKeyboard, TIME_PICK_PREFIX } from './lib/time-keyboard';
import { buildTimezoneKeyboard, TZ_PICK_PREFIX, COMMON_TIMEZONES } from './lib/timezone-keyboard';
import { parseTime, isValidTimezone } from './lib/parse';

const bot = new Bot<Context>(config.botToken);

/** Make sure we have a subscriber row for whoever sent this update. */
async function subscriberFor(ctx: Context) {
  if (!ctx.from) return null;
  return ensureSubscriber(BigInt(ctx.from.id), config.defaultTimezone);
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
  await ctx.reply(COPY.welcome(settingsSummary(sub)));
});

bot.command('help', (ctx) => ctx.reply(COPY.help));

bot.command('settings', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  await ctx.reply(settingsSummary(sub));
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
  await bot.api.setMyCommands([
    { command: 'today', description: 'عرض آية اليوم' },
    { command: 'time', description: 'ضبط وقت الإرسال' },
    { command: 'days', description: 'اختيار أيام الإرسال' },
    { command: 'review', description: 'عدد آيات المراجعة' },
    { command: 'timezone', description: 'ضبط المنطقة الزمنية' },
    { command: 'break', description: 'أخذ راحة' },
    { command: 'resume', description: 'العودة من الراحة' },
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
