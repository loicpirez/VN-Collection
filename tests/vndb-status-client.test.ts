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
    const oldSettlement = expect(oldRequest).rejects.toMatchObject({ name: 'AbortError' });
    clearVndbStatusRequest(VN_ONE);
    const newRequest = requestVndbStatus(VN_ONE);
    await oldSettlement;
    oldPending.resolve(new Response('{"version":"old"}'));

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
    expect(global.fetch).toHaveBeenCalledWith(`/api/vn/${VN_ONE}/vndb-status`, expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    expect(global.fetch).toHaveBeenCalledWith(`/api/vn/${VN_TWO}/vndb-status`, expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
  });

  it('keeps explicit fresh reads separate from cached in-flight reads', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}'));

    await Promise.all([requestVndbStatus(VN_ONE), requestVndbStatus(VN_ONE, true)]);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenCalledWith(`/api/vn/${VN_ONE}/vndb-status?fresh=1`, expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
  });

  it('keeps the shared fetch alive while another consumer still needs it', async () => {
    const pending = deferredResponse();
    const captured: { signal: AbortSignal | null } = { signal: null };
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      captured.signal = init?.signal ?? null;
      return pending.promise;
    });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = requestVndbStatus(VN_ONE, false, firstController.signal);
    const second = requestVndbStatus(VN_ONE, false, secondController.signal);
    const firstSettlement = expect(first).rejects.toMatchObject({ name: 'AbortError' });

    firstController.abort();
    await firstSettlement;
    expect(captured.signal?.aborted).toBe(false);
    pending.resolve(new Response('{"entry":null}'));
    await expect((await second).json()).resolves.toEqual({ entry: null });
  });

  it('aborts the shared fetch after its last consumer leaves', async () => {
    const captured: { signal: AbortSignal | null } = { signal: null };
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      captured.signal = init?.signal ?? null;
      return new Promise<Response>(() => {});
    });
    const controller = new AbortController();
    const request = requestVndbStatus(VN_ONE, false, controller.signal);
    const settlement = expect(request).rejects.toMatchObject({ name: 'AbortError' });

    controller.abort();
    await settlement;
    expect(captured.signal?.aborted).toBe(true);
  });

  it('rejects an already-aborted consumer without subscribing it', async () => {
    global.fetch = vi.fn(() => new Promise<Response>(() => {}));
    const controller = new AbortController();
    controller.abort('route disposed');

    await expect(requestVndbStatus(VN_ONE, false, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(global.fetch).toHaveBeenCalledOnce();
  });

  it('rejects every active consumer when the shared request is cleared', async () => {
    global.fetch = vi.fn(() => new Promise<Response>(() => {}));
    const first = requestVndbStatus(VN_ONE);
    const second = requestVndbStatus(VN_ONE);
    const firstSettlement = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    const secondSettlement = expect(second).rejects.toMatchObject({ name: 'AbortError' });

    clearVndbStatusRequest(VN_ONE);
    await Promise.all([firstSettlement, secondSettlement]);
  });
});
