import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRawCacheExport: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
}));

vi.mock('@/lib/db/raw-cache-export', () => ({
  createRawCacheExport: mocks.createRawCacheExport,
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

import { GET } from '@/app/api/export/raw/route';

function request(): Request {
  return new Request('http://127.0.0.1/api/export/raw');
}

function download(body = '{"entries":[]}'): {
  stream: ReadableStream<Uint8Array>;
  filename: string;
} {
  return {
    stream: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    filename: 'vndb-raw-2099-01-01.json',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.createRawCacheExport.mockResolvedValue(download());
});

describe('GET /api/export/raw', () => {
  it('returns auth gate responses before preparing an export', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(mocks.createRawCacheExport).not.toHaveBeenCalled();
  });

  it('streams a cache export with safe attachment headers', async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="vndb-raw-2099-01-01.json"',
    );
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await response.text()).toBe('{"entries":[]}');
  });

  it('returns a structured error without exposing setup details', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.createRawCacheExport.mockRejectedValue(new Error('private database detail'));

    const response = await GET(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'internal error',
      code: 'internal_error',
      context: 'export.raw.GET',
    });
    expect(error).toHaveBeenCalledWith('[internal:export.raw.GET] private database detail');
    error.mockRestore();
  });
});
