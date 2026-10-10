/**
 * Execute the global-refresh HTTP handler with real SQLite repositories,
 * release decoders, and read-through cache. Only unrelated fan-outs and the
 * upstream transport are stubbed. Pin cold-fill, forced revalidation, and
 * preservation of valid release metadata during an upstream outage.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(),
}));

vi.mock('@/lib/vndb-throttle', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/vndb-throttle')>(),
  throttledFetch: fetchMock,
}));

vi.mock('@/lib/vndb', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/vndb')>(),
  getGlobalStats: vi.fn(async () => ({ vn: 1 })),
  getAuthInfo: vi.fn(async () => null),
  getSchema: vi.fn(async () => ({})),
  searchTags: vi.fn(async () => []),
  searchTraits: vi.fn(async () => []),
}));

vi.mock('@/lib/erogamescape', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/erogamescape')>(),
  fetchEgsAnticipated: vi.fn(async () => []),
  fetchEgsTopRanked: vi.fn(async () => []),
}));

vi.mock('@/lib/top-ranked', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/top-ranked')>(),
  fetchVndbTopRanked: vi.fn(async () => []),
}));

vi.mock('@/lib/upcoming', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/upcoming')>(),
  fetchAllUpcomingFromVndb: vi.fn(async () => []),
  fetchUpcomingForCollection: vi.fn(async () => []),
}));

import { POST } from '@/app/api/refresh/global/route';
import { addToCollection, db, getReleaseMeta, listShelves, putCacheRow, setAppSetting } from '@/lib/db';
import { getReleasesForVn } from '@/lib/vndb';
import { vndbReleaseFixture } from './fixtures/vndb-release';

listShelves();
const IDS = ['v90600', 'v90601', 'v90602'];

function releaseId(vnId: string): string {
  return `r${vnId.slice(1)}1`;
}

function releaseResponse(vnId: string, title: string, platform: string): Response {
  return new Response(JSON.stringify({
    results: [vndbReleaseFixture({
      id: releaseId(vnId), title, platforms: [platform],
      languages: [{ lang: 'ja' }], vns: [{ id: vnId }],
    })], more: false,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function requestVn(init?: RequestInit): string {
  if (typeof init?.body !== 'string') throw new Error('Expected a release request body');
  const body = init.body;
  const id = IDS.find((candidate) => body.includes(`"${candidate}"`));
  if (!id) throw new Error('Unexpected release request');
  return id;
}

async function refresh(): Promise<{ done: number; failed: number; total: number }> {
  const response = await POST(new NextRequest('http://127.0.0.1/api/refresh/global', {
    method: 'POST', headers: { host: '127.0.0.1' },
  }));
  expect(response.status).toBe(200);
  return response.json();
}

beforeEach(() => {
  db.exec('DELETE FROM owned_release; DELETE FROM release_meta_cache; DELETE FROM collection; DELETE FROM vn; DELETE FROM vndb_cache;');
  setAppSetting('vndb_backup_enabled', null);
  fetchMock.mockReset();
  for (const id of IDS) {
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(id, id, Date.now());
    addToCollection(id, {});
  }
});

describe('global refresh retains and refills release caches', () => {
  it('fills all three cold collection release caches before materializing metadata', async () => {
    fetchMock.mockImplementation(async (_url, init) => releaseResponse(requestVn(init), 'cold title', 'swi'));

    const result = await refresh();

    expect(result.failed).toBe(0);
    expect(result.done).toBe(result.total);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    for (const id of IDS) {
      expect(getReleaseMeta(releaseId(id))).toMatchObject({ title: 'cold title', platforms: ['swi'] });
      expect(await getReleasesForVn(id, 100)).toHaveLength(1);
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('revalidates fresh rows while preserving unrelated producers, covers, and metadata', async () => {
    fetchMock.mockImplementation(async (_url, init) => releaseResponse(requestVn(init), 'stale title', 'win'));
    await refresh();
    putCacheRow({ cache_key: 'POST /producer|POST|unrelated', body: '{}', etag: null, last_modified: null, fetched_at: 1, expires_at: Date.now() + 60000 });
    putCacheRow({ cache_key: 'egs:cover-resolved:900001', body: '[]', etag: null, last_modified: null, fetched_at: 1, expires_at: Date.now() + 60000 });
    db.prepare('INSERT INTO release_meta_cache (release_id, vn_id, title, platforms, languages, fetched_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run('r906991', 'v90699', 'unrelated title', '["psv"]', '[]', 1);
    fetchMock.mockImplementation(async (_url, init) => releaseResponse(requestVn(init), 'fresh title', 'swi'));

    const result = await refresh();

    expect(result.failed).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(6);
    for (const id of IDS) expect(getReleaseMeta(releaseId(id))).toMatchObject({ title: 'fresh title', platforms: ['swi'] });
    expect(getReleaseMeta('r906991')).toMatchObject({ title: 'unrelated title', platforms: ['psv'] });
    expect(db.prepare('SELECT cache_key FROM vndb_cache WHERE cache_key = ?').get('POST /producer|POST|unrelated')).toBeDefined();
    expect(db.prepare('SELECT cache_key FROM vndb_cache WHERE cache_key = ?').get('egs:cover-resolved:900001')).toBeDefined();
  });

  it('retains three valid cached snapshots and their timestamps on refresh failure', async () => {
    fetchMock.mockImplementation(async (_url, init) => releaseResponse(requestVn(init), 'retained title', 'win'));
    await refresh();
    const before = db.prepare("SELECT cache_key, body, fetched_at, expires_at FROM vndb_cache WHERE cache_key LIKE 'POST /release|%' ORDER BY cache_key").all();
    fetchMock.mockRejectedValue(new Error('upstream unavailable'));

    await refresh();

    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(db.prepare("SELECT cache_key, body, fetched_at, expires_at FROM vndb_cache WHERE cache_key LIKE 'POST /release|%' ORDER BY cache_key").all()).toEqual(before);
    for (const id of IDS) expect(getReleaseMeta(releaseId(id))).toMatchObject({ title: 'retained title', platforms: ['win'] });
  });

  it('continues after one cold upstream failure and reports the failed task', async () => {
    fetchMock.mockImplementation(async (_url, init) => {
      const id = requestVn(init);
      if (id === IDS[0]) throw new Error('upstream unavailable');
      return releaseResponse(id, 'available title', 'swi');
    });

    const result = await refresh();

    expect(result.failed).toBe(1);
    expect(result.done).toBe(result.total - 1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getReleaseMeta(releaseId(IDS[0]))).toBeNull();
    for (const id of IDS.slice(1)) expect(getReleaseMeta(releaseId(id))).toMatchObject({ title: 'available title', platforms: ['swi'] });
  });
});
