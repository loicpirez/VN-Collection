import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getSeriesRepository } from '@/lib/db/repositories/series';
import { registerSeriesRepositoryContract, SERIES_CONTRACT_IDS } from './series.contract';

function reset(): void {
  db.prepare('DELETE FROM series_vn WHERE series_id IN (?, ?)').run(
    SERIES_CONTRACT_IDS.firstSeries,
    SERIES_CONTRACT_IDS.secondSeries,
  );
  db.prepare('DELETE FROM series WHERE id IN (?, ?)').run(
    SERIES_CONTRACT_IDS.firstSeries,
    SERIES_CONTRACT_IDS.secondSeries,
  );
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(
    SERIES_CONTRACT_IDS.firstVn,
    SERIES_CONTRACT_IDS.secondVn,
  );
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(
    SERIES_CONTRACT_IDS.firstVn,
    SERIES_CONTRACT_IDS.secondVn,
  );
}

function seed(): void {
  reset();
  db.prepare(`
    INSERT INTO vn (id, title, relations, fetched_at) VALUES
      (?, 'Alpha Series VN', ?, 1),
      (?, 'Beta Series VN', NULL, 1)
  `).run(
    SERIES_CONTRACT_IDS.firstVn,
    JSON.stringify([{
      id: SERIES_CONTRACT_IDS.secondVn,
      title: 'Beta Series VN',
      relation: 'seq',
    }]),
    SERIES_CONTRACT_IDS.secondVn,
  );
  db.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at)
    VALUES
      (?, 'completed', 1, 1),
      (?, 'playing', 1, 1)
  `).run(SERIES_CONTRACT_IDS.firstVn, SERIES_CONTRACT_IDS.secondVn);
  db.prepare(`
    INSERT INTO series (id, name, description, created_at, updated_at) VALUES
      (?, 'Alpha Contract Series', NULL, 1, 1),
      (?, 'Beta Contract Series', NULL, 1, 1)
  `).run(SERIES_CONTRACT_IDS.firstSeries, SERIES_CONTRACT_IDS.secondSeries);
}

registerSeriesRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getSeriesRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
