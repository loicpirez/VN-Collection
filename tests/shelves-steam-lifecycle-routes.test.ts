/**
 * Success-path coverage for the shelves and Steam routes whose happy paths
 * were previously untested (existing suites only cover the auth-403 and
 * input-400 branches): shelves (GET/POST/PATCH), shelves/[id]
 * (GET/PATCH/DELETE), shelves/[id]/slots (POST/DELETE), steam/library,
 * steam/sync (GET/POST), steam/link (POST/DELETE).
 *
 * `@/lib/steam` is mocked at the function level so no Steam API key or
 * network is used. Shelf and owned-edition fixtures are seeded through the
 * real DB layer with synthetic ids. Authorized requests use host 127.0.0.1
 * (the auth gate requires loopback). Each case asserts exactly one HTTP
 * status plus a body assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as shelvesGET, POST as shelvesPOST, PATCH as shelvesPATCH } from '@/app/api/shelves/route';
import {
  GET as shelfIdGET,
  PATCH as shelfIdPATCH,
  DELETE as shelfIdDELETE,
} from '@/app/api/shelves/[id]/route';
import {
  POST as slotsPOST,
  DELETE as slotsDELETE,
} from '@/app/api/shelves/[id]/slots/route';
import { GET as steamLibraryGET } from '@/app/api/steam/library/route';
import { GET as steamSyncGET, POST as steamSyncPOST } from '@/app/api/steam/sync/route';
import { POST as steamLinkPOST, DELETE as steamLinkDELETE } from '@/app/api/steam/link/route';
import { addToCollection, db } from '@/lib/db';

const {
  fetchOwnedGamesMock,
  computeSteamSuggestionsMock,
  listUnlinkedSteamGamesMock,
  recordSyncMock,
} = vi.hoisted(() => ({
  fetchOwnedGamesMock: vi.fn(),
  computeSteamSuggestionsMock: vi.fn(),
  listUnlinkedSteamGamesMock: vi.fn(),
  recordSyncMock: vi.fn(),
}));

vi.mock('@/lib/steam', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/steam')>();
  return {
    ...actual,
    fetchOwnedGames: fetchOwnedGamesMock,
    computeSteamSuggestions: computeSteamSuggestionsMock,
    listUnlinkedSteamGames: listUnlinkedSteamGamesMock,
    recordSync: recordSyncMock,
  };
});

const SHELF_NAME = '__test_shelf_lifecycle';
const VN_ID = 'v90401';
const RELEASE_ID = 'r904010';

function loopback(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { host: '127.0.0.1', 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

function seedOwnedEdition(): void {
  db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
    VN_ID,
    'Shelved Title',
    Date.now(),
  );
  addToCollection(VN_ID, { status: 'completed' });
  db.prepare(
    `INSERT OR REPLACE INTO owned_release (vn_id, release_id, physical_location, added_at)
     VALUES (?, ?, ?, ?)`,
  ).run(VN_ID, RELEASE_ID, JSON.stringify([]), Date.now());
}

beforeEach(() => {
  fetchOwnedGamesMock.mockReset();
  computeSteamSuggestionsMock.mockReset();
  listUnlinkedSteamGamesMock.mockReset();
  recordSyncMock.mockReset();
});

afterEach(() => {
  db.exec(
    `DELETE FROM shelf_display_slot WHERE shelf_id IN (SELECT id FROM shelf_unit WHERE name LIKE '${SHELF_NAME}%');
     DELETE FROM shelf_slot WHERE shelf_id IN (SELECT id FROM shelf_unit WHERE name LIKE '${SHELF_NAME}%');
     DELETE FROM shelf_unit WHERE name LIKE '${SHELF_NAME}%';`,
  );
  db.prepare('DELETE FROM steam_link WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM owned_release WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
});

describe('shelves CRUD + reorder', () => {
  it('POST creates, GET lists, PATCH renames, DELETE removes a shelf', async () => {
    const created = await shelvesPOST(loopback('/api/shelves', 'POST', { name: SHELF_NAME, cols: 4, rows: 3 }));
    expect(created.status).toBe(200);
    const shelf = (await created.json()).shelf;
    expect(shelf.cols).toBe(4);

    const listed = await shelvesGET(loopback('/api/shelves'));
    expect(listed.status).toBe(200);
    expect((await listed.json()).shelves.some((s: { id: number }) => s.id === shelf.id)).toBe(true);

    const read = await shelfIdGET(loopback(`/api/shelves/${shelf.id}`), {
      params: Promise.resolve({ id: String(shelf.id) }),
    });
    expect(read.status).toBe(200);
    const readBody = await read.json();
    expect(readBody.shelf.id).toBe(shelf.id);
    expect(Array.isArray(readBody.slots)).toBe(true);

    const renamed = await shelfIdPATCH(
      loopback(`/api/shelves/${shelf.id}`, 'PATCH', { name: `${SHELF_NAME}_renamed` }),
      { params: Promise.resolve({ id: String(shelf.id) }) },
    );
    expect(renamed.status).toBe(200);
    expect((await renamed.json()).shelf.name).toBe(`${SHELF_NAME}_renamed`);

    const removed = await shelfIdDELETE(loopback(`/api/shelves/${shelf.id}`, 'DELETE'), {
      params: Promise.resolve({ id: String(shelf.id) }),
    });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ ok: true });
  });

  it('GET ?pool=1 includes the unplaced-editions array', async () => {
    const res = await shelvesGET(loopback('/api/shelves?pool=1'));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).unplaced)).toBe(true);
  });

  it('PATCH resize returns the new dimensions and an evicted list', async () => {
    const created = await shelvesPOST(loopback('/api/shelves', 'POST', { name: `${SHELF_NAME}_resize`, cols: 4, rows: 4 }));
    const shelf = (await created.json()).shelf;
    const resized = await shelfIdPATCH(
      loopback(`/api/shelves/${shelf.id}`, 'PATCH', { cols: 2, rows: 2 }),
      { params: Promise.resolve({ id: String(shelf.id) }) },
    );
    expect(resized.status).toBe(200);
    const body = await resized.json();
    expect(body.shelf.cols).toBe(2);
    expect(Array.isArray(body.evicted)).toBe(true);
  });

  it('PATCH reorders shelves by id', async () => {
    const a = await shelvesPOST(loopback('/api/shelves', 'POST', { name: `${SHELF_NAME}_a` }));
    const b = await shelvesPOST(loopback('/api/shelves', 'POST', { name: `${SHELF_NAME}_b` }));
    const idA = (await a.json()).shelf.id as number;
    const idB = (await b.json()).shelf.id as number;
    const res = await shelvesPATCH(loopback('/api/shelves', 'PATCH', { order: [idB, idA] }));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).shelves)).toBe(true);
  });
});

describe('shelves/[id]/slots place/remove', () => {
  it('POST places an owned edition and DELETE returns it to the pool', async () => {
    seedOwnedEdition();
    const created = await shelvesPOST(loopback('/api/shelves', 'POST', { name: `${SHELF_NAME}_slots`, cols: 3, rows: 3 }));
    const shelf = (await created.json()).shelf;

    const placed = await slotsPOST(
      loopback(`/api/shelves/${shelf.id}/slots`, 'POST', { row: 0, col: 0, vn_id: VN_ID, release_id: RELEASE_ID }),
      { params: Promise.resolve({ id: String(shelf.id) }) },
    );
    expect(placed.status).toBe(200);
    const placedBody = await placed.json();
    expect(placedBody.slots.some((s: { vn_id: string }) => s.vn_id === VN_ID)).toBe(true);

    const removed = await slotsDELETE(
      loopback(`/api/shelves/${shelf.id}/slots`, 'DELETE', { vn_id: VN_ID, release_id: RELEASE_ID }),
      { params: Promise.resolve({ id: String(shelf.id) }) },
    );
    expect(removed.status).toBe(200);
    expect((await removed.json()).slots.some((s: { vn_id: string }) => s.vn_id === VN_ID)).toBe(false);
  });

  it('POST 404 when the shelf does not exist', async () => {
    seedOwnedEdition();
    const res = await slotsPOST(
      loopback('/api/shelves/987654/slots', 'POST', { row: 0, col: 0, vn_id: VN_ID, release_id: RELEASE_ID }),
      { params: Promise.resolve({ id: '987654' }) },
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not found');
  });
});

describe('steam/library', () => {
  it('200 returning the unlinked Steam games on success', async () => {
    fetchOwnedGamesMock.mockResolvedValue([{ appid: 10, name: 'Game A' }]);
    listUnlinkedSteamGamesMock.mockReturnValue([{ appid: 10, name: 'Game A' }]);
    const res = await steamLibraryGET(loopback('/api/steam/library'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.games).toEqual([{ appid: 10, name: 'Game A' }]);
  });

  it('502 when the Steam fetch throws', async () => {
    fetchOwnedGamesMock.mockRejectedValue(new Error('steam down'));
    const res = await steamLibraryGET(loopback('/api/steam/library'));
    expect(res.status).toBe(502);
    expect((await res.json()).ok).toBe(false);
  });
});

describe('steam/sync', () => {
  it('GET 200 with suggestions on success', async () => {
    fetchOwnedGamesMock.mockResolvedValue([]);
    computeSteamSuggestionsMock.mockResolvedValue([{ vn_id: VN_ID, delta: 30 }]);
    const res = await steamSyncGET(loopback('/api/steam/sync'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.suggestions).toHaveLength(1);
  });

  it('GET 400 with code steam_not_configured when Steam is not set up', async () => {
    fetchOwnedGamesMock.mockRejectedValue(new Error('Steam not configured'));
    const res = await steamSyncGET(loopback('/api/steam/sync'));
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('steam_not_configured');
  });

  it('POST 200 applying playtime to a collected VN', async () => {
    seedOwnedEdition();
    const res = await steamSyncPOST(
      loopback('/api/steam/sync', 'POST', { applies: [{ vn_id: VN_ID, playtime_minutes: 120 }] }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: 1 });
    expect(recordSyncMock).toHaveBeenCalledWith(VN_ID, 120);
  });
});

describe('steam/link', () => {
  it('POST pins a Steam app and DELETE unlinks it', async () => {
    seedOwnedEdition();
    const linked = await steamLinkPOST(
      loopback('/api/steam/link', 'POST', { vn_id: VN_ID, appid: 555, steam_name: 'Steam Title' }),
    );
    expect(linked.status).toBe(200);
    expect((await linked.json()).link.appid).toBe(555);

    const unlinked = await steamLinkDELETE(loopback(`/api/steam/link?vn_id=${VN_ID}`, 'DELETE'));
    expect(unlinked.status).toBe(200);
    expect(await unlinked.json()).toEqual({ ok: true });
  });

  it('POST 400 when the VN is not in the collection', async () => {
    const res = await steamLinkPOST(
      loopback('/api/steam/link', 'POST', { vn_id: VN_ID, appid: 5, steam_name: 'X' }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('add VN to collection first');
  });

  it('DELETE 404 when the VN is not linked', async () => {
    const res = await steamLinkDELETE(loopback(`/api/steam/link?vn_id=${VN_ID}`, 'DELETE'));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('not linked');
  });
});
