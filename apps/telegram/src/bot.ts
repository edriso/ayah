import { Bot, type Context } from 'grammy';
import { toggleDay, activeDaysList } from '@ayah/core';
import {
  ensureSubscriber,
  setActiveDays,
  setDeliveryTime,
  setTimezone,
  pauseSubscriber,
  resumeSubscriber,
} from '@ayah/database';
import { config } from './config';
import { logger } from './lib/logger';
import { COPY, settingsSummary, formatTimeAr, daysSummaryAr } from './lib/copy';
import { previewCurrent, deliverDueSubscribers } from './lib/deliver';
import { buildDaysKeyboard, DAY_TOGGLE_PREFIX, DAYS_DONE } from './lib/days-keyboard';
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
// the subscriber forward. A pure peek.
bot.command('today', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const text = await previewCurrent(sub);
  await ctx.reply(text ?? COPY.brokenOrNotStarted);
});

// /time HH:MM
bot.command('time', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'time');
  if (!arg) return void ctx.reply(COPY.timeUsage);
  const parsed = parseTime(arg);
  if (!parsed) return void ctx.reply(COPY.timeInvalid);
  await setDeliveryTime(sub.id, parsed.hour, parsed.minute);
  await ctx.reply(COPY.timeUpdated(formatTimeAr(parsed.hour, parsed.minute)));
});

// /timezone Area/City
bot.command('timezone', async (ctx) => {
  const sub = await subscriberFor(ctx);
  if (!sub) return;
  const arg = commandArg(ctx, 'timezone');
  if (!arg) return void ctx.reply(COPY.tzUsage);
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
  await ctx.reply(cleared ? COPY.resumed : COPY.alreadyActive);
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
  const summary =
    activeDaysList(sub.activeDays).length === 0
      ? COPY.daysNone
      : COPY.daysUpdated(daysSummaryAr(sub.activeDays));
  await ctx.editMessageReplyMarkup(); // remove the keyboard
  await ctx.reply(summary);
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
  const stats = await deliverDueSubscribers(bot);
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
