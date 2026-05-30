import cron, { type ScheduledTask } from 'node-cron';
import type { Bot, Context } from 'grammy';
import { pruneCronRuns } from '@ayah/database';
import { deliverDueSubscribers } from './lib/deliver';
import { logger } from './lib/logger';

const tasks: ScheduledTask[] = [];

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
    deliverDueSubscribers(bot)
      .then((stats) => {
        if (stats.due > 0) logger.info('Delivery tick', { ...stats });
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
