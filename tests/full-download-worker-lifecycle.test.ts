import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClaimedFullDownloadItem, FullDownloadQueueStore } from '@/lib/db/repositories/full-download-queue';
import type { BackgroundJobLease } from '@/lib/background-job-lease';

const mocks = vi.hoisted(() => ({
  acquireLease: vi.fn(),
  bumpStatus: vi.fn(),
  character: vi.fn(),
  producer: vi.fn(),
  registerShutdown: vi.fn(),
  staff: vi.fn(),
  store: {
    enqueue: vi.fn(),
    claim: vi.fn(),
    renew: vi.fn(),
    finishPhase: vi.fn(),
    finish: vi.fn(),
    listJobs: vi.fn(),
  },
}));

vi.mock('@/lib/background-job-lease', () => ({ acquireBackgroundJobLease: mocks.acquireLease }));
vi.mock('@/lib/download-status', () => ({ bumpStatus: mocks.bumpStatus }));
vi.mock('@/lib/staff-full', () => ({ downloadFullStaffForVn: mocks.staff }));
vi.mock('@/lib/character-full', () => ({ downloadFullCharForVn: mocks.character }));
vi.mock('@/lib/producer-full', () => ({ downloadFullProducerForVn: mocks.producer }));
vi.mock('@/lib/db/repositories/full-download-queue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/repositories/full-download-queue')>();
  return { ...actual, getFullDownloadQueueStore: () => mocks.store as FullDownloadQueueStore };
});
vi.mock('@/lib/server-shutdown', () => ({ registerServerShutdownHandler: mocks.registerShutdown }));

function lease(): BackgroundJobLease {
  return {
    name: 'full-download-worker:1',
    renew: vi.fn(async () => {}),
    release: vi.fn(async () => true),
  };
}

describe('full-download worker coordinator lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.renew.mockResolvedValue(true);
    mocks.store.finishPhase.mockResolvedValue(true);
    mocks.store.finish.mockResolvedValue(true);
    mocks.staff.mockResolvedValue(undefined);
    mocks.character.mockResolvedValue(undefined);
    mocks.producer.mockResolvedValue(undefined);
  });

  it('starts once, drains through default phases, logs worker failures, polls, and stops', async () => {
    vi.useFakeTimers();
    const item: ClaimedFullDownloadItem = {
      id: 'job-1', vnId: 'v999001', phaseIndex: 0, leaseOwner: 'owner-a',
    };
    mocks.acquireLease
      .mockRejectedValueOnce(new Error('slot database failed'))
      .mockResolvedValue(lease());
    mocks.store.claim
      .mockResolvedValueOnce(item)
      .mockResolvedValue(null);
    const shutdownHandlers: Array<() => void> = [];
    mocks.registerShutdown.mockImplementation((handler: () => void) => {
      shutdownHandlers.push(handler);
      return () => {};
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const worker = await import('@/lib/full-download-worker');

    worker.startFullDownloadWorkers();
    worker.startFullDownloadWorkers();
    worker.wakeFullDownloadWorkers();
    await vi.waitFor(() => expect(mocks.producer).toHaveBeenCalledWith('v999001', { force: true }));
    expect(mocks.staff).toHaveBeenCalledWith('v999001', { force: true });
    expect(mocks.character).toHaveBeenCalledWith('v999001', { force: true });
    expect(mocks.store.finishPhase).toHaveBeenCalledTimes(3);
    expect(mocks.store.finish).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalledWith('[full-download-worker] queue item failed:', 'slot database failed');
    expect(mocks.registerShutdown).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(30_000);
    expect(mocks.acquireLease.mock.calls.length).toBeGreaterThan(2);
    const shutdown = shutdownHandlers[0];
    if (!shutdown) throw new Error('shutdown fixture was not registered');
    shutdown();
    shutdown();
    worker.wakeFullDownloadWorkers();
    await vi.advanceTimersByTimeAsync(30_000);
    consoleSpy.mockRestore();
    vi.useRealTimers();
  });
});
