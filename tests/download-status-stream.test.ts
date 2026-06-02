import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { GET } from '@/app/api/download-status/stream/route';

const STREAM_ROUTE = readFileSync(
  join(__dirname, '..', 'src/app/api/download-status/stream/route.ts'),
  'utf8',
);

describe('download-status SSE stream', () => {
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

  it('tears down listeners and timers when enqueue fails before request abort', () => {
    expect(STREAM_ROUTE).toContain('let cleanedUp = false;');
    expect(STREAM_ROUTE).toContain('if (cleanedUp) return;');
    expect(STREAM_ROUTE).toContain('if (keepAlive) clearInterval(keepAlive);');
    expect(STREAM_ROUTE).toContain('unsubscribe?.();');
    expect(STREAM_ROUTE).toContain("req.signal.removeEventListener('abort', cleanup);");
    expect(STREAM_ROUTE).toMatch(/catch \{\s+aborted = true;\s+cleanup\(\);/);
  });
});
