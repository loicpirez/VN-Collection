/**
 * Pin the owned-release fields forwarded through listShelfSlots /
 * listShelfDisplaySlots. The shelf popover for a placed cell used
 * to hide physical_location, price_paid, currency, and acquired_date
 * because the slot SQL only joined the display-critical subset of
 * owned_release. The synthesizer then hardcoded these fields to
 * empty placeholders, contradicting the popover's contract of
 * "surface every owned-release fact for the placed edition".
 *
 * This test seeds an owned_release with annotations + places it on a
 * shelf, then asserts the listShelfSlots row carries the four
 * annotations verbatim.
 *
 * Synthetic v9xxxx ids only; never touches the real DB or upstream.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  createShelf,
  listShelfDisplaySlots,
  listShelfSlots,
  listShelves,
  placeShelfDisplayItem,
  placeShelfItem,
} from '@/lib/db';

listShelves();
const db = new Database(process.env.DB_PATH!);

function seed(vnId: string, releaseId: string, fields: {
  physical_location: string[];
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
}): void {
  const now = Date.now();
  db.prepare('INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(vnId, vnId, now);
  db.prepare(
    `INSERT OR REPLACE INTO owned_release (
       vn_id, release_id, physical_location, price_paid, currency,
       acquired_date, added_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    vnId,
    releaseId,
    JSON.stringify(fields.physical_location),
    fields.price_paid,
    fields.currency,
    fields.acquired_date,
    now,
  );
}

function clear(): void {
  db.exec(
    'DELETE FROM shelf_display_slot; DELETE FROM shelf_slot; DELETE FROM shelf_unit; DELETE FROM owned_release WHERE vn_id LIKE \'v9%\'; DELETE FROM vn WHERE id LIKE \'v9%\';',
  );
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('listShelfSlots forwards owned-release annotations', () => {
  it('returns physical_location, price_paid, currency, acquired_date', () => {
    seed('v90300', 'r903000', {
      physical_location: ['shelf-A', 'box-7'],
      price_paid: 4500,
      currency: 'JPY',
      acquired_date: '2024-08-15',
    });
    const shelf = createShelf({ name: 'Test shelf' });
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v90300', releaseId: 'r903000' });

    const slots = listShelfSlots(shelf.id);
    expect(slots).toHaveLength(1);
    const slot = slots[0];
    expect(slot.physical_location).toEqual(['shelf-A', 'box-7']);
    expect(slot.price_paid).toBe(4500);
    expect(slot.currency).toBe('JPY');
    expect(slot.acquired_date).toBe('2024-08-15');
  });

  it('returns null / empty defaults when fields are unset', () => {
    seed('v90301', 'r903010', {
      physical_location: [],
      price_paid: null,
      currency: null,
      acquired_date: null,
    });
    const shelf = createShelf({ name: 'Empty annotations shelf' });
    placeShelfItem({ shelfId: shelf.id, row: 0, col: 0, vnId: 'v90301', releaseId: 'r903010' });

    const [slot] = listShelfSlots(shelf.id);
    expect(slot.physical_location).toEqual([]);
    expect(slot.price_paid).toBeNull();
    expect(slot.currency).toBeNull();
    expect(slot.acquired_date).toBeNull();
  });
});

describe('listShelfDisplaySlots forwards owned-release annotations', () => {
  it('returns the same fields as the cell-slot query', () => {
    seed('v90310', 'r903100', {
      physical_location: ['front-display'],
      price_paid: 12000,
      currency: 'EUR',
      acquired_date: '2026-01-02',
    });
    const shelf = createShelf({ name: 'Front display shelf', cols: 4, rows: 2 });
    placeShelfDisplayItem({
      shelfId: shelf.id,
      afterRow: 0,
      position: 0,
      vnId: 'v90310',
      releaseId: 'r903100',
    });

    const slots = listShelfDisplaySlots(shelf.id);
    expect(slots).toHaveLength(1);
    const slot = slots[0];
    expect(slot.physical_location).toEqual(['front-display']);
    expect(slot.price_paid).toBe(12000);
    expect(slot.currency).toBe('EUR');
    expect(slot.acquired_date).toBe('2026-01-02');
  });
});
