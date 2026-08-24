import { describe, expect, it } from 'vitest';
import type { AnalyticsRepository } from '@/lib/db/repositories/analytics';

/** Stable identifiers shared by the analytics parity contract. */
export const ANALYTICS_CONTRACT_FIXTURE = {
  firstVn: 'v994501',
  secondVn: 'v994502',
  thirdVn: 'v994503',
  storyTag: 'g994501',
  eroTag: 'g994502',
  year: 2098,
} as const;

/** Harness that supplies a freshly seeded analytics repository. */
export interface AnalyticsContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (repository: AnalyticsRepository) => Promise<void>): Promise<void>;
}

/** Register dashboard, annual-review, and richer analytics parity tests. */
export function registerAnalyticsRepositoryContract(
  label: string,
  harness: AnalyticsContractHarness,
): void {
  describe(`${label} analytics repository contract`, () => {
    it('returns personal and collection-wide aggregates', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.personal()).resolves.toEqual({
          total: 3,
          playtime_minutes: 210,
          favorites: 2,
          avg_user_rating: 70,
          byStatus: [
            { status: 'completed', n: 2 },
            { status: 'planning', n: 1 },
          ],
        });
        const aggregate = await repository.aggregate();
        expect(aggregate.ratingDistribution.filter((row) => row.count > 0)).toEqual([
          { bucket: 6, count: 1 },
          { bucket: 8, count: 1 },
        ]);
        expect(aggregate.finishedByMonth).toEqual([
          { month: '2098-02', count: 2, minutes: 180 },
        ]);
        expect(aggregate.byLanguage).toEqual([
          { lang: 'ja', count: 2 },
          { lang: 'en', count: 1 },
        ]);
        expect(aggregate.byPlatform).toEqual([
          { platform: 'swi', count: 1 },
          { platform: 'win', count: 1 },
        ]);
        expect(aggregate.topTags).toMatchObject([
          { id: ANALYTICS_CONTRACT_FIXTURE.storyTag, count: 2 },
          { id: ANALYTICS_CONTRACT_FIXTURE.eroTag, count: 1 },
        ]);
        expect(aggregate.byYear).toEqual([
          { year: '2020', count: 1 },
          { year: '2021', count: 1 },
        ]);
        expect(aggregate.egs).toEqual({
          matched: 1,
          unmatched: 2,
          avg_median: 81,
          sum_playtime_minutes: 100,
        });
      });
    });

    it('builds the annual review and reads its goal', async () => {
      await harness.withRepository(async (repository) => {
        await expect(repository.readingGoal(ANALYTICS_CONTRACT_FIXTURE.year)).resolves.toMatchObject({
          year: ANALYTICS_CONTRACT_FIXTURE.year,
          target: 3,
        });
        await expect(repository.yearReview(ANALYTICS_CONTRACT_FIXTURE.year)).resolves.toEqual({
          year: ANALYTICS_CONTRACT_FIXTURE.year,
          completed: 2,
          hours: 3,
          topTags: [{ id: ANALYTICS_CONTRACT_FIXTURE.storyTag, name: 'Story', count: 2 }],
          topGenres: [{ name: 'Story', count: 2 }],
          avgUserRating: 70,
          best: [
            { id: ANALYTICS_CONTRACT_FIXTURE.firstVn, title: 'Alpha Analytics', rating: 80 },
            { id: ANALYTICS_CONTRACT_FIXTURE.secondVn, title: 'Beta Analytics', rating: 60 },
          ],
        });
        await expect(repository.countFinishedInYear(ANALYTICS_CONTRACT_FIXTURE.year)).resolves.toBe(2);
        const updated = await repository.setReadingGoal(ANALYTICS_CONTRACT_FIXTURE.year, 12.9);
        expect(updated).toMatchObject({ year: ANALYTICS_CONTRACT_FIXTURE.year, target: 12 });
        await expect(repository.readingGoal(ANALYTICS_CONTRACT_FIXTURE.year)).resolves.toMatchObject({
          year: ANALYTICS_CONTRACT_FIXTURE.year,
          target: 12,
        });
        await expect(repository.setReadingGoal(ANALYTICS_CONTRACT_FIXTURE.year, 5000)).resolves.toMatchObject({
          target: 1000,
        });
      });
    });

    it('keeps histogram, ROI, and tag-year calculations aligned', async () => {
      await harness.withRepository(async (repository) => {
        const histogram = await repository.ratingHistogram();
        expect(histogram.filter((row) => row.mine > 0 || row.vndb > 0)).toEqual([
          { bucket: 60, mine: 1, vndb: 1 },
          { bucket: 70, mine: 0, vndb: 1 },
          { bucket: 80, mine: 1, vndb: 0 },
        ]);
        await expect(repository.bestRoi(2)).resolves.toMatchObject([
          { id: ANALYTICS_CONTRACT_FIXTURE.secondVn, roi: 1 },
          { id: ANALYTICS_CONTRACT_FIXTURE.firstVn },
        ]);
        await expect(repository.tagsCompletedPerYear(3)).resolves.toEqual([
          { year: ANALYTICS_CONTRACT_FIXTURE.year, tag: 'Story', count: 2 },
        ]);
      });
    });
  });
}
