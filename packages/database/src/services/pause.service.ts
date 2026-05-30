import { prisma } from '../client';

/**
 * Pause / "take a break". This is an INDEFINITE break: the bot sends
 * nothing and the subscriber's position does not advance, so /resume picks
 * up exactly where they left off. The break stays until they resume.
 *
 * We model it with a single `pausedAt` timestamp: null means active, a set
 * value means on break (and records when the break started, handy for
 * stats). Compare this with the num-ninjas bot, which uses `pausedUntil`
 * for fixed-length breaks; here we chose indefinite to match "make the bot
 * stop sending me".
 */

/** True if the subscriber is currently on a break. */
export function isPaused(subscriber: { pausedAt: Date | null }): boolean {
  return subscriber.pausedAt !== null;
}

/**
 * Start a break. Idempotent: if already paused we keep the original
 * pausedAt (so the "since" time stays honest). Returns true if this call
 * actually started a new break, false if they were already paused.
 */
export async function pauseSubscriber(subscriberId: number, now: Date = new Date()) {
  const result = await prisma.subscriber.updateMany({
    where: { id: subscriberId, pausedAt: null },
    data: { pausedAt: now },
  });
  return result.count > 0;
}

/**
 * End a break. Idempotent: no-op if they were not paused. Returns true if a
 * break was actually cleared, so the caller can decide whether to send a
 * "welcome back" reply.
 */
export async function resumeSubscriber(subscriberId: number) {
  const result = await prisma.subscriber.updateMany({
    where: { id: subscriberId, pausedAt: { not: null } },
    data: { pausedAt: null },
  });
  return result.count > 0;
}
