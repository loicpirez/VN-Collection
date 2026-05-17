/**
 * Pins the `?edition=<type>` Library filter wired so that the stats
 * page's "By edition" deep-link actually narrows the grid. The filter
 * matches `collection.edition_type` exactly — values come from
 * `EDITION_TYPES` in `src/lib/types.ts`.
 *
 * Synthetic VN ids only; never touches the real DB or upstream APIs.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import {
  addToCollection,
  listCollection,
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
    `DELETE FROM collection WHERE vn_id LIKE 'v9%';
     DELETE FROM vn WHERE id LIKE 'v9%';`,
  );
}

beforeAll(() => clear());
beforeEach(() => clear());

describe('Library ?edition=<type> filter', () => {
  it('filters to the requested edition_type exactly', () => {
    seedVn('v90200');
    seedVn('v90201');
    seedVn('v90202');
    addToCollection('v90200', {});
    addToCollection('v90201', {});
    addToCollection('v90202', {});
    updateCollection('v90200', { edition_type: 'physical' });
    updateCollection('v90201', { edition_type: 'digital' });
    updateCollection('v90202', { edition_type: 'limited' });

    const physical = listCollection({ edition: 'physical' }).map((i) => i.id);
    expect(physical).toEqual(['v90200']);

    const digital = listCollection({ edition: 'digital' }).map((i) => i.id);
    expect(digital).toEqual(['v90201']);

    const limited = listCollection({ edition: 'limited' }).map((i) => i.id);
    expect(limited).toEqual(['v90202']);
  });

  it('does not return rows with a different edition_type', () => {
    seedVn('v90210');
    seedVn('v90211');
    addToCollection('v90210', {});
    addToCollection('v90211', {});
    updateCollection('v90210', { edition_type: 'collector' });
    updateCollection('v90211', { edition_type: 'standard' });

    const ids = listCollection({ edition: 'collector' }).map((i) => i.id);
    expect(ids).toContain('v90210');
    expect(ids).not.toContain('v90211');
  });

  it('treats `none` as a real bucket (the unset default)', () => {
    seedVn('v90220');
    addToCollection('v90220', {});
    // edition_type defaults to 'none'; do not call updateCollection.
    const ids = listCollection({ edition: 'none' }).map((i) => i.id);
    expect(ids).toContain('v90220');
  });

  it('does NOT filter when the option is undefined', () => {
    seedVn('v90230');
    seedVn('v90231');
    addToCollection('v90230', {});
    addToCollection('v90231', {});
    updateCollection('v90230', { edition_type: 'physical' });
    updateCollection('v90231', { edition_type: 'digital' });

    const ids = listCollection({}).map((i) => i.id);
    expect(ids).toContain('v90230');
    expect(ids).toContain('v90231');
  });
});
