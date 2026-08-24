import { describe, expect, it } from 'vitest';
import type { RecommendationReadRepository } from '@/lib/db/repositories/recommendation-read';

/** Stable identifiers shared by the recommendation-read parity contract. */
export const RECOMMENDATION_READ_CONTRACT_IDS = {
  first: 'v994801',
  second: 'v994802',
  third: 'v994803',
  missing: 'v994899',
  developer: 'p994801',
  wishlistCache: 'POST /ulist|recommendation-contract',
  tagCache: 'POST /tag|recommendation-contract',
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

    it('loads batched seed signals, VN metadata, ownership, and cache bodies', async () => {
      await harness.withRepository(async (repository) => {
        const ids = RECOMMENDATION_READ_CONTRACT_IDS;
        await expect(repository.seedSignals()).resolves.toEqual([
          { vnId: ids.first, signal: 'completed', rating: 80 },
          { vnId: ids.first, signal: 'rated', rating: 80 },
          { vnId: ids.second, signal: 'completed', rating: 90 },
          { vnId: ids.second, signal: 'rated', rating: 90 },
          { vnId: ids.third, signal: 'completed', rating: 60 },
          { vnId: ids.third, signal: 'favorite', rating: 60 },
          { vnId: ids.third, signal: 'queue', rating: null },
        ]);
        await expect(repository.vnMetadata([ids.second, ids.missing, ids.first])).resolves.toEqual([
          expect.objectContaining({ id: ids.first, title: 'First Recommendation VN' }),
          expect.objectContaining({ id: ids.second, title: 'Second Recommendation VN' }),
        ]);
        await expect(repository.vnMetadata([])).resolves.toEqual([]);
        await expect(repository.collectionIds()).resolves.toEqual([ids.first, ids.second, ids.third]);
        await expect(repository.wishlistCacheBodies()).resolves.toEqual(['{"results":[]}']);
        await expect(repository.tagCacheBodies()).resolves.toEqual(['{"results":[]}']);
      });
    });
  });
}
