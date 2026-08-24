import { afterAll } from 'vitest';
import { db, invalidateProducerStats } from '@/lib/db';
import { getProducerRepository } from '@/lib/db/repositories/producer';
import {
  PRODUCER_CONTRACT_FIXTURE,
  registerProducerRepositoryContract,
} from './producer.contract';

const VN_IDS = [PRODUCER_CONTRACT_FIXTURE.firstVn, PRODUCER_CONTRACT_FIXTURE.secondVn] as const;
const PRODUCER_IDS = [
  PRODUCER_CONTRACT_FIXTURE.developer,
  PRODUCER_CONTRACT_FIXTURE.fallbackDeveloper,
  PRODUCER_CONTRACT_FIXTURE.publisher,
] as const;

function reset(): void {
  const vnPlaceholders = VN_IDS.map(() => '?').join(',');
  const producerPlaceholders = PRODUCER_IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM collection WHERE vn_id IN (${vnPlaceholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn_developer_index WHERE vn_id IN (${vnPlaceholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn_publisher_index WHERE vn_id IN (${vnPlaceholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (${vnPlaceholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM producer WHERE id IN (${producerPlaceholders})`).run(...PRODUCER_IDS);
  invalidateProducerStats();
}

function seed(): void {
  reset();
  const fixture = PRODUCER_CONTRACT_FIXTURE;
  db.prepare(`
    INSERT INTO producer (
      id, name, original, lang, type, description, aliases, extlinks, logo_path, fetched_at
    ) VALUES (?, 'Explicit Developer', NULL, 'ja', 'co', NULL, ?, ?, '/producer-logo.png', 1)
  `).run(
    fixture.developer,
    JSON.stringify(['Explicit Dev']),
    JSON.stringify([{ url: 'https://example.test/dev', label: 'Official', name: 'Site' }]),
  );
  db.prepare(`
    INSERT INTO vn (id, title, developers, publishers, rating, fetched_at) VALUES
      (?, 'First Producer VN', ?, ?, 70, 1),
      (?, 'Second Producer VN', ?, ?, 90, 1)
  `).run(
    fixture.firstVn,
    JSON.stringify([
      { id: fixture.developer, name: 'Explicit Developer' },
      { id: fixture.fallbackDeveloper, name: 'Fallback Developer' },
    ]),
    JSON.stringify([{ id: fixture.publisher, name: 'Fallback Publisher' }]),
    fixture.secondVn,
    JSON.stringify([{ id: fixture.developer, name: 'Explicit Developer' }]),
    JSON.stringify([{ id: fixture.publisher, name: 'Fallback Publisher' }]),
  );
  db.prepare(`
    INSERT INTO collection (vn_id, status, user_rating, added_at, updated_at) VALUES
      (?, 'completed', 80, 1, 1),
      (?, 'completed', 60, 1, 2)
  `).run(...VN_IDS);
  db.prepare(`
    INSERT INTO vn_developer_index (vn_id, producer_id) VALUES
      (?, ?), (?, ?), (?, ?)
  `).run(
    fixture.firstVn, fixture.developer,
    fixture.firstVn, fixture.fallbackDeveloper,
    fixture.secondVn, fixture.developer,
  );
  db.prepare(`
    INSERT INTO vn_publisher_index (vn_id, producer_id) VALUES (?, ?), (?, ?)
  `).run(fixture.firstVn, fixture.publisher, fixture.secondVn, fixture.publisher);
  invalidateProducerStats();
}

registerProducerRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getProducerRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
