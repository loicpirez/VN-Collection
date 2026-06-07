/**
 * R5-239 pin: `findStaffSiblings` returns conservative cross-sid
 * candidates that:
 *   - share a name or original with the input sid
 *   - appear in VNs that are in the operator's collection
 *   - exclude the input sid itself
 *   - dedupe per candidate sid, listing each VN once
 *
 * No automatic merge — the UI labels every row "Possible match".
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { batchGetStaffNames, findStaffSiblings } from '@/lib/db';

findStaffSiblings('s90000');
const db = new Database(process.env.DB_PATH!);

function seedVn(vnId: string, title: string, inCollection: boolean): void {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(vnId, title, now);
  if (inCollection) {
    db.prepare(`INSERT OR IGNORE INTO collection (vn_id, added_at, updated_at, status) VALUES (?, ?, ?, 'planning')`).run(vnId, now, now);
  }
}

function seedStaffCredit(vnId: string, sid: string, name: string, original?: string): void {
  db.prepare(`
    INSERT INTO vn_staff_credit (vn_id, sid, role, note, name, original, lang)
    VALUES (?, ?, 'scenario', NULL, ?, ?, 'ja')
  `).run(vnId, sid, name, original ?? null);
}

function seedVaCredit(vnId: string, sid: string, c_id: string, vaName: string, vaOriginal?: string): void {
  db.prepare(`
    INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name, va_original, va_lang)
    VALUES (?, ?, ?, ?, ?, ?, 'ja')
  `).run(vnId, sid, c_id, `${c_id} display`, vaName, vaOriginal ?? null);
}

beforeAll(() => {
  db.exec(`
    DELETE FROM vn_va_credit;
    DELETE FROM vn_staff_credit;
    DELETE FROM collection;
    DELETE FROM vn;
  `);
});

afterAll(() => {
  db.close();
});

describe('findStaffSiblings', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM vn_va_credit;
      DELETE FROM vn_staff_credit;
      DELETE FROM collection;
      DELETE FROM vn;
    `);
  });

  it('returns empty when the sid has no known names', () => {
    expect(findStaffSiblings('s9999')).toEqual([]);
  });

  it('finds candidate sids that share a display name', () => {
    seedVn('v9001', 'In-collection VN A', true);
    seedVn('v9002', 'In-collection VN B', true);
    seedStaffCredit('v9001', 's9100', 'Synthetic Writer');
    seedStaffCredit('v9002', 's9101', 'Synthetic Writer'); // same name, different sid

    const sibs = findStaffSiblings('s9100');
    expect(sibs).toHaveLength(1);
    expect(sibs[0].sid).toBe('s9101');
    expect(sibs[0].vns.map((v) => v.vn_id)).toEqual(['v9002']);
  });

  it('finds candidate sids that share an original name', () => {
    seedVn('v9010', 'X', true);
    seedVn('v9011', 'Y', true);
    seedStaffCredit('v9010', 's9200', 'PenName A', 'OriginalShared');
    seedStaffCredit('v9011', 's9201', 'PenName B', 'OriginalShared');

    const sibs = findStaffSiblings('s9200');
    expect(sibs).toHaveLength(1);
    expect(sibs[0].sid).toBe('s9201');
  });

  it('cross-references vn_va_credit too (a writer who also voice-acts)', () => {
    seedVn('v9020', 'X', true);
    seedVn('v9021', 'Y', true);
    seedStaffCredit('v9020', 's9300', 'Crossover Person');
    seedVaCredit('v9021', 's9301', 'c9101', 'Crossover Person');

    const sibs = findStaffSiblings('s9300');
    expect(sibs).toHaveLength(1);
    expect(sibs[0].sid).toBe('s9301');
  });

  it('resolves staff names from voice credits when production credits are absent', () => {
    seedVn('v9022', 'Voice only', true);
    seedVaCredit('v9022', 's9302', 'c9102', 'Voice Only Person');

    expect(batchGetStaffNames(['s9302'])).toEqual(new Map([['s9302', 'Voice Only Person']]));
  });

  it('excludes candidate sids whose VN is NOT in the collection', () => {
    seedVn('v9030', 'Owned', true);
    seedVn('v9031', 'Not owned', false);
    seedStaffCredit('v9030', 's9400', 'Common');
    seedStaffCredit('v9031', 's9401', 'Common');

    const sibs = findStaffSiblings('s9400');
    expect(sibs).toEqual([]);
  });

  it('excludes the input sid from its own result', () => {
    seedVn('v9040', 'Owned', true);
    seedVn('v9041', 'Owned 2', true);
    seedStaffCredit('v9040', 's9500', 'Same name');
    seedStaffCredit('v9041', 's9500', 'Same name'); // same sid

    const sibs = findStaffSiblings('s9500');
    expect(sibs).toEqual([]);
  });

  it('deduplicates the same VN across multiple credits of the same candidate sid', () => {
    seedVn('v9050', 'Owned', true);
    seedStaffCredit('v9050', 's9600', 'Anchor');
    // Two distinct credit rows for s9601 on the same VN (e.g. scenario + chardesign):
    seedStaffCredit('v9050', 's9601', 'Anchor');
    db.prepare(`
      INSERT INTO vn_staff_credit (vn_id, sid, role, note, name, original, lang)
      VALUES (?, ?, 'art', NULL, ?, NULL, 'ja')
    `).run('v9050', 's9601', 'Anchor');

    const sibs = findStaffSiblings('s9600');
    expect(sibs).toHaveLength(1);
    expect(sibs[0].sid).toBe('s9601');
    expect(sibs[0].vns).toHaveLength(1);
  });

  it('uses VA-only input names and groups one candidate sid across multiple VNs', () => {
    seedVn('v9060', 'Input voice VN', true);
    seedVn('v9061', 'Candidate display VN', true);
    seedVn('v9062', 'Candidate original VN', true);
    seedVaCredit('v9060', 's9700', 'c9700', 'Voice Shared', 'Voice Original');
    seedStaffCredit('v9061', 's9701', 'Voice Shared');
    seedStaffCredit('v9062', 's9701', 'Different Display', 'Voice Original');

    const sibs = findStaffSiblings('s9700');
    expect(sibs).toHaveLength(1);
    expect(sibs[0]).toMatchObject({ sid: 's9701', name: 'Voice Shared', original: null });
    expect(sibs[0].vns).toEqual([
      { vn_id: 'v9061', vn_title: 'Candidate display VN' },
      { vn_id: 'v9062', vn_title: 'Candidate original VN' },
    ]);
  });
});
