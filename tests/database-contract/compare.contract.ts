import { describe, expect, it } from 'vitest';
import type { CompareRepository } from '@/lib/db/repositories/compare';

/** Engine-neutral voice-credit fixture used by the compare contract. */
export interface CompareVoiceCreditFixture {
  vn_id: string;
  sid: string;
  aid: number | null;
  c_id: string;
  c_name: string;
  va_name: string;
  va_original: string | null;
  note: string | null;
}

/** Harness that provides one isolated repository scenario per contract test. */
export interface CompareContractHarness {
  /** Run one assertion against a clean engine-specific repository. */
  withRepository(
    run: (
      repository: CompareRepository,
      seed: (rows: readonly CompareVoiceCreditFixture[]) => Promise<void>,
    ) => Promise<void>,
  ): Promise<void>;
}

const credits: readonly CompareVoiceCreditFixture[] = [
  { vn_id: 'v991001', sid: 's991001', aid: 1, c_id: 'c991001', c_name: 'First heroine', va_name: 'Canonical actor', va_original: null, note: null },
  { vn_id: 'v991001', sid: 's991001', aid: 1, c_id: 'c991001', c_name: 'First heroine', va_name: 'Canonical actor', va_original: null, note: 'alternate route' },
  { vn_id: 'v991002', sid: 's991001', aid: 2, c_id: 'c991002', c_name: 'Second heroine', va_name: 'Credited alias', va_original: 'Alias', note: null },
  { vn_id: 'v991001', sid: 's991002', aid: 1, c_id: 'c991003', c_name: 'Unrelated one', va_name: 'Same display name', va_original: null, note: null },
  { vn_id: 'v991002', sid: 's991003', aid: 1, c_id: 'c991004', c_name: 'Unrelated two', va_name: 'Same display name', va_original: null, note: null },
  { vn_id: 'v991001', sid: 's991004', aid: 1, c_id: 'c991010', c_name: 'Recurring character', va_name: 'Actor one', va_original: null, note: null },
  { vn_id: 'v991002', sid: 's991005', aid: 1, c_id: 'c991010', c_name: 'Recurring character', va_name: 'Actor two', va_original: null, note: null },
];

/**
 * Register the engine-neutral compare repository contract.
 *
 * @param label Database engine label shown by Vitest.
 * @param harness Isolated engine harness.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerCompareRepositoryContract(
  label: string,
  harness: CompareContractHarness,
): void {
  describe(`${label} compare repository contract`, () => {
    it('returns no overlap before two distinct VNs are supplied', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.findSharedVas([])).resolves.toEqual([]);
        await expect(repository.findSharedVas(['v991001', 'v991001'])).resolves.toEqual([]);
        await expect(repository.findSharedCharacters(['v991001'])).resolves.toEqual([]);
      });
    });

    it('matches canonical actor ids, deduplicates characters, and preserves VN order', async () => {
      await harness.withRepository(async (repository, seed) => {
        await seed(credits);
        await expect(repository.findSharedVas(['v991001', 'v991002'])).resolves.toEqual([{
          sid: 's991001',
          va_name: 'Canonical actor',
          va_original: null,
          creditsByVn: [
            { vn_id: 'v991001', characters: [{ c_id: 'c991001', c_name: 'First heroine' }] },
            { vn_id: 'v991002', characters: [{ c_id: 'c991002', c_name: 'Second heroine' }] },
          ],
          totalCharacters: 2,
        }]);
        const reversed = await repository.findSharedVas(['v991002', 'v991001']);
        expect(reversed[0]?.creditsByVn.map((entry) => entry.vn_id)).toEqual(['v991002', 'v991001']);
      });
    });

    it('matches recurring characters independently from their voice actor', async () => {
      await harness.withRepository(async (repository, seed) => {
        await seed(credits);
        await expect(repository.findSharedCharacters(['v991001', 'v991002'])).resolves.toEqual([{
          c_id: 'c991010',
          c_name: 'Recurring character',
          per_vn: [
            { vn_id: 'v991001', va_name: 'Actor one' },
            { vn_id: 'v991002', va_name: 'Actor two' },
          ],
        }]);
      });
    });
  });
}
