import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getActivityRepository } from '@/lib/db/repositories/activity';
import {
  ACTIVITY_CONTRACT_FIXTURE,
  registerActivityRepositoryContract,
} from './activity.contract';

function reset(): void {
  db.prepare("DELETE FROM user_activity WHERE actor = 'contract'").run();
  db.prepare('DELETE FROM vn_activity WHERE vn_id IN (?, ?)').run(
    ACTIVITY_CONTRACT_FIXTURE.firstVn,
    ACTIVITY_CONTRACT_FIXTURE.secondVn,
  );
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(
    ACTIVITY_CONTRACT_FIXTURE.firstVn,
    ACTIVITY_CONTRACT_FIXTURE.secondVn,
  );
}

function seed(): void {
  reset();
  db.prepare(`
    INSERT INTO vn (id, title, fetched_at) VALUES
      (?, 'Activity Contract One', 1),
      (?, 'Activity Contract Two', 1)
  `).run(ACTIVITY_CONTRACT_FIXTURE.firstVn, ACTIVITY_CONTRACT_FIXTURE.secondVn);
  db.prepare(`
    INSERT INTO vn_activity (id, vn_id, kind, payload, occurred_at) VALUES
      (?, ?, 'manual', '{"text":"contract note"}', ?),
      (?, ?, 'note', 'invalid-json', ?),
      (?, ?, 'status', '{"to":"completed"}', ?)
  `).run(
    ACTIVITY_CONTRACT_FIXTURE.firstActivity,
    ACTIVITY_CONTRACT_FIXTURE.firstVn,
    ACTIVITY_CONTRACT_FIXTURE.firstDay,
    ACTIVITY_CONTRACT_FIXTURE.secondActivity,
    ACTIVITY_CONTRACT_FIXTURE.firstVn,
    ACTIVITY_CONTRACT_FIXTURE.secondDay,
    ACTIVITY_CONTRACT_FIXTURE.thirdActivity,
    ACTIVITY_CONTRACT_FIXTURE.secondVn,
    ACTIVITY_CONTRACT_FIXTURE.secondDay,
  );
}

registerActivityRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getActivityRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
