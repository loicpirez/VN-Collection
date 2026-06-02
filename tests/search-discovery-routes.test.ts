/**
 * Success-path coverage for the VNDB/EGS-backed discovery routes whose happy
 * paths were previously untested (existing suites only cover input-400 and
 * auth-403): search, search/advanced, search/textual, tags, traits, staff,
 * egs/search, maintenance/duplicates, maintenance/stale.
 *
 * Upstream functions in `@/lib/vndb` and `@/lib/erogamescape` are mocked at
 * the function level so no real token, host, or VN name is used.
 * `in_collection` lookups and textual search hit the real per-worker SQLite.
 * Authorized requests use host 127.0.0.1 (the auth gate requires loopback)
 * plus a distinct `x-forwarded-for` so the per-IP rate limiter stays
 * isolated. Each case asserts exactly one HTTP status plus a body assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as searchGET } from '@/app/api/search/route';
import { POST as advancedPOST } from '@/app/api/search/advanced/route';
import { GET as textualGET } from '@/app/api/search/textual/route';
import { GET as tagsGET } from '@/app/api/tags/route';
import { GET as traitsGET } from '@/app/api/traits/route';
import { GET as staffGET } from '@/app/api/staff/route';
import { GET as egsSearchGET } from '@/app/api/egs/search/route';
import { GET as duplicatesGET } from '@/app/api/maintenance/duplicates/route';
import { GET as staleGET } from '@/app/api/maintenance/stale/route';
import { addToCollection, db } from '@/lib/db';

const {
  searchVnMock,
  advancedSearchVnMock,
  searchTagsMock,
  searchTraitsMock,
  searchStaffMock,
  searchEgsCandidatesMock,
} = vi.hoisted(() => ({
  searchVnMock: vi.fn(),
  advancedSearchVnMock: vi.fn(),
  searchTagsMock: vi.fn(),
  searchTraitsMock: vi.fn(),
  searchStaffMock: vi.fn(),
  searchEgsCandidatesMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return {
    ...actual,
    searchVn: searchVnMock,
    advancedSearchVn: advancedSearchVnMock,
    searchTags: searchTagsMock,
    searchTraits: searchTraitsMock,
    searchStaff: searchStaffMock,
  };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return { ...actual, searchEgsCandidates: searchEgsCandidatesMock };
});

const VN_ID = 'v90501';

function loopback(path: string, fwd: string): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    headers: { host: '127.0.0.1', 'x-forwarded-for': fwd },
  });
}

function loopbackPost(path: string, fwd: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method: 'POST',
    headers: { host: '127.0.0.1', 'content-type': 'application/json', 'x-forwarded-for': fwd },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  searchVnMock.mockReset();
  advancedSearchVnMock.mockReset();
  searchTagsMock.mockReset();
  searchTraitsMock.mockReset();
  searchStaffMock.mockReset();
  searchEgsCandidatesMock.mockReset();
});

afterEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
});

describe('GET /api/search', () => {
  it('200 with empty results for a blank query (no upstream call)', async () => {
    const res = await searchGET(loopback('/api/search', '10.10.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [], more: false });
    expect(searchVnMock).not.toHaveBeenCalled();
  });

  it('200 annotating in_collection for matched results', async () => {
    db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
      VN_ID,
      'Owned Title',
      Date.now(),
    );
    addToCollection(VN_ID, { status: 'completed' });
    searchVnMock.mockResolvedValue({ results: [{ id: VN_ID, title: 'Owned Title' }], more: false });

    const res = await searchGET(loopback('/api/search?q=owned', '10.10.0.2'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].in_collection).toBe(true);
  });
});

describe('POST /api/search/advanced', () => {
  it('200 forwarding a validated sort param to the advanced search', async () => {
    advancedSearchVnMock.mockResolvedValue({ results: [], more: false });
    const res = await advancedPOST(
      loopbackPost('/api/search/advanced', '10.11.0.1', { q: 'abc', sort: 'rating', reverse: true }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [], more: false });
    expect(advancedSearchVnMock).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'abc', sort: 'rating', reverse: true }),
    );
  });

  it('200 annotating in_collection on advanced results', async () => {
    db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
      VN_ID,
      'Adv Title',
      Date.now(),
    );
    addToCollection(VN_ID, { status: 'playing' });
    advancedSearchVnMock.mockResolvedValue({ results: [{ id: VN_ID, title: 'Adv Title' }], more: true });

    const res = await advancedPOST(loopbackPost('/api/search/advanced', '10.11.0.2', { langs: ['ja'] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].in_collection).toBe(true);
    expect(body.more).toBe(true);
  });
});

describe('GET /api/search/textual', () => {
  it('200 returning hits from collection notes', async () => {
    db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
      VN_ID,
      'Noted Title',
      Date.now(),
    );
    addToCollection(VN_ID, { status: 'completed', notes: 'a uniquephrase appears here' });

    const res = await textualGET(loopback('/api/search/textual?q=uniquephrase', '10.12.0.1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hits.some((h: { vn_id: string }) => h.vn_id === VN_ID)).toBe(true);
  });
});

describe('GET /api/tags', () => {
  it('200 returning the tag search results', async () => {
    searchTagsMock.mockResolvedValue([{ id: 'g90', name: 'Tag X' }]);
    const res = await tagsGET(loopback('/api/tags?q=tag', '10.13.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tags: [{ id: 'g90', name: 'Tag X' }] });
  });

  it('502 when the upstream tag search throws', async () => {
    searchTagsMock.mockRejectedValue(new Error('vndb down'));
    const res = await tagsGET(loopback('/api/tags?q=tag', '10.13.0.2'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBeDefined();
  });
});

describe('GET /api/traits', () => {
  it('200 returning the trait search results', async () => {
    searchTraitsMock.mockResolvedValue([{ id: 'i90', name: 'Trait X' }]);
    const res = await traitsGET(loopback('/api/traits?q=trait', '10.14.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ traits: [{ id: 'i90', name: 'Trait X' }] });
  });
});

describe('GET /api/staff', () => {
  it('200 with an empty list for a blank query (no upstream call)', async () => {
    const res = await staffGET(loopback('/api/staff', '10.15.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staff: [] });
    expect(searchStaffMock).not.toHaveBeenCalled();
  });

  it('200 returning the staff search results', async () => {
    searchStaffMock.mockResolvedValue([{ id: 's90', name: 'Staff X' }]);
    const res = await staffGET(loopback('/api/staff?q=staff', '10.15.0.2'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ staff: [{ id: 's90', name: 'Staff X' }] });
  });
});

describe('GET /api/egs/search', () => {
  it('200 with empty candidates for a blank query (no upstream call)', async () => {
    const res = await egsSearchGET(loopback('/api/egs/search', '10.16.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: [] });
    expect(searchEgsCandidatesMock).not.toHaveBeenCalled();
  });

  it('200 returning the EGS candidate results', async () => {
    searchEgsCandidatesMock.mockResolvedValue([{ egs_id: 7, gamename: 'EGS X' }]);
    const res = await egsSearchGET(loopback('/api/egs/search?q=egs', '10.16.0.2'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ candidates: [{ egs_id: 7, gamename: 'EGS X' }] });
  });

  it('503 when EGS is unreachable', async () => {
    const { EgsUnreachable } = await import('@/lib/erogamescape');
    searchEgsCandidatesMock.mockRejectedValue(new EgsUnreachable('network', 'timeout', null));
    const res = await egsSearchGET(loopback('/api/egs/search?q=egs', '10.16.0.3'));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe('egs_unreachable');
    expect(body.candidates).toEqual([]);
  });
});

describe('GET /api/maintenance/* from loopback', () => {
  it('duplicates 200 with a groups array', async () => {
    const res = await duplicatesGET(loopback('/api/maintenance/duplicates', '10.17.0.1'));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).groups)).toBe(true);
  });

  it('stale 200 with a rows array', async () => {
    const res = await staleGET(loopback('/api/maintenance/stale', '10.17.0.2'));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).rows)).toBe(true);
  });
});
