import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getEntityNameRepository } from '@/lib/db/repositories/entity-name';
import {
  ENTITY_NAME_CONTRACT_IDS,
  registerEntityNameRepositoryContract,
} from './entity-name.contract';

const VN_IDS = [ENTITY_NAME_CONTRACT_IDS.vn, ENTITY_NAME_CONTRACT_IDS.developerHost] as const;

function reset(): void {
  const placeholders = VN_IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM vn_va_credit WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn_staff_credit WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare(`DELETE FROM vn_developer_index WHERE vn_id IN (${placeholders})`).run(...VN_IDS);
  db.prepare('DELETE FROM producer WHERE id IN (?, ?)').run(
    ENTITY_NAME_CONTRACT_IDS.directProducer,
    ENTITY_NAME_CONTRACT_IDS.embeddedProducer,
  );
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...VN_IDS);
}

function seed(): void {
  reset();
  const ids = ENTITY_NAME_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, developers, fetched_at) VALUES
      (?, 'Named VN', NULL, 1),
      (?, 'Developer Host', ?, 1)
  `).run(
    ids.vn,
    ids.developerHost,
    JSON.stringify([{ id: ids.embeddedProducer, name: 'Embedded Producer' }]),
  );
  db.prepare('INSERT INTO producer (id, name, fetched_at) VALUES (?, ?, 1)')
    .run(ids.directProducer, 'Direct Producer');
  db.prepare('INSERT INTO vn_developer_index (vn_id, producer_id) VALUES (?, ?)')
    .run(ids.developerHost, ids.embeddedProducer);
  db.prepare(`
    INSERT INTO vn_staff_credit (vn_id, sid, role, name) VALUES (?, ?, 'staff', ?)
  `).run(ids.vn, ids.productionStaff, 'Production Staff');
  db.prepare(`
    INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES
      (?, ?, ?, 'Contract Character', 'Voice Alias'),
      (?, ?, 'c994802', 'Other Character', 'Voice Only Staff')
  `).run(
    ids.vn,
    ids.productionStaff,
    ids.character,
    ids.developerHost,
    ids.voiceOnlyStaff,
  );
}

registerEntityNameRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getEntityNameRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
