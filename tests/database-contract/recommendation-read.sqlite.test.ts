import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getRecommendationReadRepository } from '@/lib/db/repositories/recommendation-read';
import {
  RECOMMENDATION_READ_CONTRACT_IDS,
  registerRecommendationReadRepositoryContract,
} from './recommendation-read.contract';

const VN_IDS = [
  RECOMMENDATION_READ_CONTRACT_IDS.first,
  RECOMMENDATION_READ_CONTRACT_IDS.second,
  RECOMMENDATION_READ_CONTRACT_IDS.third,
] as const;

function reset(): void {
  const placeholders = VN_IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM reading_queue WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM collection WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...VN_IDS);
  db.prepare('DELETE FROM vndb_cache WHERE cache_key IN (?, ?)').run(
    RECOMMENDATION_READ_CONTRACT_IDS.wishlistCache,
    RECOMMENDATION_READ_CONTRACT_IDS.tagCache,
  );
}

function seed(): void {
  reset();
  const ids = RECOMMENDATION_READ_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (
      id, title, alttitle, released, image_thumb, image_sexual, developers, fetched_at
    ) VALUES
      (?, 'First Recommendation VN', 'First alternate', '2097-01-02', 'first-thumb.jpg', 1, ?, 1),
      (?, 'Second Recommendation VN', NULL, NULL, NULL, NULL, 'malformed', 1),
      (?, 'Third Recommendation VN', NULL, NULL, NULL, NULL, NULL, 1)
  `).run(
    ids.first,
    JSON.stringify([{ id: ids.developer, name: 'Recommendation Studio' }]),
    ids.second,
    ids.third,
  );
  db.prepare(`
    INSERT INTO collection (vn_id, status, user_rating, favorite, added_at, updated_at) VALUES
      (?, 'completed', 80, 0, 1, 1),
      (?, 'completed', 90, 0, 1, 2),
      (?, 'completed', 60, 1, 1, 3)
  `).run(...VN_IDS);
  db.prepare('INSERT INTO reading_queue (vn_id, position, added_at) VALUES (?, 1, 1)')
    .run(ids.third);
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES
      (?, '{"results":[]}', 2, 3),
      (?, '{"results":[]}', 1, 3)
  `).run(ids.wishlistCache, ids.tagCache);
}

registerRecommendationReadRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getRecommendationReadRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
