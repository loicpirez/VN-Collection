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
import { db, setVnPublishers, upsertProducer, upsertVn } from '@/lib/db';
import * as dbModule from '@/lib/db';
import { recordActivity } from '@/lib/activity';

const { fetchProducerMock } = vi.hoisted(() => ({ fetchProducerMock: vi.fn() }));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getProducer: fetchProducerMock };
});

const PRODUCER_ID = 'p90801';
const VN_ID = 'v90801';
const VN_ID_EMPTY_META = 'v90802';
const ACTIVITY_KIND = '__test_kind_route';
const RAW_CACHE_PREFIX = 'TEST export raw';

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
  db.prepare('DELETE FROM producer WHERE id IN (?, ?)').run('p90802', 'p90803');
  db.prepare('DELETE FROM producer WHERE id = ?').run(PRODUCER_ID);
  db.prepare('DELETE FROM vn_stock_offer WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_developer_index WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_developer_index WHERE vn_id = ?').run(VN_ID_EMPTY_META);
  db.prepare('DELETE FROM vn_publisher_index WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn_publisher_index WHERE vn_id = ?').run(VN_ID_EMPTY_META);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID_EMPTY_META);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID_EMPTY_META);
  db.prepare('DELETE FROM user_activity WHERE kind = ?').run(ACTIVITY_KIND);
  db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?').run(`${RAW_CACHE_PREFIX}%`);
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

  it('200 stores and returns a freshly fetched producer when the local cache is empty', async () => {
    fetchProducerMock.mockResolvedValue({ id: PRODUCER_ID, name: 'Fetched Studio' });
    const res = await producerGET(loopbackReq(`/api/producer/${PRODUCER_ID}`) as never, {
      params: Promise.resolve({ id: PRODUCER_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.producer.id).toBe(PRODUCER_ID);
    expect(body.producer.name).toBe('Fetched Studio');
    expect(fetchProducerMock).toHaveBeenCalledWith(PRODUCER_ID);
  });

  it('200 returns stale cached producer data when VNDB no longer returns it', async () => {
    upsertProducer({ id: PRODUCER_ID, name: 'Stale Studio' });
    db.prepare('UPDATE producer SET fetched_at = ? WHERE id = ?').run(1, PRODUCER_ID);
    fetchProducerMock.mockResolvedValue(null);
    const res = await producerGET(loopbackReq(`/api/producer/${PRODUCER_ID}`) as never, {
      params: Promise.resolve({ id: PRODUCER_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.producer.name).toBe('Stale Studio');
  });

  it('200 returns stale cached producer data with a warning when VNDB fetch fails', async () => {
    upsertProducer({ id: PRODUCER_ID, name: 'Warning Studio' });
    db.prepare('UPDATE producer SET fetched_at = ? WHERE id = ?').run(1, PRODUCER_ID);
    fetchProducerMock.mockRejectedValue(new Error('producer upstream down'));
    const res = await producerGET(loopbackReq(`/api/producer/${PRODUCER_ID}`) as never, {
      params: Promise.resolve({ id: PRODUCER_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.producer.name).toBe('Warning Studio');
    expect(body.warning).toBe('fetch failed; using cached data');
  });

  it('502 when uncached and VNDB fetch fails', async () => {
    fetchProducerMock.mockRejectedValue(new Error('producer upstream down'));
    const res = await producerGET(loopbackReq(`/api/producer/${PRODUCER_ID}`) as never, {
      params: Promise.resolve({ id: PRODUCER_ID }),
    });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream service unavailable');
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
    upsertVn({
      id: VN_ID,
      title: 'List Title',
      released: '2021-05-01',
      developers: [{ id: 'p90802', name: 'List Developer' }],
    });
    setVnPublishers(VN_ID, [{ id: 'p90803', name: 'List Publisher' }]);
    db.prepare(
      'INSERT OR IGNORE INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(VN_ID, 'finished', Date.now(), Date.now());
    upsertVn({ id: VN_ID_EMPTY_META, title: 'Metadata Empty Title' });
    db.prepare(
      'INSERT OR IGNORE INTO collection (vn_id, status, added_at, updated_at) VALUES (?, ?, ?, ?)',
    ).run(VN_ID_EMPTY_META, 'finished', Date.now(), Date.now());

    const res = await gameListGET(loopbackReq('/api/export/game-list'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/text\/plain/);
    expect(res.headers.get('Content-Disposition')).toMatch(/attachment; filename="vn-games-/);
    const text = await res.text();
    expect(text).toContain('List Title');
    expect(text).toContain('List Developer');
    expect(text).toContain('Metadata Empty Title');
  });

  it('500 with a sanitized body when archive listing fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listCollection').mockImplementation(() => {
      throw new Error('private game-list failure');
    });
    const res = await gameListGET(loopbackReq('/api/export/game-list'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:export.game-list.GET] private game-list failure');
    listSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('GET /api/export/raw', () => {
  it('403 from an external origin', async () => {
    const res = await rawGET(externalReq('/api/export/raw'));
    expect(res.status).toBe(403);
  });

  it('200 streaming the vndb cache as a parseable JSON document', async () => {
    const now = Date.now();
    db.prepare(
      'INSERT OR REPLACE INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(`${RAW_CACHE_PREFIX}:json`, JSON.stringify({ ok: true }), 'etag-json', null, now, now + 1000);
    db.prepare(
      'INSERT OR REPLACE INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(`${RAW_CACHE_PREFIX}:raw`, '{broken', null, 'last-modified', now, now + 1000);

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
    expect(parsed.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ cache_key: `${RAW_CACHE_PREFIX}:json`, body: { ok: true }, etag: 'etag-json' }),
        expect.objectContaining({ cache_key: `${RAW_CACHE_PREFIX}:raw`, body: '{broken', last_modified: 'last-modified' }),
      ]),
    );
  });
});
