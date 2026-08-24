import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getVnRouteRepository } from '@/lib/db/repositories/vn-route';
import {
  registerVnRouteRepositoryContract,
  VN_ROUTE_CONTRACT_IDS,
  type VnRouteContractRows,
} from './vn-route.contract';

function reset(): void {
  const ids = Object.values(VN_ROUTE_CONTRACT_IDS);
  db.prepare('DELETE FROM vn_route WHERE vn_id IN (?, ?)').run(...ids);
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(...ids);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(...ids);
}

function seed(): VnRouteContractRows {
  reset();
  const ids = VN_ROUTE_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, fetched_at) VALUES (?, 'Route VN', 1), (?, 'Foreign Route VN', 1)
  `).run(ids.vn, ids.foreignVn);
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
      (?, 'playing', 1, 1), (?, 'playing', 1, 1)
  `).run(ids.vn, ids.foreignVn);
  const insert = db.prepare(`
    INSERT INTO vn_route (vn_id, name, order_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?) RETURNING id
  `);
  return {
    first: (insert.get(ids.vn, 'Common route', 0, 1, 1) as { id: number }).id,
    second: (insert.get(ids.vn, 'Second route', 1, 2, 2) as { id: number }).id,
    foreign: (insert.get(ids.foreignVn, 'Foreign route', 0, 3, 3) as { id: number }).id,
  };
}

registerVnRouteRepositoryContract('SQLite', {
  async withRepository(run) {
    const rows = seed();
    try {
      await run(getVnRouteRepository(), rows);
    } finally {
      reset();
    }
  },
});

afterAll(reset);
