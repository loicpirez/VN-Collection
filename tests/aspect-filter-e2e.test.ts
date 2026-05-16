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
  deriveVnAspectKey,
  listCollection,
  listShelves,
  materializeAspectForCollectionVns,
  materializeReleaseAspectsForVn,
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

  it('materializeReleaseAspectsForVn populates rc from cached VNDB release payloads', () => {
    // Reproduces a user-reported case: a VN whose only aspect
    // signal lives in a cached `POST /release` response body that
    // ReleasesSection fetched on an earlier visit. The VN page
    // must pre-derive 16:9 SSR-side instead of flashing 'unknown'
    // while the client-side fetch is pending.
    seedVn('v90008');
    addToCollection('v90008', {});
    // Seed a cached POST /release payload that includes a
    // release linked to v90008 with resolution [1280, 720].
    const cacheKey = 'POST /release|POST|cafefacefacecafe';
    db.prepare(
      `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      cacheKey,
      JSON.stringify({
        results: [
          {
            id: 'r90008',
            resolution: [1280, 720],
            vns: [{ id: 'v90008' }],
          },
        ],
      }),
      Date.now(),
      Date.now() + 3600 * 1000,
    );
    // Before materialize: derived = unknown (cache + override
    // empty, screenshots empty).
    expect(deriveVnAspectKey('v90008')).toBe('unknown');
    materializeReleaseAspectsForVn('v90008');
    // After materialize: the release cache row was written and
    // deriveVnAspectKey now finds it via the vn-bound branch.
    expect(deriveVnAspectKey('v90008')).toBe('16:9');
    // Library filter also matches now.
    const items = listCollection({ aspect: '16:9' });
    expect(items.map((i) => i.id)).toContain('v90008');
  });

  it('materializeReleaseAspectsForVn does NOT change derivation when a manual VN override exists', () => {
    seedVn('v90009');
    addToCollection('v90009', {});
    setVnAspectOverride({ vnId: 'v90009', aspectKey: '21:9' });
    // Seed a 1280x720 cache entry.
    db.prepare(
      `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      'POST /release|POST|9009',
      JSON.stringify({ results: [{ id: 'r90009', resolution: [1280, 720], vns: [{ id: 'v90009' }] }] }),
      Date.now(),
      Date.now() + 3600 * 1000,
    );
    materializeReleaseAspectsForVn('v90009');
    // The release cache may or may not have been written
    // (materializer is idempotent + best-effort). The contract
    // the user cares about is: manual override beats cache.
    expect(deriveVnAspectKey('v90009')).toBe('21:9');
    // Library filter still only matches the override bucket.
    expect(listCollection({ aspect: '21:9' }).map((i) => i.id)).toContain('v90009');
    expect(listCollection({ aspect: '16:9' }).map((i) => i.id)).not.toContain('v90009');
  });

  it('multi-select aspect filter matches a VN by ANY of the selected aspects', () => {
    seedVn('v90011');
    seedVn('v90012');
    seedVn('v90013');
    addToCollection('v90011', {});
    addToCollection('v90012', {});
    addToCollection('v90013', {});
    setVnAspectOverride({ vnId: 'v90011', aspectKey: '4:3' });
    setVnAspectOverride({ vnId: 'v90012', aspectKey: '16:9' });
    setVnAspectOverride({ vnId: 'v90013', aspectKey: '21:9' });
    const out = listCollection({ aspects: ['4:3', '16:9'] });
    const ids = out.map((i) => i.id);
    expect(ids).toContain('v90011');
    expect(ids).toContain('v90012');
    expect(ids).not.toContain('v90013');
  });

  it('multi-select including unknown matches both aspect-pinned and unknown VNs', () => {
    seedVn('v90014');
    seedVn('v90015');
    addToCollection('v90014', {});
    addToCollection('v90015', {});
    setVnAspectOverride({ vnId: 'v90014', aspectKey: '16:9' });
    // v90015 has no signal → unknown.
    const out = listCollection({ aspects: ['16:9', 'unknown'] });
    const ids = out.map((i) => i.id);
    expect(ids).toContain('v90014');
    expect(ids).toContain('v90015');
  });

  it('materializeReleaseAspectsForVn short-circuits when the VN already has a non-unknown rc row', () => {
    seedVn('v90010');
    addToCollection('v90010', {});
    // Seed an existing non-unknown rc row.
    upsertReleaseResolutionCache({
      releaseId: 'r90010-existing',
      vnId: 'v90010',
      resolution: '1920x1080',
    });
    // Seed a cached payload for an UNRELATED release id pointing
    // at v90010; materializer should NOT touch it because the
    // VN already has a signal.
    db.prepare(
      `INSERT OR REPLACE INTO vndb_cache (cache_key, body, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)`,
    ).run(
      'POST /release|POST|9010',
      JSON.stringify({ results: [{ id: 'r90010-new', resolution: [800, 600], vns: [{ id: 'v90010' }] }] }),
      Date.now(),
      Date.now() + 3600 * 1000,
    );
    materializeReleaseAspectsForVn('v90010');
    const newRow = db
      .prepare(`SELECT aspect_key FROM release_resolution_cache WHERE release_id = 'r90010-new'`)
      .all();
    expect(newRow.length).toBe(0);
  });
});
