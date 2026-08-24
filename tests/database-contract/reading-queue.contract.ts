import { describe, expect, it } from 'vitest';
import type { ReadingQueueRepository } from '@/lib/db/repositories/reading-queue';

/** Stable identifiers shared by the reading-queue parity contract. */
export const READING_QUEUE_CONTRACT_IDS = {
  firstVn: 'v991701',
  secondVn: 'v991702',
} as const;

/** Harness that supplies a freshly seeded reading-queue repository. */
export interface ReadingQueueContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: ReadingQueueRepository) => Promise<void>): Promise<void>;
}

/** Register reading-queue ordering and idempotency parity tests. */
export function registerReadingQueueRepositoryContract(
  label: string,
  harness: ReadingQueueContractHarness,
): void {
  describe(`${label} reading-queue repository contract`, () => {
    it('adds entries idempotently and allocates distinct positions', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.list()).resolves.toEqual([]);
        const [first, second] = await Promise.all([
          repository.add(READING_QUEUE_CONTRACT_IDS.firstVn.toUpperCase()),
          repository.add(READING_QUEUE_CONTRACT_IDS.secondVn),
        ]);
        expect(new Set([first.position, second.position]).size).toBe(2);
        await expect(repository.add(READING_QUEUE_CONTRACT_IDS.firstVn)).resolves.toEqual(first);
        const listed = await repository.list();
        expect(listed).toHaveLength(2);
        expect(new Set(listed.map((entry) => entry.vn_id))).toEqual(new Set([
          READING_QUEUE_CONTRACT_IDS.firstVn,
          READING_QUEUE_CONTRACT_IDS.secondVn,
        ]));
      });
    });

    it('reorders atomically and reports removal accurately', async () => {
      await harness.withRepository(async (repository) => {
        await repository.reorder([]);
        await repository.add(READING_QUEUE_CONTRACT_IDS.firstVn);
        await repository.add(READING_QUEUE_CONTRACT_IDS.secondVn);
        await repository.reorder([
          READING_QUEUE_CONTRACT_IDS.secondVn.toUpperCase(),
          READING_QUEUE_CONTRACT_IDS.firstVn,
        ]);
        await expect(repository.list()).resolves.toMatchObject([
          { vn_id: READING_QUEUE_CONTRACT_IDS.secondVn, position: 1 },
          { vn_id: READING_QUEUE_CONTRACT_IDS.firstVn, position: 2 },
        ]);
        await expect(repository.remove(READING_QUEUE_CONTRACT_IDS.firstVn.toUpperCase())).resolves.toBe(true);
        await expect(repository.remove(READING_QUEUE_CONTRACT_IDS.firstVn)).resolves.toBe(false);
      });
    });
  });
}
