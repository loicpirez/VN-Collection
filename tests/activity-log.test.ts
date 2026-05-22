/**
 * Contract tests for the activity-log layer:
 *   - `recordActivity` / `listUserActivity` from `@/lib/activity` (user_activity table)
 *   - `listActivityForVn` / `addManualActivity` from `@/lib/db` (vn_activity table)
 *
 * The test DB is the shared in-memory SQLite instance that vitest
 * initialises via `tests/setup.ts`. Each `describe` block cleans its
 * own rows so the suites are independent of execution order.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { listUserActivity, recordActivity } from '@/lib/activity';
import { addManualActivity, listActivityForVn } from '@/lib/db';

const VN_A = 'v80001';
const VN_B = 'v80002';

function seedVn(id: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
  ).run(id, `Test VN ${id}`, Date.now());
}

describe('recordActivity — happy path', () => {
  afterEach(() => {
    db.prepare('DELETE FROM user_activity WHERE actor = ?').run('test-actor');
  });

  it('stores a valid ActivityEvent without throwing', () => {
    expect(() =>
      recordActivity({
        kind: 'collection.add',
        entity: 'vn',
        entityId: 'v80099',
        label: 'Activity log test VN',
        payload: { status: 'playing' },
        actor: 'test-actor',
      }),
    ).not.toThrow();
  });

  it('written record is retrievable via listUserActivity', () => {
    recordActivity({
      kind: 'collection.add',
      entity: 'vn',
      entityId: 'v80099',
      label: 'Retrievable record',
      payload: { status: 'playing' },
      actor: 'test-actor',
    });
    const rows = listUserActivity({ kind: 'collection.add', entity: 'vn' });
    const match = rows.find((r) => r.actor === 'test-actor' && r.entity_id === 'v80099');
    expect(match).toBeDefined();
    expect(match?.kind).toBe('collection.add');
    expect(match?.label).toBe('Retrievable record');
    expect(match?.actor).toBe('test-actor');
  });
});

describe('listUserActivity — reverse-chronological ordering', () => {
  afterEach(() => {
    db.prepare("DELETE FROM user_activity WHERE kind = 'chrono-order-test'").run();
  });

  it('returns N items in reverse-chronological order (newest first)', () => {
    const base = Date.now();
    db.prepare(
      `INSERT INTO user_activity (occurred_at, kind, entity, entity_id, label, payload, actor)
       VALUES (?, 'chrono-order-test', 'vn', 'v1', 'first', NULL, 'user')`,
    ).run(base);
    db.prepare(
      `INSERT INTO user_activity (occurred_at, kind, entity, entity_id, label, payload, actor)
       VALUES (?, 'chrono-order-test', 'vn', 'v2', 'second', NULL, 'user')`,
    ).run(base + 1000);
    db.prepare(
      `INSERT INTO user_activity (occurred_at, kind, entity, entity_id, label, payload, actor)
       VALUES (?, 'chrono-order-test', 'vn', 'v3', 'third', NULL, 'user')`,
    ).run(base + 2000);

    const rows = listUserActivity({ kind: 'chrono-order-test' });
    expect(rows.length).toBeGreaterThanOrEqual(3);
    const labels = rows.slice(0, 3).map((r) => r.label);
    expect(labels).toEqual(['third', 'second', 'first']);
  });
});

describe('listActivityForVn — entity filtering', () => {
  beforeEach(() => {
    seedVn(VN_A);
    seedVn(VN_B);
  });

  afterEach(() => {
    db.prepare('DELETE FROM vn_activity WHERE vn_id IN (?, ?)').run(VN_A, VN_B);
    db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(VN_A, VN_B);
  });

  it('returns only rows for the requested VN, ignoring unrelated rows', () => {
    addManualActivity(VN_A, 'Note for VN A');
    addManualActivity(VN_A, 'Another note for VN A');
    addManualActivity(VN_B, 'Note for VN B — must not appear');

    const rows = listActivityForVn(VN_A);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.vn_id).toBe(VN_A);
    }
  });

  it('returns an empty array when the VN has no activity', () => {
    const rows = listActivityForVn(VN_A);
    expect(rows).toEqual([]);
  });

  it('returns rows newest-first when multiple entries exist', () => {
    const t0 = Date.now();
    db.prepare(
      `INSERT INTO vn_activity (vn_id, kind, payload, occurred_at)
       VALUES (?, 'manual', ?, ?)`,
    ).run(VN_A, JSON.stringify({ text: 'older entry' }), t0);
    db.prepare(
      `INSERT INTO vn_activity (vn_id, kind, payload, occurred_at)
       VALUES (?, 'manual', ?, ?)`,
    ).run(VN_A, JSON.stringify({ text: 'newer entry' }), t0 + 5000);

    const rows = listActivityForVn(VN_A);
    expect(rows[0].occurred_at).toBeGreaterThanOrEqual(rows[rows.length - 1].occurred_at);
    const texts = rows.map((r) => (r.payload as { text: string } | null)?.text);
    expect(texts[0]).toBe('newer entry');
    expect(texts[1]).toBe('older entry');
  });
});

describe('recordActivity — unknown kind edge case', () => {
  afterEach(() => {
    db.prepare("DELETE FROM user_activity WHERE kind = 'unknown.kind.xyz'").run();
  });

  it('stores and retrieves an unknown kind without throwing', () => {
    expect(() =>
      recordActivity({
        kind: 'unknown.kind.xyz',
        entity: 'vn',
        entityId: 'v80010',
        label: 'Edge case unknown kind',
        payload: { arbitrary: true },
      }),
    ).not.toThrow();

    const rows = listUserActivity({ kind: 'unknown.kind.xyz' });
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('unknown.kind.xyz');
  });
});
