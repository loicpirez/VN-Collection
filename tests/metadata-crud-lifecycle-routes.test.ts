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
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import * as dbModule from '@/lib/db';
import * as activityModule from '@/lib/activity';

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

  it('GET 400 for a malformed series id', async () => {
    const res = await seriesIdGET(loopback('/api/series/bad'), {
      params: Promise.resolve({ id: 'bad' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('POST validates names and descriptions and reports create failures', async () => {
    expect((await seriesPOST(loopback('/api/series', 'POST', { name: '' }))).status).toBe(400);
    expect((await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_bad_desc`, description: { text: 'bad' } }))).status).toBe(400);

    const createdWithDescription = await seriesPOST(
      loopback('/api/series', 'POST', { name: `${SERIES_NAME}_desc`, description: 'Series description' }),
    );
    expect(createdWithDescription.status).toBe(200);
    expect((await createdWithDescription.json()).series.description).toBe('Series description');

    const createSpy = vi.spyOn(dbModule, 'createSeries').mockImplementation(() => {
      throw new Error('create failed privately');
    });
    const failed = await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_fail` }));
    expect(failed.status).toBe(400);
    expect(await failed.json()).toEqual({ error: 'create failed' });
    createSpy.mockRestore();
  });

  it('POST succeeds when series creation activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('series activity failed');
    });

    const res = await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_activity_fail` }));

    expect(res.status).toBe(200);
    expect((await res.json()).series.name).toBe(`${SERIES_NAME}_activity_fail`);
    expect(consoleSpy).toHaveBeenCalledWith('[series:create] activity log failed:', 'series activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('PATCH 404 for an unknown series id', async () => {
    const res = await seriesIdPATCH(loopback('/api/series/987654', 'PATCH', { name: 'x' }), {
      params: Promise.resolve({ id: '987654' }),
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });

  it('PATCH validates and applies all optional series fields', async () => {
    const created = await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_fields` }));
    const id = (await created.json()).series.id as number;

    expect((await seriesIdPATCH(loopback('/api/series/bad', 'PATCH', {}), { params: Promise.resolve({ id: 'bad' }) })).status).toBe(400);
    expect((await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { name: '' }), { params: Promise.resolve({ id: String(id) }) })).status).toBe(400);
    expect((await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { description: { text: 'bad' } }), { params: Promise.resolve({ id: String(id) }) })).status).toBe(400);
    expect((await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { cover_path: { path: 'bad' } }), { params: Promise.resolve({ id: String(id) }) })).status).toBe(400);
    expect((await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { cover_path: 'x'.repeat(201) }), { params: Promise.resolve({ id: String(id) }) })).status).toBe(400);
    expect((await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { cover_path: '../bad.png' }), { params: Promise.resolve({ id: String(id) }) })).status).toBe(400);
    expect((await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { banner_path: '../bad.png' }), { params: Promise.resolve({ id: String(id) }) })).status).toBe(400);

    const patched = await seriesIdPATCH(
      loopback(`/api/series/${id}`, 'PATCH', {
        description: 'Updated description',
        cover_path: null,
        banner_path: 'series/banner.png',
      }),
      { params: Promise.resolve({ id: String(id) }) },
    );

    expect(patched.status).toBe(200);
    expect((await patched.json()).series).toMatchObject({ description: 'Updated description', cover_path: null, banner_path: 'series/banner.png' });

    const cleared = await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { description: null }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(cleared.status).toBe(200);
    expect((await cleared.json()).series.description).toBeNull();

    const emptyPath = await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { cover_path: '' }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(emptyPath.status).toBe(200);
    expect((await emptyPath.json()).series.cover_path).toBe('');
  });

  it('PATCH succeeds when series update activity logging fails', async () => {
    const created = await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_patch_activity` }));
    const id = (await created.json()).series.id as number;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('series patch activity failed');
    });

    const res = await seriesIdPATCH(loopback(`/api/series/${id}`, 'PATCH', { name: `${SERIES_NAME}_patched_activity` }), {
      params: Promise.resolve({ id: String(id) }),
    });

    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(`[series:${id}] activity log failed:`, 'series patch activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('DELETE validates ids, reports missing rows, and tolerates activity failure', async () => {
    expect((await seriesIdDELETE(loopback('/api/series/bad', 'DELETE'), { params: Promise.resolve({ id: 'bad' }) })).status).toBe(400);
    expect((await seriesIdDELETE(loopback('/api/series/987654', 'DELETE'), { params: Promise.resolve({ id: '987654' }) })).status).toBe(404);

    const created = await seriesPOST(loopback('/api/series', 'POST', { name: `${SERIES_NAME}_delete_activity` }));
    const id = (await created.json()).series.id as number;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('series delete activity failed');
    });

    const res = await seriesIdDELETE(loopback(`/api/series/${id}`, 'DELETE'), {
      params: Promise.resolve({ id: String(id) }),
    });

    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(`[series:${id}] activity log failed:`, 'series delete activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
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

  it('POST accepts optional description and blank color/icon as normalized fields', async () => {
    const created = await listsPOST(
      loopback('/api/lists', 'POST', {
        name: '__test_crud_list_optional',
        description: 'Optional description',
        color: '   ',
        icon: '',
      }),
    );
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(body.list.description).toBe('Optional description');
    expect(body.list.color).toBeNull();
    expect(body.list.icon).toBeNull();
  });

  it('POST rejects invalid color and icon tokens', async () => {
    const badColor = await listsPOST(loopback('/api/lists', 'POST', { name: '__test_crud_bad_color', color: 'not valid!' }));
    expect(badColor.status).toBe(400);
    expect((await badColor.json()).error).toBe('invalid color');

    const badIcon = await listsPOST(loopback('/api/lists', 'POST', { name: '__test_crud_bad_icon', icon: '1bad' }));
    expect(badIcon.status).toBe(400);
    expect((await badIcon.json()).error).toBe('invalid icon');
  });

  it('POST returns a stable error when list creation fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const createSpy = vi.spyOn(dbModule, 'createUserList').mockImplementation(() => {
      throw new Error('list create failed');
    });
    const res = await listsPOST(loopback('/api/lists', 'POST', { name: '__test_crud_list_fail' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'could not create list' });
    expect(consoleSpy).toHaveBeenCalledWith('[lists] createUserList failed:', 'list create failed');
    createSpy.mockRestore();
    consoleSpy.mockRestore();
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

  it('POST 400 when the reading target is missing or invalid', async () => {
    expect((await readingGoalPOST(loopback('/api/reading-goal', 'POST', { year: TEST_YEAR }))).status).toBe(400);
    expect((await readingGoalPOST(loopback('/api/reading-goal', 'POST', { year: TEST_YEAR, target: '12' }))).status).toBe(400);
  });

  it('POST 200 when reading-goal activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('goal activity failed');
    });

    const res = await readingGoalPOST(
      loopback('/api/reading-goal', 'POST', { year: TEST_YEAR, target: 9 }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).goal.target).toBe(9);
    expect(consoleSpy).toHaveBeenCalledWith('[reading-goal] activity log failed:', 'goal activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
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

  it('POST 400 when the VN id is missing or malformed', async () => {
    expect((await readingQueuePOST(loopback('/api/reading-queue', 'POST', {}))).status).toBe(400);
    expect((await readingQueuePOST(loopback('/api/reading-queue', 'POST', { vn_id: 'bad' }))).status).toBe(400);
  });

  it('DELETE 404 when the VN is not queued', async () => {
    const res = await readingQueueDELETE(loopback(`/api/reading-queue?vn_id=${VN_B}`, 'DELETE'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not in queue');
  });

  it('DELETE 400 when the VN id is missing or malformed', async () => {
    expect((await readingQueueDELETE(loopback('/api/reading-queue', 'DELETE'))).status).toBe(400);
    expect((await readingQueueDELETE(loopback('/api/reading-queue?vn_id=bad', 'DELETE'))).status).toBe(400);
  });

  it('GET 500 when queue listing fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listReadingQueue').mockImplementation(() => {
      throw new Error('queue list failed');
    });
    const res = await readingQueueGET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:reading-queue.GET] queue list failed');
    listSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('POST 500 when queue insertion fails', async () => {
    seedVnInCollection(VN_A);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const addSpy = vi.spyOn(dbModule, 'addToReadingQueue').mockImplementation(() => {
      throw new Error('queue add failed');
    });
    const res = await readingQueuePOST(loopback('/api/reading-queue', 'POST', { vn_id: VN_A }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:reading-queue.POST] queue add failed');
    addSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('DELETE 500 when queue removal fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const removeSpy = vi.spyOn(dbModule, 'removeFromReadingQueue').mockImplementation(() => {
      throw new Error('queue remove failed');
    });
    const res = await readingQueueDELETE(loopback(`/api/reading-queue?vn_id=${VN_A}`, 'DELETE'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:reading-queue.DELETE] queue remove failed');
    removeSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('PATCH 500 when queue reorder fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const reorderSpy = vi.spyOn(dbModule, 'reorderReadingQueue').mockImplementation(() => {
      throw new Error('queue reorder failed');
    });
    const res = await readingQueuePATCH(loopback('/api/reading-queue', 'PATCH', { ids: [VN_A] }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:reading-queue.PATCH] queue reorder failed');
    reorderSpy.mockRestore();
    consoleSpy.mockRestore();
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

  it('validates saved-filter inputs and duplicate reorder ids', async () => {
    expect((await savedFiltersPOST(loopback('/api/saved-filters', 'POST', { name: '', params: '' }))).status).toBe(400);
    expect((await savedFiltersPOST(loopback('/api/saved-filters', 'POST', { name: '__test_crud_filter_bad', params: { bad: true } }))).status).toBe(400);
    expect((await savedFiltersDELETE(loopback('/api/saved-filters?id=bad', 'DELETE'))).status).toBe(400);
    expect((await savedFiltersPATCH(loopback('/api/saved-filters', 'PATCH', { ids: 'bad' }))).status).toBe(400);
    expect((await savedFiltersPATCH(loopback('/api/saved-filters', 'PATCH', { ids: [1, 1] }))).status).toBe(400);
  });

  it('returns sanitized internal errors for saved-filter DB and activity failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listSavedFilters').mockImplementation(() => {
      throw new Error('saved filter list failed');
    });
    const listed = await savedFiltersGET();
    expect(listed.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalledWith('[internal:saved-filters.GET] saved filter list failed');
    listSpy.mockRestore();

    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('saved filter activity failed');
    });
    const created = await savedFiltersPOST(
      loopback('/api/saved-filters', 'POST', { name: '__test_crud_filter_activity', params: 'q=1' }),
    );
    expect(created.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalledWith('[internal:saved-filters.POST] saved filter activity failed');
    activitySpy.mockRestore();

    const deleteSpy = vi.spyOn(dbModule, 'deleteSavedFilter').mockImplementation(() => {
      throw new Error('saved filter delete failed');
    });
    const deleted = await savedFiltersDELETE(loopback('/api/saved-filters?id=1', 'DELETE'));
    expect(deleted.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalledWith('[internal:saved-filters.DELETE] saved filter delete failed');
    deleteSpy.mockRestore();

    const reorderSpy = vi.spyOn(dbModule, 'reorderSavedFilters').mockImplementation(() => {
      throw new Error('saved filter reorder failed');
    });
    const reordered = await savedFiltersPATCH(loopback('/api/saved-filters', 'PATCH', { ids: [1] }));
    expect(reordered.status).toBe(500);
    expect(consoleSpy).toHaveBeenCalledWith('[internal:saved-filters.PATCH] saved filter reorder failed');
    reorderSpy.mockRestore();
    consoleSpy.mockRestore();
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

  it('GET 400 for a malformed route id', async () => {
    const res = await routeIdGET(loopback('/api/route/bad'), {
      params: Promise.resolve({ routeId: 'bad' }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid id');
  });

  it('PATCH validates all route fields and clears nullable values', async () => {
    seedVnInCollection(VN_A);
    const route = createRoute(VN_A, 'Route Validation');

    expect((await routeIdPATCH(loopback('/api/route/bad', 'PATCH', {}), { params: Promise.resolve({ routeId: 'bad' }) })).status).toBe(400);
    expect((await routeIdPATCH(loopback('/api/route/987654', 'PATCH', {}), { params: Promise.resolve({ routeId: '987654' }) })).status).toBe(404);
    expect((await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { name: '' }), { params: Promise.resolve({ routeId: String(route.id) }) })).status).toBe(400);
    expect((await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { completed: 'true' }), { params: Promise.resolve({ routeId: String(route.id) }) })).status).toBe(400);
    expect((await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { completed_date: '2099/01/02' }), { params: Promise.resolve({ routeId: String(route.id) }) })).status).toBe(400);
    expect((await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { order_index: -1 }), { params: Promise.resolve({ routeId: String(route.id) }) })).status).toBe(400);
    expect((await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { notes: { text: 'bad' } }), { params: Promise.resolve({ routeId: String(route.id) }) })).status).toBe(400);
    expect((await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { notes: 'x'.repeat(10_001) }), { params: Promise.resolve({ routeId: String(route.id) }) })).status).toBe(400);

    const patched = await routeIdPATCH(
      loopback(`/api/route/${route.id}`, 'PATCH', {
        completed: false,
        completed_date: '',
        order_index: 2,
        notes: '',
      }),
      { params: Promise.resolve({ routeId: String(route.id) }) },
    );

    expect(patched.status).toBe(200);
    expect((await patched.json()).route).toMatchObject({ completed: false, completed_date: null, order_index: 2, notes: null });
  });

  it('PATCH and DELETE tolerate route activity logging failures', async () => {
    seedVnInCollection(VN_A);
    const route = createRoute(VN_A, 'Route Activity');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('route activity failed');
    });

    const patched = await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { name: 'Route Activity Updated' }), {
      params: Promise.resolve({ routeId: String(route.id) }),
    });
    expect(patched.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(`[route:${route.id}] activity log failed:`, 'route activity failed');

    const deleted = await routeIdDELETE(loopback(`/api/route/${route.id}`, 'DELETE'), {
      params: Promise.resolve({ routeId: String(route.id) }),
    });
    expect(deleted.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(`[route:${route.id}] activity log failed:`, 'route activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('PATCH records null entity metadata when the updated route is absent after update', async () => {
    seedVnInCollection(VN_A);
    const route = createRoute(VN_A, 'Route Missing After Update');
    const updateSpy = vi.spyOn(dbModule, 'updateRoute').mockReturnValue(null);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => undefined);

    const res = await routeIdPATCH(loopback(`/api/route/${route.id}`, 'PATCH', { name: 'No Returned Route' }), {
      params: Promise.resolve({ routeId: String(route.id) }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ route: null });
    expect(activitySpy).toHaveBeenCalledWith(expect.objectContaining({ entityId: null }));
    updateSpy.mockRestore();
    activitySpy.mockRestore();
  });

  it('DELETE records null entity metadata when the route disappears before deletion metadata is read', async () => {
    const getSpy = vi.spyOn(dbModule, 'getRoute').mockReturnValue(null);
    const deleteSpy = vi.spyOn(dbModule, 'deleteRoute').mockReturnValue(true);
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => undefined);

    const res = await routeIdDELETE(loopback('/api/route/987654', 'DELETE'), {
      params: Promise.resolve({ routeId: '987654' }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(activitySpy).toHaveBeenCalledWith(expect.objectContaining({
      entityId: null,
      payload: { route_id: 987654, completed: undefined },
    }));
    getSpy.mockRestore();
    deleteSpy.mockRestore();
    activitySpy.mockRestore();
  });

  it('DELETE validates ids and reports missing route ids', async () => {
    expect((await routeIdDELETE(loopback('/api/route/bad', 'DELETE'), { params: Promise.resolve({ routeId: 'bad' }) })).status).toBe(400);
    expect((await routeIdDELETE(loopback('/api/route/987654', 'DELETE'), { params: Promise.resolve({ routeId: '987654' }) })).status).toBe(404);
  });
});
