/**
 * Regression for the "UNIQUE constraint failed: vn_staff_credit.(vn_id, sid,
 * role)" crash. VNDB occasionally returns a staff entry credited multiple
 * times for the same role (different `aid`/`eid` slots — e.g. the same
 * scenario writer billed under two contracts that map to the same role
 * enum). Before the fix `rebuildStaffVaCredits` used a bare `INSERT INTO
 * vn_staff_credit`, so the unique index on `(vn_id, sid, role)` aborted
 * the entire `upsertVn` transaction. The `/vn/[id]` page then rendered
 * the raw SQL error message because `loadVn` propagated `e.message`.
 *
 * The fix is `INSERT OR IGNORE` — first credit wins, duplicates dropped.
 *
 * Synthetic placeholders only per CLAUDE.md (v90000+ / s90000+).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { db as appDb, getCollectionItem, upsertVn, type RawVnPayload } from '@/lib/db';

// Force lib/db bootstrap so vn_staff_credit / vn_va_credit exist.
appDb.prepare('SELECT 1').get();

const rawDb = new Database(process.env.DB_PATH!);

function clearVn(vnId: string): void {
  rawDb.prepare('DELETE FROM vn_staff_credit WHERE vn_id = ?').run(vnId);
  rawDb.prepare('DELETE FROM vn_va_credit WHERE vn_id = ?').run(vnId);
  rawDb.prepare('DELETE FROM vn WHERE id = ?').run(vnId);
}

function payload(id: string, staff: { id: string; aid?: number | null; eid?: number | null; role: string; name: string }[]): RawVnPayload {
  return {
    id,
    title: 'sample',
    alttitle: null,
    image: null,
    released: null,
    olang: null,
    devstatus: 0,
    languages: [],
    platforms: [],
    length: null,
    length_minutes: null,
    length_votes: null,
    rating: null,
    votecount: null,
    average: null,
    description: null,
    titles: [],
    aliases: [],
    extlinks: [],
    developers: [],
    publishers: [],
    tags: [],
    screenshots: [],
    relations: [],
    has_anime: false,
    editions: [],
    staff: staff.map((s) => ({
      id: s.id,
      aid: s.aid ?? null,
      eid: s.eid ?? null,
      role: s.role,
      note: null,
      name: s.name,
      original: null,
      lang: null,
    })),
    va: [],
  } as unknown as RawVnPayload;
}

const VN_ID = 'v90017';
const STAFF_ID = 's95001';

beforeAll(() => {
  clearVn(VN_ID);
});

beforeEach(() => {
  clearVn(VN_ID);
});

afterAll(() => {
  clearVn(VN_ID);
  rawDb.close();
});

describe('upsertVn — duplicate staff (sid, role) tuples', () => {
  it('does NOT throw when the same staff is credited twice for the same role', () => {
    // Two entries with the SAME (sid, role) but different aid/eid.
    // VNDB exposes this when one writer holds multiple contract slots.
    const p = payload(VN_ID, [
      { id: STAFF_ID, aid: 1, eid: null, role: 'scenario', name: 'Writer A' },
      { id: STAFF_ID, aid: 2, eid: null, role: 'scenario', name: 'Writer A' },
    ]);
    expect(() => upsertVn(p)).not.toThrow();
    const row = getCollectionItem(VN_ID);
    expect(row).toBeTruthy();
  });

  it('persists exactly one row per (vn_id, sid, role) — first credit wins', () => {
    upsertVn(payload(VN_ID, [
      { id: STAFF_ID, aid: 1, eid: 100, role: 'scenario', name: 'Writer A' },
      { id: STAFF_ID, aid: 2, eid: 200, role: 'scenario', name: 'Writer A' },
    ]));
    const rows = rawDb
      .prepare('SELECT aid, eid FROM vn_staff_credit WHERE vn_id = ? AND sid = ? AND role = ?')
      .all(VN_ID, STAFF_ID, 'scenario') as Array<{ aid: number | null; eid: number | null }>;
    expect(rows).toHaveLength(1);
    // INSERT OR IGNORE keeps the FIRST inserted row.
    expect(rows[0]).toEqual({ aid: 1, eid: 100 });
  });

  it('still inserts a second row when role differs', () => {
    upsertVn(payload(VN_ID, [
      { id: STAFF_ID, aid: 1, eid: null, role: 'scenario', name: 'Writer A' },
      { id: STAFF_ID, aid: 2, eid: null, role: 'director', name: 'Writer A' },
    ]));
    const rows = rawDb
      .prepare('SELECT role FROM vn_staff_credit WHERE vn_id = ? AND sid = ? ORDER BY role')
      .all(VN_ID, STAFF_ID) as Array<{ role: string }>;
    expect(rows.map((r) => r.role)).toEqual(['director', 'scenario']);
  });

  it('handles a re-upsert (DELETE + INSERT cycle) idempotently', () => {
    upsertVn(payload(VN_ID, [
      { id: STAFF_ID, aid: 1, eid: null, role: 'scenario', name: 'Writer A' },
    ]));
    // Second upsert with the duplicate-tuple payload should still succeed.
    expect(() => upsertVn(payload(VN_ID, [
      { id: STAFF_ID, aid: 5, eid: null, role: 'scenario', name: 'Writer A' },
      { id: STAFF_ID, aid: 6, eid: null, role: 'scenario', name: 'Writer A' },
    ]))).not.toThrow();
    const rows = rawDb
      .prepare('SELECT aid FROM vn_staff_credit WHERE vn_id = ? AND sid = ? AND role = ?')
      .all(VN_ID, STAFF_ID, 'scenario') as Array<{ aid: number | null }>;
    expect(rows).toHaveLength(1);
    // After re-upsert: rebuildStaffVaCredits ran DELETE first; the new
    // insert is the (5, scenario) row (first of the duplicate pair).
    expect(rows[0].aid).toBe(5);
  });
});
