/**
 * Round 5 page-audit hardening: `deleteActivityForVn(eid, vnId)` only
 * deletes an activity row when it belongs to the supplied VN. The bare
 * `deleteActivity(eid)` helper still exists but mutation endpoints
 * scoped to a VN should NOT let an out-of-scope `eid` slip through.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { addManualActivity, deleteActivityForVn, listActivityForVn } from '@/lib/db';

const VN_A = 'v90201';
const VN_B = 'v90202';

function seedVn(id: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
  ).run(id, `VN ${id}`, Date.now());
  db.prepare(
    `INSERT OR IGNORE INTO collection (vn_id, status, added_at, updated_at) VALUES (?, 'playing', ?, ?)`,
  ).run(id, Date.now(), Date.now());
}

describe('deleteActivityForVn — scoped delete', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM vn_activity').run();
    seedVn(VN_A);
    seedVn(VN_B);
  });

  it('deletes the row when the eid belongs to the supplied VN', () => {
    const entry = addManualActivity(VN_A, 'manual note A');
    expect(entry?.id).toBeDefined();
    const ok = deleteActivityForVn(entry!.id, VN_A);
    expect(ok).toBe(true);
    expect(listActivityForVn(VN_A, 100)).toHaveLength(0);
  });

  it('refuses to delete an entry that belongs to a different VN', () => {
    const entryB = addManualActivity(VN_B, 'manual note B');
    expect(entryB?.id).toBeDefined();
    // Attempt to delete VN_B's entry from VN_A's scope — must be rejected.
    const ok = deleteActivityForVn(entryB!.id, VN_A);
    expect(ok).toBe(false);
    expect(listActivityForVn(VN_B, 100)).toHaveLength(1);
  });

  it('returns false when the eid does not exist at all', () => {
    const ok = deleteActivityForVn(99_999_999, VN_A);
    expect(ok).toBe(false);
  });
});
