import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bumpStatus,
  finishJob,
  listJobs,
  recordError,
  setJobCurrent,
  startJob,
  subscribeStatus,
  tickJob,
} from '@/lib/download-status';

afterEach(() => {
  vi.restoreAllMocks();
});

function flushMicrotasks(): Promise<void> {
  // Two awaits flush queueMicrotask → resolved promises in the
  // microtask queue. Matches Node's microtask ordering.
  return Promise.resolve().then(() => Promise.resolve());
}

describe('download-status pub/sub', () => {
  it('coalesces burst mutations to one notification per microtask', async () => {
    const listener = vi.fn();
    const off = subscribeStatus(listener);
    const job = startJob('vndb-pull', 'test', 3);
    tickJob(job.id);
    recordError(job.id, 'item', 'boom');
    finishJob(job.id);
    expect(listener).not.toHaveBeenCalled();
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('emits across multiple microtask boundaries', async () => {
    const listener = vi.fn();
    const off = subscribeStatus(listener);
    bumpStatus();
    await flushMicrotasks();
    bumpStatus();
    await flushMicrotasks();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });

  it('unsubscribe stops further notifications', async () => {
    const listener = vi.fn();
    const off = subscribeStatus(listener);
    off();
    const job = startJob('staff', 'unsub', 1);
    tickJob(job.id);
    finishJob(job.id);
    await flushMicrotasks();
    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing listener does not break the producer chain', async () => {
    const bad = vi.fn(() => {
      throw new Error('nope');
    });
    const good = vi.fn();
    const off1 = subscribeStatus(bad);
    const off2 = subscribeStatus(good);
    expect(() => bumpStatus()).not.toThrow();
    await flushMicrotasks();
    expect(good).toHaveBeenCalled();
    off1();
    off2();
  });

  // Guard against listener-leak DoS: the producer caps the set at
  // MAX_LISTENERS (100). When a 101st subscriber attaches, the
  // oldest listener is evicted and never notified again. Previous
  // test runs left the cap untested — a regression that flipped
  // the cap off would silently grow the set unbounded.
  it('setJobCurrent surfaces the current task on the snapshot for the bar', async () => {
    // Regression: the DownloadStatusBar collapsed chip used to
    // show only the generic "1 en cours" label even when a
    // job-specific current_item was set (e.g. "EGS top-ranked
    // (top 100)"). The bar's source data MUST carry the
    // current_item field through getStatusSnapshot() so the
    // chip can promote it to the visible line.
    const listener = vi.fn();
    const off = subscribeStatus(listener);
    const job = startJob('cache-refresh', 'Global refresh', 3);
    setJobCurrent(job.id, 'EGS top-ranked (top 100)');
    await flushMicrotasks();
    const j = listJobs().find((x) => x.id === job.id);
    expect(j).toBeDefined();
    expect(j?.current_item).toBe('EGS top-ranked (top 100)');
    expect(j?.kind).toBe('cache-refresh');
    expect(j?.label).toBe('Global refresh');
    // setJobCurrent(null) clears it.
    setJobCurrent(job.id, null);
    await flushMicrotasks();
    expect(listJobs().find((x) => x.id === job.id)?.current_item)
      .toBeNull();
    finishJob(job.id);
    off();
  });

  it('evicts the oldest listener when the cap is exceeded', async () => {
    const MAX_LISTENERS = 100;
    const listeners: Array<{ fn: ReturnType<typeof vi.fn>; off: () => void }> = [];
    for (let i = 0; i < MAX_LISTENERS; i++) {
      const fn = vi.fn();
      listeners.push({ fn, off: subscribeStatus(fn) });
    }
    const newest = vi.fn();
    const offNewest = subscribeStatus(newest);
    bumpStatus();
    await flushMicrotasks();
    // Oldest got evicted at subscribe time — should have zero calls.
    expect(listeners[0].fn).not.toHaveBeenCalled();
    // Newest plus everyone in between gets the bump.
    expect(newest).toHaveBeenCalledTimes(1);
    expect(listeners[1].fn).toHaveBeenCalledTimes(1);
    expect(listeners[listeners.length - 1].fn).toHaveBeenCalledTimes(1);
    for (const { off } of listeners) off();
    offNewest();
  });
});
