import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getMaintenanceRepository } from '@/lib/db/repositories/maintenance';
import {
  MAINTENANCE_CONTRACT_IDS,
  registerMaintenanceRepositoryContract,
} from './maintenance.contract';

const IDS = Object.values(MAINTENANCE_CONTRACT_IDS);

function reset(): void {
  const placeholders = IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM egs_game WHERE vn_id IN (${placeholders})`).run(...IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...IDS);
}

function seed(): void {
  reset();
  const ids = MAINTENANCE_CONTRACT_IDS;
  const now = Date.now();
  db.prepare(`
    INSERT INTO vn (id, title, image_url, fetched_at) VALUES
      (?, 'Duplicate: Title!', NULL, 1),
      (?, 'duplicate title', 'second.jpg', 1),
      (?, 'abc', 'short.jpg', 1),
      (?, 'Fresh Missing Cover', NULL, ?),
      (?, 'Fresh Complete', 'fresh.jpg', ?)
  `).run(ids.duplicateA, ids.duplicateB, ids.shortTitle, ids.freshMissingCover, now, ids.freshComplete, now);
  db.prepare(`
    INSERT INTO egs_game (vn_id, egs_id, source, fetched_at) VALUES (?, 994902, 'manual', 1)
  `).run(ids.duplicateB);
}

registerMaintenanceRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getMaintenanceRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
