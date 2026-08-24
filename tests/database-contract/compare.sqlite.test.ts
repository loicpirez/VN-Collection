import Database from 'better-sqlite3';
import { afterAll } from 'vitest';
import { listCollection } from '@/lib/db';
import { getCompareRepository } from '@/lib/db/repositories/compare';
import {
  registerCompareRepositoryContract,
  type CompareVoiceCreditFixture,
} from './compare.contract';

listCollection({});
const database = new Database(process.env.DB_PATH!);
const fixtureIds = ['v991001', 'v991002'] as const;

function reset(): void {
  database.prepare(`DELETE FROM vn_va_credit WHERE vn_id IN (?, ?)` ).run(...fixtureIds);
  database.prepare(`DELETE FROM vn WHERE id IN (?, ?)` ).run(...fixtureIds);
}

async function seed(rows: readonly CompareVoiceCreditFixture[]): Promise<void> {
  const insertVn = database.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)');
  for (const id of fixtureIds) insertVn.run(id, `Contract ${id}`, 1);
  const insertCredit = database.prepare(`
    INSERT INTO vn_va_credit (
      vn_id, sid, aid, c_id, c_name, va_name, va_original, note
    ) VALUES (@vn_id, @sid, @aid, @c_id, @c_name, @va_name, @va_original, @note)
  `);
  for (const row of rows) insertCredit.run(row);
}

registerCompareRepositoryContract('SQLite', {
  async withRepository(run) {
    reset();
    try {
      await run(getCompareRepository(), seed);
    } finally {
      reset();
    }
  },
});

afterAll(() => database.close());
