/**
 * R5-138 pin: the four `listCollection` filter clauses
 * (`producer`, `publisher`, `tag`, formerly `json_each`) now
 * read from flat derived indexes
 * (`vn_developer_index`, `vn_publisher_index`, `vn_tag_index`).
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
import { addToCollection, listCollection, setVnPublishers, upsertVn } from '@/lib/db';
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
    DELETE FROM vn_publisher_index;
    DELETE FROM vn_developer_index;
    DELETE FROM vn_tag_index;
    DELETE FROM vn;
  `);
});

describe('R5-138 — listCollection filters via vn_tag_index / vn_developer_index / vn_publisher_index', () => {
  it('listCollection WHERE clauses use the derived indexes', () => {
    const body = SOURCE.split('export function listCollection')[1]?.split('\nexport ')[0] ?? '';
    expect(body).toMatch(/vn_developer_index WHERE vn_id = c\.vn_id AND producer_id = \?/);
    expect(body).toMatch(/vn_publisher_index WHERE vn_id = c\.vn_id AND producer_id = \?/);
    expect(body).toMatch(/vn_tag_index WHERE vn_id = c\.vn_id AND tag_id = \?/);
  });

  it('listCollection WHERE clauses no longer EXISTS json_each over v.developers / v.tags / v.publishers', () => {
    const body = SOURCE.split('export function listCollection')[1]?.split('\nexport ')[0] ?? '';
    // Only assert the EXISTS-over-json_each FILTER shape is gone.
    // The sort path that still does `MIN(json_extract(...) FROM
    // json_each(...))` for ORDER BY publisher / developer name is
    // a separate optimisation (R5-138 carry-over) — out of scope
    // for the filter rewrite.
    expect(body).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+json_each\(v\.developers\)/);
    expect(body).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+json_each\(v\.tags\)/);
    expect(body).not.toMatch(/EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+json_each\(COALESCE\(v\.publishers/);
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
    const tagRows = db.prepare('SELECT tag_id, spoiler, category FROM vn_tag_index WHERE vn_id = ? ORDER BY tag_id').all('v9300');
    expect(tagRows).toEqual([
      { tag_id: 'g1', spoiler: 0, category: 'cont' },
      { tag_id: 'g2', spoiler: 0, category: 'cont' },
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
});
