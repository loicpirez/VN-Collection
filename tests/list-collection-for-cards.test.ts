/**
 * R5-144 pin: `listCollectionForCards()` returns the same row
 * shape `cardData.toCardData` reads from, but SKIPS the heavy
 * JSON columns the library grid never touches.
 *
 * Behaviour we pin:
 *   - The slim path SELECTs a narrow column list (verified via
 *     a source-pin against `CARDS_VN_COLUMNS`).
 *   - `description` / `aliases` / `staff` / `va` / `titles` /
 *     `editions` / `extlinks` / `screenshots` / `release_images`
 *     / `raw` / `languages` / `platforms` / `length` /
 *     `votecount` etc. come back empty / null even when the
 *     underlying `vn` row has values, because the slim SELECT
 *     never fetches them.
 *   - The full path (`listCollection({})`) keeps returning the
 *     full payload — no behaviour change for callers that need
 *     it.
 *   - `developers`, `publishers`, `tags`, `relations`,
 *     `image_*`, `released`, `length_minutes`, `rating`,
 *     `local_image*`, `custom_cover`, `banner_image` ARE kept
 *     (the library grid filters on them).
 */
import Database from 'better-sqlite3';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addToCollection,
  listCollection,
  listCollectionForCards,
  upsertVn,
} from '@/lib/db';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

describe('listCollectionForCards — R5-144 source shape', () => {
  it('CARDS_VN_COLUMNS lists only the card-relevant vn.* columns', () => {
    const match = SOURCE.match(/CARDS_VN_COLUMNS\s*=\s*([\s\S]*?);/);
    expect(match, 'CARDS_VN_COLUMNS must be defined').not.toBeNull();
    const cols = match![1];
    // Must keep these.
    for (const k of [
      'v.id',
      'v.title',
      'v.alttitle',
      'v.image_url',
      'v.image_thumb',
      'v.image_sexual',
      'v.released',
      'v.length_minutes',
      'v.rating',
      'v.developers',
      'v.publishers',
      'v.tags',
      'v.relations',
      'v.local_image',
      'v.local_image_thumb',
      'v.custom_cover',
      'v.banner_image',
    ]) {
      expect(cols, `CARDS_VN_COLUMNS missing ${k}`).toContain(k);
    }
    // Must NOT include the heavy columns.
    for (const k of [
      'v.description',
      'v.aliases',
      'v.staff',
      'v.va',
      'v.titles',
      'v.editions',
      'v.extlinks',
      'v.screenshots',
      'v.release_images',
      'v.raw',
      'v.languages',
      'v.platforms',
      'v.length_votes',
      'v.votecount',
    ]) {
      expect(cols, `CARDS_VN_COLUMNS unexpectedly contains ${k}`).not.toContain(k);
    }
  });

  it('listCollection picks the projection via the `_projection` knob', () => {
    const body = SOURCE.split('export function listCollection')[1]?.split('\nexport ')[0] ?? '';
    expect(body).toMatch(/_projection\s*=\s*'full'/);
    expect(body).toMatch(/_projection === 'cards'/);
    expect(body).toMatch(/\bCARDS_VN_COLUMNS\b/);
  });
});

describe('listCollectionForCards — behaviour', () => {
  it('returns rows with heavy JSON columns empty / null on the slim path', () => {
    upsertVn({
      id: 'v9400',
      title: 'fixture-slim',
      alttitle: 'Slim Fixture',
      description: 'this should never be sent to the card grid',
      aliases: ['alias-a', 'alias-b'],
      languages: ['en', 'ja'],
      platforms: ['win', 'lin'],
      developers: [{ id: 'p91500', name: 'dev-X' }],
      tags: [{ id: 'g9', name: 'tag-X', rating: 3, spoiler: 0, category: 'cont' }],
    });
    addToCollection('v9400', { status: 'planning' });

    const slim = listCollectionForCards({})[0];
    const full = listCollection({})[0];

    // Identity preserved across both paths.
    expect(slim.id).toBe('v9400');
    expect(full.id).toBe('v9400');
    expect(slim.title).toBe('fixture-slim');
    expect(slim.alttitle).toBe('Slim Fixture');

    // Slim path drops the heavy JSON columns.
    expect(slim.description).toBeFalsy();
    expect(slim.aliases).toEqual([]);
    expect(slim.languages).toEqual([]);
    expect(slim.platforms).toEqual([]);

    // Full path keeps them.
    expect(full.description).toBe('this should never be sent to the card grid');
    expect(full.aliases).toEqual(['alias-a', 'alias-b']);
    expect(full.languages).toEqual(['en', 'ja']);
    expect(full.platforms).toEqual(['win', 'lin']);

    // Slim path keeps the card-relevant fields.
    expect(slim.developers).toEqual([{ id: 'p91500', name: 'dev-X' }]);
    expect(slim.tags).toHaveLength(1);
    expect(slim.tags[0].id).toBe('g9');
  });

  it('listCollectionForCards respects the same WHERE filters as listCollection', () => {
    upsertVn({
      id: 'v9401',
      title: 'A',
      tags: [{ id: 'g50', name: 'mystery', rating: 3, spoiler: 0, category: 'cont' }],
    });
    upsertVn({
      id: 'v9402',
      title: 'B',
      tags: [{ id: 'g51', name: 'comedy', rating: 3, spoiler: 0, category: 'cont' }],
    });
    addToCollection('v9401', { status: 'planning' });
    addToCollection('v9402', { status: 'completed' });

    expect(listCollectionForCards({ tag: 'g50' }).map((it) => it.id)).toEqual(['v9401']);
    expect(listCollectionForCards({ status: 'completed' }).map((it) => it.id)).toEqual(['v9402']);
  });

  it('listCollectionForCards enforces the requested SQL limit', () => {
    upsertVn({ id: 'v9403', title: 'Limit A' });
    upsertVn({ id: 'v9404', title: 'Limit B' });
    addToCollection('v9403', { status: 'planning' });
    addToCollection('v9404', { status: 'planning' });
    expect(listCollectionForCards({ limit: 1 })).toHaveLength(1);
  });
});

describe('R5-144 /api/collection route', () => {
  it('uses listCollectionForCards without a rich-detail query escape hatch', () => {
    const src = readFileSync(join(__dirname, '..', 'src/app/api/collection/route.ts'), 'utf8');
    expect(src).toMatch(/listCollectionForCards/);
    expect(src).not.toMatch(/detail.*===\s*'full'/);
    expect(src).not.toMatch(/wantsFullDetail/);
  });
});
