import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshMock, matchNextMock, vndbFromEgsMock, searchEgsMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  matchNextMock: vi.fn(),
  vndbFromEgsMock: vi.fn(),
  searchEgsMock: vi.fn(),
}));

vi.mock('@/lib/alicenet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/alicenet')>();
  return {
    ...actual,
    refreshAliceNetStock: refreshMock,
    matchNextAliceNetItems: matchNextMock,
    matchVndbFromEgsForAliceNet: vndbFromEgsMock,
    searchEgsForAliceNetNoVndb: searchEgsMock,
  };
});

import { DELETE, POST } from '@/app/api/alicenet/run/route';
import { getJob } from '@/lib/download-status';

const SCRAPE = { count: 3, added: 1, updated: 1, removed: 1, fetched_at: 1700000000 };
const DONE = { processed: 0, matched: 0, remaining: 0 };

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

async function startAndFinish(op: string): Promise<string> {
  const res = await POST(req('/api/alicenet/run', 'POST', { op }));
  expect(res.status).toBe(202);
  const body = await res.json() as { jobId: string; op: string };
  expect(body.op).toBe(op);
  await vi.waitFor(() => expect(getJob(body.jobId)?.finished_at).not.toBeNull());
  return body.jobId;
}

describe('alicenet run route branches', () => {
  beforeEach(() => {
    refreshMock.mockReset().mockResolvedValue(SCRAPE);
    matchNextMock.mockReset().mockResolvedValue(DONE);
    vndbFromEgsMock.mockReset().mockResolvedValue(DONE);
    searchEgsMock.mockReset().mockResolvedValue(DONE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects non-loopback requests', async () => {
    const res = await POST(externalReq('/api/alicenet/run', 'POST', { op: 'download' }));
    expect(res.status).toBe(403);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid or missing op', async () => {
    let res = await POST(req('/api/alicenet/run', 'POST', { op: 'bogus' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('op must be one of');

    res = await POST(req('/api/alicenet/run', 'POST', {}));
    expect(res.status).toBe(400);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('runs the download op (scrape only) and finishes cleanly', async () => {
    const jobId = await startAndFinish('download');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(matchNextMock).not.toHaveBeenCalled();
    const job = getJob(jobId);
    expect(job?.errors).toEqual([]);
    expect(job?.total).toBe(3);
    expect(job?.done).toBe(3);
    expect(job?.cancelled ?? false).toBe(false);
  });

  it('runs the full pipeline op across every phase in order', async () => {
    await startAndFinish('pipeline');
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(matchNextMock).toHaveBeenCalledTimes(2);
    expect(matchNextMock.mock.calls[0]?.[1]).toBe(false);
    expect(matchNextMock.mock.calls[1]?.[1]).toBe(true);
    expect(vndbFromEgsMock).toHaveBeenCalledTimes(1);
    expect(searchEgsMock).toHaveBeenCalledTimes(1);
  });

  it('runs the match-vndb op without scraping or EGS search', async () => {
    await startAndFinish('match-vndb');
    expect(refreshMock).not.toHaveBeenCalled();
    expect(matchNextMock).toHaveBeenCalledTimes(2);
    expect(vndbFromEgsMock).toHaveBeenCalledTimes(1);
    expect(searchEgsMock).not.toHaveBeenCalled();
  });

  it('loops a match-egs phase until remaining is drained', async () => {
    searchEgsMock
      .mockResolvedValueOnce({ processed: 1, matched: 1, remaining: 1 })
      .mockResolvedValue({ processed: 1, matched: 1, remaining: 0 });
    await startAndFinish('match-egs');
    expect(searchEgsMock).toHaveBeenCalledTimes(2);
  });

  it('breaks a phase loop after a batch processes nothing', async () => {
    matchNextMock.mockResolvedValue({ processed: 0, matched: 0, remaining: 5 });
    await startAndFinish('match-vndb');
    expect(matchNextMock).toHaveBeenCalledTimes(2);
  });

  it('records a phase failure and continues to the next phase', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    matchNextMock.mockRejectedValue(new Error('vndb unreachable'));
    const jobId = await startAndFinish('match-vndb');
    expect(vndbFromEgsMock).toHaveBeenCalledTimes(1);
    const job = getJob(jobId);
    expect(job?.errors.length).toBeGreaterThan(0);
    expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('[download:alicenet]'))).toBe(true);
    consoleSpy.mockRestore();
  });

  it('rejects a second run while one is already active', async () => {
    let release: () => void = () => {};
    refreshMock.mockImplementation(() => new Promise((resolve) => { release = () => resolve(SCRAPE); }));
    const first = await POST(req('/api/alicenet/run', 'POST', { op: 'download' }));
    expect(first.status).toBe(202);
    const firstBody = await first.json() as { jobId: string };
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));

    const second = await POST(req('/api/alicenet/run', 'POST', { op: 'download' }));
    expect(second.status).toBe(429);
    expect(await second.json()).toEqual({ error: 'an AliceNet operation is already running', code: 'queue_full' });

    release();
    await vi.waitFor(() => expect(getJob(firstBody.jobId)?.finished_at).not.toBeNull());
  });

  it('cancels between phases and skips the remaining phases', async () => {
    let release: () => void = () => {};
    refreshMock.mockImplementation(() => new Promise((resolve) => { release = () => resolve(SCRAPE); }));
    const started = await POST(req('/api/alicenet/run', 'POST', { op: 'pipeline' }));
    const body = await started.json() as { jobId: string };
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));

    const cancelled = await DELETE(req(`/api/alicenet/run?jobId=${encodeURIComponent(body.jobId)}`, 'DELETE'));
    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toEqual({ cancelled: body.jobId });

    release();
    await vi.waitFor(() => expect(getJob(body.jobId)?.finished_at).not.toBeNull());
    expect(matchNextMock).not.toHaveBeenCalled();
    expect(getJob(body.jobId)?.cancelled).toBe(true);
  });

  it('cancels mid phase-loop on the next batch check', async () => {
    let release: () => void = () => {};
    searchEgsMock.mockImplementation(() => new Promise((resolve) => { release = () => resolve({ processed: 1, matched: 1, remaining: 1 }); }));
    const started = await POST(req('/api/alicenet/run', 'POST', { op: 'match-egs' }));
    const body = await started.json() as { jobId: string };
    await vi.waitFor(() => expect(searchEgsMock).toHaveBeenCalledTimes(1));

    await DELETE(req(`/api/alicenet/run?jobId=${encodeURIComponent(body.jobId)}`, 'DELETE'));
    release();
    await vi.waitFor(() => expect(getJob(body.jobId)?.finished_at).not.toBeNull());
    expect(searchEgsMock).toHaveBeenCalledTimes(1);
  });

  it('does not record phase errors that arrive after cancellation', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let reject: (e: Error) => void = () => {};
    refreshMock.mockImplementation(() => new Promise((_resolve, rej) => { reject = rej; }));
    const started = await POST(req('/api/alicenet/run', 'POST', { op: 'download' }));
    const body = await started.json() as { jobId: string };
    await vi.waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));

    await DELETE(req(`/api/alicenet/run?jobId=${encodeURIComponent(body.jobId)}`, 'DELETE'));
    reject(new Error('late scrape failure'));
    await vi.waitFor(() => expect(getJob(body.jobId)?.finished_at).not.toBeNull());
    expect(consoleSpy.mock.calls.some((c) => String(c[0]).includes('[download:alicenet]'))).toBe(false);
    consoleSpy.mockRestore();
  });

  it('rejects cancellation without a job id and accepts a job id', async () => {
    let res = await DELETE(req('/api/alicenet/run', 'DELETE'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'missing jobId' });

    res = await DELETE(req('/api/alicenet/run?jobId=alicenet:unknown', 'DELETE'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ cancelled: 'alicenet:unknown' });
  });

  it('rejects non-loopback cancellation', async () => {
    const res = await DELETE(externalReq('/api/alicenet/run?jobId=alicenet:test', 'DELETE'));
    expect(res.status).toBe(403);
  });
});
