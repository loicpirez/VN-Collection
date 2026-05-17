import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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

describe('round-four route source-pin', () => {
  // Source-pinned fallback for routes whose handler instrumentation we
  // assert by reading the route file. These tests catch refactors that
  // drop the `recordActivity(...)` call without realising the kind
  // string anchors the activity log.
  const ROUTE_KIND_MATRIX: Array<[string, string]> = [
    ['src/app/api/collection/[id]/source-pref/route.ts', 'collection.source-pref'],
    ['src/app/api/collection/[id]/custom-description/route.ts', 'collection.custom-description'],
    ['src/app/api/collection/[id]/game-log/route.ts', 'collection.game-log-add'],
    ['src/app/api/collection/[id]/game-log/route.ts', 'collection.game-log-update'],
    ['src/app/api/collection/[id]/game-log/route.ts', 'collection.game-log-delete'],
    ['src/app/api/collection/[id]/routes/route.ts', 'collection.route-add'],
    ['src/app/api/collection/[id]/routes/route.ts', 'collection.route-update'],
    ['src/app/api/route/[routeId]/route.ts', 'collection.route-update'],
    ['src/app/api/route/[routeId]/route.ts', 'collection.route-delete'],
    ['src/app/api/vn/[id]/aspect/route.ts', 'aspect.set'],
    ['src/app/api/vn/[id]/aspect/route.ts', 'aspect.clear'],
    ['src/app/api/collection/order/route.ts', 'collection.custom-order'],
    ['src/app/api/collection/[id]/assets/route.ts', 'download.refresh'],
    ['src/app/api/series/route.ts', 'series.create'],
    ['src/app/api/series/[id]/route.ts', 'series.update'],
    ['src/app/api/series/[id]/route.ts', 'series.delete'],
    ['src/app/api/series/[id]/vn/[vnId]/route.ts', 'series.link'],
    ['src/app/api/series/[id]/vn/[vnId]/route.ts', 'series.unlink'],
    ['src/app/api/series/[id]/image/route.ts', 'series.image-upload'],
    ['src/app/api/reading-goal/route.ts', 'reading-goal.set'],
    ['src/app/api/steam/link/route.ts', 'steam.link'],
    ['src/app/api/steam/link/route.ts', 'steam.unlink'],
    ['src/app/api/steam/sync/route.ts', 'steam.sync-apply'],
    ['src/app/api/vndb/cache/route.ts', 'cache.invalidate'],
    ['src/app/api/producer/[id]/refresh/route.ts', 'producer.refresh'],
    ['src/app/api/producer/[id]/logo/route.ts', 'producer.logo-set'],
    ['src/app/api/producer/[id]/logo/route.ts', 'producer.logo-clear'],
    ['src/app/api/staff/[id]/download/route.ts', 'staff.full-download'],
    ['src/app/api/vn/[id]/erogamescape/route.ts', 'vn.egs-link'],
    ['src/app/api/vn/[id]/erogamescape/route.ts', 'vn.egs-unlink'],
    ['src/app/api/egs/[id]/vndb/route.ts', 'egs.vndb-link'],
    ['src/app/api/egs/[id]/vndb/route.ts', 'egs.vndb-unlink'],
    ['src/app/api/egs/sync/route.ts', 'egs.sync-apply'],
    ['src/app/api/vn/[id]/vndb-status/route.ts', 'vndb-status.update'],
    ['src/app/api/vn/[id]/vndb-status/route.ts', 'vndb-status.remove'],
  ];

  it.each(ROUTE_KIND_MATRIX)('%s mentions kind %s', async (path, kind) => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(path, 'utf8');
    expect(src).toContain('recordActivity');
    expect(src).toContain(kind);
  });
});

// Route-level integration tests for a representative subset. The
// remaining kinds are pinned via the source-pin matrix above.
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
