import Database from 'better-sqlite3';
import { afterAll } from 'vitest';
import { listCollection } from '@/lib/db';
import { getStockProviderMaintenanceRepository } from '@/lib/db/repositories/stock-provider-maintenance';
import { getStockQueueRepository } from '@/lib/db/repositories/stock-queue';
import { getStockRepository } from '@/lib/db/repositories/stock';
import {
  registerStockRepositoryContract,
  STOCK_CONTRACT_IDS,
} from './stock.contract';

listCollection({});
const database = new Database(process.env.DB_PATH!);
const contractVnIds = [STOCK_CONTRACT_IDS.firstVn, STOCK_CONTRACT_IDS.secondVn] as const;

function reset(): void {
  database.prepare('DELETE FROM vn_stock_source WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_stock_alias WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_stock_offer WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_stock_provider_status WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn_title_resolve_cache WHERE query = ?').run('contract query');
  database.prepare('DELETE FROM stock_batch_job WHERE id = ?').run(STOCK_CONTRACT_IDS.batch);
  database.prepare(`DELETE FROM stock_provider_batch_run WHERE provider IN ('sofmap', 'surugaya')`).run();
  database.prepare('DELETE FROM reading_queue WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(...contractVnIds);
  database.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(...contractVnIds);
  database.prepare(`DELETE FROM app_setting WHERE key IN ('stock_disabled_providers', 'stock_retry_without_proxy')`).run();
}

function seed(): void {
  reset();
  database.prepare(`
    INSERT INTO vn (id, title, fetched_at) VALUES
      (?, 'Stock Contract Alpha', 1),
      (?, 'Stock Contract Beta', 1)
  `).run(...contractVnIds);
  database.prepare(`
    INSERT INTO collection (vn_id, status, added_at, updated_at) VALUES
      (?, 'completed', 10, 20),
      (?, 'planning', 5, 10)
  `).run(...contractVnIds);
  database.prepare(`
    INSERT INTO reading_queue (vn_id, position, added_at) VALUES
      (?, 2, 1),
      (?, 1, 1)
  `).run(...contractVnIds);
  database.prepare(`INSERT INTO app_setting (key, value) VALUES ('stock_disabled_providers', '["sofmap","invalid"]')`).run();
  database.prepare(`INSERT INTO app_setting (key, value) VALUES ('stock_retry_without_proxy', '1')`).run();
}

registerStockRepositoryContract('SQLite', {
  async withRepositories(run) {
    seed();
    try {
      await run(
        getStockRepository(),
        getStockQueueRepository(),
        getStockProviderMaintenanceRepository(),
        {
          async insertCompletedBatch(providers, startedAt) {
            const insert = database.prepare(`
              INSERT INTO stock_provider_batch_run (provider, started_at, finished_at)
              VALUES (?, ?, ?)
            `);
            database.transaction(() => {
              for (const provider of providers) insert.run(provider, startedAt, startedAt + 10);
            })();
          },
        },
      );
    } finally {
      reset();
    }
  },
});

afterAll(() => database.close());
