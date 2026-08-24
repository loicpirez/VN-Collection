import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postgresQuery: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: mocks.postgresQuery,
}));

import { createPostgresAnalyticsRepository } from '@/lib/db/repositories/analytics';

describe('PostgreSQL analytics edge branches', () => {
  beforeEach(() => {
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
  });

  it('returns stable empty summaries when aggregate queries return no rows', async () => {
    const repository = createPostgresAnalyticsRepository();

    await expect(repository.personal()).resolves.toEqual({
      total: 0,
      playtime_minutes: 0,
      favorites: 0,
      avg_user_rating: null,
      byStatus: [],
    });
    await expect(repository.aggregate()).resolves.toMatchObject({
      egs: {
        matched: 0,
        unmatched: 0,
        avg_median: null,
        sum_playtime_minutes: 0,
      },
    });
    await expect(repository.yearReview(2025)).resolves.toMatchObject({
      year: 2025,
      completed: 0,
      hours: 0,
      avgUserRating: null,
    });
    await expect(repository.readingGoal(2025)).resolves.toBeNull();
    await expect(repository.countFinishedInYear(2025)).resolves.toBe(0);
  });

  it('rounds a populated EGS median and normalizes default or invalid limits', async () => {
    const repository = createPostgresAnalyticsRepository();
    mocks.postgresQuery.mockImplementation(async (sql: string) => ({
      rows: sql.includes('AS matched')
        ? [{ matched: 2, unmatched: 3, avg_median: 78.26, sum_playtime: 900 }]
        : [],
      rowCount: 0,
    }));

    await expect(repository.aggregate()).resolves.toMatchObject({
      egs: {
        matched: 2,
        unmatched: 3,
        avg_median: 78.3,
        sum_playtime_minutes: 900,
      },
    });
    await expect(repository.bestRoi()).resolves.toEqual([]);
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]).toEqual([20]);
    await expect(repository.bestRoi(Number.NaN)).resolves.toEqual([]);
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]).toEqual([20]);
    await expect(repository.tagsCompletedPerYear()).resolves.toEqual([]);
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]).toEqual([6]);
  });
});
