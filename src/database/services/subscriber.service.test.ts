import { describe, it, expect, beforeEach, vi } from 'vitest';

// Only the Prisma client is stubbed. subscriberStats is thin glue over five
// COUNT queries; the logic worth pinning is WHICH where-clause each count uses
// (especially "active" = reachable and not paused) and the assembled shape.
const h = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock('../client', () => ({ prisma: { subscriber: { count: h.count } } }));

import { subscriberStats } from './subscriber.service';

beforeEach(() => vi.clearAllMocks());

describe('subscriberStats', () => {
  it('runs the five counts with the right filters and assembles the snapshot', async () => {
    // Promise.all preserves order: total, active, paused, blocked, started.
    h.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(70)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(15)
      .mockResolvedValueOnce(90);

    const stats = await subscriberStats();

    expect(stats).toEqual({ total: 100, active: 70, paused: 20, blocked: 15, started: 90 });

    const calls = h.count.mock.calls.map((c) => c[0]);
    expect(calls[0]).toBeUndefined(); // total: no filter
    // "active" mirrors the send loops: reachable AND not on a break.
    expect(calls[1]).toEqual({ where: { pausedAt: null, blockedAt: null } });
    expect(calls[2]).toEqual({ where: { pausedAt: { not: null } } });
    expect(calls[3]).toEqual({ where: { blockedAt: { not: null } } });
    expect(calls[4]).toEqual({ where: { startedAt: { not: null } } });
  });
});
