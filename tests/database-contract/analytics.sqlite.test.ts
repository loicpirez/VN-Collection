import { afterAll } from 'vitest';
import { db, invalidateAggregateStats } from '@/lib/db';
import { getAnalyticsRepository } from '@/lib/db/repositories/analytics';
import {
  ANALYTICS_CONTRACT_FIXTURE,
  registerAnalyticsRepositoryContract,
} from './analytics.contract';

const IDS = [
  ANALYTICS_CONTRACT_FIXTURE.firstVn,
  ANALYTICS_CONTRACT_FIXTURE.secondVn,
  ANALYTICS_CONTRACT_FIXTURE.thirdVn,
] as const;

function reset(): void {
  const placeholders = IDS.map(() => '?').join(',');
  db.prepare(`DELETE FROM vn_tag_index WHERE vn_id IN (${placeholders})`).run(...IDS);
  db.prepare(`DELETE FROM vn_language_index WHERE vn_id IN (${placeholders})`).run(...IDS);
  db.prepare(`DELETE FROM vn_platform_index WHERE vn_id IN (${placeholders})`).run(...IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (${placeholders})`).run(...IDS);
  db.prepare('DELETE FROM reading_goal WHERE year = ?').run(ANALYTICS_CONTRACT_FIXTURE.year);
  invalidateAggregateStats();
}

function seed(): void {
  reset();
  const fixture = ANALYTICS_CONTRACT_FIXTURE;
  db.prepare(`
    INSERT INTO vn (id, title, released, rating, fetched_at) VALUES
      (?, 'Alpha Analytics', '2020-01-01', 74, 1),
      (?, 'Beta Analytics', '2021-01-01', 64, 1),
      (?, 'Gamma Analytics', NULL, NULL, 1)
  `).run(...IDS);
  db.prepare(`
    INSERT INTO collection (
      vn_id, status, user_rating, playtime_minutes, finished_date, favorite,
      location, edition_type, added_at, updated_at
    ) VALUES
      (?, 'completed', 80, 120, '2098-02-01', 1, 'jp', 'physical', 1, 1),
      (?, 'completed', 60, 60, '2098-02-10', 0, 'fr', 'digital', 1, 1),
      (?, 'planning', NULL, 30, NULL, 1, 'unknown', 'none', 1, 1)
  `).run(...IDS);
  db.prepare(`
    INSERT INTO vn_language_index (vn_id, lang) VALUES
      (?, 'ja'), (?, 'en'), (?, 'ja')
  `).run(fixture.firstVn, fixture.firstVn, fixture.secondVn);
  db.prepare(`
    INSERT INTO vn_platform_index (vn_id, platform) VALUES
      (?, 'win'), (?, 'swi')
  `).run(fixture.firstVn, fixture.secondVn);
  db.prepare(`
    INSERT INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES
      (?, ?, 'Story', 0, 'cont'),
      (?, ?, 'Erotic', 0, 'ero'),
      (?, ?, 'Story', 0, 'cont')
  `).run(fixture.firstVn, fixture.storyTag, fixture.firstVn, fixture.eroTag, fixture.secondVn, fixture.storyTag);
  db.prepare(`
    INSERT INTO egs_game (
      vn_id, egs_id, median, playtime_median_minutes, source, fetched_at
    ) VALUES
      (?, 994501, 81, 100, 'extlink', 1),
      (?, NULL, NULL, NULL, NULL, 1)
  `).run(fixture.firstVn, fixture.secondVn);
  db.prepare('INSERT INTO reading_goal (year, target, updated_at) VALUES (?, 3, 1)')
    .run(fixture.year);
  invalidateAggregateStats();
}

registerAnalyticsRepositoryContract('SQLite', {
  async withRepository(run) {
    seed();
    try {
      await run(getAnalyticsRepository());
    } finally {
      reset();
    }
  },
});

afterAll(reset);
