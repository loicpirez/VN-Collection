/**
 * Pin the /dumped page's dump semantics so they always agree with the
 * Library `?dumped=1` filter.
 *
 * The bug we are guarding against: /dumped used to read EXCLUSIVELY
 * from `owned_release.dumped`, while Library `?dumped=1` reads from
 * `collection.dumped`. A user with VN-level dumped flags but zero
 * tracked owned-editions saw the page say "0 dumpées" while the
 * Library filter happily showed every dumped VN. Worse, /dumped's
 * progress bar said 0%.
 *
 * Now both surfaces must agree on the "fully dumped" set:
 *   - any VN with `collection.dumped = 1`
 *   - PLUS any VN with owned editions, every edition dumped
 *
 * Tests use synthetic VN ids and never touch the real DB or any
 * real third-party token.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  addToCollection,
  getDumpSummary,
  listCollection,
  listDumpStatus,
  listShelves,
  updateCollection,
} from '@/lib/db';

// Force schema bootstrap.
listShelves();
const db = new Database(process.env.DB_PATH!);

function seedVn(id: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
  ).run(id, id, Date.now());
}

function clear(): void {
  db.exec(
    `DELETE FROM owned_release;
     DELETE FROM collection WHERE vn_id LIKE 'v9%';
     DELETE FROM vn WHERE id LIKE 'v9%';`,
  );
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('dumped page vs library ?dumped=1 filter', () => {
  it('VN-level collection.dumped=1 counts as fully dumped on /dumped', () => {
    seedVn('v90100');
    addToCollection('v90100', {});
    updateCollection('v90100', { dumped: true });
    // No owned_release row at all.
    const status = listDumpStatus().find((e) => e.vn_id === 'v90100');
    expect(status?.collection_dumped).toBe(true);
    const lib = listCollection({ dumped: true }).map((i) => i.id);
    expect(lib).toContain('v90100');
    const summary = getDumpSummary();
    // Both pages "see" the dump signal:
    expect(summary.fullyDumpedVns).toBeGreaterThanOrEqual(1);
    expect(summary.editionPct).toBeGreaterThanOrEqual(1);
  });

  it('owned_release.dumped=1 on every edition counts as fully dumped', () => {
    seedVn('v90101');
    addToCollection('v90101', {});
    db.prepare(
      `INSERT INTO owned_release (vn_id, release_id, dumped, added_at)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    ).run('v90101', 'r901011', 1, Date.now(), 'v90101', 'r901012', 1, Date.now());
    const summary = getDumpSummary();
    expect(summary.totalEditions).toBeGreaterThanOrEqual(2);
    expect(summary.dumpedEditions).toBeGreaterThanOrEqual(2);
    expect(summary.fullyDumpedVns).toBeGreaterThanOrEqual(1);
  });

  it('partial dumped is partial (not complete, not none)', () => {
    seedVn('v90102');
    addToCollection('v90102', {});
    db.prepare(
      `INSERT INTO owned_release (vn_id, release_id, dumped, added_at)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    ).run('v90102', 'r901021', 1, Date.now(), 'v90102', 'r901022', 0, Date.now());
    const entry = listDumpStatus().find((e) => e.vn_id === 'v90102');
    expect(entry?.dumped_editions).toBe(1);
    expect(entry?.total_editions).toBe(2);
    expect(entry?.collection_dumped).toBe(false);
    const lib = listCollection({ dumped: true }).map((i) => i.id);
    // Library filter is per-VN, no collection.dumped → not in
    // ?dumped=1. /dumped will classify as 'partial'.
    expect(lib).not.toContain('v90102');
  });

  it('summary percentage is honest when collection-only dumped exists', () => {
    // Setup: 1 VN with 1/2 editions dumped (partial), 1 VN with
    // collection.dumped only.
    seedVn('v90103');
    addToCollection('v90103', {});
    db.prepare(
      `INSERT INTO owned_release (vn_id, release_id, dumped, added_at)
       VALUES (?, ?, ?, ?), (?, ?, ?, ?)`,
    ).run('v90103', 'r901031', 1, Date.now(), 'v90103', 'r901032', 0, Date.now());
    seedVn('v90104');
    addToCollection('v90104', {});
    updateCollection('v90104', { dumped: true });
    const s = getDumpSummary();
    // 2 editions total, 1 dumped, plus 1 collection-only dumped VN
    //   numerator = 1 (dumped_editions) + 1 (coll_dumped_no_editions) = 2
    //   denominator = 2 (total_editions) + 1 = 3
    //   percent = 67
    expect(s.totalEditions).toBe(2);
    expect(s.dumpedEditions).toBe(1);
    expect(s.fullyDumpedVns).toBe(1); // only v90104
    expect(s.editionPct).toBe(67);
  });
});
