import { describe, expect, it } from 'vitest';
import type { RecommendationReadRepository } from '@/lib/db/repositories/recommendation-read';

/** Stable identifiers shared by the recommendation-read parity contract. */
export const RECOMMENDATION_READ_CONTRACT_IDS = {
  first: 'v994801',
  second: 'v994802',
  third: 'v994803',
  missing: 'v994899',
  developer: 'p994801',
} as const;

/** Harness that supplies a freshly seeded recommendation-read repository. */
export interface RecommendationReadContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: RecommendationReadRepository) => Promise<void>): Promise<void>;
}

/** Register recommendation seed and top-rated context parity tests. */
export function registerRecommendationReadRepositoryContract(
  label: string,
  harness: RecommendationReadContractHarness,
): void {
  describe(`${label} recommendation-read repository contract`, () => {
    it('decodes the local seed chip and handles unknown ids', async () => {
      await harness.withRepository(async (repository) => {
        const ids = RECOMMENDATION_READ_CONTRACT_IDS;
        await expect(repository.seedChip(ids.first)).resolves.toEqual({
          id: ids.first,
          title: 'First Recommendation VN',
          alttitle: 'First alternate',
          released: '2097-01-02',
          developer: 'Recommendation Studio',
          image: { url: '', thumbnail: 'first-thumb.jpg', sexual: 1 },
        });
        await expect(repository.seedChip(ids.second)).resolves.toMatchObject({ image: null, developer: null });
        await expect(repository.seedChip(ids.missing)).resolves.toBeNull();
      });
    });

    it('returns personal top ratings in deterministic order with a bounded limit', async () => {
      await harness.withRepository(async (repository) => {
        const ids = RECOMMENDATION_READ_CONTRACT_IDS;
        await expect(repository.topRated()).resolves.toEqual([
          { id: ids.second, title: 'Second Recommendation VN' },
          { id: ids.first, title: 'First Recommendation VN' },
        ]);
        await expect(repository.topRated(80, 1)).resolves.toEqual([
          { id: ids.second, title: 'Second Recommendation VN' },
        ]);
      });
    });
  });
}
