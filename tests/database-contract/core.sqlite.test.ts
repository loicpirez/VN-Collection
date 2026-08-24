import Database from 'better-sqlite3';
import { afterAll } from 'vitest';
import { listCollection } from '@/lib/db';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { getTextSearchRepository } from '@/lib/db/repositories/text-search';
import { getVnReadRepository } from '@/lib/db/repositories/vn-read';
import { getVnWriteRepository } from '@/lib/db/repositories/vn-write';
import {
  CORE_CONTRACT_IDS,
  registerCoreRepositoryContract,
} from './core.contract';

listCollection({});
const database = new Database(process.env.DB_PATH!);
const contractVnIds = [CORE_CONTRACT_IDS.firstVn, CORE_CONTRACT_IDS.secondVn] as const;

function reset(): void {
  database.prepare('DELETE FROM user_list_vn WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM collection_place_index WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_quote WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_tag_index WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_developer_index WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_language_index WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_platform_index WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(...contractVnIds);
}

registerCoreRepositoryContract('SQLite', {
  async withRepositories(run) {
    reset();
    try {
      await run(
        getCollectionCoreRepository(),
        getVnReadRepository(),
        getVnWriteRepository(),
        getTextSearchRepository(),
        {
          async insertQuote(vnId, quote) {
            database.prepare(`
              INSERT INTO vn_quote (quote_id, vn_id, quote, score, fetched_at)
              VALUES (?, ?, ?, 1, 1)
            `).run(`quote-${vnId}`, vnId, quote);
          },
          async tagIds(vnId) {
            return database.prepare(`
              SELECT tag_id FROM vn_tag_index WHERE vn_id = ? ORDER BY tag_id
            `).all(vnId).map((row) => (row as { tag_id: string }).tag_id);
          },
          async customOrders() {
            const rows = database.prepare(`
              SELECT vn_id, custom_order
              FROM collection
              WHERE vn_id IN (?, ?)
              ORDER BY vn_id
            `).all(...contractVnIds) as Array<{ vn_id: string; custom_order: number }>;
            return Object.fromEntries(rows.map((row) => [row.vn_id, row.custom_order]));
          },
        },
      );
    } finally {
      reset();
    }
  },
});

afterAll(() => database.close());
