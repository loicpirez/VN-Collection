import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addToCollection,
  getAggregateStats,
  getCoOccurringTags,
  invalidateAggregateStats,
  listCollection,
  listCollectionTags,
  tagsCompletedPerYear,
  upsertVn,
  yearReview,
} from '@/lib/db';

listCollection({});
const db = new Database(process.env.DB_PATH!);
const SOURCE = readFileSync(join(__dirname, '..', 'src/lib/db.ts'), 'utf8');

function resetRows(): void {
  db.exec(`
    DELETE FROM owned_release;
    DELETE FROM collection;
    DELETE FROM vn_publisher_index;
    DELETE FROM vn_developer_index;
    DELETE FROM vn_tag_index;
    DELETE FROM vn;
  `);
  invalidateAggregateStats();
}

function seedTaggedVn(
  id: string,
  tags: Array<{ id: string; name: string; spoiler?: number; category?: 'cont' | 'ero' | 'tech' | null }>,
): void {
  upsertVn({
    id,
    title: `fixture ${id}`,
    tags: tags.map((tag) => ({
      id: tag.id,
      name: tag.name,
      rating: 3,
      spoiler: tag.spoiler ?? 0,
      category: tag.category ?? 'cont',
    })),
  });
}

beforeAll(resetRows);
beforeEach(resetRows);

afterAll(() => {
  db.close();
});

describe('PERF-004 — tag aggregates use vn_tag_index', () => {
  it('removes json_each(v.tags) from every collection tag aggregate path', () => {
    const bodies = [
      SOURCE.split('function computeAggregateStats')[1]?.split('\nexport function isValidStatus')[0] ?? '',
      SOURCE.split('export function listCollectionTags')[1]?.split('\n/**\n * Local character search')[0] ?? '',
      SOURCE.split('export function getCoOccurringTags')[1]?.split('\n// Routes per VN')[0] ?? '',
      SOURCE.split('export function yearReview')[1]?.split('\n// Tag completions per year')[0] ?? '',
      SOURCE.split('export function tagsCompletedPerYear')[1]?.split('\nexport interface RatingRoiRow')[0] ?? '',
    ];
    for (const body of bodies) {
      expect(body).toContain('vn_tag_index');
      expect(body).not.toMatch(/json_each\([^)]*tags/);
    }
  });

  it('serves aggregate stats and tag browser counts from indexed tag names', () => {
    seedTaggedVn('v9400', [
      { id: 'g9400', name: 'tone A' },
      { id: 'g9401', name: 'tone B', category: 'ero' },
    ]);
    seedTaggedVn('v9401', [
      { id: 'g9400', name: 'tone A' },
      { id: 'g9402', name: 'tone C' },
    ]);
    addToCollection('v9400', { status: 'completed', finished_date: '2024-02-03', playtime_minutes: 120 });
    addToCollection('v9401', { status: 'completed', finished_date: '2024-03-04', playtime_minutes: 180 });

    expect(getAggregateStats().topTags.find((tag) => tag.id === 'g9400')).toEqual({
      id: 'g9400',
      name: 'tone A',
      count: 2,
    });
    expect(listCollectionTags().find((tag) => tag.id === 'g9400')).toEqual({
      id: 'g9400',
      name: 'tone A',
      category: 'cont',
      count: 2,
    });
  });

  it('serves co-occurring tags from the derived index', () => {
    seedTaggedVn('v9410', [
      { id: 'g9410', name: 'seed A' },
      { id: 'g9411', name: 'seed B' },
    ]);
    seedTaggedVn('v9411', [
      { id: 'g9410', name: 'seed A' },
      { id: 'g9412', name: 'adjacent A' },
    ]);
    seedTaggedVn('v9412', [
      { id: 'g9419', name: 'unmatched A' },
    ]);
    addToCollection('v9410', { status: 'completed' });
    addToCollection('v9411', { status: 'completed' });
    addToCollection('v9412', { status: 'completed' });

    expect(getCoOccurringTags('v9410', 10)).toEqual([
      { id: 'g9412', name: 'adjacent A', category: 'cont', shared: 1 },
    ]);
  });

  it('serves year-review tag summaries from the derived index', () => {
    seedTaggedVn('v9420', [
      { id: 'g9420', name: 'year A' },
      { id: 'g9421', name: 'year adult', category: 'ero' },
    ]);
    seedTaggedVn('v9421', [
      { id: 'g9420', name: 'year A' },
      { id: 'g9422', name: 'year hidden', spoiler: 1 },
    ]);
    addToCollection('v9420', { status: 'completed', finished_date: '2025-01-02', playtime_minutes: 90, user_rating: 80 });
    addToCollection('v9421', { status: 'completed', finished_date: '2025-02-03', playtime_minutes: 180, user_rating: 70 });

    const review = yearReview(2025);
    expect(review.topTags).toContainEqual({ id: 'g9420', name: 'year A', count: 2 });
    expect(review.topTags.map((tag) => tag.id)).not.toContain('g9421');
    expect(review.topTags.map((tag) => tag.id)).not.toContain('g9422');
    expect(tagsCompletedPerYear(3)).toContainEqual({ year: 2025, tag: 'year A', count: 2 });
  });
});
