import { config } from './config';
import { bot, setBotCommands } from './bot';
import { startScheduler, stopScheduler, runDeliveryOnce } from './scheduler';
import { startHealthServer } from './health';
import { prisma, assertQuranSeeded, assertTracksSeeded } from '@ayah/database';
import { logger } from './lib/logger';

// Short tail before a fatal exit so the last log line reaches stdout.
const LOG_FLUSH_MS = 200;
const SHUTDOWN_TIMEOUT_MS = 5_000;
// How long to keep retrying the database at startup before giving up. A host
// may bring the bot up a moment before the database is ready.
const DB_MAX_RETRIES = 10;

/**
 * Wait for the database to accept a query, retrying with a short backoff.
 * This avoids a crash-loop when the bot boots a few seconds before the DB.
 */
async function waitForDatabase(): Promise<void> {
  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (err) {
      if (attempt === DB_MAX_RETRIES) throw err;
      const delaySeconds = Math.min(attempt * 3, 30);
      logger.warn(`Database not ready (attempt ${attempt}/${DB_MAX_RETRIES}), retrying`, {
        delaySeconds,
        error: String(err),
      });
      await new Promise((r) => setTimeout(r, delaySeconds * 1000));
    }
  }
}

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

  // Wait for the database, then refuse to start unless the Quran text is
  // fully seeded. Better to fail at boot than to send a broken ayah.
  await waitForDatabase();
  await assertQuranSeeded();
  // Every order the bot offers must be a fully-seeded track, else picking it
  // would fail at runtime. Fail at boot instead. Run "pnpm db:seed" to fix.
  await assertTracksSeeded();

  startHealthServer();
  await setBotCommands();

  // grammY long-polling. start() resolves only when the bot stops, so we do
  // not await it here; we let it run and continue booting the scheduler. A
  // rejection (e.g. a bad token) is fatal, so we crash and let the supervisor
  // restart us.
  void bot
    .start({ onStart: (me) => logger.info('Bot online', { username: me.username }) })
    .catch((err) => {
      logger.error('Bot polling stopped unexpectedly, exiting', { error: String(err) });
      exitAfterFlush(1);
    });

  startScheduler(bot);

  // Catch-up: a restart should still deliver today's due ayat that were
  // missed while the process was down. The in-process lock and the per-day
  // unique record together stop any double-send.
  runDeliveryOnce(bot)
    .then((stats) => logger.info('Startup catch-up done', { ...(stats ?? { skipped: true }) }))
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
