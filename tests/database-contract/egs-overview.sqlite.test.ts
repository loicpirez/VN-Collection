import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getEgsOverviewRepository } from '@/lib/db/repositories/egs-overview';
import {
  EGS_OVERVIEW_CONTRACT_IDS,
  registerEgsOverviewRepositoryContract,
} from './egs-overview.contract';

function reset(): void {
  const ids = EGS_OVERVIEW_CONTRACT_IDS;
  db.prepare('DELETE FROM vn WHERE id IN (?, ?, ?)').run(ids.linkedVn, ids.negativeVn, ids.missingVn);
}

function seed(): void {
  reset();
  const ids = EGS_OVERVIEW_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, alttitle, image_thumb, fetched_at) VALUES
      (?, 'Alpha Linked', NULL, 'https://example.test/linked.jpg', 1),
      (?, 'Zulu Negative', 'Negative Alt', NULL, 1),
      (?, 'Beta Missing', NULL, NULL, 1)
  `).run(ids.linkedVn, ids.negativeVn, ids.missingVn);
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
      (?, 'completed', 1, 1),
      (?, 'planning', 1, 1),
      (?, 'playing', 1, 1)
  `).run(ids.linkedVn, ids.negativeVn, ids.missingVn);
  db.prepare(`
    INSERT INTO egs_game (
      vn_id, egs_id, median, playtime_median_minutes, source, fetched_at
    ) VALUES
      (?, 994401, 84, 180, 'manual', 1),
      (?, NULL, NULL, NULL, NULL, 1)
  `).run(ids.linkedVn, ids.negativeVn);
}

registerEgsOverviewRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getEgsOverviewRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
