import Database from 'better-sqlite3';
import { afterAll } from 'vitest';
import { listCollection } from '@/lib/db';
import { getOwnedReleaseRepository } from '@/lib/db/repositories/owned-release';
import { getShelfRepository } from '@/lib/db/repositories/shelf';
import {
  registerShelfRepositoryContract,
  SHELF_CONTRACT_IDS,
} from './shelf.contract';

listCollection({});
const database = new Database(process.env.DB_PATH!);

function reset(): void {
  database.prepare('DELETE FROM physical_bundle_member WHERE vn_id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstVn,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
  database.prepare('DELETE FROM physical_bundle WHERE anchor_vn_id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstVn,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
  database.prepare('DELETE FROM shelf_display_slot WHERE shelf_id IN (?, ?)').run(
    SHELF_CONTRACT_IDS.firstShelf,
    SHELF_CONTRACT_IDS.secondShelf,
  );
  database.prepare('DELETE FROM shelf_slot WHERE shelf_id IN (?, ?)').run(
    SHELF_CONTRACT_IDS.firstShelf,
    SHELF_CONTRACT_IDS.secondShelf,
  );
  database.prepare('DELETE FROM shelf_unit WHERE id IN (?, ?)').run(
    SHELF_CONTRACT_IDS.firstShelf,
    SHELF_CONTRACT_IDS.secondShelf,
  );
  database.prepare('DELETE FROM release_resolution_cache WHERE release_id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstRelease,
    SHELF_CONTRACT_IDS.secondRelease,
    SHELF_CONTRACT_IDS.thirdRelease,
  );
  database.prepare('DELETE FROM release_meta_cache WHERE release_id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstRelease,
    SHELF_CONTRACT_IDS.secondRelease,
    SHELF_CONTRACT_IDS.thirdRelease,
  );
  database.prepare('DELETE FROM collection_place_index WHERE vn_id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstVn,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
  database.prepare('DELETE FROM owned_release WHERE vn_id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstVn,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
  database.prepare('DELETE FROM collection WHERE vn_id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstVn,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
  database.prepare('DELETE FROM vn WHERE id IN (?, ?, ?)').run(
    SHELF_CONTRACT_IDS.firstVn,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
}

function seed(): void {
  reset();
  const firstImages = JSON.stringify([{
    release_id: SHELF_CONTRACT_IDS.firstRelease,
    release_title: 'First release',
    type: 'pkgfront',
    url: 'https://example.test/release-first.jpg',
    thumbnail: 'https://example.test/release-first-thumb.jpg',
  }]);
  database.prepare(`
    INSERT INTO vn (id, title, release_images, fetched_at) VALUES
      (?, 'Alpha contract VN', ?, 1),
      (?, 'Beta contract VN', '[]', 1),
      (?, 'Gamma contract VN', '[]', 1)
  `).run(
    SHELF_CONTRACT_IDS.firstVn,
    firstImages,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
  database.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
      (?, 'completed', 1, 1),
      (?, 'completed', 1, 1),
      (?, 'completed', 1, 1)
  `).run(
    SHELF_CONTRACT_IDS.firstVn,
    SHELF_CONTRACT_IDS.secondVn,
    SHELF_CONTRACT_IDS.thirdVn,
  );
  const releaseMeta = database.prepare(`
    INSERT INTO release_meta_cache (
      release_id, vn_id, title, platforms, languages, resolution,
      patch, freeware, official, has_ero, fetched_at
    ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 1, 0, 1)
  `);
  releaseMeta.run(
    SHELF_CONTRACT_IDS.firstRelease,
    SHELF_CONTRACT_IDS.firstVn,
    'First release',
    '["win"]',
    '[{"lang":"ja"}]',
    '1920x1080',
  );
  releaseMeta.run(
    SHELF_CONTRACT_IDS.secondRelease,
    SHELF_CONTRACT_IDS.secondVn,
    'Second release',
    '["swi"]',
    '[{"lang":"en"}]',
    '1280x720',
  );
  releaseMeta.run(
    SHELF_CONTRACT_IDS.thirdRelease,
    SHELF_CONTRACT_IDS.thirdVn,
    'Third release',
    '["ps4"]',
    '[{"lang":"fr"}]',
    '1920x1080',
  );
  database.prepare(`
    INSERT INTO shelf_unit (id, name, cols, rows, order_index, created_at, updated_at)
    VALUES
      (?, 'Shelf Alpha', 2, 2, 0, 1, 1),
      (?, 'Shelf Beta', 2, 2, 1, 1, 1)
  `).run(SHELF_CONTRACT_IDS.firstShelf, SHELF_CONTRACT_IDS.secondShelf);
}

registerShelfRepositoryContract('SQLite', {
  async withRepositories(run) {
    seed();
    try {
      await run(getOwnedReleaseRepository(), getShelfRepository());
    } finally {
      reset();
    }
  },
});

afterAll(() => database.close());
