import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bumpStatus,
  finishJob,
  recordError,
  startJob,
  subscribeStatus,
  tickJob,
} from '@/lib/download-status';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('download-status pub/sub', () => {
  it('emits to subscribers on every mutation', () => {
    const listener = vi.fn();
    const off = subscribeStatus(listener);
    const job = startJob('vndb-pull', 'test', 3);
    tickJob(job.id);
    recordError(job.id, 'item', 'boom');
    finishJob(job.id);
    expect(listener).toHaveBeenCalledTimes(4);
    off();
  });

  it('bumpStatus pings without a state change', () => {
    const listener = vi.fn();
    const off = subscribeStatus(listener);
    bumpStatus();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('unsubscribe stops further notifications', () => {
    const listener = vi.fn();
    const off = subscribeStatus(listener);
    off();
    const job = startJob('staff', 'unsub', 1);
    tickJob(job.id);
    finishJob(job.id);
    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing listener does not break the producer chain', () => {
    const bad = vi.fn(() => {
      throw new Error('nope');
    });
    const good = vi.fn();
    const off1 = subscribeStatus(bad);
    const off2 = subscribeStatus(good);
    expect(() => bumpStatus()).not.toThrow();
    expect(good).toHaveBeenCalled();
    off1();
    off2();
  });
});
