import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getUserListRepository } from '@/lib/db/repositories/user-list';
import {
  registerUserListRepositoryContract,
  USER_LIST_CONTRACT_IDS,
} from './user-list.contract';

function reset(): void {
  db.prepare('DELETE FROM user_list_vn WHERE list_id IN (?, ?)').run(
    USER_LIST_CONTRACT_IDS.firstList,
    USER_LIST_CONTRACT_IDS.secondList,
  );
  db.prepare('DELETE FROM user_list WHERE id IN (?, ?)').run(
    USER_LIST_CONTRACT_IDS.firstList,
    USER_LIST_CONTRACT_IDS.secondList,
  );
}

function seed(): void {
  reset();
  db.prepare(`
    INSERT INTO user_list (id, name, slug, description, color, icon, pinned, created_at, updated_at) VALUES
      (?, 'Alpha List', 'alpha-list', NULL, NULL, NULL, 0, 1, 1),
      (?, 'Beta List', 'beta-list', NULL, NULL, NULL, 0, 1, 2)
  `).run(USER_LIST_CONTRACT_IDS.firstList, USER_LIST_CONTRACT_IDS.secondList);
}

registerUserListRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getUserListRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
