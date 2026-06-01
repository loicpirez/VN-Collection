import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/vndb', () => ({
  searchVn: vi.fn().mockImplementation((q: string) => {
    vndbLastQuery = q;
    return Promise.resolve({ results: [], more: false });
  }),
  searchStaff: vi.fn().mockImplementation((q: string) => {
    staffLastQuery = q;
    return Promise.resolve([]);
  }),
  searchTags: vi.fn().mockImplementation((q: string, opts: { results?: number; category?: string }) => {
    tagsLastQuery = q;
    tagsLastOptions = opts;
    return Promise.resolve([]);
  }),
  searchTraits: vi.fn().mockImplementation((q: string, opts: { results?: number }) => {
    traitsLastQuery = q;
    traitsLastOptions = opts;
    return Promise.resolve([]);
  }),
}));

vi.mock('@/lib/erogamescape', () => ({
  EgsUnreachable: class EgsUnreachable extends Error {
    constructor(msg: string, public kind?: string, public status?: number) {
      super(msg);
    }
  },
  searchEgsCandidates: vi.fn().mockImplementation((q: string, limit?: number) => {
    egsLastQuery = q;
    egsLastLimit = limit;
    return Promise.resolve([]);
  }),
}));

let vndbLastQuery = '';
let staffLastQuery = '';
let tagsLastQuery = '';
let tagsLastOptions: { results?: number; category?: string } = {};
let traitsLastQuery = '';
let traitsLastOptions: { results?: number } = {};
let egsLastQuery = '';
let egsLastLimit: number | undefined;

import { GET as searchGET } from '@/app/api/search/route';
import { GET as egsSearchGET } from '@/app/api/egs/search/route';
import { GET as staffGET } from '@/app/api/staff/route';
import { GET as tagsGET } from '@/app/api/tags/route';
import { GET as traitsGET } from '@/app/api/traits/route';
import { PATCH as savedFiltersPATCH } from '@/app/api/saved-filters/route';
import { PATCH as shelvesPATCH } from '@/app/api/shelves/route';
import { PATCH as collectionOrderPATCH } from '@/app/api/collection/order/route';
import { PATCH as readingQueuePATCH } from '@/app/api/reading-queue/route';

// Use the host directly — requireLocalhostOrToken inspects the URL host
// (127.0.0.1 → loopback, anything else → external), not a header.
function loopbackReq(url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }): NextRequest {
  return new NextRequest(url.replace('http://localhost', 'http://127.0.0.1'), init);
}

function patchReq(url: string, body: unknown): NextRequest {
  return loopbackReq(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('S-046: search query length caps', () => {
  const HUGE_Q = 'a'.repeat(50_000);

  it('GET /api/search truncates oversized q', async () => {
    const r = await searchGET(loopbackReq(`http://localhost/api/search?q=${encodeURIComponent(HUGE_Q)}`));
    expect(r.status).toBe(200);
    // searchVn is invoked with the truncated string, not the 50k-char input.
    expect(vndbLastQuery.length).toBeLessThanOrEqual(200);
  });

  it('GET /api/egs/search truncates oversized q', async () => {
    const r = await egsSearchGET(loopbackReq(`http://localhost/api/egs/search?q=${encodeURIComponent(HUGE_Q)}`));
    expect(r.status).toBe(200);
    expect(egsLastQuery.length).toBeLessThanOrEqual(200);
  });

  it('GET /api/egs/search rejects fractional result limits', async () => {
    const r = await egsSearchGET(loopbackReq('http://localhost/api/egs/search?q=foo&limit=12.5'));
    expect(r.status).toBe(200);
    expect(egsLastLimit).toBe(20);
  });

  it('GET /api/egs/search rejects suffixed result limits', async () => {
    const r = await egsSearchGET(loopbackReq('http://localhost/api/egs/search?q=foo&limit=12junk'));
    expect(r.status).toBe(200);
    expect(egsLastLimit).toBe(20);
  });

  it('GET /api/staff truncates oversized q', async () => {
    const r = await staffGET(loopbackReq(`http://localhost/api/staff?q=${encodeURIComponent(HUGE_Q)}`));
    expect(r.status).toBe(200);
    expect(staffLastQuery.length).toBeLessThanOrEqual(200);
  });

  it('GET /api/tags clamps q and results', async () => {
    const r = await tagsGET(
      loopbackReq(`http://localhost/api/tags?q=${encodeURIComponent(HUGE_Q)}&results=99999&category=${'x'.repeat(100)}`),
    );
    expect(r.status).toBe(200);
    expect(tagsLastQuery.length).toBeLessThanOrEqual(200);
    expect(tagsLastOptions.results).toBeLessThanOrEqual(200);
    expect((tagsLastOptions.category ?? '').length).toBeLessThanOrEqual(32);
  });

  it('GET /api/traits clamps q and results', async () => {
    const r = await traitsGET(
      loopbackReq(`http://localhost/api/traits?q=${encodeURIComponent(HUGE_Q)}&results=99999`),
    );
    expect(r.status).toBe(200);
    expect(traitsLastQuery.length).toBeLessThanOrEqual(200);
    expect(traitsLastOptions.results).toBeLessThanOrEqual(200);
  });

  it('GET /api/traits with garbage results param falls back to default', async () => {
    const r = await traitsGET(loopbackReq('http://localhost/api/traits?q=foo&results=NaN'));
    expect(r.status).toBe(200);
    // 50 is the documented default; the helper must never forward NaN.
    expect(traitsLastOptions.results).toBe(50);
  });

  it('GET /api/tags with fractional results param falls back to default', async () => {
    const r = await tagsGET(loopbackReq('http://localhost/api/tags?q=foo&results=12.5'));
    expect(r.status).toBe(200);
    expect(tagsLastOptions.results).toBe(50);
  });

  it('GET /api/traits with suffixed results param falls back to default', async () => {
    const r = await traitsGET(loopbackReq('http://localhost/api/traits?q=foo&results=12junk'));
    expect(r.status).toBe(200);
    expect(traitsLastOptions.results).toBe(50);
  });
});

describe('S-047/S-048/S-049/S-050/S-052: array-length caps on reorder PATCH', () => {
  it('PATCH /api/saved-filters rejects > 500 ids', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => i + 1);
    const r = await savedFiltersPATCH(patchReq('http://localhost/api/saved-filters', { ids }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/saved-filters rejects non-positive integers', async () => {
    const r = await savedFiltersPATCH(patchReq('http://localhost/api/saved-filters', { ids: [1, 2, -3] }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/saved-filters rejects non-integer numbers', async () => {
    const r = await savedFiltersPATCH(patchReq('http://localhost/api/saved-filters', { ids: [1, 2.5] }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/saved-filters rejects duplicate ids', async () => {
    const r = await savedFiltersPATCH(patchReq('http://localhost/api/saved-filters', { ids: [1, 1] }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/shelves rejects > 500 ids', async () => {
    const order = Array.from({ length: 501 }, (_, i) => i + 1);
    const r = await shelvesPATCH(patchReq('http://localhost/api/shelves', { order }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/shelves rejects zero / negative ids', async () => {
    const r = await shelvesPATCH(patchReq('http://localhost/api/shelves', { order: [0, 1] }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/shelves rejects duplicate ids', async () => {
    const r = await shelvesPATCH(patchReq('http://localhost/api/shelves', { order: [1, 1] }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/collection/order rejects > 50000 ids', async () => {
    const ids = Array.from({ length: 50_001 }, (_, i) => `v${i + 1}`);
    const r = await collectionOrderPATCH(patchReq('http://localhost/api/collection/order', { ids }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/reading-queue rejects > 1000 ids', async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `v${i + 1}`);
    const r = await readingQueuePATCH(patchReq('http://localhost/api/reading-queue', { ids }));
    expect(r.status).toBe(400);
  });

  it('PATCH /api/reading-queue rejects duplicate VN ids after normalization', async () => {
    const r = await readingQueuePATCH(patchReq('http://localhost/api/reading-queue', { ids: ['v1', 'V1'] }));
    expect(r.status).toBe(400);
  });
});
