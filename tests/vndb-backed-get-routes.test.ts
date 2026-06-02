/**
 * Hermetic coverage for the thin VNDB-backed GET routes that previously had
 * no test importing them: character/[id], release/[id], vndb/stats,
 * vndb/auth, tags/web-tree, vndb/quote/random.
 *
 * The single upstream surface (`@/lib/vndb` and `@/lib/vndb-tag-web-cache`)
 * is mocked at the function level so no real token, host, or VN name is
 * involved. Every authorized request uses host 127.0.0.1 (the auth gate
 * requires loopback) plus a distinct `x-forwarded-for` so the per-IP rate
 * limiter on quote/random stays isolated regardless of test order. Each
 * case asserts exactly one HTTP status plus a body assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as characterGET } from '@/app/api/character/[id]/route';
import { GET as releaseGET } from '@/app/api/release/[id]/route';
import { GET as statsGET } from '@/app/api/vndb/stats/route';
import { GET as authGET } from '@/app/api/vndb/auth/route';
import { GET as tagTreeGET } from '@/app/api/tags/web-tree/route';
import { GET as quoteGET } from '@/app/api/vndb/quote/random/route';
import { db, setAppSetting } from '@/lib/db';

const {
  getCharacterMock,
  getReleaseMock,
  getGlobalStatsMock,
  getAuthInfoMock,
  getRandomQuoteMock,
  getTreeMock,
} = vi.hoisted(() => ({
  getCharacterMock: vi.fn(),
  getReleaseMock: vi.fn(),
  getGlobalStatsMock: vi.fn(),
  getAuthInfoMock: vi.fn(),
  getRandomQuoteMock: vi.fn(),
  getTreeMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return {
    ...actual,
    getCharacter: getCharacterMock,
    getRelease: getReleaseMock,
    getGlobalStats: getGlobalStatsMock,
    getAuthInfo: getAuthInfoMock,
    getRandomQuote: getRandomQuoteMock,
  };
});

vi.mock('@/lib/vndb-tag-web-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-tag-web-cache')>();
  return { ...actual, getVndbTagHomeTree: getTreeMock };
});

function loopbackReq(path: string, fwd: string): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    headers: { host: '127.0.0.1', 'x-forwarded-for': fwd },
  });
}

function externalReq(path: string): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`);
}

beforeEach(() => {
  getCharacterMock.mockReset();
  getReleaseMock.mockReset();
  getGlobalStatsMock.mockReset();
  getAuthInfoMock.mockReset();
  getRandomQuoteMock.mockReset();
  getTreeMock.mockReset();
});

describe('GET /api/character/[id]', () => {
  it('403 from an external origin', async () => {
    const res = await characterGET(externalReq('/api/character/c9001'), {
      params: Promise.resolve({ id: 'c9001' }),
    });
    expect(res.status).toBe(403);
  });

  it('400 on a malformed character id', async () => {
    const res = await characterGET(loopbackReq('/api/character/bad', '10.1.0.1'), {
      params: Promise.resolve({ id: 'bad' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('404 when the character is not found upstream', async () => {
    getCharacterMock.mockResolvedValue(null);
    const res = await characterGET(loopbackReq('/api/character/c9002', '10.1.0.2'), {
      params: Promise.resolve({ id: 'c9002' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('200 with the character payload on success', async () => {
    getCharacterMock.mockResolvedValue({ id: 'c9003', name: 'Heroine A' });
    const res = await characterGET(loopbackReq('/api/character/c9003', '10.1.0.3'), {
      params: Promise.resolve({ id: 'c9003' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ character: { id: 'c9003', name: 'Heroine A' } });
  });
});

describe('GET /api/release/[id]', () => {
  it('403 from an external origin', async () => {
    const res = await releaseGET(externalReq('/api/release/r9001'), {
      params: Promise.resolve({ id: 'r9001' }),
    });
    expect(res.status).toBe(403);
  });

  it('400 on a malformed release id', async () => {
    const res = await releaseGET(loopbackReq('/api/release/v9001', '10.2.0.1'), {
      params: Promise.resolve({ id: 'v9001' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('404 when the release is not found upstream', async () => {
    getReleaseMock.mockResolvedValue(null);
    const res = await releaseGET(loopbackReq('/api/release/r9002', '10.2.0.2'), {
      params: Promise.resolve({ id: 'r9002' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('200 with the release payload on success', async () => {
    getReleaseMock.mockResolvedValue({ id: 'r9003', title: 'Edition X' });
    const res = await releaseGET(loopbackReq('/api/release/r9003', '10.2.0.3'), {
      params: Promise.resolve({ id: 'r9003' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ release: { id: 'r9003', title: 'Edition X' } });
  });
});

describe('GET /api/vndb/stats', () => {
  it('403 from an external origin', async () => {
    const res = await statsGET(externalReq('/api/vndb/stats'));
    expect(res.status).toBe(403);
  });

  it('502 when the upstream stats call throws', async () => {
    getGlobalStatsMock.mockRejectedValue(new Error('vndb down'));
    const res = await statsGET(loopbackReq('/api/vndb/stats', '10.3.0.1'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBeDefined();
  });

  it('200 with the global stats on success', async () => {
    getGlobalStatsMock.mockResolvedValue({ vn: 42, release: 7 });
    const res = await statsGET(loopbackReq('/api/vndb/stats', '10.3.0.2'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stats: { vn: 42, release: 7 } });
  });
});

describe('GET /api/vndb/auth', () => {
  it('403 from an external origin', async () => {
    const res = await authGET(externalReq('/api/vndb/auth'));
    expect(res.status).toBe(403);
  });

  it('200 with authenticated:false when no token info is available', async () => {
    getAuthInfoMock.mockResolvedValue(null);
    const res = await authGET(loopbackReq('/api/vndb/auth', '10.4.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it('200 with the merged auth info on success', async () => {
    getAuthInfoMock.mockResolvedValue({ username: 'tester', permissions: ['listread'] });
    const res = await authGET(loopbackReq('/api/vndb/auth', '10.4.0.2'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      username: 'tester',
      permissions: ['listread'],
    });
  });
});

describe('GET /api/tags/web-tree', () => {
  it('403 from an external origin', async () => {
    const res = await tagTreeGET(externalReq('/api/tags/web-tree'));
    expect(res.status).toBe(403);
  });

  it('200 with the cached tree on success', async () => {
    getTreeMock.mockResolvedValue({ groups: [], fetchedAt: 123 });
    const res = await tagTreeGET(loopbackReq('/api/tags/web-tree', '10.5.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groups: [], fetchedAt: 123 });
  });

  it('forwards ?force=1 to the cache helper', async () => {
    getTreeMock.mockResolvedValue({ groups: [] });
    await tagTreeGET(loopbackReq('/api/tags/web-tree?force=1', '10.5.0.2'));
    expect(getTreeMock).toHaveBeenCalledWith({ force: true });
  });
});

describe('GET /api/vndb/quote/random', () => {
  it('403 from an external origin', async () => {
    const res = await quoteGET(externalReq('/api/vndb/quote/random'));
    expect(res.status).toBe(403);
  });

  it('200 with the enriched VNDB quote on the default (all) source', async () => {
    setAppSetting('random_quote_source', 'all');
    getRandomQuoteMock.mockResolvedValue({
      id: 'q1',
      quote: 'a line',
      score: 5,
      vn: { id: 'v90991', title: 'Title X' },
      character: null,
    });
    const res = await quoteGET(loopbackReq('/api/vndb/quote/random', '10.6.0.1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('all');
    expect(body.quote.id).toBe('q1');
  });

  it('200 reading from the local mirror when source=mine', async () => {
    setAppSetting('random_quote_source', 'mine');
    db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
      'v90992',
      'Local Title',
      Date.now(),
    );
    db.prepare(
      'INSERT OR IGNORE INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run('v90992', 'finished', Date.now(), Date.now());
    db.prepare(
      'INSERT OR REPLACE INTO vn_quote (quote_id, vn_id, quote, score, fetched_at) VALUES (?, ?, ?, ?, ?)',
    ).run('lq1', 'v90992', 'local line', 9, Date.now());

    const res = await quoteGET(loopbackReq('/api/vndb/quote/random', '10.6.0.2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe('mine');
    expect(body.quote.vn.id).toBe('v90992');
    expect(getRandomQuoteMock).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  db.prepare('DELETE FROM vn_quote WHERE vn_id IN (?, ?)').run('v90991', 'v90992');
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run('v90991', 'v90992');
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run('v90991', 'v90992');
  setAppSetting('random_quote_source', 'all');
});
