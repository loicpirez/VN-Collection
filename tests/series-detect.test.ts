import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { walkSeriesRelations, detectSeriesForVn } from '@/lib/series-detect';

const NOW = Date.now();

function insertVn(id: string, title: string, relations: { id: string; title: string; relation: string }[] = []): void {
  db.prepare(
    `INSERT INTO vn (id, title, fetched_at, relations)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, relations = excluded.relations`,
  ).run(id, title, NOW, relations.length > 0 ? JSON.stringify(relations) : null);
}

function insertCollection(vnId: string): void {
  db.prepare(
    `INSERT INTO collection (vn_id, status, added_at, updated_at)
     VALUES (?, 'playing', ?, ?)
     ON CONFLICT(vn_id) DO NOTHING`,
  ).run(vnId, NOW, NOW);
}

function clearTables(): void {
  db.exec(`
    DELETE FROM series_vn;
    DELETE FROM series;
    DELETE FROM collection;
    DELETE FROM vn;
  `);
}

beforeEach(clearTables);

describe('walkSeriesRelations', () => {
  it('returns empty array when seed has no relations', async () => {
    insertVn('v1', 'Title A');
    await expect(walkSeriesRelations('v1')).resolves.toEqual([]);
  });

  it('returns empty array when seed has no DB row', async () => {
    await expect(walkSeriesRelations('v9999')).resolves.toEqual([]);
  });

  it('returns direct series-strength relations', async () => {
    insertVn('v1', 'Title A', [{ id: 'v2', title: 'Title B', relation: 'seq' }]);
    insertVn('v2', 'Title B');
    const result = await walkSeriesRelations('v1');
    expect(result).toEqual([{ id: 'v2', title: 'Title B', relation: 'seq' }]);
  });

  it('walks transitively through the relation graph', async () => {
    insertVn('v1', 'A', [{ id: 'v2', title: 'B', relation: 'seq' }]);
    insertVn('v2', 'B', [{ id: 'v3', title: 'C', relation: 'seq' }]);
    insertVn('v3', 'C');
    const ids = (await walkSeriesRelations('v1')).map((r) => r.id);
    expect(ids).toContain('v2');
    expect(ids).toContain('v3');
    expect(ids).not.toContain('v1');
  });

  it('handles cycle guard — does not loop infinitely', async () => {
    insertVn('v1', 'A', [{ id: 'v2', title: 'B', relation: 'seq' }]);
    insertVn('v2', 'B', [{ id: 'v1', title: 'A', relation: 'preq' }]);
    const result = await walkSeriesRelations('v1');
    expect(result.map((r) => r.id)).toEqual(['v2']);
  });

  it('skips non-series relations (char, side, par, etc.)', async () => {
    insertVn('v1', 'A', [
      { id: 'v2', title: 'B', relation: 'char' },
      { id: 'v3', title: 'C', relation: 'side' },
      { id: 'v4', title: 'D', relation: 'seq' },
    ]);
    insertVn('v2', 'B');
    insertVn('v3', 'C');
    insertVn('v4', 'D');
    const ids = (await walkSeriesRelations('v1')).map((r) => r.id);
    expect(ids).toEqual(['v4']);
  });

  it('handles malformed JSON in relations column gracefully', async () => {
    db.prepare(`INSERT INTO vn (id, title, fetched_at, relations) VALUES ('v1', 'A', ?, '{bad}')`)
      .run(NOW);
    await expect(walkSeriesRelations('v1')).resolves.toEqual([]);
  });

  it('handles parseable non-array relations gracefully', async () => {
    db.prepare(`INSERT INTO vn (id, title, fetched_at, relations) VALUES ('v1', 'A', ?, '{"id":"v2"}')`)
      .run(NOW);
    await expect(walkSeriesRelations('v1')).resolves.toEqual([]);
  });

  it('caps a pathological relation frontier', async () => {
    insertVn('v1', 'A', Array.from({ length: 501 }, (_, index) => ({
      id: `v${index + 2}`,
      title: `Entry ${index + 2}`,
      relation: 'seq',
    })));
    expect(await walkSeriesRelations('v1')).toHaveLength(500);
  });
});

describe('detectSeriesForVn', () => {
  it('returns null when VN row does not exist', async () => {
    await expect(detectSeriesForVn('v9999')).resolves.toBeNull();
  });

  it('returns null when VN has no series-strength relations', async () => {
    insertVn('v1', 'Solo Game');
    insertCollection('v1');
    await expect(detectSeriesForVn('v1')).resolves.toBeNull();
  });

  it('returns null when VN is already part of a series', async () => {
    insertVn('v1', 'Game A', [{ id: 'v2', title: 'Game B', relation: 'seq' }]);
    insertVn('v2', 'Game B');
    insertCollection('v1');
    insertCollection('v2');
    const seriesId = (db.prepare(`INSERT INTO series (name, created_at, updated_at) VALUES ('Game Series', ?, ?)`)
      .run(NOW, NOW) as { lastInsertRowid: number }).lastInsertRowid;
    db.prepare(`INSERT INTO series_vn (series_id, vn_id) VALUES (?, 'v1')`).run(seriesId);
    await expect(detectSeriesForVn('v1')).resolves.toBeNull();
  });

  it('returns null when no related VNs are in collection', async () => {
    insertVn('v1', 'Game A', [{ id: 'v2', title: 'Game B', relation: 'seq' }]);
    insertVn('v2', 'Game B');
    insertCollection('v1');
    await expect(detectSeriesForVn('v1')).resolves.toBeNull();
  });

  it('suggests a new series when related VNs are in collection', async () => {
    insertVn('v1', 'Game Series Part 1', [{ id: 'v2', title: 'Game Series Part 2', relation: 'seq' }]);
    insertVn('v2', 'Game Series Part 2');
    insertCollection('v1');
    insertCollection('v2');
    const result = await detectSeriesForVn('v1');
    expect(result).not.toBeNull();
    expect(result!.relatedInCollection.map((r) => r.id)).toContain('v2');
    expect(result!.existing).toEqual([]);
    expect(typeof result!.suggestedName).toBe('string');
    expect(result!.suggestedName!.length).toBeGreaterThan(0);
  });

  it('surfaces existing series that contain related VNs', async () => {
    insertVn('v1', 'Series Entry 1', [{ id: 'v2', title: 'Series Entry 2', relation: 'seq' }]);
    insertVn('v2', 'Series Entry 2');
    insertCollection('v1');
    insertCollection('v2');
    const seriesId = (db.prepare(`INSERT INTO series (name, created_at, updated_at) VALUES ('The Series', ?, ?)`)
      .run(NOW, NOW) as { lastInsertRowid: number }).lastInsertRowid;
    db.prepare(`INSERT INTO series_vn (series_id, vn_id) VALUES (?, 'v2')`).run(seriesId);
    const result = await detectSeriesForVn('v1');
    expect(result).not.toBeNull();
    expect(result!.existing).toHaveLength(1);
    expect(result!.existing[0]!.name).toBe('The Series');
  });

  it('derives suggestedName from longest common prefix', async () => {
    insertVn('v1', 'My Game Part 1', [{ id: 'v2', title: 'My Game Part 2', relation: 'seq' }]);
    insertVn('v2', 'My Game Part 2');
    insertCollection('v1');
    insertCollection('v2');
    const result = await detectSeriesForVn('v1');
    expect(result!.suggestedName).toMatch(/^My Game/);
  });

  it('falls back to a trimmed seed title when related titles have no common prefix', async () => {
    insertVn('v1', 'Fixture 2', [{ id: 'v2', title: 'Other', relation: 'seq' }]);
    insertVn('v2', 'Other');
    insertCollection('v2');
    expect((await detectSeriesForVn('v1'))?.suggestedName).toBe('Fixture');
  });

  it('falls back to the original seed title when trimming removes everything', async () => {
    insertVn('v1', ': subtitle', [{ id: 'v2', title: 'Other', relation: 'seq' }]);
    insertVn('v2', 'Other');
    insertCollection('v2');
    expect((await detectSeriesForVn('v1'))?.suggestedName).toBe(': subtitle');
  });
});
