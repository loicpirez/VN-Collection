import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE as deletePlaceRoute, GET as getPlaceRoute, PATCH as patchPlaceRoute } from '@/app/api/places/[id]/route';
import { DELETE as unlinkPlaceRoute, POST as linkPlaceRoute } from '@/app/api/places/[id]/link/route';
import { createPlace, db, getPlace, linkProviderToPlace } from '@/lib/db';
import * as dbModule from '@/lib/db';

const PLACE_PREFIX = '__test_place_detail_route_';
const LABEL_PREFIX = '__test_place_label_route_';

function loopbackReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function externalReq(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function ctx(id: string | number): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

afterEach(() => {
  db.prepare('DELETE FROM place_provider_link WHERE provider_label LIKE ?').run(`${LABEL_PREFIX}%`);
  db.prepare('DELETE FROM place_registry WHERE name LIKE ?').run(`${PLACE_PREFIX}%`);
});

describe('GET /api/places/[id]', () => {
  it('rejects malformed ids and missing rows', async () => {
    expect((await getPlaceRoute(loopbackReq('/api/places/nope'), ctx('nope'))).status).toBe(400);
    expect((await getPlaceRoute(loopbackReq('/api/places/999999999'), ctx('999999999'))).status).toBe(404);
  });

  it('returns a persisted place and sanitizes unexpected parameter failures', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}get`, name_ja: 'テスト', kind: 'shop' });
    const found = await getPlaceRoute(loopbackReq(`/api/places/${id}`), ctx(id));
    expect(found.status).toBe(200);
    expect((await found.json()).place).toMatchObject({ id, name: `${PLACE_PREFIX}get`, name_ja: 'テスト' });

    const failed = await getPlaceRoute(loopbackReq('/api/places/1'), {
      params: Promise.reject(new Error('params failed')),
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'internal error' });
  });
});

describe('PATCH /api/places/[id]', () => {
  it('enforces auth, id, existence, primitive coordinate, and optional field validation', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}patch-invalid` });
    expect((await patchPlaceRoute(externalReq(`/api/places/${id}`, 'PATCH', { name: 'blocked' }), ctx(id))).status).toBe(403);
    expect((await patchPlaceRoute(loopbackReq('/api/places/0', 'PATCH', {}), ctx('0'))).status).toBe(400);
    expect((await patchPlaceRoute(loopbackReq('/api/places/999999999', 'PATCH', {}), ctx('999999999'))).status).toBe(404);
    expect((await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { lng: '139.7' }), ctx(id))).status).toBe(400);
    expect((await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { name: '' }), ctx(id))).status).toBe(400);
    expect((await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { name_ja: { text: 'bad' } }), ctx(id))).status).toBe(400);
    expect((await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { kind: 'museum' }), ctx(id))).status).toBe(400);
    expect((await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { address: { text: 'bad' } }), ctx(id))).status).toBe(400);
    expect((await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { url: 'ftp://example.test' }), ctx(id))).status).toBe(400);
    const badNotes = await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { notes: { text: 'bad' } }), ctx(id));
    expect(badNotes.status).toBe(400);
    expect(await badNotes.json()).toEqual({ error: 'notes must be a string' });
  });

  it('updates all supported fields, clears nullable fields, and rejects incomplete stored coordinates', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}patch-full` });
    const updated = await patchPlaceRoute(
      loopbackReq(`/api/places/${id}`, 'PATCH', {
        name: `${PLACE_PREFIX}patched`,
        name_ja: '更新',
        kind: 'storage',
        address: 'Tokyo',
        lat: 35.6,
        lng: 139.7,
        url: 'https://example.test/place',
        notes: 'note',
      }),
      ctx(id),
    );
    expect(updated.status).toBe(200);
    expect(getPlace(id)).toMatchObject({
      name: `${PLACE_PREFIX}patched`,
      name_ja: '更新',
      kind: 'storage',
      address: 'Tokyo',
      lat: 35.6,
      lng: 139.7,
      url: 'https://example.test/place',
      notes: 'note',
    });

    const cleared = await patchPlaceRoute(
      loopbackReq(`/api/places/${id}`, 'PATCH', {
        name_ja: '',
        address: null,
        lat: null,
        lng: null,
        url: null,
        notes: '',
      }),
      ctx(id),
    );
    expect(cleared.status).toBe(200);
    expect(getPlace(id)).toMatchObject({ name_ja: null, address: null, lat: null, lng: null, url: null, notes: null });

    const partial = createPlace({ name: `${PLACE_PREFIX}patch-partial`, lat: 35.6, lng: 139.7 });
    const incomplete = await patchPlaceRoute(loopbackReq(`/api/places/${partial}`, 'PATCH', { lng: null }), ctx(partial));
    expect(incomplete.status).toBe(400);

    const latOnly = createPlace({ name: `${PLACE_PREFIX}patch-lat-only`, lat: 35.6, lng: 139.7 });
    const latOnlyResponse = await patchPlaceRoute(loopbackReq(`/api/places/${latOnly}`, 'PATCH', { lat: 35.7 }), ctx(latOnly));
    expect(latOnlyResponse.status).toBe(200);
    expect(getPlace(latOnly)).toMatchObject({ lat: 35.7, lng: 139.7 });
  });

  it('returns a sanitized internal error when updating fails', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}patch-fail` });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const updateSpy = vi.spyOn(dbModule, 'updatePlace').mockImplementation(() => {
      throw new Error('private update failure');
    });

    const response = await patchPlaceRoute(loopbackReq(`/api/places/${id}`, 'PATCH', { name: `${PLACE_PREFIX}failed` }), ctx(id));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.[id].PATCH] private update failure');
    updateSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/places/[id]', () => {
  it('enforces auth, id, existence, and deletes existing rows', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}delete` });
    expect((await deletePlaceRoute(externalReq(`/api/places/${id}`, 'DELETE'), ctx(id))).status).toBe(403);
    expect((await deletePlaceRoute(loopbackReq('/api/places/nope', 'DELETE'), ctx('nope'))).status).toBe(400);
    expect((await deletePlaceRoute(loopbackReq('/api/places/999999999', 'DELETE'), ctx('999999999'))).status).toBe(404);
    const deleted = await deletePlaceRoute(loopbackReq(`/api/places/${id}`, 'DELETE'), ctx(id));
    expect(deleted.status).toBe(200);
    expect(getPlace(id)).toBeNull();
  });

  it('returns a sanitized internal error when deleting fails', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}delete-fail` });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const deleteSpy = vi.spyOn(dbModule, 'deletePlace').mockImplementation(() => {
      throw new Error('private delete failure');
    });

    const response = await deletePlaceRoute(loopbackReq(`/api/places/${id}`, 'DELETE'), ctx(id));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.[id].DELETE] private delete failure');
    deleteSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('POST /api/places/[id]/link', () => {
  it('enforces auth, id, existence, label, and source-place validation', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}link-invalid` });
    expect((await linkPlaceRoute(externalReq(`/api/places/${id}/link`, 'POST', { provider_label: `${LABEL_PREFIX}x` }), ctx(id))).status).toBe(403);
    expect((await linkPlaceRoute(loopbackReq('/api/places/nope/link', 'POST', { provider_label: `${LABEL_PREFIX}x` }), ctx('nope'))).status).toBe(400);
    expect((await linkPlaceRoute(loopbackReq('/api/places/999999999/link', 'POST', { provider_label: `${LABEL_PREFIX}x` }), ctx('999999999'))).status).toBe(404);
    expect((await linkPlaceRoute(loopbackReq(`/api/places/${id}/link`, 'POST', { provider_label: '' }), ctx(id))).status).toBe(400);
    expect((await linkPlaceRoute(loopbackReq(`/api/places/${id}/link`, 'POST', { provider_label: `${LABEL_PREFIX}x`, from_place_id: 0 }), ctx(id))).status).toBe(400);
    expect((await linkPlaceRoute(loopbackReq(`/api/places/${id}/link`, 'POST', { provider_label: `${LABEL_PREFIX}x`, from_place_id: 999999999 }), ctx(id))).status).toBe(404);
  });

  it('creates links, treats same-place source ids as normal links, and moves links between places', async () => {
    const from = createPlace({ name: `${PLACE_PREFIX}link-from` });
    const to = createPlace({ name: `${PLACE_PREFIX}link-to` });
    const directLabel = `${LABEL_PREFIX}direct`;
    const sameLabel = `${LABEL_PREFIX}same`;
    const movedLabel = `${LABEL_PREFIX}moved`;

    expect((await linkPlaceRoute(loopbackReq(`/api/places/${to}/link`, 'POST', { provider_label: directLabel }), ctx(to))).status).toBe(200);
    expect((await linkPlaceRoute(loopbackReq(`/api/places/${to}/link`, 'POST', { provider_label: sameLabel, from_place_id: to }), ctx(to))).status).toBe(200);

    linkProviderToPlace(from, movedLabel);
    const moved = await linkPlaceRoute(
      loopbackReq(`/api/places/${to}/link`, 'POST', { provider_label: movedLabel, from_place_id: from }),
      ctx(to),
    );
    expect(moved.status).toBe(200);
    expect(await moved.json()).toEqual({ ok: true, moved: true });

    const rows = db
      .prepare('SELECT place_id, provider_label FROM place_provider_link WHERE provider_label LIKE ? ORDER BY provider_label, place_id')
      .all(`${LABEL_PREFIX}%`) as Array<{ place_id: number; provider_label: string }>;
    expect(rows).toEqual([
      { place_id: to, provider_label: directLabel },
      { place_id: to, provider_label: movedLabel },
      { place_id: to, provider_label: sameLabel },
    ]);
  });

  it('returns a sanitized internal error when linking fails', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}link-fail` });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const linkSpy = vi.spyOn(dbModule, 'linkProviderToPlace').mockImplementation(() => {
      throw new Error('private link failure');
    });

    const response = await linkPlaceRoute(loopbackReq(`/api/places/${id}/link`, 'POST', { provider_label: `${LABEL_PREFIX}fail` }), ctx(id));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.[id].link.POST] private link failure');
    linkSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/places/[id]/link', () => {
  it('enforces auth, id, existence, label validation, and removes links', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}unlink` });
    const label = `${LABEL_PREFIX}unlink`;
    linkProviderToPlace(id, label);

    expect((await unlinkPlaceRoute(externalReq(`/api/places/${id}/link`, 'DELETE', { provider_label: label }), ctx(id))).status).toBe(403);
    expect((await unlinkPlaceRoute(loopbackReq('/api/places/nope/link', 'DELETE', { provider_label: label }), ctx('nope'))).status).toBe(400);
    expect((await unlinkPlaceRoute(loopbackReq('/api/places/999999999/link', 'DELETE', { provider_label: label }), ctx('999999999'))).status).toBe(404);
    expect((await unlinkPlaceRoute(loopbackReq(`/api/places/${id}/link`, 'DELETE', { provider_label: '' }), ctx(id))).status).toBe(400);

    const removed = await unlinkPlaceRoute(loopbackReq(`/api/places/${id}/link`, 'DELETE', { provider_label: label }), ctx(id));
    expect(removed.status).toBe(200);
    const row = db.prepare('SELECT 1 FROM place_provider_link WHERE place_id = ? AND provider_label = ?').get(id, label);
    expect(row).toBeUndefined();
  });

  it('returns a sanitized internal error when unlinking fails', async () => {
    const id = createPlace({ name: `${PLACE_PREFIX}unlink-fail` });
    const label = `${LABEL_PREFIX}unlink-fail`;
    linkProviderToPlace(id, label);
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const unlinkSpy = vi.spyOn(dbModule, 'unlinkProviderFromPlace').mockImplementation(() => {
      throw new Error('private unlink failure');
    });

    const response = await unlinkPlaceRoute(loopbackReq(`/api/places/${id}/link`, 'DELETE', { provider_label: label }), ctx(id));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:places.[id].link.DELETE] private unlink failure');
    unlinkSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
