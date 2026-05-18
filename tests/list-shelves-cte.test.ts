/**
 * R5-143 pin: `listShelves()` uses a CTE/GROUP BY for placed_count.
 *
 * The previous shape ran two correlated `SELECT COUNT(*) … WHERE
 * shelf_id = u.id` subqueries per shelf row (one for `shelf_slot`,
 * one for `shelf_display_slot`). Cost was O(N_shelves) subquery
 * evaluations, each a separate scan over the placement tables.
 *
 * The refactor aggregates each placement table ONCE inside a CTE,
 * unions the per-shelf totals, sums them, and the outer query is a
 * single LEFT JOIN. We pin two things:
 *
 *   1. Source shape: `WITH placement_counts AS` + `LEFT JOIN
 *      placement_counts` — no correlated subqueries left.
 *   2. Behaviour: a shelf with 3 grid slots + 2 display slots
 *      reports `placed_count = 5`; an empty shelf reports 0.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createShelf,
  listShelves,
  placeShelfDisplayItem,
  placeShelfItem,
} from '@/lib/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Force lib/db to bootstrap.
listShelves();
const db = new Database(process.env.DB_PATH!);

const SOURCE = readFileSync(join(__dirname, '..', 'src/lib/db.ts'), 'utf8');

beforeAll(() => {
  db.exec(`
    DELETE FROM shelf_display_slot;
    DELETE FROM shelf_slot;
    DELETE FROM shelf_unit;
    DELETE FROM owned_release;
    DELETE FROM collection;
    DELETE FROM vn;
  `);
});

afterAll(() => {
  db.close();
});

function ensureVnAndOwned(vnId: string, releaseId: string): void {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(vnId, vnId, now);
  db.prepare(`INSERT OR IGNORE INTO collection (vn_id, added_at, updated_at, status) VALUES (?, ?, ?, 'planning')`).run(vnId, now, now);
  db.prepare(
    `INSERT OR IGNORE INTO owned_release (vn_id, release_id, added_at) VALUES (?, ?, ?)`,
  ).run(vnId, releaseId, now);
}

describe('listShelves — R5-143 CTE/GROUP BY', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM shelf_display_slot;
      DELETE FROM shelf_slot;
      DELETE FROM shelf_unit;
      DELETE FROM owned_release;
      DELETE FROM collection;
      DELETE FROM vn;
    `);
  });

  it('source uses CTE WITH placement_counts AS … LEFT JOIN', () => {
    const body = SOURCE.split('export function listShelves')[1]?.split('\nexport ')[0] ?? '';
    expect(body).toMatch(/WITH\s+placement_counts\s+AS/i);
    expect(body).toMatch(/LEFT\s+JOIN\s+placement_counts/i);
  });

  it('source no longer has the correlated `WHERE s.shelf_id = u.id` subquery pattern', () => {
    const body = SOURCE.split('export function listShelves')[1]?.split('\nexport ')[0] ?? '';
    // The pre-refactor shape had two `SELECT COUNT(*) FROM
    // shelf_(display_)?slot WHERE shelf_id = u.id` subqueries. The
    // CTE has no such alias-correlated comparison.
    expect(body).not.toMatch(/WHERE\s+s\.shelf_id\s*=\s*u\.id/i);
    expect(body).not.toMatch(/WHERE\s+d\.shelf_id\s*=\s*u\.id/i);
  });

  it('placed_count sums grid slots + display slots and coalesces empty shelves to 0', () => {
    const shelfA = createShelf({ name: 'A', cols: 4, rows: 3 });
    const shelfB = createShelf({ name: 'B', cols: 4, rows: 3 });
    ensureVnAndOwned('v9000', 'r1');
    ensureVnAndOwned('v9001', 'r2');
    ensureVnAndOwned('v9002', 'r3');
    ensureVnAndOwned('v9003', 'r4');
    ensureVnAndOwned('v9004', 'r5');
    // Shelf A: 3 grid slots
    placeShelfItem({ shelfId: shelfA.id, row: 0, col: 0, vnId: 'v9000', releaseId: 'r1' });
    placeShelfItem({ shelfId: shelfA.id, row: 0, col: 1, vnId: 'v9001', releaseId: 'r2' });
    placeShelfItem({ shelfId: shelfA.id, row: 0, col: 2, vnId: 'v9002', releaseId: 'r3' });
    // Shelf A: 2 display slots
    placeShelfDisplayItem({ shelfId: shelfA.id, afterRow: 0, position: 0, vnId: 'v9003', releaseId: 'r4' });
    placeShelfDisplayItem({ shelfId: shelfA.id, afterRow: 0, position: 1, vnId: 'v9004', releaseId: 'r5' });
    // Shelf B: empty.
    const shelves = listShelves();
    const a = shelves.find((s) => s.id === shelfA.id);
    const b = shelves.find((s) => s.id === shelfB.id);
    expect(a?.placed_count).toBe(5);
    expect(b?.placed_count).toBe(0);
  });

  it('a shelf with only display slots still reports the right placed_count', () => {
    const shelf = createShelf({ name: 'Disp', cols: 4, rows: 3 });
    ensureVnAndOwned('v9100', 'r1');
    ensureVnAndOwned('v9101', 'r2');
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: 0, vnId: 'v9100', releaseId: 'r1' });
    placeShelfDisplayItem({ shelfId: shelf.id, afterRow: 0, position: 1, vnId: 'v9101', releaseId: 'r2' });
    const listed = listShelves().find((s) => s.id === shelf.id);
    expect(listed?.placed_count).toBe(2);
  });
});
