import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getEgsRepository } from '@/lib/db/repositories/egs';
import { EGS_CONTRACT_IDS, registerEgsRepositoryContract } from './egs.contract';

const VN_IDS = [EGS_CONTRACT_IDS.vn, EGS_CONTRACT_IDS.otherVn] as const;

function reset(): void {
  db.prepare('DELETE FROM vn_egs_link WHERE vn_id IN (?, ?)').run(...VN_IDS);
  db.prepare('DELETE FROM egs_vn_link WHERE egs_id IN (?, ?)').run(EGS_CONTRACT_IDS.egs, EGS_CONTRACT_IDS.otherEgs);
  db.prepare('DELETE FROM egs_game WHERE vn_id IN (?, ?)').run(...VN_IDS);
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(...VN_IDS);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(...VN_IDS);
}

function seed(): void {
  reset();
  db.prepare(`
    INSERT INTO vn (id, title, fetched_at) VALUES (?, 'EGS VN', 1), (?, 'Other EGS VN', 1)
  `).run(...VN_IDS);
  db.prepare(`
    INSERT INTO collection (
      vn_id, status, user_rating, playtime_minutes, started_date, added_at, updated_at
    ) VALUES (?, 'playing', 75, 45, '2095-01-01', 1, 1)
  `).run(EGS_CONTRACT_IDS.vn);
}

registerEgsRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getEgsRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
