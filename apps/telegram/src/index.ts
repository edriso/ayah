import { config } from './config';
import { bot, setBotCommands } from './bot';
import { startScheduler, stopScheduler } from './scheduler';
import { startHealthServer } from './health';
import { prisma, assertQuranSeeded } from '@ayah/database';
import { deliverDueSubscribers } from './lib/deliver';
import { logger } from './lib/logger';

// Short tail before a fatal exit so the last log line reaches stdout.
const LOG_FLUSH_MS = 200;
const SHUTDOWN_TIMEOUT_MS = 5_000;

async function main() {
  logger.info('Ayah bot starting', { isDev: config.isDev, defaultTz: config.defaultTimezone });

  // "Let it crash": log, then exit so the supervisor restarts from a clean
  // state instead of running on possibly-corrupt memory.
  process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception, exiting', { error: String(err) });
    exitAfterFlush(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection, exiting', { reason: String(reason) });
    exitAfterFlush(1);
  });

  // Fail fast if the database is unreachable or the Quran text is not fully
  // seeded. Better to refuse to start than to send a broken ayah to a user.
  await prisma.$queryRaw`SELECT 1`;
  await assertQuranSeeded();

  startHealthServer();
  await setBotCommands();

  // grammY long-polling. start() resolves only when the bot stops, so we do
  // not await it here; we let it run and continue booting the scheduler.
  void bot.start({
    onStart: (me) => logger.info('Bot online', { username: me.username }),
  });

  startScheduler(bot);

  // Catch-up: a restart should still deliver today's due ayat that were
  // missed while the process was down. Idempotency stops any double-send.
  deliverDueSubscribers(bot)
    .then((stats) => logger.info('Startup catch-up done', { ...stats }))
    .catch((err) => logger.error('Startup catch-up failed', { error: String(err) }));
}

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  stopScheduler();
  await withTimeout(
    bot.stop().catch(() => {}),
    SHUTDOWN_TIMEOUT_MS,
  );
  await withTimeout(
    prisma.$disconnect().catch(() => {}),
    SHUTDOWN_TIMEOUT_MS,
  );
  exitAfterFlush(0);
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([p, new Promise<void>((r) => setTimeout(r, ms))]);
}

function exitAfterFlush(code: number): void {
  setTimeout(() => process.exit(code), LOG_FLUSH_MS).unref();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

main().catch((err) => {
  logger.error('Fatal startup error', { error: String(err) });
  exitAfterFlush(1);
});
