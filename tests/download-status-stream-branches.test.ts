import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

type StatusListener = () => void;
type StreamRoute = typeof import('@/app/api/download-status/stream/route');

async function loadRouteWithStatusMock(failDurableMerge = false) {
  let listener: StatusListener | null = null;
  const unsubscribe = vi.fn();

  vi.resetModules();
  vi.doMock('@/lib/download-status', () => ({
    listJobs: () => [],
    subscribeStatus: (next: StatusListener) => {
      listener = next;
      return unsubscribe;
    },
  }));
  vi.doMock('@/lib/download-status-names', () => ({
    enrichJobs: (jobs: readonly []) => jobs,
  }));
  vi.doMock('@/lib/vndb-throttle', () => ({
    getVndbThrottleStats: () => ({ active: 0, queued: 0, retryAfterMs: 0 }),
  }));
  vi.doMock('@/lib/stock-batch-store', () => ({
    mergeDurableStockBatchJobs: failDurableMerge
      ? async () => { throw new Error('durable unavailable'); }
      : (jobs: readonly []) => jobs,
  }));

  const route: StreamRoute = await import('@/app/api/download-status/stream/route');
  return { route, getListener: () => listener, unsubscribe };
}

describe('download-status SSE stream branches', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.doUnmock('@/lib/download-status');
    vi.doUnmock('@/lib/download-status-names');
    vi.doUnmock('@/lib/vndb-throttle');
    vi.doUnmock('@/lib/stock-batch-store');
    vi.resetModules();
  });

  it('ignores stale status pushes after the stream is cancelled', async () => {
    const { route, getListener, unsubscribe } = await loadRouteWithStatusMock();
    const response = await route.GET(new NextRequest('http://127.0.0.1/api/download-status/stream'));
    const reader = response.body!.getReader();

    await reader.read();
    const listener = getListener();
    expect(listener).not.toBeNull();
    await reader.cancel();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(() => listener?.()).not.toThrow();
  });

  it('treats cleanup as idempotent when the runtime cancels twice', async () => {
    const { route, unsubscribe } = await loadRouteWithStatusMock();
    const NativeReadableStream = ReadableStream;

    class CancellingReadableStream extends NativeReadableStream<Uint8Array> {
      constructor(source: UnderlyingSource<Uint8Array>) {
        super({
          start(controller) {
            source.start?.(controller);
            source.cancel?.();
            source.cancel?.();
          },
        });
      }
    }

    vi.stubGlobal('ReadableStream', CancellingReadableStream);

    const response = await route.GET(new NextRequest('http://127.0.0.1/api/download-status/stream'));

    expect(response.status).toBe(200);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('falls back to live jobs when durable status loading fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { route } = await loadRouteWithStatusMock(true);
    const response = await route.GET(new NextRequest('http://127.0.0.1/api/download-status/stream'));
    const reader = response.body!.getReader();

    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"jobs":[]');
    expect(consoleSpy).toHaveBeenCalledWith(
      '[download-status] durable stock jobs unavailable',
      expect.objectContaining({ message: 'durable unavailable' }),
    );
    await reader.cancel();
  });

  it('rejects non-loopback stream requests', async () => {
    const { route } = await loadRouteWithStatusMock();
    const response = await route.GET(new NextRequest('http://93.184.216.34/api/download-status/stream'));

    expect(response.status).toBe(403);
  });

  it('handles cancellation before keep-alive and subscription setup', async () => {
    const { route, unsubscribe } = await loadRouteWithStatusMock();
    const NativeReadableStream = ReadableStream;

    class PreCancelledReadableStream extends NativeReadableStream<Uint8Array> {
      constructor(source: UnderlyingSource<Uint8Array>) {
        source.cancel?.();
        super({ start: source.start });
      }
    }

    vi.stubGlobal('ReadableStream', PreCancelledReadableStream);
    const response = await route.GET(new NextRequest('http://127.0.0.1/api/download-status/stream'));

    expect(response.status).toBe(200);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});
