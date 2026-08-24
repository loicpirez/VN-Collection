import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getSavedFilterRepository } from '@/lib/db/repositories/saved-filter';
import {
  registerSavedFilterRepositoryContract,
  SAVED_FILTER_CONTRACT_PREFIX,
} from './saved-filter.contract';

function reset(): void {
  db.prepare('DELETE FROM saved_filter WHERE name LIKE ?').run(`${SAVED_FILTER_CONTRACT_PREFIX}%`);
}

function seed(): void {
  reset();
  const insert = db.prepare(`
    INSERT INTO saved_filter (name, params, position, created_at) VALUES (?, ?, ?, ?)
  `);
  insert.run(`${SAVED_FILTER_CONTRACT_PREFIX}First`, 'tag=g1', 2, 1);
  insert.run(`${SAVED_FILTER_CONTRACT_PREFIX}Second`, 'status=playing', 1, 2);
  insert.run(`${SAVED_FILTER_CONTRACT_PREFIX}Third`, '', 3, 3);
}

registerSavedFilterRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getSavedFilterRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
