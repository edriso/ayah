import cron, { type ScheduledTask } from 'node-cron';
import type { Bot, Context } from 'grammy';
import { pruneCronRuns } from './database';
import { deliverDueSubscribers, type DeliveryStats } from './lib/deliver';
import { logger } from './lib/logger';

const tasks: ScheduledTask[] = [];

// In-process lock so two delivery runs never overlap. A batch that takes
// longer than a minute would otherwise let the next cron tick (or the startup
// catch-up) start a second batch, and both could send to the same subscriber
// before either records the delivery. The per-day unique index stops a double
// RECORD, but only this guard stops a double SEND. (Assumes a single bot
// process; horizontal scaling would need a database lock instead.)
let deliveryRunning = false;

/**
 * Run one delivery batch, unless another one is already in progress. Used by
 * both the cron tick and the startup catch-up. Returns null when skipped
 * because a run was already active.
 */
export async function runDeliveryOnce(
  bot: Bot<Context>,
  now: Date = new Date(),
): Promise<DeliveryStats | null> {
  if (deliveryRunning) {
    logger.debug('Delivery already running, skipping this trigger');
    return null;
  }
  deliveryRunning = true;
  try {
    return await deliverDueSubscribers(bot, now);
  } finally {
    deliveryRunning = false;
  }
}

/**
 * Start the recurring jobs:
 *   - Delivery tick, every minute. Each subscriber is judged in their own
 *     timezone, so one global minute-tick serves every timezone correctly.
 *     The (subscriber, local date) record keeps it to one ayah per day.
 *   - Cron-run cleanup, once a day, so the observability table stays small.
 *
 * Errors inside a job are caught so a single bad run never kills the loop.
 */
export function startScheduler(bot: Bot<Context>): void {
  const tick = cron.schedule('* * * * *', () => {
    runDeliveryOnce(bot)
      .then((stats) => {
        if (stats && stats.due > 0) logger.info('Delivery tick', { ...stats });
      })
      .catch((err) => logger.error('Delivery tick failed', { error: String(err) }));
  });

  const cleanup = cron.schedule('30 3 * * *', () => {
    pruneCronRuns(30)
      .then((deleted) => logger.info('Pruned old cron runs', { deleted }))
      .catch((err) => logger.error('Cron-run cleanup failed', { error: String(err) }));
  });

  tasks.push(tick, cleanup);
  logger.info('Scheduler started', { jobs: tasks.length });
}

export function stopScheduler(): void {
  for (const task of tasks) task.stop();
  tasks.length = 0;
  logger.info('Scheduler stopped');
}
