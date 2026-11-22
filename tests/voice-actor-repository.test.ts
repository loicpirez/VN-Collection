import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addToCollection, db, upsertVn } from '@/lib/db';
import { getPeopleRepository } from '@/lib/db/repositories/people';
import {
  getVoiceActorRepository,
  type VoiceActorBrowseOptions,
  type VoiceActorSort,
} from '@/lib/db/repositories/voice-actors';

const VN_IDS = ['v980101', 'v980102', 'v980103', 'v980104'];

function options(overrides: Partial<VoiceActorBrowseOptions> = {}): VoiceActorBrowseOptions {
  return {
    query: '',
    language: null,
    scope: 'all',
    sort: 'vns',
    direction: 'desc',
    minimumVns: 1,
    page: 1,
    pageSize: 2,
    ...overrides,
  };
}

function clearFixtures(): void {
  const placeholders = VN_IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM collection WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...VN_IDS);
  db.prepare("DELETE FROM character_image WHERE char_id LIKE 'c9801%'").run();
}

beforeAll(() => {
  clearFixtures();
  upsertVn({ id: VN_IDS[0], title: 'Fixture one', released: '2001-01-01', languages: ['ja'] });
  upsertVn({ id: VN_IDS[1], title: 'Fixture two', released: '2004-01-01', languages: ['ja'] });
  upsertVn({ id: VN_IDS[2], title: 'Fixture three', released: 'TBA', languages: ['ja'] });
  upsertVn({ id: VN_IDS[3], title: 'Fixture four', released: '2010-01-01', languages: ['en'] });
  addToCollection(VN_IDS[0], { status: 'completed' });
  addToCollection(VN_IDS[3], { status: 'playing' });
  const insert = db.prepare(`
    INSERT INTO vn_va_credit (
      vn_id, sid, aid, c_id, c_name, c_original, c_image_url,
      va_name, va_original, va_lang, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(VN_IDS[0], 's980101', 1, 'c980101', 'Lead role', 'Lead original', 'https://example.test/lead.jpg', 'Primary Voice', 'Primary Original', 'ja', null);
  insert.run(VN_IDS[1], 's980101', 1, 'c980101', 'Lead role', 'Lead original', 'https://example.test/lead.jpg', 'Primary Voice', 'Primary Original', 'ja', null);
  insert.run(VN_IDS[2], 's980101', 2, 'c980102', 'Second role', null, null, 'Alias %_ Voice', null, 'ja', 'alias');
  insert.run(VN_IDS[3], 's980102', 3, 'c980103', 'English role', null, null, 'English Voice', null, 'en', null);
  db.prepare(`
    INSERT INTO character_image (char_id, url, local_path, fetched_at)
    VALUES (?, ?, ?, ?)
  `).run('c980101', 'https://example.test/lead.jpg', 'characters/lead.webp', 1);
});

afterAll(clearFixtures);

describe('SQLite local seiyuu repository', () => {
  it('aggregates names, aliases, collection overlap, years, and representative characters', async () => {
    const result = await getVoiceActorRepository().browse(options({ query: 'Primary Voice', pageSize: 48 }));

    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(48);
    expect(result.rows).toEqual([{
      id: 's980101',
      name: 'Primary Voice',
      original: 'Primary Original',
      language: 'ja',
      vnCount: 3,
      collectionVnCount: 1,
      characterCount: 2,
      creditCount: 3,
      aliasCount: 2,
      firstYear: 2001,
      lastYear: 2004,
      aliases: ['Alias %_ Voice'],
      characters: [
        {
          id: 'c980101',
          name: 'Lead role',
          original: 'Lead original',
          imageUrl: 'https://example.test/lead.jpg',
          localImage: 'characters/lead.webp',
          vnCount: 2,
        },
        {
          id: 'c980102',
          name: 'Second role',
          original: null,
          imageUrl: null,
          localImage: null,
          vnCount: 1,
        },
      ],
    }]);
    expect(result.stats.actorCount).toBeGreaterThanOrEqual(2);
    expect(result.stats.vnCount).toBeGreaterThanOrEqual(4);
    expect(result.stats.characterCount).toBeGreaterThanOrEqual(3);
    expect(result.stats.creditCount).toBeGreaterThanOrEqual(4);
    expect(result.stats.collectionActorCount).toBeGreaterThanOrEqual(2);
    expect(result.stats.collectionVnCount).toBeGreaterThanOrEqual(2);
    expect(result.languages).toEqual(expect.arrayContaining([
      expect.objectContaining({ language: 'ja', actorCount: expect.any(Number) }),
      expect.objectContaining({ language: 'en', actorCount: expect.any(Number) }),
    ]));
  });

  it('applies collection, language, escaped-alias, minimum, and page bounds', async () => {
    const collection = await getVoiceActorRepository().browse(options({
      scope: 'collection',
      language: 'ja',
      query: 'Alias %_ Voice',
      page: 99,
    }));
    expect(collection.rows.map((row) => row.id)).toEqual(['s980101']);
    expect(collection.page).toBe(1);

    const empty = await getVoiceActorRepository().browse(options({
      query: 'Primary Voice',
      minimumVns: 50,
      page: 99,
    }));
    expect(empty).toMatchObject({ rows: [], total: 0, page: 1, pageSize: 2 });
    expect(empty.stats.actorCount).toBeGreaterThanOrEqual(2);
  });

  it('keeps sold voice credits discoverable without counting them as owned', async () => {
    const soldId = VN_IDS[1];
    addToCollection(soldId, { status: 'sold' });
    try {
      const repo = getVoiceActorRepository();
      const result = await repo.browse(options({ query: 'Primary Voice' }));
      expect(result.rows[0]).toMatchObject({ id: 's980101', vnCount: 3, collectionVnCount: 1 });
      const archived = await repo.browse(options({ scope: 'sold', query: 'Alias %_ Voice' }));
      expect(archived.rows).toEqual([
        expect.objectContaining({
          id: 's980101',
          vnCount: 1,
          collectionVnCount: 0,
          firstYear: 2004,
          lastYear: 2004,
          characters: [expect.objectContaining({ id: 'c980101', vnCount: 1 })],
        }),
      ]);
      const soldWithTwoCredits = await repo.browse(options({ scope: 'sold', minimumVns: 2 }));
      expect(soldWithTwoCredits.rows).toEqual([]);
      const activeOnlyActor = await repo.browse(options({ scope: 'sold', query: 'English Voice' }));
      expect(activeOnlyActor.rows).toEqual([]);

      const people = getPeopleRepository();
      const credits = await people.voiceCredits('s980101');
      expect(credits.find(({ vn }) => vn.id === soldId)?.vn).toMatchObject({
        in_collection: false,
        sold: true,
      });
      const owned = await people.voiceCredits('s980101', { inCollectionOnly: true });
      expect(owned.map(({ vn }) => vn.id)).toEqual([VN_IDS[0]]);
    } finally {
      db.prepare('DELETE FROM collection WHERE vn_id = ?').run(soldId);
    }
  });

  it('filters staff index credit counts before aggregation in each collection scope', async () => {
    const [, soldId] = VN_IDS;
    addToCollection(soldId, { status: 'sold' });
    try {
      const credit = db.prepare("INSERT INTO vn_staff_credit (vn_id, sid, role, name, lang) VALUES (?, ?, ?, ?, 'ja')");
      credit.run(VN_IDS[0], 's980110', 'scenario', 'Mixed Writer');
      credit.run(soldId, 's980110', 'scenario', 'Mixed Writer');
      credit.run(soldId, 's980111', 'scenario', 'Sold Writer');
      credit.run(soldId, 's980111', 'editor', 'Sold Writer');

      const people = getPeopleRepository();
      const active = await people.searchStaff({ q: 'Writer', scope: 'collection' });
      expect(active).toMatchObject([{ id: 's980110', vn_count: 1 }]);
      const sold = await people.searchStaff({ q: 'Writer', scope: 'sold', vn: soldId, role: 'scenario' });
      expect(sold).toEqual([
        expect.objectContaining({ id: 's980110', vn_count: 1, roles: ['scenario'] }),
        expect.objectContaining({ id: 's980111', vn_count: 1, roles: ['scenario'] }),
      ]);
      const all = await people.searchStaff({ q: 'Writer' });
      expect(all).toMatchObject([{ id: 's980110', vn_count: 2 }, { id: 's980111', vn_count: 1 }]);
    } finally {
      db.prepare("DELETE FROM vn_staff_credit WHERE sid IN ('s980110', 's980111')").run();
      db.prepare('DELETE FROM collection WHERE vn_id = ?').run(soldId);
    }
  });

  it('supports every ranking dimension in both directions', async () => {
    const sorts: VoiceActorSort[] = ['vns', 'collection', 'characters', 'recent', 'name'];
    for (const sort of sorts) {
      const descending = await getVoiceActorRepository().browse(options({ sort, direction: 'desc' }));
      const ascending = await getVoiceActorRepository().browse(options({ sort, direction: 'asc' }));
      expect(descending.rows).toHaveLength(2);
      expect(ascending.rows).toHaveLength(2);
    }
  });
});
