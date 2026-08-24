import { describe, expect, it } from 'vitest';
import type { SeriesRepository } from '@/lib/db/repositories/series';

/** Stable identifiers shared by the series parity contract. */
export const SERIES_CONTRACT_IDS = {
  firstSeries: 991601,
  secondSeries: 991602,
  firstVn: 'v991601',
  secondVn: 'v991602',
  missingVn: 'v991699',
} as const;

/** Harness that supplies a freshly seeded series repository. */
export interface SeriesContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: SeriesRepository) => Promise<void>): Promise<void>;
}

/**
 * Register series metadata, membership, and transaction parity tests.
 *
 * @param label Engine name displayed by Vitest.
 * @param harness Reset and repository factory for the engine.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerSeriesRepositoryContract(
  label: string,
  harness: SeriesContractHarness,
): void {
  describe(`${label} series repository contract`, () => {
    it('lists, reads, updates, and deletes series metadata', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.list()).resolves.toMatchObject([
          { id: SERIES_CONTRACT_IDS.firstSeries, name: 'Alpha Contract Series' },
          { id: SERIES_CONTRACT_IDS.secondSeries, name: 'Beta Contract Series' },
        ]);
        await expect(repository.get(SERIES_CONTRACT_IDS.firstSeries)).resolves.toMatchObject({
          id: SERIES_CONTRACT_IDS.firstSeries,
          name: 'Alpha Contract Series',
          vns: [],
        });
        await expect(repository.get(999999)).resolves.toBeNull();
        await expect(repository.update(SERIES_CONTRACT_IDS.firstSeries, {})).resolves.toMatchObject({
          name: 'Alpha Contract Series',
        });
        await expect(repository.update(SERIES_CONTRACT_IDS.firstSeries, {
          name: 'Renamed Contract Series',
          description: 'Updated description',
          cover_path: 'series/cover.webp',
          banner_path: null,
        })).resolves.toMatchObject({
          name: 'Renamed Contract Series',
          description: 'Updated description',
          cover_path: 'series/cover.webp',
          banner_path: null,
        });
        await expect(repository.update(999999, { name: 'Missing' })).resolves.toBeNull();
        await repository.remove(SERIES_CONTRACT_IDS.secondSeries);
        await expect(repository.get(SERIES_CONTRACT_IDS.secondSeries)).resolves.toBeNull();
      });
    });

    it('maintains deterministic ordered memberships', async () => {
      await harness.withRepository(async (repository) => {
        await repository.addMembers(SERIES_CONTRACT_IDS.firstSeries, []);
        await repository.addMembers(SERIES_CONTRACT_IDS.firstSeries, [
          { vnId: SERIES_CONTRACT_IDS.firstVn.toUpperCase(), orderIndex: 2 },
          { vnId: SERIES_CONTRACT_IDS.secondVn, orderIndex: 1 },
        ]);
        await expect(repository.get(SERIES_CONTRACT_IDS.firstSeries)).resolves.toMatchObject({
          vns: [
            { id: SERIES_CONTRACT_IDS.secondVn, order_index: 1, status: null },
            { id: SERIES_CONTRACT_IDS.firstVn, order_index: 2, status: 'completed' },
          ],
        });
        await expect(repository.listForVn(SERIES_CONTRACT_IDS.firstVn)).resolves.toEqual([
          { id: SERIES_CONTRACT_IDS.firstSeries, name: 'Alpha Contract Series' },
        ]);
        await repository.removeMember(SERIES_CONTRACT_IDS.firstSeries, SERIES_CONTRACT_IDS.firstVn.toUpperCase());
        await expect(repository.listForVn(SERIES_CONTRACT_IDS.firstVn)).resolves.toEqual([]);
      });
    });

    it('rolls back every membership when a later insert fails', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.addMembers(SERIES_CONTRACT_IDS.firstSeries, [
          { vnId: SERIES_CONTRACT_IDS.firstVn, orderIndex: 0 },
          { vnId: SERIES_CONTRACT_IDS.missingVn, orderIndex: 1 },
        ])).rejects.toThrow();
        await expect(repository.listForVn(SERIES_CONTRACT_IDS.firstVn)).resolves.toEqual([]);
      });
    });
  });
}
