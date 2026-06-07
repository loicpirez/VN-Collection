import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface RawCacheRow {
  body: string;
  cache_key: string;
  etag: string | null;
  expires_at: number;
  fetched_at: number;
  last_modified: string | null;
}

const mocks = vi.hoisted(() => ({
  iterate: vi.fn(),
  prepare: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: { prepare: mocks.prepare },
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

import { GET } from '@/app/api/export/raw/route';

function request(): Request {
  return new Request('http://127.0.0.1/api/export/raw');
}

function row(): RawCacheRow {
  return {
    body: '{"ok":true}',
    cache_key: 'test:raw',
    etag: null,
    expires_at: 2,
    fetched_at: 1,
    last_modified: null,
  };
}

function iteratorThatThrowsImmediately(): IterableIterator<RawCacheRow> {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      throw new Error('iterate failed');
    },
    return() {
      return { done: true, value: row() };
    },
  };
}

function iteratorThatThrowsAfterOne(onReturn: () => void): IterableIterator<RawCacheRow> {
  let yielded = false;
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      if (!yielded) {
        yielded = true;
        return { done: false, value: row() };
      }
      throw new Error('second row failed');
    },
    return() {
      onReturn();
      return { done: true, value: row() };
    },
  };
}

function emptyIterator(onReturn: () => void): IterableIterator<RawCacheRow> {
  return {
    [Symbol.iterator]() {
      return this;
    },
    next() {
      return { done: true, value: row() };
    },
    return() {
      onReturn();
      return { done: true, value: row() };
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.prepare.mockImplementation((sql: string) => {
    if (sql.includes('COUNT(*)')) {
      return { get: () => ({ n: 1 }) };
    }
    return { iterate: mocks.iterate };
  });
});

describe('GET /api/export/raw stream branches', () => {
  it('returns auth gate responses before preparing cache statements', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);

    const response = await GET(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(mocks.prepare).not.toHaveBeenCalled();
  });

  it('surfaces iterator failures through the response body stream', async () => {
    mocks.iterate.mockReturnValue(iteratorThatThrowsImmediately());

    const response = await GET(request());

    await expect(response.text()).rejects.toThrow('iterate failed');
  });

  it('calls iterator.return when the underlying stream cancellation hook runs', async () => {
    const onReturn = vi.fn();
    mocks.iterate.mockReturnValue(iteratorThatThrowsAfterOne(onReturn));
    const OriginalReadableStream = globalThis.ReadableStream;
    const capture: { cancel: (() => void | PromiseLike<void>) | null } = { cancel: null };
    class CapturingReadableStream {
      constructor(source?: UnderlyingSource<Uint8Array>, strategy?: QueuingStrategy<Uint8Array>) {
        capture.cancel = source?.cancel ? () => source.cancel?.() : null;
        return new OriginalReadableStream(source, strategy);
      }
    }
    vi.stubGlobal('ReadableStream', CapturingReadableStream);

    try {
      const response = await GET(request());
      await expect(response.text()).rejects.toThrow('second row failed');
      await capture.cancel?.();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(onReturn).toHaveBeenCalled();
  });

  it('ignores cancellation after the iterator has already completed', async () => {
    const onReturn = vi.fn();
    mocks.iterate.mockReturnValue(emptyIterator(onReturn));
    const OriginalReadableStream = globalThis.ReadableStream;
    const capture: { cancel: (() => void | PromiseLike<void>) | null } = { cancel: null };
    class CapturingReadableStream {
      constructor(source?: UnderlyingSource<Uint8Array>, strategy?: QueuingStrategy<Uint8Array>) {
        capture.cancel = source?.cancel ? () => source.cancel?.() : null;
        return new OriginalReadableStream(source, strategy);
      }
    }
    vi.stubGlobal('ReadableStream', CapturingReadableStream);

    try {
      const response = await GET(request());
      expect(await response.text()).toContain('"entries": [');
      await capture.cancel?.();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(onReturn).not.toHaveBeenCalled();
  });
});
