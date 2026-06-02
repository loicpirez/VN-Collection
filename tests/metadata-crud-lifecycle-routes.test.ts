/**
 * Success-path (and 404/400) coverage for the pure-DB CRUD routes whose
 * happy paths were previously untested (existing suites only assert the
 * auth-403 and input-400 branches): series, series/[id],
 * series/[id]/vn/[vnId], lists, lists/[id], lists/[id]/items, reading-goal,
 * reading-queue, saved-filters, route/[routeId].
 *
 * All fixtures are seeded through the real DB layer with synthetic ids; no
 * network or token is involved. Authorized requests use host 127.0.0.1 (the
 * auth gate requires loopback). Each case asserts exactly one HTTP status
 * plus a body assertion.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as seriesGET, POST as seriesPOST } from '@/app/api/series/route';
import {
  GET as seriesIdGET,
  PATCH as seriesIdPATCH,
  DELETE as seriesIdDELETE,
} from '@/app/api/series/[id]/route';
import {
  POST as seriesVnPOST,
  DELETE as seriesVnDELETE,
} from '@/app/api/series/[id]/vn/[vnId]/route';
import { GET as listsGET, POST as listsPOST } from '@/app/api/lists/route';
import {
  GET as listIdGET,
  PATCH as listIdPATCH,
  DELETE as listIdDELETE,
} from '@/app/api/lists/[id]/route';
import {
  POST as listItemsPOST,
  DELETE as listItemsDELETE,
} from '@/app/api/lists/[id]/items/route';
import { GET as readingGoalGET, POST as readingGoalPOST } from '@/app/api/reading-goal/route';
import {
  GET as readingQueueGET,
  POST as readingQueuePOST,
  DELETE as readingQueueDELETE,
  PATCH as readingQueuePATCH,
} from '@/app/api/reading-queue/route';
import {
  GET as savedFiltersGET,
  POST as savedFiltersPOST,
  DELETE as savedFiltersDELETE,
  PATCH as savedFiltersPATCH,
} from '@/app/api/saved-filters/route';
import {
  GET as routeIdGET,
  PATCH as routeIdPATCH,
  DELETE as routeIdDELETE,
} from '@/app/api/route/[routeId]/route';
import { addToCollection, createRoute, db } from '@/lib/db';

const SERIES_NAME = '__test_crud_series';
const VN_A = 'v90601';
const VN_B = 'v90602';
const TEST_YEAR = 2099;

function loopback(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { host: '127.0.0.1', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function seedVnInCollection(id: string): void {
  db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
    id,
    `Title ${id}`,
    Date.now(),
  );
  addToCollection(id, { status: 'completed' });
}

afterEach(() => {
  db.prepare(`DELETE FROM series_vn WHERE series_id IN (SELECT id FROM series WHERE name LIKE '${SERIES_NAME}%')`).run();
  db.prepare(`DELETE FROM series WHERE name LIKE '${SERIES_NAME}%'`).run();
  db.prepare(`DELETE FROM user_list_vn WHERE list_id IN (SELECT id FROM user_list WHERE name LIKE '__test_crud_list%')`).run();
  db.prepare(`DELETE FROM user_list WHERE name LIKE '__test_crud_list%'`).run();
  db.prepare(`DELETE FROM saved_filter WHERE name LIKE '__test_crud_filter%'`).run();
  db.prepare('DELETE FROM reading_queue WHERE vn_id IN (?, ?)').run(VN_A, VN_B);
  db.prepare('DELETE FROM reading_goal WHERE year = ?').run(TEST_YEAR);
  db.prepare('DELETE FROM vn_route WHERE vn_id IN (?, ?)').run(VN_A, VN_B);
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(VN_A, VN_B);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(VN_A, VN_B);
});

describe('series CRUD lifecycle', () => {
  it('POST creates, GET reads, PATCH renames, DELETE removes a series', async () => {
    const created = await seriesPOST(loopback('/api/series', 'POST', { name: SERIES_NAME }));
    expect(created.status).toBe(200);
    const id = (await created.json()).series.id as number;

    const listed = await seriesGET();
    expect(listed.status).toBe(200);
    expect((await listed.json()).series.some((s: { id: number }) => s.id === id)).toBe(true);

    const read = await seriesIdGET(loopback(`/api/series/${id}`), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(read.status).toBe(200);
    expect((await read.json()).series.name).toBe(SERIES_NAME);

    const patched = await seriesIdPATCH(
      loopback(`/api/series/${id}`, 'PATCH', { name: `${SERIES_NAME}_renamed` }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).series.name).toBe(`${SERIES_NAME}_renamed`);

    const removed = await seriesIdDELETE(loopback(`/api/series/${id}`, 'DELETE'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
  });

  it('GET 404 for an unknown series id', async () => {
    const res = await seriesIdGET(loopback('/api/series/987654'), {
      params: Promise.resolve({ id: '987654' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('PATCH 404 for an unknown series id', async () => {
    const res = await seriesIdPATCH(loopback('/api/series/987654', 'PATCH', { name: 'x' }), {
      params: Promise.resolve({ id: '987654' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });
});

describe('series VN link/unlink', () => {
  it('POST links an owned VN and DELETE unlinks it', async () => {
    seedVnInCollection(VN_A);
    const created = await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_link` }));
    const sid = (await created.json()).series.id as number;

    const linked = await seriesVnPOST(
      loopback(`/api/series/${sid}/vn/${VN_A}`, 'POST', { order_index: 0 }),
      { params: Promise.resolve({ id: String(sid), vnId: VN_A }) },
    );
    expect(linked.status).toBe(200);
    const linkedBody = await linked.json();
    expect(linkedBody.added).toEqual([VN_A]);
    expect(linkedBody.series.vns.some((v: { id: string }) => v.id === VN_A)).toBe(true);

    const unlinked = await seriesVnDELETE(loopback(`/api/series/${sid}/vn/${VN_A}`, 'DELETE'), {
      params: Promise.resolve({ id: String(sid), vnId: VN_A }),
    });
    expect(unlinked.status).toBe(200);
    expect((await unlinked.json()).series.vns.some((v: { id: string }) => v.id === VN_A)).toBe(false);
  });

  it('POST 400 when the VN is not yet in the collection', async () => {
    const created = await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_nocol` }));
    const sid = (await created.json()).series.id as number;
    const res = await seriesVnPOST(loopback(`/api/series/${sid}/vn/${VN_B}`, 'POST', {}), {
      params: Promise.resolve({ id: String(sid), vnId: VN_B }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('add VN to collection first');
  });

  it('POST 404 when the series does not exist', async () => {
    const res = await seriesVnPOST(loopback(`/api/series/987654/vn/${VN_A}`, 'POST', {}), {
      params: Promise.resolve({ id: '987654', vnId: VN_A }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('series not found');
  });
});

describe('lists CRUD lifecycle', () => {
  it('POST creates, GET reads, PATCH pins, DELETE removes a list', async () => {
    const created = await listsPOST(
      loopback('/api/lists', 'POST', { name: '__test_crud_list', color: '#aabbcc', icon: 'Star' }),
    );
    expect(created.status).toBe(200);
    const id = (await created.json()).list.id as number;

    const listed = await listsGET();
    expect(listed.status).toBe(200);
    expect((await listed.json()).lists.some((l: { id: number }) => l.id === id)).toBe(true);

    const read = await listIdGET(loopback(`/api/lists/${id}`), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(read.status).toBe(200);
    const readBody = await read.json();
    expect(readBody.list.id).toBe(id);
    expect(Array.isArray(readBody.items)).toBe(true);

    const patched = await listIdPATCH(loopback(`/api/lists/${id}`, 'PATCH', { pinned: true }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(patched.status).toBe(200);
    expect((await patched.json()).list.pinned).toBeTruthy();

    const removed = await listIdDELETE(loopback(`/api/lists/${id}`, 'DELETE'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
  });

  it('GET 404 for an unknown list id', async () => {
    const res = await listIdGET(loopback('/api/lists/987654'), {
      params: Promise.resolve({ id: '987654' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });
});

describe('list items add/remove', () => {
  it('POST adds a VN and DELETE removes it', async () => {
    seedVnInCollection(VN_A);
    const created = await listsPOST(loopback('/api/lists', 'POST', { name: '__test_crud_list_items' }));
    const id = (await created.json()).list.id as number;

    const added = await listItemsPOST(loopback(`/api/lists/${id}/items`, 'POST', { vn_id: VN_A }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(added.status).toBe(200);
    expect((await added.json()).item.vn_id).toBe(VN_A);

    const removed = await listItemsDELETE(loopback(`/api/lists/${id}/items?vn=${VN_A}`, 'DELETE'), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
  });

  it('POST reorders members when given an order array', async () => {
    seedVnInCollection(VN_A);
    seedVnInCollection(VN_B);
    const created = await listsPOST(loopback('/api/lists', 'POST', { name: '__test_crud_list_order' }));
    const id = (await created.json()).list.id as number;
    await listItemsPOST(loopback(`/api/lists/${id}/items`, 'POST', { vn_id: VN_A }), {
      params: Promise.resolve({ id: String(id) }),
    });
    await listItemsPOST(loopback(`/api/lists/${id}/items`, 'POST', { vn_id: VN_B }), {
      params: Promise.resolve({ id: String(id) }),
    });

    const reordered = await listItemsPOST(
      loopback(`/api/lists/${id}/items`, 'POST', { order: [VN_B, VN_A] }),
      { params: Promise.resolve({ id: String(id) }) },
    );
    expect(reordered.status).toBe(200);
    expect(await reordered.json()).toEqual({ ok: true });
  });

  it('POST 404 when adding to an unknown list', async () => {
    const res = await listItemsPOST(loopback('/api/lists/987654/items', 'POST', { vn_id: VN_A }), {
      params: Promise.resolve({ id: '987654' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('list not found');
  });
});

describe('reading-goal GET/POST', () => {
  it('GET 200 returns the requested year shape', async () => {
    const res = await readingGoalGET(loopback(`/api/reading-goal?year=${TEST_YEAR}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.year).toBe(TEST_YEAR);
    expect(body).toHaveProperty('finished');
  });

  it('POST 200 upserts the year target', async () => {
    const res = await readingGoalPOST(
      loopback('/api/reading-goal', 'POST', { year: TEST_YEAR, target: 12 }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).goal.target).toBe(12);
  });
});

describe('reading-queue lifecycle', () => {
  it('POST adds, GET lists, PATCH reorders, DELETE removes', async () => {
    seedVnInCollection(VN_A);
    seedVnInCollection(VN_B);

    const addedA = await readingQueuePOST(loopback('/api/reading-queue', 'POST', { vn_id: VN_A }));
    expect(addedA.status).toBe(200);
    expect((await addedA.json()).entry.vn_id).toBe(VN_A);
    await readingQueuePOST(loopback('/api/reading-queue', 'POST', { vn_id: VN_B }));

    const listed = await readingQueueGET();
    expect(listed.status).toBe(200);
    expect((await listed.json()).entries.length).toBeGreaterThanOrEqual(2);

    const reordered = await readingQueuePATCH(
      loopback('/api/reading-queue', 'PATCH', { ids: [VN_B, VN_A] }),
    );
    expect(reordered.status).toBe(200);
    expect(await reordered.json()).toEqual({ ok: true });

    const removed = await readingQueueDELETE(loopback(`/api/reading-queue?vn_id=${VN_A}`, 'DELETE'));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
  });

  it('POST 400 when the VN is not in the collection', async () => {
    seedVnInCollection(VN_A);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_A);
    const res = await readingQueuePOST(loopback('/api/reading-queue', 'POST', { vn_id: VN_A }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('add VN to collection first');
  });

  it('DELETE 404 when the VN is not queued', async () => {
    const res = await readingQueueDELETE(loopback(`/api/reading-queue?vn_id=${VN_B}`, 'DELETE'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not in queue');
  });
});

describe('saved-filters lifecycle', () => {
  it('POST creates, GET lists, PATCH reorders, DELETE removes', async () => {
    const a = await savedFiltersPOST(
      loopback('/api/saved-filters', 'POST', { name: '__test_crud_filter_a', params: 'status=finished' }),
    );
    expect(a.status).toBe(200);
    const idA = (await a.json()).filter.id as number;
    const b = await savedFiltersPOST(
      loopback('/api/saved-filters', 'POST', { name: '__test_crud_filter_b', params: 'status=playing' }),
    );
    const idB = (await b.json()).filter.id as number;

    const listed = await savedFiltersGET();
    expect(listed.status).toBe(200);
    expect((await listed.json()).filters.length).toBeGreaterThanOrEqual(2);

    const reordered = await savedFiltersPATCH(
      loopback('/api/saved-filters', 'PATCH', { ids: [idB, idA] }),
    );
    expect(reordered.status).toBe(200);
    expect(await reordered.json()).toEqual({ ok: true });

    const removed = await savedFiltersDELETE(loopback(`/api/saved-filters?id=${idA}`, 'DELETE'));
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
  });

  it('DELETE 404 for an unknown filter id', async () => {
    const res = await savedFiltersDELETE(loopback('/api/saved-filters?id=987654', 'DELETE'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });
});

describe('route/[routeId] CRUD', () => {
  it('GET reads, PATCH updates completion, DELETE removes a route', async () => {
    seedVnInCollection(VN_A);
    const route = createRoute(VN_A, 'Route Alpha');

    const read = await routeIdGET(loopback(`/api/route/${route.id}`), {
      params: Promise.resolve({ routeId: String(route.id) }),
    });
    expect(read.status).toBe(200);
    expect((await read.json()).route.id).toBe(route.id);

    const patched = await routeIdPATCH(
      loopback(`/api/route/${route.id}`, 'PATCH', { completed: true, completed_date: '2099-01-02' }),
      { params: Promise.resolve({ routeId: String(route.id) }) },
    );
    expect(patched.status).toBe(200);
    expect((await patched.json()).route.completed).toBeTruthy();

    const removed = await routeIdDELETE(loopback(`/api/route/${route.id}`, 'DELETE'), {
      params: Promise.resolve({ routeId: String(route.id) }),
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
  });

  it('GET 404 for an unknown route id', async () => {
    const res = await routeIdGET(loopback('/api/route/987654'), {
      params: Promise.resolve({ routeId: '987654' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });
});
