import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearVndbStatusRequest, requestVndbStatus } from '@/lib/vndb-status-client';

const VN_ONE = 'v90001';
const VN_TWO = 'v90002';

function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

afterEach(() => {
  clearVndbStatusRequest(VN_ONE);
  clearVndbStatusRequest(VN_TWO);
  vi.restoreAllMocks();
});

describe('VNDB status client request coalescing', () => {
  it('shares one in-flight fetch and gives every consumer a readable response', async () => {
    const pending = deferredResponse();
    global.fetch = vi.fn(() => pending.promise);

    const first = requestVndbStatus(VN_ONE);
    const second = requestVndbStatus(VN_ONE);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    pending.resolve(new Response(JSON.stringify({ entry: null }), {
      headers: { 'content-type': 'application/json' },
    }));

    await expect((await first).json()).resolves.toEqual({ entry: null });
    await expect((await second).json()).resolves.toEqual({ entry: null });
  });

  it('releases successful and failed requests so a later read retries', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('{}'));

    await requestVndbStatus(VN_ONE);
    await expect(requestVndbStatus(VN_ONE)).rejects.toThrow('offline');
    await requestVndbStatus(VN_ONE);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('does not let an older completion clear a newer request', async () => {
    const oldPending = deferredResponse();
    const newPending = deferredResponse();
    global.fetch = vi.fn()
      .mockImplementationOnce(() => oldPending.promise)
      .mockImplementationOnce(() => newPending.promise);

    const oldRequest = requestVndbStatus(VN_ONE);
    clearVndbStatusRequest(VN_ONE);
    const newRequest = requestVndbStatus(VN_ONE);
    oldPending.resolve(new Response('{"version":"old"}'));
    await oldRequest;

    const sharedNewRequest = requestVndbStatus(VN_ONE);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    newPending.resolve(new Response('{"version":"new"}'));
    await expect((await newRequest).json()).resolves.toEqual({ version: 'new' });
    await expect((await sharedNewRequest).json()).resolves.toEqual({ version: 'new' });
  });

  it('keeps requests for different VNs independent', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}'));

    await Promise.all([requestVndbStatus(VN_ONE), requestVndbStatus(VN_TWO)]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(`/api/vn/${VN_ONE}/vndb-status`, { cache: 'no-store' });
    expect(global.fetch).toHaveBeenCalledWith(`/api/vn/${VN_TWO}/vndb-status`, { cache: 'no-store' });
  });
});
