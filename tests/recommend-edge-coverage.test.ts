import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';

interface FakeHit {
  id: string;
  title: string;
  alttitle?: string | null;
  released?: string | null;
  rating?: number | null;
  votecount?: number | null;
  length_minutes?: number | null;
  image?: { url: string; thumbnail: string; sexual?: number | null } | null;
  developers?: { id: string; name: string }[];
}

const POOL = new Map<string, FakeHit[]>();

vi.mock('@/lib/vndb-recommend', () => ({
  vndbAdvancedSearchRaw: vi.fn(async (args: { filters: unknown }) => {
    const filters = args.filters as [string, [string, string, [string, ...unknown[]]], unknown];
    const tagId = filters[1][2][0];
    return POOL.get(tagId) ?? [];
  }),
}));

import { addToCollection, listShelves } from '@/lib/db';
import { recommendVns } from '@/lib/recommend';

listShelves();
const db = new Database(process.env.DB_PATH!);

function insertVn(
  id: string,
  tags: unknown[],
  {
    title = id,
    developers = null,
    staff = null,
  }: {
    title?: string;
    developers?: unknown[] | null;
    staff?: unknown[] | null;
  } = {},
): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn (id, title, tags, developers, staff, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    title,
    JSON.stringify(tags),
    developers === null ? null : JSON.stringify(developers),
    staff === null ? null : JSON.stringify(staff),
    Date.now(),
  );
}

beforeEach(() => {
  db.exec(`
    DELETE FROM collection WHERE vn_id LIKE 'v98%';
    DELETE FROM reading_queue WHERE vn_id LIKE 'v98%';
    DELETE FROM vn WHERE id LIKE 'v98%';
    DELETE FROM vndb_cache WHERE cache_key LIKE '%edge%';
  `);
  POOL.clear();
});

describe('recommendVns edge contracts', () => {
  it('returns a clean empty similar result when a valid anchor has no usable tags', async () => {
    insertVn('v980001', []);

    await expect(recommendVns({ mode: 'similar-to-vn', seedVnId: 'v980001' })).resolves.toEqual({
      seeds: [],
      results: [],
      mode: 'similar-to-vn',
    });
  });

  it('supports a synthetic anchor with pinned tags when no local VN title exists', async () => {
    POOL.set('gEdgePinned', [{ id: 'v989001', title: 'candidate', rating: 82, votecount: 300 }]);

    const result = await recommendVns({
      mode: 'similar-to-vn',
      seedVnId: 'egs_980001',
      customTagIds: ['gEdgePinned'],
    });

    expect(result.seeds).toEqual([{
      tagId: 'gEdgePinned',
      name: 'gEdgePinned',
      weight: 1,
      contributors: ['egs_980001'],
    }]);
    expect(result.results[0]?.contributors).toEqual([{ id: 'egs_980001', title: 'egs_980001' }]);
  });

  it('normalizes sparse tag and identity JSON while retaining supported identity shapes', async () => {
    insertVn(
      'v980010',
      [
        null,
        { id: 10, name: 'bad-id' },
        { id: 'gEdgePlain', name: 'plain' },
        { id: 'gEdgeNullCategory', name: 'null-category', rating: 2, spoiler: 0, category: null },
        { id: 'gEdgeSpoiler', name: 'spoiler', spoiler: 1 },
        { id: 'gEdgeEro', name: 'ero', category: 'ero' },
      ],
      {
        title: '',
        developers: [null, { id: 'p980010' }, { aid: 'ignored-aid' }, { name: 'Studio Edge' }, {}],
        staff: [null, { id: 's980010' }, { aid: 'a980010' }, { aid: 980010 }, { name: 'Staff Edge' }, {}],
      },
    );
    addToCollection('v980010', { status: 'completed' });
    db.prepare(`UPDATE collection SET user_rating = 0 WHERE vn_id = ?`).run('v980010');
    POOL.set('gEdgePlain', [{ id: 'v989010', title: 'candidate', rating: 80, votecount: 300 }]);
    POOL.set('gEdgeNullCategory', [{ id: 'v989010', title: 'candidate', rating: 80, votecount: 300 }]);
    POOL.set('gEdgeEro', [{ id: 'v989011', title: 'ero-candidate', rating: 80, votecount: 300 }]);

    const withoutEro = await recommendVns({ useWishlist: false });
    const withEro = await recommendVns({ useWishlist: false, includeEro: true });

    expect(withoutEro.seeds.map((seed) => seed.tagId)).toEqual(expect.arrayContaining([
      'gEdgePlain',
      'gEdgeNullCategory',
    ]));
    expect(withoutEro.seeds.map((seed) => seed.tagId)).not.toContain('gEdgeSpoiler');
    expect(withoutEro.seeds.map((seed) => seed.tagId)).not.toContain('gEdgeEro');
    expect(withEro.seeds.map((seed) => seed.tagId)).toContain('gEdgeEro');
    expect(withoutEro.results[0]?.contributors).toEqual([{ id: 'v980010', title: 'v980010' }]);
  });

  it('decodes malformed wishlist entries and both supported label encodings', async () => {
    insertVn('v980020', [{ id: 'gEdgeWish', name: 'wish' }]);
    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).run(
      'POST /ulist|edge-wishlist',
      JSON.stringify({
        results: [
          null,
          { id: 'bad-id', labels: [5] },
          { id: 'V980020', label_ids: [{ id: 5 }, { id: 'bad' }, 5.5], labels: 'bad-shape' },
        ],
      }),
      Date.now(),
      Date.now() + 60_000,
    );
    POOL.set('gEdgeWish', [{ id: 'v989020', title: 'candidate', rating: 80, votecount: 300 }]);

    const result = await recommendVns({ includeWishlist: true });

    expect(result.signalCounts?.wishlist).toBe(1);
    expect(result.seeds.map((seed) => seed.tagId)).toContain('gEdgeWish');
  });

  it('falls back to tag ids and preserves sparse upstream recommendation fields', async () => {
    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).run(
      'POST /tag|edge-tags',
      JSON.stringify({
        results: [
          null,
          { id: 10, name: 'bad-id' },
          { id: 'gEdgeNamed', name: '' },
          { id: 'gEdgeNamed', name: 'Named tag' },
          { id: 'gEdgeNamed', name: 'Ignored duplicate' },
        ],
      }),
      Date.now(),
      Date.now() + 60_000,
    );
    POOL.set('gEdgeNamed', [{
      id: 'v989030',
      title: 'full',
      alttitle: 'alternate',
      released: '2025-01-01',
      rating: 80,
      votecount: 300,
      length_minutes: 60,
      image: { url: 'https://example.invalid/full.jpg', thumbnail: 'https://example.invalid/thumb.jpg' },
      developers: [{ id: 'p980030', name: 'Studio Edge' }],
    }]);
    POOL.set('gEdgeUnknown', [{
      id: 'v989031',
      title: 'sparse',
      rating: null,
      votecount: null,
      image: { url: 'https://example.invalid/sparse.jpg', thumbnail: 'https://example.invalid/sparse-thumb.jpg', sexual: null },
    }]);

    const result = await recommendVns({ customTagIds: ['gEdgeNamed', 'gEdgeUnknown'] });

    expect(result.seeds).toEqual([
      { tagId: 'gEdgeNamed', name: 'Named tag', weight: 1 },
      { tagId: 'gEdgeUnknown', name: 'gEdgeUnknown', weight: 1 },
    ]);
    expect(result.results.find((row) => row.id === 'v989030')?.image?.sexual).toBeNull();
    expect(result.results.find((row) => row.id === 'v989031')).toMatchObject({
      rating: null,
      votecount: null,
      contributors: undefined,
    });
  });

  it('applies sparse votecount and rating defaults in mode-specific filters', async () => {
    POOL.set('gEdgeSparse', [
      { id: 'v989040', title: 'sparse-a', rating: null, votecount: null },
      { id: 'v989041', title: 'sparse-b', rating: null, votecount: null },
      { id: 'v989042', title: 'missing-votes', rating: 90, votecount: null },
    ]);

    const hidden = await recommendVns({ mode: 'hidden-gems', customTagIds: ['gEdgeSparse'] });
    const highlyRated = await recommendVns({ mode: 'highly-rated', customTagIds: ['gEdgeSparse'] });

    expect(hidden.results.map((row) => row.id)).toContain('v989040');
    expect(highlyRated.results).toEqual([]);
  });

  it('filters spoiler and erotic tags for similar mode and uses the default sparse-tag weight', async () => {
    insertVn('v980050', [
      { id: 'gEdgeSimilarPlain', name: 'plain' },
      { id: 'gEdgeSimilarSpoiler', name: 'spoiler', spoiler: 1 },
      { id: 'gEdgeSimilarEro', name: 'ero', category: 'ero' },
    ]);
    POOL.set('gEdgeSimilarPlain', [{ id: 'v989050', title: 'plain', rating: 80, votecount: 300 }]);
    POOL.set('gEdgeSimilarEro', [{ id: 'v989051', title: 'ero', rating: 80, votecount: 300 }]);

    const withoutEro = await recommendVns({ mode: 'similar-to-vn', seedVnId: 'v980050' });
    const withEro = await recommendVns({ mode: 'similar-to-vn', seedVnId: 'v980050', includeEro: true });

    expect(withoutEro.seeds).toEqual([{
      tagId: 'gEdgeSimilarPlain',
      name: 'plain',
      weight: 1,
      contributors: ['v980050'],
    }]);
    expect(withEro.seeds.map((seed) => seed.tagId)).toEqual(expect.arrayContaining([
      'gEdgeSimilarPlain',
      'gEdgeSimilarEro',
    ]));
  });
});
