import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { listActivityKinds, listUserActivity, maskActivityPayload, recordActivity } from '@/lib/activity';

describe('user activity', () => {
  afterEach(() => {
    db.prepare('DELETE FROM user_activity').run();
  });

  it('masks sensitive payload keys recursively', () => {
    expect(maskActivityPayload({
      token: 'secret',
      nested: { steam_api_key: 'secret', safe: 'value' },
    })).toEqual({
      token: '[masked]',
      nested: { steam_api_key: '[masked]', safe: 'value' },
    });
  });

  it('records and filters mutation activity', () => {
    recordActivity({
      kind: 'settings.update',
      entity: 'settings',
      entityId: 'display',
      label: 'Updated settings',
      payload: { vndb_token: 'secret', theme: 'dark' },
    });
    const rows = listUserActivity({ kind: 'settings.update' });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toContain('[masked]');
    expect(rows[0].payload).not.toContain('secret');
    expect(listActivityKinds()).toEqual(['settings.update']);
  });

  it('records the round-4-followup mutation kinds end-to-end', () => {
    // VNDB writeback
    recordActivity({
      kind: 'vndb.writeback',
      entity: 'vn',
      entityId: 'v9001',
      label: 'v9001',
      payload: { changed: ['vote'], labels_set: null, labels_unset: null },
    });
    // VN→EGS mapping (pin + clear)
    recordActivity({
      kind: 'mapping.vn-egs',
      entity: 'vn',
      entityId: 'v9001',
      label: 'placeholder title',
      payload: { egs_id: 12345, action: 'pin' },
    });
    recordActivity({
      kind: 'mapping.vn-egs',
      entity: 'vn',
      entityId: 'v9001',
      label: 'v9001',
      payload: { action: 'clear', mode: 'auto' },
    });
    // EGS→VN mapping
    recordActivity({
      kind: 'mapping.egs-vn',
      entity: 'egs',
      entityId: '12345',
      label: 'egs_12345 → v9001',
      payload: { action: 'pin', vndb_id: 'v9001' },
    });
    // EGS-only collection add
    recordActivity({
      kind: 'collection.add',
      entity: 'vn',
      entityId: 'egs_12345',
      label: 'placeholder title',
      payload: { source: 'egs', egs_id: 12345, status: 'planning' },
    });

    const kinds = listActivityKinds().sort();
    expect(kinds).toEqual([
      'collection.add',
      'mapping.egs-vn',
      'mapping.vn-egs',
      'vndb.writeback',
    ]);
    expect(listUserActivity({ entity: 'vn' })).toHaveLength(4); // writeback + pin + clear + add
    expect(listUserActivity({ entity: 'egs' })).toHaveLength(1);

    const writebackRow = listUserActivity({ kind: 'vndb.writeback' })[0];
    const writebackPayload = JSON.parse(writebackRow.payload ?? '{}');
    expect(writebackPayload).toHaveProperty('changed');
    // Confirm the route never carried raw `notes` text into the
    // payload — the round-4-followup contract said only the changed
    // field NAMES are persisted, not values.
    expect(writebackPayload).not.toHaveProperty('notes');
  });
});

/**
 * Round-four kind coverage. For every new activity kind added by the
 * round-four sweep, assert:
 *   - It lands in `listUserActivity` + `listActivityKinds` after a write.
 *   - The masker still hides any sensitive-shaped keys carried in the
 *     payload (defence in depth — none of the new kinds carry secrets
 *     today, but a future field rename shouldn't silently leak).
 *   - The disable env var no-ops the write.
 */
const NEW_KINDS = [
  'collection.source-pref',
  'collection.custom-description',
  'collection.game-log-add',
  'collection.game-log-update',
  'collection.game-log-delete',
  'collection.route-add',
  'collection.route-update',
  'collection.route-delete',
  'collection.custom-order',
  'aspect.set',
  'aspect.clear',
  'download.refresh',
  'series.create',
  'series.update',
  'series.delete',
  'series.link',
  'series.unlink',
  'series.image-upload',
  'reading-goal.set',
  'steam.link',
  'steam.unlink',
  'steam.sync-apply',
  'cache.invalidate',
  'producer.refresh',
  'producer.logo-set',
  'producer.logo-clear',
  'staff.full-download',
  'vn.egs-link',
  'vn.egs-unlink',
  'egs.vndb-link',
  'egs.vndb-unlink',
  'egs.sync-apply',
  'vndb-status.update',
  'vndb-status.remove',
] as const;

describe('round-four activity kinds', () => {
  afterEach(() => {
    db.prepare('DELETE FROM user_activity').run();
    delete process.env.VNCOLL_DISABLE_ACTIVITY;
  });

  it.each(NEW_KINDS)('records kind %s and surfaces it in listActivityKinds', (kind) => {
    recordActivity({
      kind,
      entity: 'vn',
      entityId: 'v99999',
      label: `Test ${kind}`,
      payload: { note: 'placeholder' },
    });
    const rows = listUserActivity({ kind });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe(kind);
    expect(listActivityKinds()).toContain(kind);
  });

  it.each(NEW_KINDS)('masks sensitive-shaped payload values for %s', (kind) => {
    recordActivity({
      kind,
      entity: 'vn',
      entityId: 'v99999',
      payload: { vndb_token: 'placeholder-token-not-real', visible: 'plain' },
    });
    const [row] = listUserActivity({ kind });
    expect(row.payload).toContain('[masked]');
    expect(row.payload).not.toContain('placeholder-token-not-real');
    expect(row.payload).toContain('"visible":"plain"');
  });

  it.each(NEW_KINDS)('respects VNCOLL_DISABLE_ACTIVITY for %s', (kind) => {
    process.env.VNCOLL_DISABLE_ACTIVITY = '1';
    recordActivity({ kind, entity: 'vn', entityId: 'v99999', payload: { x: 1 } });
    expect(listUserActivity({ kind })).toHaveLength(0);
  });
});

vi.mock('@/lib/erogamescape', () => ({
  linkEgsToVn: vi.fn(async (_vnId: string, egsId: number) => ({ egs_id: egsId, gamename: 'Mocked Game' })),
  clearEgsCache: vi.fn(),
  resolveEgsForVn: vi.fn(async () => ({ game: null, source: 'none' })),
  EgsUnreachable: class EgsUnreachable extends Error {},
}));

vi.mock('@/lib/assets', () => ({
  ensureLocalImagesForVn: vi.fn(async () => ({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] })),
}));

vi.mock('@/lib/staff-full', () => ({
  downloadFullStaffInfo: vi.fn(async () => ({ productionCredits: [], vaCredits: [], fetched_at: Date.now() })),
  downloadFullStaffForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/character-full', () => ({
  downloadFullCharForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/producer-full', () => ({
  downloadFullProducerForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/release-full', () => ({
  downloadFullReleasesForVn: vi.fn(async () => {}),
  downloadScreenshotReleasesForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/tag-full', () => ({
  downloadFullTagsForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/trait-full', () => ({
  downloadFullTraitsForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/relations-full', () => ({
  downloadFullRelationsForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/scrape-producer-relations', () => ({
  scrapeProducersForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/scrape-tag-dag', () => ({
  scrapeTagDagForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/scrape-character-instances', () => ({
  scrapeCharactersForVn: vi.fn(async () => {}),
}));

vi.mock('@/lib/producer-associations', () => ({
  invalidateProducerAssociations: vi.fn(),
  fetchProducerAssociations: vi.fn(async () => ({
    developerVns: [{ id: 'v1' }],
    publisherVns: [],
    ownedUnique: 1,
    stale: false,
    upstreamFailed: false,
  })),
}));

vi.mock('@/lib/files', () => ({
  saveUpload: vi.fn(async (_bucket: string, _file: unknown, name: string) => `series/${name}.jpg`),
  UnsupportedFileType: class UnsupportedFileType extends Error {},
}));

vi.mock('@/lib/steam', () => ({
  fetchOwnedGames: vi.fn(async () => []),
  computeSteamSuggestions: vi.fn(async () => []),
  recordSync: vi.fn(),
}));

vi.mock('@/lib/egs-sync', () => ({
  applyEgsSuggestions: vi.fn(async () => ({ applied: 1, skipped: 0 })),
  computeEgsSuggestions: vi.fn(async () => ({ needsConfig: false, suggestions: [] })),
}));

vi.mock('@/lib/vndb', () => ({
  patchUlistEntry: vi.fn(async () => ({ ok: true })),
  deleteUlistEntry: vi.fn(async () => ({ ok: true })),
  fetchUlistEntry: vi.fn(async () => null),
  fetchUlistLabels: vi.fn(async () => []),
  getVn: vi.fn(async () => null),
  refreshVn: vi.fn(async () => null),
  getProducer: vi.fn(async () => null),
}));

const VN_ID = 'v99990';

function seedVnAndCollection(id: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
  ).run(id, `Test VN ${id}`, Date.now());
  db.prepare(
    `INSERT OR IGNORE INTO collection (vn_id, status, added_at, updated_at) VALUES (?, 'planning', ?, ?)`,
  ).run(id, Date.now(), Date.now());
}

function seedProducer(id: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO producer (id, name, aliases, extlinks, fetched_at) VALUES (?, ?, '[]', '[]', ?)`,
  ).run(id, `Producer ${id}`, Date.now());
}

describe('round-four route integration — activity row created', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM user_activity').run();
    db.prepare('DELETE FROM vn_game_log').run();
    db.prepare('DELETE FROM vn_route').run();
    db.prepare('DELETE FROM series_vn').run();
    db.prepare('DELETE FROM series').run();
    db.prepare('DELETE FROM steam_link').run();
    db.prepare('DELETE FROM collection').run();
    db.prepare('DELETE FROM vn').run();
    db.prepare('DELETE FROM producer').run();
    db.prepare('DELETE FROM egs_vn_link').run();
    seedVnAndCollection(VN_ID);
  });

  it('PATCH /api/collection/[id]/source-pref logs collection.source-pref', async () => {
    const { PATCH } = await import('@/app/api/collection/[id]/source-pref/route');
    const req = new Request(`http://localhost/api/collection/${VN_ID}/source-pref`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'vndb' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.source-pref' })).toHaveLength(1);
  });

  it('PATCH /api/collection/[id]/custom-description logs collection.custom-description', async () => {
    const { PATCH } = await import('@/app/api/collection/[id]/custom-description/route');
    const req = new Request(`http://localhost/api/collection/${VN_ID}/custom-description`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'my synopsis' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.custom-description' })).toHaveLength(1);
  });

  it('POST /api/collection/[id]/game-log logs collection.game-log-add', async () => {
    const { POST } = await import('@/app/api/collection/[id]/game-log/route');
    const req = new Request(`http://localhost/api/collection/${VN_ID}/game-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: 'started chapter 1' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.game-log-add' })).toHaveLength(1);
  });

  it('PATCH /api/collection/[id]/game-log logs collection.game-log-update', async () => {
    const { addGameLogEntry } = await import('@/lib/db');
    const entry = addGameLogEntry(VN_ID, 'initial note');
    const { PATCH } = await import('@/app/api/collection/[id]/game-log/route');
    const req = new Request(`http://localhost/api/collection/${VN_ID}/game-log`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: entry.id, note: 'updated note' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.game-log-update' })).toHaveLength(1);
  });

  it('DELETE /api/collection/[id]/game-log logs collection.game-log-delete', async () => {
    const { addGameLogEntry } = await import('@/lib/db');
    const entry = addGameLogEntry(VN_ID, 'note to delete');
    const { DELETE } = await import('@/app/api/collection/[id]/game-log/route');
    const req = new NextRequest(
      `http://localhost/api/collection/${VN_ID}/game-log?entry=${entry.id}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.game-log-delete' })).toHaveLength(1);
  });

  it('POST /api/collection/[id]/routes logs collection.route-add', async () => {
    const { POST } = await import('@/app/api/collection/[id]/routes/route');
    const req = new Request(`http://localhost/api/collection/${VN_ID}/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Heroine A route' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.route-add' })).toHaveLength(1);
  });

  it('PATCH /api/collection/[id]/routes logs collection.route-update (reorder)', async () => {
    const { createRoute } = await import('@/lib/db');
    const r1 = createRoute(VN_ID, 'Route A');
    const r2 = createRoute(VN_ID, 'Route B');
    const { PATCH } = await import('@/app/api/collection/[id]/routes/route');
    const req = new Request(`http://localhost/api/collection/${VN_ID}/routes`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [r2.id, r1.id] }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.route-update' })).toHaveLength(1);
  });

  it('PATCH /api/route/[routeId] logs collection.route-update', async () => {
    const { createRoute } = await import('@/lib/db');
    const route = createRoute(VN_ID, 'Test route');
    const { PATCH } = await import('@/app/api/route/[routeId]/route');
    const req = new Request(`http://localhost/api/route/${route.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed route' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ routeId: String(route.id) }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.route-update' })).toHaveLength(1);
  });

  it('DELETE /api/route/[routeId] logs collection.route-delete', async () => {
    const { createRoute } = await import('@/lib/db');
    const route = createRoute(VN_ID, 'Route to delete');
    const { DELETE } = await import('@/app/api/route/[routeId]/route');
    const req = new Request(`http://localhost/api/route/${route.id}`, {
      method: 'DELETE',
    }) as unknown as import('next/server').NextRequest;
    const res = await DELETE(req, { params: Promise.resolve({ routeId: String(route.id) }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'collection.route-delete' })).toHaveLength(1);
  });

  it('POST /api/collection/[id]/assets?refresh=true logs download.refresh', async () => {
    const { POST } = await import('@/app/api/collection/[id]/assets/route');
    const req = new NextRequest(
      `http://localhost/api/collection/${VN_ID}/assets?refresh=true`,
      { method: 'POST' },
    );
    const res = await POST(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'download.refresh' })).toHaveLength(1);
  });

  it('POST /api/series logs series.create', async () => {
    const { POST } = await import('@/app/api/series/route');
    const req = new Request('http://localhost/api/series', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Series' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'series.create' })).toHaveLength(1);
  });

  it('PATCH /api/series/[id] logs series.update', async () => {
    const { createSeries } = await import('@/lib/db');
    const series = createSeries('Series to update');
    const { PATCH } = await import('@/app/api/series/[id]/route');
    const req = new Request(`http://localhost/api/series/${series.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Series Name' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ id: String(series.id) }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'series.update' })).toHaveLength(1);
  });

  it('DELETE /api/series/[id] logs series.delete', async () => {
    const { createSeries } = await import('@/lib/db');
    const series = createSeries('Series to delete');
    const { DELETE } = await import('@/app/api/series/[id]/route');
    const req = new Request(`http://localhost/api/series/${series.id}`, {
      method: 'DELETE',
    }) as unknown as import('next/server').NextRequest;
    const res = await DELETE(req, { params: Promise.resolve({ id: String(series.id) }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'series.delete' })).toHaveLength(1);
  });

  it('POST /api/series/[id]/vn/[vnId] logs series.link', async () => {
    const { createSeries } = await import('@/lib/db');
    const series = createSeries('Series for linking');
    const { POST } = await import('@/app/api/series/[id]/vn/[vnId]/route');
    const req = new Request(`http://localhost/api/series/${series.id}/vn/${VN_ID}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: String(series.id), vnId: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'series.link' })).toHaveLength(1);
  });

  it('DELETE /api/series/[id]/vn/[vnId] logs series.unlink', async () => {
    const { createSeries, addVnToSeries } = await import('@/lib/db');
    const series = createSeries('Series for unlinking');
    addVnToSeries(series.id, VN_ID, 0);
    const { DELETE } = await import('@/app/api/series/[id]/vn/[vnId]/route');
    const req = new Request(`http://localhost/api/series/${series.id}/vn/${VN_ID}`, {
      method: 'DELETE',
    }) as unknown as import('next/server').NextRequest;
    const res = await DELETE(req, { params: Promise.resolve({ id: String(series.id), vnId: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'series.unlink' })).toHaveLength(1);
  });

  it('POST /api/series/[id]/image logs series.image-upload', async () => {
    const { createSeries } = await import('@/lib/db');
    const series = createSeries('Series for image');
    const { POST } = await import('@/app/api/series/[id]/image/route');
    const file = new File(['fake-png-data'], 'cover.png', { type: 'image/png' });
    const fd = new FormData();
    fd.append('file', file);
    fd.append('kind', 'cover');
    const req = new Request(`http://localhost/api/series/${series.id}/image`, {
      method: 'POST',
      body: fd,
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: String(series.id) }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'series.image-upload' })).toHaveLength(1);
  });

  it('POST /api/reading-goal logs reading-goal.set', async () => {
    const { POST } = await import('@/app/api/reading-goal/route');
    const req = new Request('http://localhost/api/reading-goal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, target: 12 }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'reading-goal.set' })).toHaveLength(1);
  });

  it('POST /api/steam/link logs steam.link', async () => {
    const { POST } = await import('@/app/api/steam/link/route');
    const req = new Request('http://localhost/api/steam/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vn_id: VN_ID, appid: 99001, steam_name: 'My VN on Steam' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'steam.link' })).toHaveLength(1);
  });

  it('DELETE /api/steam/link logs steam.unlink', async () => {
    const { setSteamLink } = await import('@/lib/db');
    setSteamLink({ vnId: VN_ID, appid: 99002, steamName: 'Linked Game', source: 'manual' });
    const { DELETE } = await import('@/app/api/steam/link/route');
    const req = new NextRequest(
      `http://localhost/api/steam/link?vn_id=${VN_ID}`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'steam.unlink' })).toHaveLength(1);
  });

  it('POST /api/steam/sync logs steam.sync-apply', async () => {
    const { POST } = await import('@/app/api/steam/sync/route');
    const req = new Request('http://localhost/api/steam/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applies: [{ vn_id: VN_ID, playtime_minutes: 120 }] }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'steam.sync-apply' })).toHaveLength(1);
  });

  it('DELETE /api/vndb/cache logs cache.invalidate', async () => {
    const { DELETE } = await import('@/app/api/vndb/cache/route');
    const req = new NextRequest('http://localhost/api/vndb/cache', { method: 'DELETE' });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'cache.invalidate' })).toHaveLength(1);
  });

  it('POST /api/producer/[id]/refresh logs producer.refresh', async () => {
    const { POST } = await import('@/app/api/producer/[id]/refresh/route');
    const req = new Request('http://localhost/api/producer/p1/refresh', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'producer.refresh' })).toHaveLength(1);
  });

  it('DELETE /api/producer/[id]/logo logs producer.logo-clear', async () => {
    seedProducer('p2');
    const { DELETE } = await import('@/app/api/producer/[id]/logo/route');
    const req = new Request('http://localhost/api/producer/p2/logo', {
      method: 'DELETE',
    }) as unknown as import('next/server').NextRequest;
    const res = await DELETE(req, { params: Promise.resolve({ id: 'p2' }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'producer.logo-clear' })).toHaveLength(1);
  });

  it('POST /api/producer/[id]/logo logs producer.logo-set', async () => {
    seedProducer('p3');
    const { POST } = await import('@/app/api/producer/[id]/logo/route');
    const file = new File(['fake-image'], 'logo.png', { type: 'image/png' });
    const fd = new FormData();
    fd.append('file', file);
    const req = new Request('http://localhost/api/producer/p3/logo', {
      method: 'POST',
      body: fd,
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: 'p3' }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'producer.logo-set' })).toHaveLength(1);
  });

  it('POST /api/staff/[id]/download logs staff.full-download', async () => {
    const { POST } = await import('@/app/api/staff/[id]/download/route');
    const req = new Request('http://localhost/api/staff/s1/download', { method: 'POST' });
    const res = await POST(req, { params: Promise.resolve({ id: 's1' }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'staff.full-download' })).toHaveLength(1);
  });

  it('POST /api/vn/[id]/erogamescape logs vn.egs-link', async () => {
    const { POST } = await import('@/app/api/vn/[id]/erogamescape/route');
    const req = new Request(`http://localhost/api/vn/${VN_ID}/erogamescape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ egs_id: 12345 }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'vn.egs-link' })).toHaveLength(1);
  });

  it('DELETE /api/vn/[id]/erogamescape logs vn.egs-unlink', async () => {
    const { DELETE } = await import('@/app/api/vn/[id]/erogamescape/route');
    const req = new NextRequest(
      `http://localhost/api/vn/${VN_ID}/erogamescape`,
      { method: 'DELETE' },
    );
    const res = await DELETE(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'vn.egs-unlink' })).toHaveLength(1);
  });

  it('POST /api/egs/[id]/vndb logs egs.vndb-link', async () => {
    const { POST } = await import('@/app/api/egs/[id]/vndb/route');
    const req = new Request('http://localhost/api/egs/12345/vndb', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vndb_id: VN_ID }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req, { params: Promise.resolve({ id: '12345' }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'egs.vndb-link' })).toHaveLength(1);
  });

  it('DELETE /api/egs/[id]/vndb logs egs.vndb-unlink', async () => {
    const { DELETE } = await import('@/app/api/egs/[id]/vndb/route');
    const req = new Request('http://localhost/api/egs/12345/vndb', {
      method: 'DELETE',
    }) as unknown as import('next/server').NextRequest;
    const res = await DELETE(req, { params: Promise.resolve({ id: '12345' }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'egs.vndb-unlink' })).toHaveLength(1);
  });

  it('POST /api/egs/sync logs egs.sync-apply', async () => {
    const { POST } = await import('@/app/api/egs/sync/route');
    const req = new Request('http://localhost/api/egs/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vn_ids: [VN_ID] }),
    }) as unknown as import('next/server').NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'egs.sync-apply' })).toHaveLength(1);
  });

  it('PATCH /api/vn/[id]/vndb-status logs vndb-status.update', async () => {
    const { PATCH } = await import('@/app/api/vn/[id]/vndb-status/route');
    const req = new Request(`http://localhost/api/vn/${VN_ID}/vndb-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ labels_set: [1] }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'vndb-status.update' })).toHaveLength(1);
  });

  it('DELETE /api/vn/[id]/vndb-status logs vndb-status.remove', async () => {
    const { DELETE } = await import('@/app/api/vn/[id]/vndb-status/route');
    const req = new Request(`http://localhost/api/vn/${VN_ID}/vndb-status`, {
      method: 'DELETE',
    }) as unknown as import('next/server').NextRequest;
    const res = await DELETE(req, { params: Promise.resolve({ id: VN_ID }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'vndb-status.remove' })).toHaveLength(1);
  });
});

describe('route-level activity integration', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM user_activity').run();
    db.prepare('DELETE FROM vn_aspect_override').run();
    // The aspect-override table has a FK on `vn(id)`; seed a synthetic
    // VN row so the integration tests can land overrides for a
    // placeholder VN id that doesn't conflict with anything in the
    // operator's real data.
    db.prepare(
      "INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES ('v99999', 'Synthetic test VN', ?)",
    ).run(Date.now());
  });

  it('PATCH /api/vn/[id]/aspect logs aspect.set', async () => {
    const { PATCH } = await import('@/app/api/vn/[id]/aspect/route');
    const req = new Request('http://localhost/api/vn/v99999/aspect', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ aspect_key: '16:9' }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req, { params: Promise.resolve({ id: 'v99999' }) });
    expect(res.status).toBe(200);
    const rows = listUserActivity({ kind: 'aspect.set' });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].entity_id).toBe('v99999');
    expect(rows[0].payload).toContain('16:9');
  });

  it('DELETE /api/vn/[id]/aspect logs aspect.clear', async () => {
    const { DELETE } = await import('@/app/api/vn/[id]/aspect/route');
    const req = new Request('http://localhost/api/vn/v99999/aspect', {
      method: 'DELETE',
    }) as unknown as import('next/server').NextRequest;
    const res = await DELETE(req, { params: Promise.resolve({ id: 'v99999' }) });
    expect(res.status).toBe(200);
    expect(listUserActivity({ kind: 'aspect.clear' })).toHaveLength(1);
  });

  it('PATCH /api/collection/order logs collection.custom-order', async () => {
    const { PATCH } = await import('@/app/api/collection/order/route');
    const req = new Request('http://localhost/api/collection/order', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['v99999', 'v99998'] }),
    }) as unknown as import('next/server').NextRequest;
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const rows = listUserActivity({ kind: 'collection.custom-order' });
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toContain('"count":2');
  });
});
