/**
 * Branch coverage for `src/lib/collection-import.ts`
 * (`decodeCollectionImportPayload`). Pure validator — no mocks needed.
 *
 * The existing `collection-import-validation.test.ts` pins the happy path
 * plus a handful of rejections; this file walks the remaining field-level
 * error branches and the success paths of the nested `raw` sub-validators
 * (titles / editions / extlinks / image / developers / tags / relations),
 * the per-collection-field bounds, and the series / series_vn decoders.
 */
import { describe, expect, it } from 'vitest';
import { decodeCollectionImportPayload } from '@/lib/collection-import';

const NOW = Date.now();

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    exported_at: NOW,
    vns: [],
    collection: [],
    series: [],
    series_vn: [],
    ...overrides,
  };
}

function collectionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    vn_id: 'v90001',
    status: 'planning',
    ...overrides,
  };
}

function expectError(input: unknown, error: string): void {
  expect(decodeCollectionImportPayload(input)).toEqual({ ok: false, error });
}

describe('decodeCollectionImportPayload — top-level envelope', () => {
  it('rejects a non-object payload', () => {
    expectError('not-an-object', 'import payload must be an object');
    expectError(null, 'import payload must be an object');
  });

  it('rejects a wrong version', () => {
    expectError(payload({ version: 1 }), 'import payload version must be 2');
  });

  it('rejects a non-integer exported_at', () => {
    expectError(payload({ exported_at: -1 }), 'exported_at must be a non-negative safe integer');
    expectError(payload({ exported_at: 1.5 }), 'exported_at must be a non-negative safe integer');
  });

  it('rejects a non-array section', () => {
    expectError(payload({ vns: {} }), 'vns must be an array');
    expectError(payload({ collection: 'x' }), 'collection must be an array');
  });

  it('rejects a section that exceeds the import row cap', () => {
    const huge = new Array(50_001).fill({ id: 'v1', title: 't', raw: {}, fetched_at: NOW });
    expectError(payload({ vns: huge }), 'vns exceeds row cap');
  });
});

describe('decodeCollectionImportPayload — vn rows', () => {
  it('rejects a non-object vn entry', () => {
    expectError(payload({ vns: [42] }), 'vns[0] must be an object');
  });

  it('rejects an invalid vn id', () => {
    expectError(payload({ vns: [{ id: 'not-an-id', title: 't', raw: {}, fetched_at: NOW }] }), 'vns[0].id must match v\\d+ or egs_\\d+');
  });

  it('rejects an empty or over-long title', () => {
    expectError(payload({ vns: [{ id: 'v1', title: '   ', raw: {}, fetched_at: NOW }] }), 'vns[0].title must be a non-empty string at most 1000 characters');
    expectError(payload({ vns: [{ id: 'v1', title: 'x'.repeat(1001), raw: {}, fetched_at: NOW }] }), 'vns[0].title must be a non-empty string at most 1000 characters');
  });

  it('rejects a bad fetched_at', () => {
    expectError(payload({ vns: [{ id: 'v1', title: 't', raw: null, fetched_at: -5 }] }), 'vns[0].fetched_at must be a non-negative safe integer');
  });

  it('accepts a null raw and an egs_ synthetic id', () => {
    const out = decodeCollectionImportPayload(payload({ vns: [{ id: 'egs_42', title: ' Synth ', raw: null, fetched_at: NOW }] }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.vns[0]).toMatchObject({ id: 'egs_42', title: 'Synth', raw: null });
  });

  it('accepts a fully populated, valid raw payload exercising every sub-validator', () => {
    const raw = {
      id: 'v90001',
      title: 'Title',
      alttitle: null,
      aliases: ['a', 'b'],
      titles: [{ lang: 'ja', title: 'タイトル', latin: 'Taitoru', official: true, main: true }],
      released: '2020-01-01',
      olang: 'ja',
      devstatus: 0,
      languages: ['ja', 'en'],
      platforms: ['win'],
      length_minutes: 600,
      length: 2,
      length_votes: 10,
      rating: 80,
      votecount: 100,
      average: 75,
      description: 'desc',
      image: { url: 'https://x/y.jpg', thumbnail: null, sexual: 0, violence: 0, dims: [800, 600] },
      extlinks: [{ url: 'https://x', label: 'Lbl', name: 'nm' }],
      has_anime: false,
      editions: [{ eid: 1, lang: 'ja', name: 'Limited', official: true }],
      staff: [],
      va: [],
      developers: [{ id: 'p1', name: 'Dev' }],
      tags: [{ id: 'g1', name: 'Tag', rating: 2, spoiler: 0, lie: false, category: 'cont' }],
      screenshots: [],
      relations: [
        {
          id: 'v2',
          title: 'Sequel',
          alttitle: null,
          released: '2021',
          rating: null,
          votecount: null,
          length_minutes: null,
          languages: ['ja'],
          platforms: ['win'],
          developers: [{ id: 'p1', name: 'Dev' }],
          image: null,
          relation: 'seq',
          relation_official: true,
        },
      ],
    };
    const out = decodeCollectionImportPayload(payload({ vns: [{ id: 'v90001', title: 'Title', raw, fetched_at: NOW }] }));
    expect(out.ok).toBe(true);
  });

  it('rejects a raw with a malformed tag credit', () => {
    const raw = { tags: [{ id: 'g1', name: 'Tag', rating: 'bad', spoiler: 0 }] };
    expectError(payload({ vns: [{ id: 'v1', title: 't', raw, fetched_at: NOW }] }), 'vns[0].raw has an invalid shape');
  });

  it('rejects a raw with a malformed relation', () => {
    const raw = { relations: [{ id: 'not-a-vn', title: 't', relation: 'seq', relation_official: true }] };
    expectError(payload({ vns: [{ id: 'v1', title: 't', raw, fetched_at: NOW }] }), 'vns[0].raw has an invalid shape');
  });

  it('rejects a raw with a malformed image dims tuple', () => {
    const raw = { image: { url: 'https://x', dims: [800] } };
    expectError(payload({ vns: [{ id: 'v1', title: 't', raw, fetched_at: NOW }] }), 'vns[0].raw has an invalid shape');
  });

  it('rejects a raw with an out-of-range devstatus', () => {
    expectError(payload({ vns: [{ id: 'v1', title: 't', raw: { devstatus: 9 }, fetched_at: NOW }] }), 'vns[0].raw has an invalid shape');
  });
});

describe('decodeCollectionImportPayload — collection field bounds', () => {
  it('rejects a non-object collection entry', () => {
    expectError(payload({ collection: ['x'] }), 'collection[0] must be an object');
  });

  it('rejects an invalid vn_id', () => {
    expectError(payload({ collection: [collectionRow({ vn_id: 'bad' })] }), 'collection[0].vn_id must match v\\d+ or egs_\\d+');
  });

  it('rejects an out-of-range user_rating', () => {
    expectError(payload({ collection: [collectionRow({ user_rating: 5 })] }), 'collection[0].user_rating must be an integer 10-100 or null');
    expectError(payload({ collection: [collectionRow({ user_rating: 101 })] }), 'collection[0].user_rating must be an integer 10-100 or null');
  });

  it('rejects an out-of-range playtime', () => {
    expectError(payload({ collection: [collectionRow({ playtime_minutes: -1 })] }), 'collection[0].playtime_minutes must be a non-negative safe integer');
    expectError(payload({ collection: [collectionRow({ playtime_minutes: 10_000_001 })] }), 'collection[0].playtime_minutes must be a non-negative safe integer');
  });

  it('rejects malformed started / finished dates', () => {
    expectError(payload({ collection: [collectionRow({ started_date: '2020/01/01' })] }), 'collection[0].started_date is invalid');
    expectError(payload({ collection: [collectionRow({ finished_date: 'yesterday' })] }), 'collection[0].finished_date is invalid');
  });

  it('rejects over-long notes', () => {
    expectError(payload({ collection: [collectionRow({ notes: 'x'.repeat(50_001) })] }), 'collection[0].notes must be a string or null');
  });

  it('rejects an invalid favorite, location, and edition_type', () => {
    expectError(payload({ collection: [collectionRow({ favorite: 2 })] }), 'collection[0].favorite must be 0, 1, or boolean');
    expectError(payload({ collection: [collectionRow({ location: 'mars' })] }), 'collection[0].location is invalid');
    expectError(payload({ collection: [collectionRow({ edition_type: 'gold' })] }), 'collection[0].edition_type is invalid');
  });

  it('rejects an over-long edition_label', () => {
    expectError(payload({ collection: [collectionRow({ edition_label: 'x'.repeat(201) })] }), 'collection[0].edition_label must be a string or null');
  });

  it('rejects a non-string physical_location and a too-long entry inside it', () => {
    expectError(payload({ collection: [collectionRow({ physical_location: 123 })] }), 'collection[0].collection physical_location must be a string or null');
    expectError(
      payload({ collection: [collectionRow({ physical_location: JSON.stringify(['x'.repeat(201)]) })] }),
      'collection[0].physical_location entries must be at most 200 characters',
    );
  });

  it('rejects a bad added_at / updated_at', () => {
    expectError(payload({ collection: [collectionRow({ added_at: -1 })] }), 'collection[0].added_at must be a non-negative safe integer');
    expectError(payload({ collection: [collectionRow({ updated_at: 1.2 })] }), 'collection[0].updated_at must be a non-negative safe integer');
  });

  it('normalizes a plain comma-delimited physical_location string and applies enum defaults', () => {
    const out = decodeCollectionImportPayload(payload({ collection: [collectionRow({ physical_location: 'Shelf A, Shelf B', favorite: true })] }));
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.collection[0]).toMatchObject({
        favorite: 1,
        location: 'unknown',
        edition_type: 'none',
        physical_location: JSON.stringify(['Shelf A', 'Shelf B']),
      });
    }
  });

  it('stores null physical_location when the parsed list is empty', () => {
    const out = decodeCollectionImportPayload(payload({ collection: [collectionRow({ physical_location: '   ' })] }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.collection[0].physical_location).toBeNull();
  });
});

describe('decodeCollectionImportPayload — series and series_vn', () => {
  it('rejects a non-object series entry and a bad id', () => {
    expectError(payload({ series: ['x'] }), 'series[0] must be an object');
    expectError(payload({ series: [{ id: 0, name: 'S', created_at: NOW, updated_at: NOW }] }), 'series[0].id must be a positive safe integer');
  });

  it('rejects a bad series name and over-long text fields', () => {
    expectError(payload({ series: [{ id: 1, name: '  ', created_at: NOW, updated_at: NOW }] }), 'series[0].name must be a non-empty string at most 200 characters');
    expectError(payload({ series: [{ id: 1, name: 'S', description: 'x'.repeat(20_001), created_at: NOW, updated_at: NOW }] }), 'series[0].description must be a string or null');
    expectError(payload({ series: [{ id: 1, name: 'S', cover_path: 'x'.repeat(301), created_at: NOW, updated_at: NOW }] }), 'series[0].cover_path must be a string or null');
    expectError(payload({ series: [{ id: 1, name: 'S', banner_path: 'x'.repeat(301), created_at: NOW, updated_at: NOW }] }), 'series[0].banner_path must be a string or null');
  });

  it('rejects bad series timestamps', () => {
    expectError(payload({ series: [{ id: 1, name: 'S', created_at: -1, updated_at: NOW }] }), 'series[0].created_at must be a non-negative safe integer');
    expectError(payload({ series: [{ id: 1, name: 'S', created_at: NOW, updated_at: 1.5 }] }), 'series[0].updated_at must be a non-negative safe integer');
  });

  it('accepts a valid series row and trims its name', () => {
    const out = decodeCollectionImportPayload(payload({ series: [{ id: 7, name: ' Saga ', description: null, cover_path: null, banner_path: null, created_at: NOW, updated_at: NOW }] }));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.series[0]).toMatchObject({ id: 7, name: 'Saga' });
  });

  it('rejects bad series_vn entries', () => {
    expectError(payload({ series_vn: ['x'] }), 'series_vn[0] must be an object');
    expectError(payload({ series_vn: [{ series_id: 0, vn_id: 'v1', order_index: 0 }] }), 'series_vn[0].series_id must be a positive safe integer');
    expectError(payload({ series_vn: [{ series_id: 1, vn_id: 'bad', order_index: 0 }] }), 'series_vn[0].vn_id must match v\\d+ or egs_\\d+');
    expectError(payload({ series_vn: [{ series_id: 1, vn_id: 'v1', order_index: 1_000_001 }] }), 'series_vn[0].order_index must be a non-negative safe integer');
  });
});

describe('decodeCollectionImportPayload — duplicate detection', () => {
  it('rejects duplicate collection vn_ids', () => {
    expectError(
      payload({ collection: [collectionRow({ vn_id: 'v1' }), collectionRow({ vn_id: 'V1' })] }),
      'collection contains duplicate vn_ids',
    );
  });

  it('rejects duplicate series ids and duplicate memberships', () => {
    expectError(
      payload({ series: [
        { id: 1, name: 'A', created_at: NOW, updated_at: NOW },
        { id: 1, name: 'B', created_at: NOW, updated_at: NOW },
      ] }),
      'series contains duplicate ids',
    );
    expectError(
      payload({ series_vn: [
        { series_id: 1, vn_id: 'v1', order_index: 0 },
        { series_id: 1, vn_id: 'V1', order_index: 1 },
      ] }),
      'series_vn contains duplicate memberships',
    );
  });
});
