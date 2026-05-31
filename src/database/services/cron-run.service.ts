import { prisma } from '../client';

/**
 * Wrap a scheduled job so every run is recorded in the cron_runs table.
 * This lets us answer "did the 07:00 batch run today, and did it finish?"
 * without digging through logs. The job's own return value is saved as JSON
 * stats (counts, etc.). Errors are recorded and then re-thrown so the
 * caller's catch still runs.
 */
export async function withCronRun<T>(
  name: string,
  job: () => Promise<T>,
  now: Date = new Date(),
): Promise<T> {
  const run = await prisma.cronRun.create({
    data: { name, startedAt: now },
  });
  const startedMs = now.getTime();

  try {
    const result = await job();
    const finishedAt = new Date();
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        success: true,
        durationMs: finishedAt.getTime() - startedMs,
        statsJson: safeJson(result),
      },
    });
    return result;
  } catch (err) {
    const finishedAt = new Date();
    await prisma.cronRun.update({
      where: { id: run.id },
      data: {
        finishedAt,
        success: false,
        durationMs: finishedAt.getTime() - startedMs,
        errorMessage: String(err).slice(0, 2000),
      },
    });
    throw err;
  }
}

/** Delete cron_runs rows older than `days` (default 30) to keep it small. */
export async function pruneCronRuns(days = 30, now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const result = await prisma.cronRun.deleteMany({
    where: { startedAt: { lt: cutoff } },
  });
  return result.count;
}

/** JSON.stringify that never throws and stays within the TEXT column size. */
function safeJson(value: unknown): string | null {
  try {
    return JSON.stringify(value)?.slice(0, 2000) ?? null;
  } catch {
    return null;
  }
}
