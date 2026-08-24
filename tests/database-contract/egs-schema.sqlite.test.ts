import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getEgsSchemaRepository } from '@/lib/db/repositories/egs-schema';
import {
  EGS_SCHEMA_CONTRACT_IDS,
  registerEgsSchemaRepositoryContract,
} from './egs-schema.contract';

function reset(): void {
  const ids = EGS_SCHEMA_CONTRACT_IDS;
  db.prepare('DELETE FROM egs_game WHERE vn_id IN (?, ?)').run(ids.firstVn, ids.secondVn);
  db.prepare('DELETE FROM vn_egs_link WHERE vn_id = ?').run(ids.firstVn);
  db.prepare('DELETE FROM egs_vn_link WHERE egs_id = 994901').run();
  db.prepare('DELETE FROM vndb_cache WHERE cache_key IN (?, ?)').run(ids.wishlistCache, ids.staleCache);
  db.prepare("DELETE FROM app_setting WHERE key = 'egs_username'").run();
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(ids.firstVn, ids.secondVn);
}

function seed(): void {
  reset();
  const ids = EGS_SCHEMA_CONTRACT_IDS;
  db.prepare(`
    INSERT INTO vn (id, title, fetched_at) VALUES
      (?, 'EGS Schema One', 1),
      (?, 'EGS Schema Two', 1)
  `).run(ids.firstVn, ids.secondVn);
  db.prepare(`
    INSERT INTO egs_game (vn_id, egs_id, gamename, fetched_at) VALUES
      (?, 994901, 'EGS Schema One', 10),
      (?, 994902, 'EGS Schema Two', 20)
  `).run(ids.firstVn, ids.secondVn);
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES
      (?, '{}', 25, 100),
      (?, '{"staleWhileError":true}', 30, 100)
  `).run(ids.wishlistCache, ids.staleCache);
  db.prepare('INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES (?, 994901, NULL, 40)')
    .run(ids.firstVn);
  db.prepare("INSERT INTO egs_vn_link (egs_id, vn_id, note, updated_at) VALUES (994901, ?, NULL, 50)")
    .run(ids.firstVn);
  db.prepare("INSERT INTO app_setting (key, value) VALUES ('egs_username', 'schema-contract-secret')").run();
}

registerEgsSchemaRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getEgsSchemaRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
