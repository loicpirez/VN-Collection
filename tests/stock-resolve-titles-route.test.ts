/**
 * TESTA-019 — GET /api/stock/resolve-titles bounds + LIKE-escape contract.
 *
 * The route resolves each `q` against the local `vn` table with an escaped
 * LIKE pattern (so `%`/`_` are matched literally, never as SQL wildcards),
 * slices the incoming `q` list to MAX_TITLES=50, clamps each query, and
 * returns `{}` for the empty-query path. VNDB / EGS upstream lookups are
 * mocked away so an unmatched query never touches the network. Each test
 * uses a distinct `x-forwarded-for` value so the per-IP rate-limit bucket
 * is isolated regardless of test order.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/stock/resolve-titles/route';
import { db } from '@/lib/db';

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, searchVn: vi.fn(async () => null) };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return { ...actual, searchEgsByName: vi.fn(async () => null) };
});

const PERCENT_LITERAL = 'v980201';
const PERCENT_DECOY = 'v980202';
const UNDERSCORE_LITERAL = 'v980203';
const UNDERSCORE_DECOY = 'v980204';
const BULK_PREFIX = 'v98030';
const BULK_IDS = Array.from({ length: 60 }, (_, i) => `${BULK_PREFIX}${String(i).padStart(2, '0')}`);
const SEEDED_IDS = [PERCENT_LITERAL, PERCENT_DECOY, UNDERSCORE_LITERAL, UNDERSCORE_DECOY, ...BULK_IDS];

function seedVn(id: string, title: string): void {
  db.prepare(
    `INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title`,
  ).run(id, title, Date.now());
}

function makeReq(query: string, fwd: string): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/stock/resolve-titles${query}`, {
    headers: { 'x-forwarded-for': fwd },
  });
}

beforeAll(() => {
  seedVn(PERCENT_LITERAL, 'zzz a%b literal');
  seedVn(PERCENT_DECOY, 'aaa axxb decoy');
  seedVn(UNDERSCORE_LITERAL, 'zzz a_b literal');
  seedVn(UNDERSCORE_DECOY, 'aaa axb decoy');
  BULK_IDS.forEach((id, i) => seedVn(id, `bulk title ${String(i).padStart(2, '0')}`));
});

afterAll(() => {
  const placeholders = SEEDED_IDS.map(() => '?').join(', ');
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...SEEDED_IDS);
});

describe('GET /api/stock/resolve-titles', () => {
  it('returns {} for the empty-query path', async () => {
    const res = await GET(makeReq('', '10.0.0.1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it('escapes a % so it is matched literally, not as a wildcard', async () => {
    const res = await GET(makeReq('?q=a%25b', '10.0.0.2'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, { vnId: string; title: string } | null>;
    expect(body['a%b']?.vnId).toBe(PERCENT_LITERAL);
    expect(body['a%b']?.vnId).not.toBe(PERCENT_DECOY);
  });

  it('escapes an _ so it is matched literally, not as a single-char wildcard', async () => {
    const res = await GET(makeReq('?q=a_b', '10.0.0.3'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, { vnId: string; title: string } | null>;
    expect(body['a_b']?.vnId).toBe(UNDERSCORE_LITERAL);
    expect(body['a_b']?.vnId).not.toBe(UNDERSCORE_DECOY);
  });

  it('truncates more than 50 q params down to the first 50', async () => {
    const query = `?${BULK_IDS.map((_, i) => `q=bulk+title+${String(i).padStart(2, '0')}`).join('&')}`;
    const res = await GET(makeReq(query, '10.0.0.4'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toHaveLength(50);
    expect(body['bulk title 49']).toBeDefined();
    expect(body['bulk title 50']).toBeUndefined();
  });
});
