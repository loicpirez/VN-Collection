import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getDiscoveryRepository } from '@/lib/db/repositories/discovery';
import {
  DISCOVERY_CONTRACT_IDS,
  registerDiscoveryRepositoryContract,
} from './discovery.contract';

const VN_IDS = [
  DISCOVERY_CONTRACT_IDS.firstVn,
  DISCOVERY_CONTRACT_IDS.secondVn,
  DISCOVERY_CONTRACT_IDS.unownedVn,
] as const;

function reset(): void {
  const placeholders = VN_IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM staff_credit_index WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM collection WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...VN_IDS);
  db.prepare("DELETE FROM vndb_cache WHERE cache_key LIKE 'staff_full:s99470%'").run();
}

function seed(): void {
  reset();
  const ids = DISCOVERY_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, developers, fetched_at) VALUES
      (?, 'Discovery One', ?, 1),
      (?, 'Discovery Two', NULL, 1),
      (?, 'Discovery Unowned', '[{"id":"p994799"}]', 1)
  `).run(
    ids.firstVn,
    '[{"id":"p994701","name":"Discovery Studio"}]',
    ids.secondVn,
    ids.unownedVn,
  );
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
      (?, 'completed', 1, 1),
      (?, 'planning', 1, 2)
  `).run(ids.firstVn, ids.secondVn);
  db.prepare(`
    INSERT INTO staff_credit_index (sid, vn_id, is_va) VALUES
      (?, ?, 0),
      (?, ?, 1),
      (?, ?, 0)
  `).run(
    ids.firstStaff,
    ids.firstVn,
    ids.firstStaff,
    ids.secondVn,
    ids.secondStaff,
    ids.secondVn,
  );
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES
      (?, '{"staff":1}', 1, 2),
      (?, '{"staff":2}', 1, 2)
  `).run(`staff_full:${ids.firstStaff}`, `staff_full:${ids.secondStaff}`);
}

registerDiscoveryRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getDiscoveryRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
