/**
 * End-to-end coverage of the aspect-ratio FILTER path.
 *
 * Verifies that VNs match `?aspect=…` regardless of which signal
 * carries their aspect:
 *   1. VN-level manual override (vn_aspect_override)
 *   2. Per-edition manual override (owned_release_aspect_override)
 *   3. Cached release resolution joined via owned_release
 *   4. Cached release resolution bound directly to the VN (rc.vn_id)
 *   5. Screenshots fallback materialized via
 *      `materializeAspectForCollectionVns`
 *
 * Before the fix shipped today, case (1) + (4) were partially broken
 * (the SQL filter included them but `listAspectKeysForVns` for the
 * card chip + the `group=aspect` grouping did not), and case (5) was
 * not handled at all. The user reported "aspect ratio filter
 * matches nothing" — this suite locks the regression.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  addToCollection,
  listCollection,
  listShelves,
  materializeAspectForCollectionVns,
  setVnAspectOverride,
  upsertReleaseResolutionCache,
} from '@/lib/db';

// Force schema bootstrap.
listShelves();
const db = new Database(process.env.DB_PATH!);

function seedVn(id: string, screenshots?: Array<{ dims?: [number, number] }>): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, screenshots, fetched_at)
     VALUES (?, ?, ?, ?)`,
  ).run(id, id, screenshots ? JSON.stringify(screenshots) : null, Date.now());
}

function clear(): void {
  db.exec(
    `DELETE FROM vn_aspect_override;
     DELETE FROM owned_release_aspect_override;
     DELETE FROM owned_release;
     DELETE FROM release_resolution_cache;
     DELETE FROM shelf_display_slot;
     DELETE FROM shelf_slot;
     DELETE FROM collection WHERE vn_id LIKE 'v9%';
     DELETE FROM vn WHERE id LIKE 'v9%';`,
  );
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('aspect filter end-to-end (?aspect=…)', () => {
  it('matches a VN whose VN-level manual override is the only signal', () => {
    seedVn('v90001');
    addToCollection('v90001', {});
    setVnAspectOverride({ vnId: 'v90001', aspectKey: '16:9' });
    const items = listCollection({ aspect: '16:9' });
    expect(items.map((i) => i.id)).toContain('v90001');
    // And the card chip / group key surfaces the manual override
    // (this was broken before — listAspectKeysForVns only saw
    // owned-release-cached rows).
    const it90001 = items.find((i) => i.id === 'v90001');
    expect(it90001?.aspect_keys).toContain('16:9');
  });

  it('matches a VN whose only signal is a VN-bound release_resolution_cache row', () => {
    seedVn('v90002');
    addToCollection('v90002', {});
    upsertReleaseResolutionCache({
      releaseId: 'r90002',
      vnId: 'v90002',
      resolution: '1280x720',
    });
    // NO owned_release row — the cache is bound to vn_id only.
    const items = listCollection({ aspect: '16:9' });
    expect(items.map((i) => i.id)).toContain('v90002');
  });

  it('matches a VN whose only signal is the screenshots fallback (after materialization)', () => {
    seedVn('v90003', [
      { dims: [1920, 1080] },
      { dims: [1920, 1080] },
      { dims: [800, 600] },
    ]);
    addToCollection('v90003', {});
    // Before materialize the SQL filter cannot reach into screenshots.
    const beforeMat = listCollection({ aspect: '16:9' });
    expect(beforeMat.map((i) => i.id)).not.toContain('v90003');
    // Materialize and try again.
    materializeAspectForCollectionVns(['v90003']);
    const afterMat = listCollection({ aspect: '16:9' });
    expect(afterMat.map((i) => i.id)).toContain('v90003');
    const it = afterMat.find((i) => i.id === 'v90003');
    expect(it?.aspect_keys).toContain('16:9');
  });

  it('manual VN override takes priority over screenshots fallback', () => {
    seedVn('v90004', [{ dims: [1920, 1080] }]);
    addToCollection('v90004', {});
    materializeAspectForCollectionVns(['v90004']);
    // Now flip the override to a different bucket.
    setVnAspectOverride({ vnId: 'v90004', aspectKey: '4:3' });
    const wide = listCollection({ aspect: '16:9' });
    expect(wide.map((i) => i.id)).not.toContain('v90004');
    const four = listCollection({ aspect: '4:3' });
    expect(four.map((i) => i.id)).toContain('v90004');
    const it = four.find((i) => i.id === 'v90004');
    // Manual override is exclusive — chip only shows 4:3, not 16:9.
    expect(it?.aspect_keys).toEqual(['4:3']);
  });

  it('does not falsely match a VN with no aspect signal at all', () => {
    seedVn('v90005');
    addToCollection('v90005', {});
    materializeAspectForCollectionVns(['v90005']);
    const items = listCollection({ aspect: '16:9' });
    expect(items.map((i) => i.id)).not.toContain('v90005');
    // ?aspect=unknown DOES match it (no signal = unknown bucket).
    const unknownItems = listCollection({ aspect: 'unknown' });
    expect(unknownItems.map((i) => i.id)).toContain('v90005');
  });

  it('materialize is idempotent — repeated calls do not duplicate cache rows', () => {
    seedVn('v90006', [{ dims: [1280, 720] }]);
    addToCollection('v90006', {});
    materializeAspectForCollectionVns(['v90006']);
    materializeAspectForCollectionVns(['v90006']);
    materializeAspectForCollectionVns(['v90006']);
    const rows = db
      .prepare(`SELECT * FROM release_resolution_cache WHERE vn_id = ?`)
      .all('v90006') as Array<{ release_id: string; aspect_key: string }>;
    // Exactly one synthetic row.
    expect(rows.length).toBe(1);
    expect(rows[0].release_id).toBe('screenshot:v90006');
    expect(rows[0].aspect_key).toBe('16:9');
  });

  it('materialize skips VNs that already have a stronger signal', () => {
    seedVn('v90007', [{ dims: [1280, 720] }]);
    addToCollection('v90007', {});
    setVnAspectOverride({ vnId: 'v90007', aspectKey: '4:3' });
    materializeAspectForCollectionVns(['v90007']);
    const synthetic = db
      .prepare(`SELECT * FROM release_resolution_cache WHERE release_id = 'screenshot:v90007'`)
      .all();
    expect(synthetic.length).toBe(0);
  });
});
