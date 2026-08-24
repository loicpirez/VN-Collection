import { describe, expect, it } from 'vitest';
import type { SavedFilterRepository } from '@/lib/db/repositories/saved-filter';

/** Namespace used to isolate contract rows from the wider test database. */
export const SAVED_FILTER_CONTRACT_PREFIX = '__repo_saved_filter_';

async function contractRows(repository: SavedFilterRepository) {
  return (await repository.list()).filter((filter) => filter.name.startsWith(SAVED_FILTER_CONTRACT_PREFIX));
}

/** Harness that supplies a freshly seeded saved-filter repository. */
export interface SavedFilterContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: SavedFilterRepository) => Promise<void>): Promise<void>;
}

/** Register ordered saved-filter read, reorder, and delete parity tests. */
export function registerSavedFilterRepositoryContract(
  label: string,
  harness: SavedFilterContractHarness,
): void {
  describe(`${label} saved-filter repository contract`, () => {
    it('lists at most the persisted filters in stable position order', async () => {
      await harness.withRepository(async (repository) => {
        expect(await contractRows(repository)).toMatchObject([
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}Second`, params: 'status=playing', position: 1 },
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}First`, params: 'tag=g1', position: 2 },
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}Third`, params: '', position: 3 },
        ]);
      });
    });

    it('reorders existing ids and deletes idempotently', async () => {
      await harness.withRepository(async (repository) => {
        const initial = await contractRows(repository);
        await repository.reorder([initial[2]!.id, initial[1]!.id, initial[0]!.id]);
        expect(await contractRows(repository)).toMatchObject([
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}Third`, position: 1 },
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}First`, position: 2 },
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}Second`, position: 3 },
        ]);
        await expect(repository.delete(initial[1]!.id)).resolves.toBe(true);
        await expect(repository.delete(initial[1]!.id)).resolves.toBe(false);
        expect(await contractRows(repository)).toMatchObject([
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}Third` },
          { name: `${SAVED_FILTER_CONTRACT_PREFIX}Second` },
        ]);
      });
    });
  });
}
