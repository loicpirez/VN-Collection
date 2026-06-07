import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/download-status/stream/route';

const STREAM_ROUTE = readFileSync(
  join(__dirname, '..', 'src/app/api/download-status/stream/route.ts'),
  'utf8',
);

describe('download-status SSE stream', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('sends an immediate snapshot with reverse-proxy buffering disabled', async () => {
    const response = await GET(new NextRequest('http://127.0.0.1/api/download-status/stream'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('x-accel-buffering')).toBe('no');

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const first = await reader!.read();
    expect(new TextDecoder().decode(first.value)).toMatch(/^data: \{"throttle":/);
    await reader!.cancel();
  });

  it('emits periodic keep-alive comments until the stream is cancelled', async () => {
    vi.useFakeTimers();
    const response = await GET(new NextRequest('http://127.0.0.1/api/download-status/stream'));
    const reader = response.body!.getReader();
    await reader.read();
    const keepAlive = reader.read();
    await vi.advanceTimersByTimeAsync(25_000);
    const chunk = await keepAlive;
    expect(new TextDecoder().decode(chunk.value)).toBe(': keep-alive\n\n');
    await reader.cancel();
  });

  it('cleans up when the stream controller rejects an enqueue', async () => {
    const NativeReadableStream = ReadableStream;
    class ThrowingReadableStream extends NativeReadableStream<Uint8Array> {
      constructor(source: UnderlyingSource<Uint8Array>) {
        super({
          start(controller) {
            const throwingController: ReadableStreamDefaultController<Uint8Array> = {
              get desiredSize() {
                return controller.desiredSize;
              },
              close() {
                controller.close();
              },
              enqueue() {
                throw new Error('enqueue failed');
              },
              error(reason?: unknown) {
                controller.error(reason);
              },
            };
            source.start?.(throwingController);
          },
          cancel(reason?: unknown) {
            return source.cancel?.(reason);
          },
        });
      }
    }
    vi.stubGlobal('ReadableStream', ThrowingReadableStream);

    const response = await GET(new NextRequest('http://127.0.0.1/api/download-status/stream'));
    const reader = response.body!.getReader();
    const result = await reader.read();
    expect(result.done).toBe(true);
  });

  it('tears down listeners and timers when enqueue fails before request abort', () => {
    expect(STREAM_ROUTE).toContain('let cleanedUp = false;');
    expect(STREAM_ROUTE).toContain('if (cleanedUp) return;');
    expect(STREAM_ROUTE).toContain('if (keepAlive) clearInterval(keepAlive);');
    expect(STREAM_ROUTE).toContain('unsubscribe?.();');
    expect(STREAM_ROUTE).toContain("req.signal.removeEventListener('abort', cleanup);");
    expect(STREAM_ROUTE).toMatch(/catch \{\s+aborted = true;\s+cleanup\(\);/);
  });
});
