import Database from 'better-sqlite3';
import { afterAll } from 'vitest';
import { listCollection } from '@/lib/db';
import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';
import {
  COLLECTION_LIST_CONTRACT_IDS,
  registerCollectionListRepositoryContract,
} from './collection-list.contract';

listCollection({});
const database = new Database(process.env.DB_PATH!);
const vnIds = [
  COLLECTION_LIST_CONTRACT_IDS.firstVn,
  COLLECTION_LIST_CONTRACT_IDS.secondVn,
  COLLECTION_LIST_CONTRACT_IDS.thirdVn,
] as const;

function reset(): void {
  database.prepare('DELETE FROM user_list_vn WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM user_list WHERE id = ?').run(COLLECTION_LIST_CONTRACT_IDS.series);
  database.prepare('DELETE FROM reading_queue WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM series_vn WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM series WHERE id = ?').run(COLLECTION_LIST_CONTRACT_IDS.series);
  database.prepare('DELETE FROM egs_game WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM vn_aspect_override WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM release_resolution_cache WHERE vn_id IN (?, ?, ?) OR release_id IN (?, ?)').run(
    ...vnIds,
    'r991501',
    'r991503',
  );
  database.prepare('DELETE FROM release_meta_cache WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM collection_place_index WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM vn_tag_index WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM vn_developer_index WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM vn_publisher_index WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM collection WHERE vn_id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM vn WHERE id IN (?, ?, ?)').run(...vnIds);
  database.prepare('DELETE FROM producer WHERE id IN (?, ?)').run(
    COLLECTION_LIST_CONTRACT_IDS.producer,
    COLLECTION_LIST_CONTRACT_IDS.publisher,
  );
}

function seed(): void {
  reset();
  database.prepare(`
    INSERT INTO producer (id, name, aliases, extlinks, fetched_at) VALUES
      (?, 'Alpha Developer', '[]', '[]', 1),
      (?, 'Beta Publisher', '[]', '[]', 1)
  `).run(COLLECTION_LIST_CONTRACT_IDS.producer, COLLECTION_LIST_CONTRACT_IDS.publisher);
  const insertVn = database.prepare(`
    INSERT INTO vn (
      id, title, alttitle, image_sexual, released, languages, platforms,
      length_minutes, rating, description, developers, publishers, tags,
      screenshots, relations, custom_cover, banner_image, fetched_at
    ) VALUES (?, ?, ?, ?, ?, '["en"]', '["win"]', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertVn.run(
    COLLECTION_LIST_CONTRACT_IDS.firstVn,
    'Alpha Collection Contract',
    'Alpha Alternative',
    0,
    '2020-01-01',
    600,
    80,
    'Alpha description',
    JSON.stringify([{ id: COLLECTION_LIST_CONTRACT_IDS.producer, name: 'Alpha Developer' }]),
    '[]',
    JSON.stringify([{ id: COLLECTION_LIST_CONTRACT_IDS.tag, name: 'Drama', rating: 2, spoiler: 0, category: 'cont' }]),
    '[]',
    '[]',
    '/alpha-cover.jpg',
    null,
  );
  insertVn.run(
    COLLECTION_LIST_CONTRACT_IDS.secondVn,
    'Beta Collection Contract',
    null,
    2,
    '2022-02-02',
    300,
    60,
    'Beta description',
    '[]',
    JSON.stringify([{ id: COLLECTION_LIST_CONTRACT_IDS.publisher, name: 'Beta Publisher' }]),
    JSON.stringify([{ id: COLLECTION_LIST_CONTRACT_IDS.adultTag, name: 'nukige', rating: 3, spoiler: 0, category: 'ero' }]),
    '[]',
    JSON.stringify([{ id: 'v1', title: 'Original', relation: 'orig', relation_official: true }]),
    null,
    '/beta-banner.jpg',
  );
  insertVn.run(
    COLLECTION_LIST_CONTRACT_IDS.thirdVn,
    'Gamma Collection Contract',
    null,
    0,
    '',
    60,
    40,
    'Gamma description',
    '[]',
    '[]',
    '[]',
    '[{"url":"https://example.test/gamma.jpg","thumbnail":"https://example.test/gamma-thumb.jpg","dims":[1280,800]}]',
    '[]',
    null,
    null,
  );
  database.prepare(`
    INSERT INTO collection (
      vn_id, status, user_rating, playtime_minutes, notes, favorite,
      edition_type, physical_location, dumped, custom_order, added_at, updated_at
    ) VALUES
      (?, 'completed', 90, 600, 'Personal note', 1, 'physical', '["Room A"]', 1, 2, 100, 300),
      (?, 'planning', 70, 180, NULL, 0, 'digital', '[]', 0, 1, 90, 200),
      (?, 'playing', NULL, 0, NULL, 0, 'none', '[]', 0, 0, 80, 100)
  `).run(...vnIds);
  database.prepare('INSERT INTO collection_place_index (vn_id, place) VALUES (?, ?)').run(vnIds[0], 'Room A');
  database.prepare(`INSERT INTO vn_developer_index (vn_id, producer_id) VALUES (?, ?)`).run(vnIds[0], COLLECTION_LIST_CONTRACT_IDS.producer);
  database.prepare(`INSERT INTO vn_publisher_index (vn_id, producer_id) VALUES (?, ?)`).run(vnIds[1], COLLECTION_LIST_CONTRACT_IDS.publisher);
  database.prepare(`
    INSERT INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES
      (?, ?, 'Drama', 0, 'cont'),
      (?, ?, 'nukige', 0, 'ero')
  `).run(vnIds[0], COLLECTION_LIST_CONTRACT_IDS.tag, vnIds[1], COLLECTION_LIST_CONTRACT_IDS.adultTag);
  database.prepare(`
    INSERT INTO egs_game (
      vn_id, egs_id, median, average, count, playtime_median_minutes,
      source, okazu, erogame, fetched_at
    ) VALUES (?, 991501, 88, 86, 10, 720, 'manual', 0, 0, 1)
  `).run(vnIds[0]);
  database.prepare(`INSERT INTO series (id, name, created_at, updated_at) VALUES (?, 'Contract Series', 1, 1)`).run(COLLECTION_LIST_CONTRACT_IDS.series);
  database.prepare(`INSERT INTO series_vn (series_id, vn_id, order_index) VALUES (?, ?, 0)`).run(COLLECTION_LIST_CONTRACT_IDS.series, vnIds[0]);
  database.prepare(`INSERT INTO user_list (id, name, slug, created_at, updated_at) VALUES (?, 'Contract List', 'contract-list-991501', 1, 1)`).run(COLLECTION_LIST_CONTRACT_IDS.series);
  database.prepare(`INSERT INTO user_list_vn (list_id, vn_id, order_index, added_at) VALUES (?, ?, 0, 1)`).run(COLLECTION_LIST_CONTRACT_IDS.series, vnIds[0]);
  database.prepare(`INSERT INTO reading_queue (vn_id, position, added_at) VALUES (?, 1, 1)`).run(vnIds[1]);
  database.prepare(`
    INSERT INTO release_resolution_cache (
      release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at
    ) VALUES ('r991501', ?, 800, 600, '800x600', '4:3', 1)
  `).run(vnIds[0]);
  database.prepare(`INSERT INTO vn_aspect_override (vn_id, aspect_key, updated_at) VALUES (?, '16:9', 1)`).run(vnIds[1]);
  database.prepare(`
    INSERT INTO release_meta_cache (
      release_id, vn_id, platforms, languages, resolution, fetched_at
    ) VALUES ('r991503', ?, '["win"]', '[]', '1280x800', 1)
  `).run(vnIds[2]);
}

registerCollectionListRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getCollectionListRepository());
    } finally {
      reset();
    }
  },
});

afterAll(() => database.close());
