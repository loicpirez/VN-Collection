/**
 * R5-138 pin: the four `listCollection` filter clauses
 * (`producer`, `publisher`, `tag`, `place`, formerly `json_each`) now
 * read from flat derived indexes
 * (`vn_developer_index`, `vn_publisher_index`, `vn_tag_index`,
 * `collection_place_index`).
 *
 * Two halves:
 *   1. Source-pin — the rewritten WHERE clauses no longer use
 *      `json_each(v.developers|v.publishers|v.tags)`.
 *   2. Behaviour — upsertVn populates the index tables; the
 *      backfill marker (`vn_tag_index_v1`) is set; the filter
 *      finds the expected matches.
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addToCollection, listCollection, listKnownPlaces, setVnPublishers, updateCollection, upsertVn } from '@/lib/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Force lib/db to bootstrap.
listCollection({});
const db = new Database(process.env.DB_PATH!);

const SOURCE = readFileSync(join(__dirname, '..', 'src/lib/db.ts'), 'utf8');

beforeAll(() => {
  db.exec(`
    DELETE FROM owned_release;
    DELETE FROM collection;
    DELETE FROM collection_place_index;
    DELETE FROM vn_publisher_index;
    DELETE FROM vn_developer_index;
    DELETE FROM vn_tag_index;
    DELETE FROM vn;
  `);
});

afterAll(() => {
  db.close();
});

beforeEach(() => {
  db.exec(`
    DELETE FROM owned_release;
    DELETE FROM collection;
    DELETE FROM collection_place_index;
    DELETE FROM vn_publisher_index;
    DELETE FROM vn_developer_index;
    DELETE FROM vn_tag_index;
    DELETE FROM vn;
  `);
});

describe('R5-138 — listCollection filters via derived indexes', () => {
  it('listCollection WHERE clauses use the derived indexes', () => {
    const body = SOURCE.split('export function listCollection')[1]?.split('\nexport ')[0] ?? '';
    expect(body).toMatch(/vn_developer_index WHERE vn_id = c\.vn_id AND producer_id = \?/);
    expect(body).toMatch(/vn_publisher_index WHERE vn_id = c\.vn_id AND producer_id = \?/);
    expect(body).toMatch(/vn_tag_index WHERE vn_id = c\.vn_id AND tag_id = \?/);
    expect(body).toMatch(/collection_place_index WHERE vn_id = c\.vn_id AND place = \?/);
  });

  it('listCollection WHERE clauses no longer EXISTS json_each over filter JSON columns', () => {
    const body = SOURCE.split('export function listCollection')[1]?.split('\nexport ')[0] ?? '';
    expect(body).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+json_each\(v\.developers\)/);
    expect(body).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+json_each\(v\.tags\)/);
    expect(body).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+json_each\(COALESCE\(v\.publishers/);
    expect(body).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+json_each\(c\.physical_location\)/);
  });

  it('upsertVn populates vn_tag_index + vn_developer_index in the transaction', () => {
    upsertVn({
      id: 'v9300',
      title: 'fixture',
      developers: [{ id: 'p913001', name: 'dev-A' }],
      tags: [
        { id: 'g1', name: 'romance', rating: 3, spoiler: 0, category: 'cont' },
        { id: 'g2', name: 'comedy', rating: 2, spoiler: 0, category: 'cont' },
      ],
    });
    const tagRows = db.prepare('SELECT tag_id, tag_name, spoiler, category FROM vn_tag_index WHERE vn_id = ? ORDER BY tag_id').all('v9300');
    expect(tagRows).toEqual([
      { tag_id: 'g1', tag_name: 'romance', spoiler: 0, category: 'cont' },
      { tag_id: 'g2', tag_name: 'comedy', spoiler: 0, category: 'cont' },
    ]);
    const devRows = db.prepare('SELECT producer_id FROM vn_developer_index WHERE vn_id = ?').all('v9300');
    expect(devRows).toEqual([{ producer_id: 'p913001' }]);
  });

  it('setVnPublishers populates vn_publisher_index in the transaction', () => {
    upsertVn({ id: 'v9301', title: 'fixture' });
    setVnPublishers('v9301', [{ id: 'p91100', name: 'pub-A' }, { id: 'p91100', name: 'pub-A' }]);
    const rows = db.prepare('SELECT producer_id FROM vn_publisher_index WHERE vn_id = ?').all('v9301');
    expect(rows).toEqual([{ producer_id: 'p91100' }]);
  });

  it('listCollection({tag}) finds VNs through the new index path', () => {
    upsertVn({
      id: 'v9302',
      title: 'fixture-tag',
      tags: [{ id: 'g42', name: 'mystery', rating: 3, spoiler: 0, category: 'cont' }],
    });
    addToCollection('v9302', { status: 'planning' });
    const items = listCollection({ tag: 'g42' });
    expect(items.map((it) => it.id)).toContain('v9302');
    // And the wrong tag does NOT match.
    expect(listCollection({ tag: 'g99' }).map((it) => it.id)).not.toContain('v9302');
  });

  it('listCollection({producer}) finds VNs through vn_developer_index', () => {
    upsertVn({
      id: 'v9303',
      title: 'fixture-dev',
      developers: [{ id: 'p91200', name: 'dev-B' }],
    });
    addToCollection('v9303', { status: 'planning' });
    const items = listCollection({ producer: 'p91200' });
    expect(items.map((it) => it.id)).toContain('v9303');
    expect(listCollection({ producer: 'p9999' }).map((it) => it.id)).not.toContain('v9303');
  });

  it('listCollection({publisher}) finds VNs through vn_publisher_index', () => {
    upsertVn({ id: 'v9304', title: 'fixture-pub' });
    setVnPublishers('v9304', [{ id: 'p91300', name: 'pub-B' }]);
    addToCollection('v9304', { status: 'planning' });
    const items = listCollection({ publisher: 'p91300' });
    expect(items.map((it) => it.id)).toContain('v9304');
    expect(listCollection({ publisher: 'p9999' }).map((it) => it.id)).not.toContain('v9304');
  });

  it('listCollection({place}) and listKnownPlaces read from collection_place_index', () => {
    upsertVn({ id: 'v9305', title: 'fixture-place-A' });
    upsertVn({ id: 'v9306', title: 'fixture-place-B' });
    addToCollection('v9305', { status: 'planning', physical_location: ['Shelf A', 'Box 1'] });
    addToCollection('v9306', { status: 'planning', physical_location: ['Shelf B'] });

    expect(
      db.prepare('SELECT place FROM collection_place_index WHERE vn_id = ? ORDER BY place').all('v9305'),
    ).toEqual([{ place: 'Box 1' }, { place: 'Shelf A' }]);
    expect(listCollection({ place: 'Shelf A' }).map((it) => it.id)).toEqual(['v9305']);
    expect(listKnownPlaces()).toEqual(['Box 1', 'Shelf A', 'Shelf B']);

    updateCollection('v9305', { physical_location: ['Shelf C'] });
    expect(listCollection({ place: 'Shelf A' }).map((it) => it.id)).not.toContain('v9305');
    expect(listCollection({ place: 'Shelf C' }).map((it) => it.id)).toEqual(['v9305']);
  });
});
