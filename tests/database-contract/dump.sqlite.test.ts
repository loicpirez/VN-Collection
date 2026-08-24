import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getDumpRepository } from '@/lib/db/repositories/dump';
import { DUMP_CONTRACT_IDS, registerDumpRepositoryContract } from './dump.contract';

const VN_IDS = [
  DUMP_CONTRACT_IDS.partialVn,
  DUMP_CONTRACT_IDS.untouchedVn,
  DUMP_CONTRACT_IDS.editionCompleteVn,
  DUMP_CONTRACT_IDS.collectionCompleteVn,
  DUMP_CONTRACT_IDS.ignoredVn,
] as const;

function reset(): void {
  db.prepare('DELETE FROM shelf_unit WHERE id = ?').run(DUMP_CONTRACT_IDS.shelf);
  const placeholders = VN_IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM owned_release WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...VN_IDS);
}

function seed(): void {
  reset();
  const ids = DUMP_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, fetched_at) VALUES
      (?, 'Zeta Partial', 1),
      (?, 'Beta Untouched', 1),
      (?, 'Gamma Complete', 1),
      (?, 'Alpha Collection Complete', 1),
      (?, 'Omega Ignored', 1)
  `).run(ids.partialVn, ids.untouchedVn, ids.editionCompleteVn, ids.collectionCompleteVn, ids.ignoredVn);
  db.prepare(`
    INSERT INTO collection (vn_id, status, dumped, dumped_ignored, added_at, updated_at) VALUES
      (?, 'playing', 0, 0, 1, 1),
      (?, 'planning', 0, 0, 1, 1),
      (?, 'completed', 0, 0, 1, 1),
      (?, 'completed', 1, 0, 1, 1),
      (?, 'completed', 1, 1, 1, 1)
  `).run(ids.partialVn, ids.untouchedVn, ids.editionCompleteVn, ids.collectionCompleteVn, ids.ignoredVn);
  db.prepare(`
    INSERT INTO owned_release (vn_id, release_id, dumped, added_at) VALUES
      (?, 'r994201', 1, 1),
      (?, 'r994202', 0, 1),
      (?, 'r994203', 0, 1),
      (?, 'r994204', 1, 1),
      (?, 'r994205', 1, 1)
  `).run(ids.partialVn, ids.partialVn, ids.untouchedVn, ids.editionCompleteVn, ids.ignoredVn);
  db.prepare(`
    INSERT INTO shelf_unit (id, name, cols, rows, order_index, created_at, updated_at)
    VALUES (?, 'Dump Contract Shelf', 2, 2, 0, 1, 1)
  `).run(ids.shelf);
  db.prepare(`
    INSERT INTO shelf_slot (shelf_id, row, col, vn_id, release_id, placed_at)
    VALUES (?, 0, 0, ?, 'r994201', 1)
  `).run(ids.shelf, ids.partialVn);
  db.prepare(`
    INSERT INTO shelf_display_slot (shelf_id, after_row, position, vn_id, release_id, placed_at)
    VALUES (?, 0, 0, ?, 'r994203', 1)
  `).run(ids.shelf, ids.untouchedVn);
}

registerDumpRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getDumpRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
