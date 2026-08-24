import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getCollectionTransferRepository } from '@/lib/db/repositories/collection-transfer';
import {
  COLLECTION_TRANSFER_CONTRACT,
  registerCollectionTransferRepositoryContract,
} from './collection-transfer.contract';

function reset(): void {
  const fixture = COLLECTION_TRANSFER_CONTRACT;
  db.prepare('DELETE FROM series_vn WHERE vn_id IN (?, ?)').run(fixture.vnId, fixture.missingVnId);
  db.prepare('DELETE FROM series WHERE name = ?').run(fixture.seriesName);
  db.prepare('DELETE FROM collection_place_index WHERE vn_id IN (?, ?)').run(fixture.vnId, fixture.missingVnId);
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(fixture.vnId, fixture.missingVnId);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(fixture.vnId, fixture.missingVnId);
}

registerCollectionTransferRepositoryContract('SQLite', {
  async withRepository(run) {
    reset();
    try {
      await run(getCollectionTransferRepository(), async (vnId) => (
        db.prepare('SELECT place FROM collection_place_index WHERE vn_id = ? ORDER BY place')
          .all(vnId) as Array<{ place: string }>
      ).map((row) => row.place));
    } finally {
      reset();
    }
  },
});

afterAll(reset);
