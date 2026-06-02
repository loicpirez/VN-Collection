/**
 * Hermetic coverage for previously-untested GET routes:
 * producers, producer/[id], activity/kinds, stock/recent,
 * export/game-list, export/raw.
 *
 * `@/lib/vndb` is mocked at the function level (producer/[id] fetch fallback)
 * so no real token or network is used. Local fixtures are seeded through the
 * real DB layer with synthetic ids and torn down per test. Each case asserts
 * exactly one HTTP status plus a body assertion; authorized requests use host
 * 127.0.0.1 (the auth gate requires loopback).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as producersGET } from '@/app/api/producers/route';
import { GET as producerGET } from '@/app/api/producer/[id]/route';
import { GET as activityKindsGET } from '@/app/api/activity/kinds/route';
import { GET as stockRecentGET } from '@/app/api/stock/recent/route';
import { GET as gameListGET } from '@/app/api/export/game-list/route';
import { GET as rawGET } from '@/app/api/export/raw/route';
import { db, upsertProducer } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

const { fetchProducerMock } = vi.hoisted(() => ({ fetchProducerMock: vi.fn() }));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getProducer: fetchProducerMock };
});

const PRODUCER_ID = 'p90801';
const VN_ID = 'v90801';
const ACTIVITY_KIND = '__test_kind_route';

function loopbackReq(path: string): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, { headers: { host: '127.0.0.1' } });
}

function externalReq(path: string): Request {
  return new Request(`http://93.184.216.34${path}`, { headers: { host: '93.184.216.34' } });
}

beforeEach(() => {
  fetchProducerMock.mockReset();
  db.prepare('DELETE FROM producer WHERE id = ?').run(PRODUCER_ID);
});

afterEach(() => {
  db.prepare('DELETE FROM producer WHERE id = ?').run(PRODUCER_ID);
  db.prepare('DELETE FROM vn_stock_offer WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  db.prepare('DELETE FROM user_activity WHERE kind = ?').run(ACTIVITY_KIND);
});

describe('GET /api/producers', () => {
  it('403 from an external origin', async () => {
    const res = await producersGET(externalReq('/api/producers') as never);
    expect(res.status).toBe(403);
  });

  it('200 returning both producers and publishers arrays', async () => {
    const res = await producersGET(loopbackReq('/api/producers') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.producers)).toBe(true);
    expect(Array.isArray(body.publishers)).toBe(true);
  });
});

describe('GET /api/producer/[id]', () => {
  it('403 from an external origin', async () => {
    const res = await producerGET(externalReq('/api/producer/p1') as never, {
      params: Promise.resolve({ id: 'p1' }),
    });
    expect(res.status).toBe(403);
  });

  it('400 on a malformed producer id', async () => {
    const res = await producerGET(loopbackReq('/api/producer/v1') as never, {
      params: Promise.resolve({ id: 'v1' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('200 from the fresh local cache without touching VNDB', async () => {
    upsertProducer({ id: PRODUCER_ID, name: 'Studio X' });
    const res = await producerGET(loopbackReq(`/api/producer/${PRODUCER_ID}`) as never, {
      params: Promise.resolve({ id: PRODUCER_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.producer.id).toBe(PRODUCER_ID);
    expect(body.producer.name).toBe('Studio X');
    expect(fetchProducerMock).not.toHaveBeenCalled();
  });

  it('404 when uncached and VNDB has no such producer', async () => {
    fetchProducerMock.mockResolvedValue(null);
    const res = await producerGET(loopbackReq(`/api/producer/${PRODUCER_ID}`) as never, {
      params: Promise.resolve({ id: PRODUCER_ID }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });
});

describe('GET /api/activity/kinds', () => {
  it('403 from an external origin', async () => {
    const res = await activityKindsGET(externalReq('/api/activity/kinds') as never);
    expect(res.status).toBe(403);
  });

  it('200 surfacing a recorded distinct activity kind', async () => {
    recordActivity({ kind: ACTIVITY_KIND, entity: 'vn', entityId: VN_ID, label: 'seed' });
    const res = await activityKindsGET(loopbackReq('/api/activity/kinds') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kinds).toContain(ACTIVITY_KIND);
  });
});

describe('GET /api/stock/recent', () => {
  it('403 from an external origin', async () => {
    const res = await stockRecentGET(externalReq('/api/stock/recent') as never);
    expect(res.status).toBe(403);
  });

  it('200 returning the most recent stock offers joined with VN metadata', async () => {
    db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
      VN_ID,
      'Recent Title',
      Date.now(),
    );
    const now = Date.now();
    db.prepare(`
      INSERT OR REPLACE INTO vn_stock_offer (
        vn_id, provider, provider_offer_id, source, title, url, price, currency,
        availability, fetched_at, updated_at
      ) VALUES (?, 'surugaya', 'ro1', 'direct', 'Recent Title', 'https://example.test', 900, 'JPY', 'in_stock', ?, ?)
    `).run(VN_ID, now, now);

    const res = await stockRecentGET(loopbackReq('/api/stock/recent?limit=10') as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    const ours = body.offers.find((o: { vn_id: string }) => o.vn_id === VN_ID);
    expect(ours).toBeDefined();
    expect(ours.vn_title).toBe('Recent Title');
  });
});

describe('GET /api/export/game-list', () => {
  it('403 from an external origin', async () => {
    const res = await gameListGET(externalReq('/api/export/game-list'));
    expect(res.status).toBe(403);
  });

  it('200 plain-text attachment with one line per collected game', async () => {
    db.prepare('INSERT OR IGNORE INTO vn (id, title, released, fetched_at) VALUES (?, ?, ?, ?)').run(
      VN_ID,
      'List Title',
      '2021-05-01',
      Date.now(),
    );
    db.prepare(
      'INSERT OR IGNORE INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(VN_ID, 'finished', Date.now(), Date.now());

    const res = await gameListGET(loopbackReq('/api/export/game-list'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="vn-games-/);
    const text = await res.text();
    expect(text).toContain('List Title');
  });
});

describe('GET /api/export/raw', () => {
  it('403 from an external origin', async () => {
    const res = await rawGET(externalReq('/api/export/raw'));
    expect(res.status).toBe(403);
  });

  it('200 streaming the vndb cache as a parseable JSON document', async () => {
    const res = await rawGET(loopbackReq('/api/export/raw'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/application\/json/);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="vndb-raw-/);
    const parsed = JSON.parse(await res.text()) as {
      exported_at: number;
      entry_count: number;
      entries: unknown[];
    };
    expect(typeof parsed.exported_at).toBe('number');
    expect(Array.isArray(parsed.entries)).toBe(true);
  });
});
