import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  listJobs: vi.fn(),
  mergeDurableStockBatchJobs: vi.fn(),
  enrichJobs: vi.fn(),
  getVndbThrottleStats: vi.fn(),
}));

vi.mock('@/lib/download-status', () => ({ listJobs: mocks.listJobs }));
vi.mock('@/lib/stock-batch-store', () => ({ mergeDurableStockBatchJobs: mocks.mergeDurableStockBatchJobs }));
vi.mock('@/lib/download-status-names', () => ({ enrichJobs: mocks.enrichJobs }));
vi.mock('@/lib/vndb-throttle', () => ({ getVndbThrottleStats: mocks.getVndbThrottleStats }));

describe('download status payload', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.listJobs.mockReset().mockReturnValue([]);
    mocks.mergeDurableStockBatchJobs.mockReset();
    mocks.enrichJobs.mockReset().mockImplementation(async (jobs) => jobs);
    mocks.getVndbThrottleStats.mockReset().mockReturnValue({ active: 0, queued: 0, retryAfterMs: 0 });
  });

  it('coalesces concurrent consumers and rebuilds after the shared snapshot settles', async () => {
    let releaseMerge: (jobs: []) => void = () => {};
    mocks.mergeDurableStockBatchJobs.mockImplementationOnce(
      () => new Promise<[]>((resolve) => { releaseMerge = resolve; }),
    ).mockResolvedValueOnce([]);
    const { buildDownloadStatusSnapshot } = await import('@/lib/download-status-payload');

    const first = buildDownloadStatusSnapshot();
    const second = buildDownloadStatusSnapshot();
    expect(mocks.mergeDurableStockBatchJobs).toHaveBeenCalledTimes(1);
    releaseMerge([]);
    expect(await first).toEqual(await second);

    await buildDownloadStatusSnapshot();
    expect(mocks.mergeDurableStockBatchJobs).toHaveBeenCalledTimes(2);
  });

  it('falls back to live jobs when durable status cannot be read', async () => {
    const live = [{ id: 'live' }];
    mocks.listJobs.mockReturnValue(live);
    mocks.mergeDurableStockBatchJobs.mockRejectedValue(new Error('durable unavailable'));
    mocks.enrichJobs.mockResolvedValue(live);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { buildDownloadStatusSnapshot } = await import('@/lib/download-status-payload');

    const snapshot = await buildDownloadStatusSnapshot();

    expect(mocks.enrichJobs).toHaveBeenCalledWith(live);
    expect(snapshot.jobs).toBe(live);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[download-status] durable stock jobs unavailable',
      expect.objectContaining({ message: 'durable unavailable' }),
    );
  });
});
