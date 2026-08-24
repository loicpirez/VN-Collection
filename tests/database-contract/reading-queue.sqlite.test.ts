import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getReadingQueueRepository } from '@/lib/db/repositories/reading-queue';
import {
  READING_QUEUE_CONTRACT_IDS,
  registerReadingQueueRepositoryContract,
} from './reading-queue.contract';

function reset(): void {
  db.prepare('DELETE FROM reading_queue WHERE vn_id IN (?, ?)').run(
    READING_QUEUE_CONTRACT_IDS.firstVn,
    READING_QUEUE_CONTRACT_IDS.secondVn,
  );
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(
    READING_QUEUE_CONTRACT_IDS.firstVn,
    READING_QUEUE_CONTRACT_IDS.secondVn,
  );
}

function seed(): void {
  reset();
  db.prepare(`
    INSERT INTO vn (id, title, fetched_at) VALUES
      (?, 'First queue contract', 1),
      (?, 'Second queue contract', 1)
  `).run(READING_QUEUE_CONTRACT_IDS.firstVn, READING_QUEUE_CONTRACT_IDS.secondVn);
}

registerReadingQueueRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getReadingQueueRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
