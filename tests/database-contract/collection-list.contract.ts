import { describe, expect, it } from 'vitest';
import type { CollectionListRepository } from '@/lib/db/repositories/collection-list';

/** Stable identifiers shared by the collection-list parity contract. */
export const COLLECTION_LIST_CONTRACT_IDS = {
  firstVn: 'v991501',
  secondVn: 'v991502',
  thirdVn: 'egs_991503',
  producer: 'p991501',
  publisher: 'p991502',
  tag: 'g991501',
  adultTag: 'g991502',
  series: 991501,
} as const;

/** Harness that supplies a freshly seeded collection-list repository. */
export interface CollectionListContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: CollectionListRepository) => Promise<void>): Promise<void>;
}

function ids(items: Array<{ id: string }>): string[] {
  return items.map((item) => item.id);
}

/**
 * Register collection filtering, sorting, enrichment, and facet parity tests.
 *
 * @param label Engine name displayed by Vitest.
 * @param harness Reset and repository factory for the engine.
 * @returns Nothing; tests are registered with Vitest.
 */
export function registerCollectionListRepositoryContract(
  label: string,
  harness: CollectionListContractHarness,
): void {
  describe(`${label} collection-list repository contract`, () => {
    it('returns deterministic card pages and full-item enrichments', async () => {
      await harness.withRepository(async (repository) => {
        const cards = await repository.listCards({ sort: 'updated_at', order: 'desc', limit: 2 });
        expect(ids(cards)).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.firstVn,
          COLLECTION_LIST_CONTRACT_IDS.secondVn,
        ]);
        expect(cards[0]).not.toHaveProperty('description');
        await expect(repository.listCards({ sort: 'updated_at', order: 'desc', limit: 1, offset: 1 })).resolves.toMatchObject([
          { id: COLLECTION_LIST_CONTRACT_IDS.secondVn },
        ]);

        const full = await repository.list({ vnIds: [COLLECTION_LIST_CONTRACT_IDS.firstVn] });
        expect(full).toMatchObject([{
          id: COLLECTION_LIST_CONTRACT_IDS.firstVn,
          title: 'Alpha Collection Contract',
          status: 'completed',
          series: [{ id: COLLECTION_LIST_CONTRACT_IDS.series, name: 'Contract Series' }],
          physical_location: ['Room A'],
          aspect_keys: ['4:3'],
          egs: { median: 88, playtime_median_minutes: 720, okazu: false, erogame: false },
        }]);
        expect(full[0]?.description).toBe('Alpha description');
      });
    });

    it('applies every exposed categorical and text filter', async () => {
      await harness.withRepository(async (repository) => {
        const only = async (options: Parameters<CollectionListRepository['listCards']>[0], expected: string): Promise<void> => {
          expect(ids(await repository.listCards(options))).toEqual([expected]);
        };
        await only({ status: 'planning' }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ q: 'Alpha' }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ producer: COLLECTION_LIST_CONTRACT_IDS.producer }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ publisher: COLLECTION_LIST_CONTRACT_IDS.publisher }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ tag: COLLECTION_LIST_CONTRACT_IDS.tag }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ place: 'Room A' }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ edition: 'physical' }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ series: COLLECTION_LIST_CONTRACT_IDS.series }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ yearMin: 2021 }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ yearMax: 2019 }, COLLECTION_LIST_CONTRACT_IDS.thirdVn);
        await only({ dumped: true }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ onlyEgsOnly: true }, COLLECTION_LIST_CONTRACT_IDS.thirdVn);
        await only({ matchVndb: false }, COLLECTION_LIST_CONTRACT_IDS.thirdVn);
        await only({ matchEgs: true }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ fanDisc: true }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ hasNotes: true }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ hasCustomCover: true }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ hasBanner: true }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ isFavorite: true }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ hasReleased: false }, COLLECTION_LIST_CONTRACT_IDS.thirdVn);
        await only({ isNukige: true }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ inReadingQueue: true }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ inList: true }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ aspect: '4:3' }, COLLECTION_LIST_CONTRACT_IDS.firstVn);
        await only({ aspects: ['16:9'] }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
        await only({ aspect: 'unknown' }, COLLECTION_LIST_CONTRACT_IDS.thirdVn);
        await expect(repository.listCards({ vnIds: [] })).resolves.toEqual([]);
        await only({ vnIds: [COLLECTION_LIST_CONTRACT_IDS.secondVn] }, COLLECTION_LIST_CONTRACT_IDS.secondVn);
      });
    });

    it('applies numeric, adult-content, and all sort modes without widening matches', async () => {
      await harness.withRepository(async (repository) => {
        expect(ids(await repository.listCards({ ratingMin: 80 }))).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.firstVn,
        ]);
        expect(ids(await repository.listCards({ ratingMax: 50 }))).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.thirdVn,
        ]);
        expect(ids(await repository.listCards({ playtimeMinHours: 10 }))).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.firstVn,
        ]);
        expect(ids(await repository.listCards({ playtimeMaxHours: 2 }))).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.thirdVn,
        ]);
        expect(ids(await repository.listCards({ isNsfw: true, nsfwThreshold: 1 }))).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.secondVn,
        ]);
        expect(ids(await repository.listCards({ excludeNsfw: true, nsfwThreshold: 1 }))).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.firstVn,
          COLLECTION_LIST_CONTRACT_IDS.thirdVn,
        ]);
        for (const sort of [
          'updated_at', 'added_at', 'title', 'rating', 'user_rating', 'playtime',
          'length_minutes', 'egs_playtime', 'combined_playtime', 'released',
          'producer', 'publisher', 'egs_rating', 'combined_rating', 'custom',
        ] as const) {
          expect(await repository.listCards({ sort, order: 'asc' })).toHaveLength(3);
          expect(await repository.listCards({ sort, order: 'desc' })).toHaveLength(3);
        }
      });
    });

    it('returns list, queue, tag, stats, and EGS side data', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.listMembershipCounts()).resolves.toEqual(new Map([
          [COLLECTION_LIST_CONTRACT_IDS.firstVn, 1],
        ]));
        await expect(repository.readingQueueIds()).resolves.toEqual(new Set([
          COLLECTION_LIST_CONTRACT_IDS.secondVn,
        ]));
        await expect(repository.listTags()).resolves.toMatchObject([
          { id: COLLECTION_LIST_CONTRACT_IDS.tag, name: 'Drama', count: 1 },
          { id: COLLECTION_LIST_CONTRACT_IDS.adultTag, name: 'nukige', count: 1 },
        ]);
        await expect(repository.stats()).resolves.toEqual({
          total: 3,
          byStatus: [
            { status: 'completed', n: 1 },
            { status: 'planning', n: 1 },
            { status: 'playing', n: 1 },
          ],
          playtime_minutes: 780,
        });
        await expect(repository.egsSummaries([])).resolves.toEqual(new Map());
        await expect(repository.egsSummaries([
          COLLECTION_LIST_CONTRACT_IDS.firstVn,
          COLLECTION_LIST_CONTRACT_IDS.secondVn,
        ])).resolves.toEqual(new Map([[COLLECTION_LIST_CONTRACT_IDS.firstVn, {
          egs_id: 991501,
          median: 88,
          average: 86,
          count: 10,
          playtime_median_minutes: 720,
          source: 'manual',
          okazu: false,
          erogame: false,
        }]]));
      });
    });

    it('materializes release metadata aspects before applying the filter', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.listCards({ aspect: '16:10' })).resolves.toEqual([]);
        await repository.prepareAspectData([
          COLLECTION_LIST_CONTRACT_IDS.firstVn,
          COLLECTION_LIST_CONTRACT_IDS.secondVn,
          COLLECTION_LIST_CONTRACT_IDS.thirdVn,
        ]);
        expect(ids(await repository.listCards({ aspect: '16:10' }))).toEqual([
          COLLECTION_LIST_CONTRACT_IDS.thirdVn,
        ]);
      });
    });
  });
}
