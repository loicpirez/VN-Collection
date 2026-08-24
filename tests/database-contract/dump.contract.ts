import { describe, expect, it } from 'vitest';
import type { DumpRepository } from '@/lib/db/repositories/dump';

/** Stable identifiers shared by the dump-progress parity contract. */
export const DUMP_CONTRACT_IDS = {
  partialVn: 'v994201',
  untouchedVn: 'v994202',
  editionCompleteVn: 'v994203',
  collectionCompleteVn: 'v994204',
  ignoredVn: 'v994205',
  shelf: 994201,
} as const;

/** Harness that supplies a freshly seeded dump-progress repository. */
export interface DumpContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: DumpRepository) => Promise<void>): Promise<void>;
}

/** Register dump summary, ordering, exclusion, and shelf parity tests. */
export function registerDumpRepositoryContract(
  label: string,
  harness: DumpContractHarness,
): void {
  describe(`${label} dump repository contract`, () => {
    it('preserves per-VN dump status and work-first ordering', async () => {
      await harness.withRepository(async (repository) => {
        const entries = await repository.listStatus();
        expect(entries.map((entry) => entry.vn_id)).toEqual([
          DUMP_CONTRACT_IDS.partialVn,
          DUMP_CONTRACT_IDS.collectionCompleteVn,
          DUMP_CONTRACT_IDS.untouchedVn,
          DUMP_CONTRACT_IDS.editionCompleteVn,
          DUMP_CONTRACT_IDS.ignoredVn,
        ]);
        expect(entries).toMatchObject([
          { total_editions: 2, dumped_editions: 1, collection_dumped: false, dumped_ignored: false },
          { total_editions: 0, dumped_editions: 0, collection_dumped: true, dumped_ignored: false },
          { total_editions: 1, dumped_editions: 0, collection_dumped: false, dumped_ignored: false },
          { total_editions: 1, dumped_editions: 1, collection_dumped: false, dumped_ignored: false },
          { total_editions: 1, dumped_editions: 1, collection_dumped: true, dumped_ignored: true },
        ]);
      });
    });

    it('excludes ignored rows from summary math without hiding their status', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.summary()).resolves.toEqual({
          totalVns: 4,
          totalEditions: 4,
          dumpedEditions: 2,
          fullyDumpedVns: 2,
          editionPct: 60,
        });
      });
    });

    it('unifies regular and face-out shelf placements', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.listShelfVnIds()).resolves.toEqual(new Set([
          DUMP_CONTRACT_IDS.partialVn,
          DUMP_CONTRACT_IDS.untouchedVn,
        ]));
      });
    });
  });
}
