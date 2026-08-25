import Database from 'better-sqlite3';
import { afterAll } from 'vitest';
import { listCollection } from '@/lib/db';
import { getPlaceRepository } from '@/lib/db/repositories/place';
import { ALICENET_BRANCH_LABEL } from '@/lib/stock-provider-constants';
import { PLACE_CONTRACT_IDS, registerPlaceRepositoryContract } from './place.contract';

listCollection({});
const database = new Database(process.env.DB_PATH!);

function reset(): void {
  database.prepare('DELETE FROM place_registry WHERE id IN (?, ?)').run(
    PLACE_CONTRACT_IDS.firstPlace,
    PLACE_CONTRACT_IDS.secondPlace,
  );
  database.prepare('DELETE FROM alicenet_stock WHERE code = ?').run('991-991101-991');
  database.prepare('DELETE FROM vn_stock_offer WHERE vn_id IN (?, ?)').run(
    PLACE_CONTRACT_IDS.firstVn,
    PLACE_CONTRACT_IDS.secondVn,
  );
  database.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(
    PLACE_CONTRACT_IDS.firstVn,
    PLACE_CONTRACT_IDS.secondVn,
  );
  database.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(
    PLACE_CONTRACT_IDS.firstVn,
    PLACE_CONTRACT_IDS.secondVn,
  );
}

function seed(): void {
  reset();
  database.exec(`
    INSERT INTO vn (id, title, fetched_at) VALUES
      ('v991101', 'First contract VN', 1),
      ('v991102', 'Second contract VN', 1);
    INSERT INTO collection (vn_id, status, physical_location, added_at, updated_at)
      VALUES ('v991101', 'completed', '["Storage A"]', 1, 1);
    INSERT INTO collection_place_index (vn_id, place) VALUES ('v991101', 'Storage A');
    INSERT INTO place_registry (id, name, kind, created_at, updated_at) VALUES
      (991101, 'Alpha Shop', 'shop', 1, 1),
      (991102, 'Beta Shop', 'shop', 1, 1);
  `);
  const link = database.prepare('INSERT INTO place_provider_link (place_id, provider_label) VALUES (?, ?)');
  link.run(PLACE_CONTRACT_IDS.firstPlace, 'Branch A');
  link.run(PLACE_CONTRACT_IDS.firstPlace, ALICENET_BRANCH_LABEL);
  link.run(PLACE_CONTRACT_IDS.secondPlace, 'Branch B');
  const offer = database.prepare(`
    INSERT INTO vn_stock_offer (
      vn_id, provider, provider_offer_id, source, title, url, price, currency,
      availability, location_branch, location_label, fetched_at, updated_at
    ) VALUES (?, ?, ?, 'direct', ?, ?, ?, 'JPY', ?, ?, ?, ?, ?)
  `);
  offer.run('v991101', 'sofmap', 'offer-1', 'First offer', 'https://example.test/one', 5000, 'in_stock', 'Branch A', 'Branch A', 100, 100);
  offer.run('v991102', 'sofmap', 'offer-2', 'Second offer', 'https://example.test/two', 7000, 'out_of_stock', 'Branch A', 'Branch A', 200, 200);
  offer.run('v991102', 'surugaya', 'offer-3', 'Unassigned offer', 'https://example.test/three', 6000, 'in_stock', 'Branch C', 'Branch C', 250, 250);
  database.prepare(`
    INSERT INTO alicenet_stock (code, title, sale_price, vn_id, fetched_at, updated_at)
    VALUES ('991-991101-991', 'AliceNet contract', '3,000円', 'v991102', 300, 900)
  `).run();
}

registerPlaceRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getPlaceRepository());
    } finally {
      reset();
    }
  },
});

afterAll(() => database.close());
