import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshStockForVnMock } = vi.hoisted(() => ({
  refreshStockForVnMock: vi.fn(),
}));

const { upsertDurableStockBatchJobMock } = vi.hoisted(() => ({
  upsertDurableStockBatchJobMock: vi.fn(),
}));

vi.mock('@/lib/stock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stock')>();
  return {
    ...actual,
    STOCK_PROVIDER_IDS: ['sofmap', 'suruga_ya'],
    refreshStockForVn: refreshStockForVnMock,
  };
});

vi.mock('@/lib/stock-batch-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stock-batch-store')>();
  return {
    ...actual,
    upsertDurableStockBatchJob: upsertDurableStockBatchJobMock,
  };
});

import { DELETE, POST } from '@/app/api/stock/batch/route';

function req(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function externalReq(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('stock batch route branches', () => {
  beforeEach(() => {
    refreshStockForVnMock.mockReset();
    upsertDurableStockBatchJobMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects malformed VN id payloads before starting a job', async () => {
    let res = await POST(req('/api/stock/batch', 'POST', { vnIds: 'v90001' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'vnIds must be an array' });

    res = await POST(req('/api/stock/batch', 'POST', { vnIds: [] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'no valid vnIds' });

    res = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90001', 'bad'] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'vnIds must contain only VN ids' });

    expect(refreshStockForVnMock).not.toHaveBeenCalled();
  });

  it('rejects oversized batches and unknown providers', async () => {
    let res = await POST(req('/api/stock/batch', 'POST', { vnIds: Array.from({ length: 5001 }, (_, index) => `v${index + 1}`) }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'vnIds exceeds limit of 5000' });

    res = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90001'], providers: ['sofmap', 'unknown-provider', 1] }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: 'invalid providers',
      code: 'invalid_providers',
      invalid: ['unknown-provider', 'non-string'],
    });
  });

  it('queues a deduped normalized stock batch and persists job snapshots', async () => {
    refreshStockForVnMock.mockImplementation(async (_vnId: string, _providers: string[], _signal: AbortSignal, onProgress: (provider: string, done: number, total: number) => void) => {
      onProgress('sofmap', 1, 2);
      onProgress('suruga_ya', 2, 2);
    });

    const res = await POST(req('/api/stock/batch', 'POST', {
      vnIds: ['V90001', 'v90001', 'v90002'],
      providers: ['sofmap', 'suruga_ya'],
    }));
    const body = await res.json() as { jobId: string; queued: number };

    expect(res.status).toBe(202);
    expect(body.queued).toBe(2);
    await vi.waitFor(() => expect(refreshStockForVnMock).toHaveBeenCalledTimes(2));
    expect(refreshStockForVnMock.mock.calls.map((call) => call[0]).sort()).toEqual(['v90001', 'v90002']);
    expect(refreshStockForVnMock.mock.calls[0]?.[1]).toEqual(['sofmap', 'suruga_ya']);
    expect(upsertDurableStockBatchJobMock).toHaveBeenCalled();
  });

  it('falls back to all stock providers when the provider array is empty', async () => {
    refreshStockForVnMock.mockResolvedValue(undefined);

    const res = await POST(req('/api/stock/batch', 'POST', {
      vnIds: ['v90003'],
      providers: [],
    }));

    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(refreshStockForVnMock).toHaveBeenCalledWith(
      'v90003',
      ['sofmap', 'suruga_ya'],
      expect.any(AbortSignal),
      expect.any(Function),
    ));
  });

  it('rejects new batches when the active stock batch queue is full', async () => {
    const resolvers: Array<() => void> = [];
    refreshStockForVnMock.mockImplementation(() => new Promise<void>((resolve) => {
      resolvers.push(resolve);
    }));

    const first = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90101'] }));
    const second = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90102'] }));
    const third = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90103'] }));

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(third.status).toBe(429);
    expect(await third.json()).toEqual({ error: 'stock batch queue is full', code: 'queue_full' });
    resolvers.forEach((resolve) => resolve());
    await vi.waitFor(() => expect(refreshStockForVnMock).toHaveBeenCalledTimes(2));
  });

  it('records provider refresh failures without failing the queued batch response', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    refreshStockForVnMock.mockRejectedValue(new Error('private refresh failure'));

    const res = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90104'], providers: ['sofmap'] }));

    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(consoleSpy).toHaveBeenCalledWith('[stock/batch] refresh failed', {
      vnId: 'v90104',
      msg: 'private refresh failure',
    }));
    consoleSpy.mockRestore();
  });

  it('cancels a queued batch by job id and rejects missing cancellation ids', async () => {
    let res = await DELETE(req('/api/stock/batch', 'DELETE'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing jobId' });

    res = await DELETE(req('/api/stock/batch?jobId=stock-batch:test', 'DELETE'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 'stock-batch:test' });
  });

  it('rejects non-loopback batch cancellation requests', async () => {
    const res = await DELETE(externalReq('/api/stock/batch?jobId=stock-batch:test', 'DELETE'));
    expect(res.status).toBe(403);
  });

  it('aborts an active batch job and stops before later chunks', async () => {
    const resolvers: Array<() => void> = [];
    refreshStockForVnMock.mockImplementation(() => new Promise<void>((resolve) => {
      resolvers.push(resolve);
    }));
    const started = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90105', 'v90106', 'v90107'] }));
    const body = await started.json() as { jobId: string; queued: number };
    expect(started.status).toBe(202);
    expect(body.queued).toBe(3);
    await vi.waitFor(() => expect(refreshStockForVnMock).toHaveBeenCalledTimes(2));

    const cancelled = await DELETE(req(`/api/stock/batch?jobId=${encodeURIComponent(body.jobId)}`, 'DELETE'));
    expect(cancelled.status).toBe(200);
    resolvers.forEach((resolve) => resolve());

    await vi.waitFor(() => expect(refreshStockForVnMock).toHaveBeenCalledTimes(2));
  });

  it('does not record provider errors that arrive after cancellation', async () => {
    const rejectRefreshRef: { current: ((error: Error) => void) | null } = { current: null };
    refreshStockForVnMock.mockImplementation(() => new Promise<void>((_resolve, reject) => {
      rejectRefreshRef.current = reject;
    }));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = await POST(req('/api/stock/batch', 'POST', { vnIds: ['v90108'] }));
    const body = await started.json() as { jobId: string };
    await vi.waitFor(() => expect(refreshStockForVnMock).toHaveBeenCalledTimes(1));
    const durableCallsBeforeCancelReject = upsertDurableStockBatchJobMock.mock.calls.length;

    const cancelled = await DELETE(req(`/api/stock/batch?jobId=${encodeURIComponent(body.jobId)}`, 'DELETE'));
    expect(cancelled.status).toBe(200);
    const rejectRefresh = rejectRefreshRef.current;
    if (!rejectRefresh) throw new Error('refresh rejection hook was not installed');
    rejectRefresh(new Error('late provider failure'));

    await vi.waitFor(() => expect(upsertDurableStockBatchJobMock.mock.calls.length).toBeGreaterThan(durableCallsBeforeCancelReject));
    expect(consoleSpy).not.toHaveBeenCalledWith('[stock/batch] refresh failed', expect.anything());
    consoleSpy.mockRestore();
  });
});
