import type { QueryResultRow } from 'pg';
import type {
  AggregateStats,
  HistBucket,
  ReadingGoal,
  RoiRow,
  YearReview,
  YearTag,
} from '@/lib/db';
import type { Stats } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** Personal headline statistics rendered at the top of the stats page. */
export interface PersonalStats extends Stats {
  favorites: number;
  avg_user_rating: number | null;
}

/** Persistence boundary for collection analytics and annual review data. */
export interface AnalyticsRepository {
  /** Return current personal collection counters. */
  personal(): Promise<PersonalStats>;
  /** Return the detailed collection aggregate dashboard. */
  aggregate(): Promise<AggregateStats>;
  /** Return one annual collection review. */
  yearReview(year: number): Promise<YearReview>;
  /** Return the reading goal configured for one year. */
  readingGoal(year: number): Promise<ReadingGoal | null>;
  /** Count collection entries completed during one calendar year. */
  countFinishedInYear(year: number): Promise<number>;
  /** Persist the bounded reading goal for one calendar year. */
  setReadingGoal(year: number, target: number): Promise<ReadingGoal>;
  /** Compare personal and VNDB rating distributions. */
  ratingHistogram(): Promise<HistBucket[]>;
  /** Rank completed titles by rating per minute. */
  bestRoi(limit?: number): Promise<RoiRow[]>;
  /** Return top completed tags grouped by year. */
  tagsCompletedPerYear(limit?: number): Promise<YearTag[]>;
}

interface PersonalRow extends QueryResultRow {
  total: number;
  playtime_minutes: number;
  favorites: number;
  avg_user_rating: number | null;
}

interface StatusRow extends QueryResultRow {
  status: string;
  n: number;
}

interface RatingRow extends QueryResultRow {
  user_rating: number;
}

interface CountRow extends QueryResultRow {
  count: number;
}

interface EgsAggregateRow extends QueryResultRow {
  matched: number;
  unmatched: number;
  avg_median: number | null;
  sum_playtime: number;
}

interface YearBaseRow extends QueryResultRow {
  completed: number;
  playtime: number;
  avg_user_rating: number | null;
}

interface TagCountRow extends QueryResultRow {
  tag_id: string;
  tag_name: string;
  count: number;
}

interface HistogramRow extends QueryResultRow {
  bucket: number;
  cnt: number;
}

function boundedLimit(limit: number | undefined, fallback: number, maximum = 200): number {
  const integer = Math.floor(limit ?? fallback);
  return Number.isFinite(integer) ? Math.max(1, Math.min(maximum, integer)) : fallback;
}

function emptyHistogram(): HistBucket[] {
  return Array.from({ length: 10 }, (_value, index) => ({
    bucket: (index + 1) * 10,
    mine: 0,
    vndb: 0,
  }));
}

/** Create the PostgreSQL-backed analytics repository. */
export function createPostgresAnalyticsRepository(): AnalyticsRepository {
  return {
    async personal() {
      const [summary, statuses] = await Promise.all([
        postgresQuery<PersonalRow>(`
          SELECT COUNT(*)::int AS total,
            COALESCE(SUM(playtime_minutes), 0)::bigint AS playtime_minutes,
            COUNT(*) FILTER (WHERE favorite = 1)::int AS favorites,
            AVG(user_rating)::double precision AS avg_user_rating
          FROM collection
        `),
        postgresQuery<StatusRow>(`
          SELECT status, COUNT(*)::int AS n
          FROM collection GROUP BY status ORDER BY status COLLATE "C"
        `),
      ]);
      const row = summary.rows[0] ?? {
        total: 0,
        playtime_minutes: 0,
        favorites: 0,
        avg_user_rating: null,
      };
      return { ...row, byStatus: statuses.rows };
    },
    async aggregate() {
      const [
        ratings,
        finishedByMonth,
        byLanguage,
        byPlatform,
        byLocation,
        byEdition,
        topTags,
        byYear,
        egs,
      ] = await Promise.all([
        postgresQuery<RatingRow>('SELECT user_rating FROM collection WHERE user_rating IS NOT NULL'),
        postgresQuery<{ month: string; count: number; minutes: number } & QueryResultRow>(`
          SELECT SUBSTRING(finished_date FROM 1 FOR 7) AS month,
            COUNT(*)::int AS count,
            COALESCE(SUM(playtime_minutes), 0)::bigint AS minutes
          FROM collection
          WHERE finished_date IS NOT NULL AND LENGTH(finished_date) >= 7
          GROUP BY month ORDER BY month
        `),
        postgresQuery<{ lang: string; count: number } & QueryResultRow>(`
          SELECT languages.lang, COUNT(DISTINCT languages.vn_id)::int AS count
          FROM collection coll
          JOIN vn_language_index languages ON languages.vn_id = coll.vn_id
          GROUP BY languages.lang
          ORDER BY count DESC, languages.lang COLLATE "C"
          LIMIT 12
        `),
        postgresQuery<{ platform: string; count: number } & QueryResultRow>(`
          SELECT platforms.platform, COUNT(DISTINCT platforms.vn_id)::int AS count
          FROM collection coll
          JOIN vn_platform_index platforms ON platforms.vn_id = coll.vn_id
          GROUP BY platforms.platform
          ORDER BY count DESC, platforms.platform COLLATE "C"
          LIMIT 12
        `),
        postgresQuery<{ location: string; count: number } & QueryResultRow>(`
          SELECT location, COUNT(*)::int AS count FROM collection
          GROUP BY location ORDER BY count DESC, location COLLATE "C"
        `),
        postgresQuery<{ edition: string; count: number } & QueryResultRow>(`
          SELECT edition_type AS edition, COUNT(*)::int AS count FROM collection
          GROUP BY edition_type ORDER BY count DESC, edition_type COLLATE "C"
        `),
        postgresQuery<TagCountRow>(`
          SELECT tags.tag_id,
            COALESCE(MAX(tags.tag_name), tags.tag_id) AS tag_name,
            COUNT(*)::int AS count
          FROM collection coll
          JOIN vn_tag_index tags ON tags.vn_id = coll.vn_id
          WHERE tags.spoiler = 0
          GROUP BY tags.tag_id
          ORDER BY count DESC, COALESCE(MAX(tags.tag_name), tags.tag_id) COLLATE "C", tags.tag_id
          LIMIT 12
        `),
        postgresQuery<{ year: string; count: number } & QueryResultRow>(`
          SELECT SUBSTRING(vn.released FROM 1 FOR 4) AS year, COUNT(*)::int AS count
          FROM collection coll JOIN vn ON vn.id = coll.vn_id
          WHERE vn.released IS NOT NULL AND LENGTH(vn.released) >= 4
          GROUP BY year ORDER BY year
        `),
        postgresQuery<EgsAggregateRow>(`
          SELECT
            COUNT(*) FILTER (WHERE egs.egs_id IS NOT NULL)::int AS matched,
            COUNT(*) FILTER (WHERE egs.vn_id IS NULL OR egs.egs_id IS NULL)::int AS unmatched,
            AVG(egs.median) FILTER (WHERE egs.median IS NOT NULL) AS avg_median,
            COALESCE(SUM(egs.playtime_median_minutes)
              FILTER (WHERE egs.playtime_median_minutes IS NOT NULL), 0)::bigint AS sum_playtime
          FROM collection coll LEFT JOIN egs_game egs ON egs.vn_id = coll.vn_id
        `),
      ]);
      const ratingDistribution = Array.from({ length: 10 }, (_value, index) => ({
        bucket: index + 1,
        count: 0,
      }));
      for (const row of ratings.rows) {
        const index = Math.min(9, Math.max(0, Math.floor(row.user_rating / 10) - 1));
        ratingDistribution[index]!.count += 1;
      }
      const egsRow = egs.rows[0] ?? {
        matched: 0,
        unmatched: 0,
        avg_median: null,
        sum_playtime: 0,
      };
      return {
        ratingDistribution,
        finishedByMonth: finishedByMonth.rows,
        byLanguage: byLanguage.rows,
        byPlatform: byPlatform.rows,
        byLocation: byLocation.rows,
        byEdition: byEdition.rows,
        topTags: topTags.rows.map((tag) => ({ id: tag.tag_id, name: tag.tag_name, count: tag.count })),
        byYear: byYear.rows,
        egs: {
          matched: egsRow.matched,
          unmatched: egsRow.unmatched,
          avg_median: egsRow.avg_median == null ? null : Math.round(egsRow.avg_median * 10) / 10,
          sum_playtime_minutes: egsRow.sum_playtime,
        },
      };
    },
    async yearReview(year) {
      const yearText = String(year);
      const [base, tags, best] = await Promise.all([
        postgresQuery<YearBaseRow>(`
          SELECT COUNT(*)::int AS completed,
            COALESCE(SUM(playtime_minutes), 0)::bigint AS playtime,
            (AVG(user_rating) FILTER (WHERE user_rating IS NOT NULL))::double precision AS avg_user_rating
          FROM collection
          WHERE SUBSTRING(finished_date FROM 1 FOR 4) = $1
        `, [yearText]),
        postgresQuery<TagCountRow>(`
          SELECT tags.tag_id,
            COALESCE(MAX(tags.tag_name), tags.tag_id) AS tag_name,
            COUNT(*)::int AS count
          FROM collection coll
          JOIN vn_tag_index tags ON tags.vn_id = coll.vn_id
          WHERE SUBSTRING(coll.finished_date FROM 1 FOR 4) = $1
            AND tags.spoiler = 0
            AND COALESCE(tags.category, 'cont') <> 'ero'
          GROUP BY tags.tag_id
          ORDER BY count DESC, COALESCE(MAX(tags.tag_name), tags.tag_id) COLLATE "C", tags.tag_id
          LIMIT 8
        `, [yearText]),
        postgresQuery<{ id: string; title: string; rating: number } & QueryResultRow>(`
          SELECT vn.id, vn.title, coll.user_rating AS rating
          FROM collection coll JOIN vn ON vn.id = coll.vn_id
          WHERE SUBSTRING(coll.finished_date FROM 1 FOR 4) = $1
            AND coll.user_rating IS NOT NULL
          ORDER BY coll.user_rating DESC, coll.finished_date DESC, vn.id
          LIMIT 5
        `, [yearText]),
      ]);
      const row = base.rows[0] ?? { completed: 0, playtime: 0, avg_user_rating: null };
      const topTags = tags.rows.map((tag) => ({ id: tag.tag_id, name: tag.tag_name, count: tag.count }));
      return {
        year,
        completed: row.completed,
        hours: Math.round(row.playtime / 60),
        topTags,
        topGenres: topTags.slice(0, 5).map((tag) => ({ name: tag.name, count: tag.count })),
        avgUserRating: row.avg_user_rating,
        best: best.rows,
      };
    },
    async readingGoal(year) {
      const result = await postgresQuery<ReadingGoal & QueryResultRow>(
        'SELECT year, target, updated_at FROM reading_goal WHERE year = $1',
        [year],
      );
      return result.rows[0] ?? null;
    },
    async countFinishedInYear(year) {
      const result = await postgresQuery<CountRow>(`
        SELECT COUNT(*)::int AS count
        FROM collection
        WHERE SUBSTRING(finished_date FROM 1 FOR 4) = $1
      `, [String(year)]);
      return result.rows[0]?.count ?? 0;
    },
    async setReadingGoal(year, target) {
      const safeTarget = Math.max(0, Math.min(1000, Math.floor(target)));
      const result = await postgresQuery<ReadingGoal & QueryResultRow>(`
        INSERT INTO reading_goal (year, target, updated_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (year) DO UPDATE
        SET target = EXCLUDED.target, updated_at = EXCLUDED.updated_at
        RETURNING year, target, updated_at
      `, [year, safeTarget, Date.now()]);
      return result.rows[0]!;
    },
    async ratingHistogram() {
      const [mine, vndb] = await Promise.all([
        postgresQuery<HistogramRow>(`
          SELECT GREATEST(10, LEAST(100, ROUND(user_rating / 10.0)::int * 10)) AS bucket,
            COUNT(*)::int AS cnt
          FROM collection WHERE user_rating IS NOT NULL
          GROUP BY 1 ORDER BY 1
        `),
        postgresQuery<HistogramRow>(`
          SELECT GREATEST(10, LEAST(100, ROUND(vn.rating / 10.0)::int * 10)) AS bucket,
            COUNT(*)::int AS cnt
          FROM collection coll JOIN vn ON vn.id = coll.vn_id
          WHERE coll.user_rating IS NOT NULL AND vn.rating IS NOT NULL
          GROUP BY 1 ORDER BY 1
        `),
      ]);
      const buckets = emptyHistogram();
      for (const row of mine.rows) buckets[(row.bucket / 10) - 1]!.mine = row.cnt;
      for (const row of vndb.rows) buckets[(row.bucket / 10) - 1]!.vndb = row.cnt;
      return buckets;
    },
    async bestRoi(limit) {
      const result = await postgresQuery<RoiRow & QueryResultRow>(`
        SELECT vn.id, vn.title, coll.user_rating, coll.playtime_minutes,
          (coll.user_rating * 1.0 / NULLIF(coll.playtime_minutes, 0))::double precision AS roi
        FROM collection coll JOIN vn ON vn.id = coll.vn_id
        WHERE coll.status = 'completed'
          AND coll.user_rating IS NOT NULL
          AND coll.playtime_minutes > 0
        ORDER BY roi DESC, vn.id
        LIMIT $1
      `, [boundedLimit(limit, 20)]);
      return result.rows;
    },
    async tagsCompletedPerYear(limit) {
      const result = await postgresQuery<YearTag & QueryResultRow>(`
        WITH tagged AS (
          SELECT SUBSTRING(coll.finished_date FROM 1 FOR 4)::int AS year,
            tags.tag_id,
            COALESCE(tags.tag_name, tags.tag_id) AS tag_name
          FROM collection coll
          JOIN vn_tag_index tags ON tags.vn_id = coll.vn_id
          WHERE coll.finished_date IS NOT NULL
            AND tags.spoiler = 0
            AND COALESCE(tags.category, 'cont') <> 'ero'
        ), counts AS (
          SELECT year, tag_id, MAX(tag_name) AS tag_name, COUNT(*)::int AS count
          FROM tagged GROUP BY year, tag_id
        ), top_overall AS (
          SELECT tag_id FROM tagged GROUP BY tag_id
          ORDER BY COUNT(*) DESC, tag_id COLLATE "C" LIMIT $1
        )
        SELECT counts.year, counts.tag_name AS tag, counts.count
        FROM counts WHERE counts.tag_id IN (SELECT tag_id FROM top_overall)
        ORDER BY counts.year, counts.count DESC, counts.tag_id COLLATE "C"
      `, [boundedLimit(limit, 6, 50)]);
      return result.rows;
    },
  };
}

const sqliteRepository: AnalyticsRepository = {
  async personal() {
    const legacy = await import('@/lib/db');
    const stats = legacy.getStats();
    const favorites = (legacy.db.prepare(
      'SELECT COUNT(*) AS count FROM collection WHERE favorite = 1',
    ).get() as { count: number }).count;
    const average = legacy.db.prepare(
      'SELECT AVG(user_rating) AS value FROM collection WHERE user_rating IS NOT NULL',
    ).get() as { value: number | null };
    return { ...stats, favorites, avg_user_rating: average.value };
  },
  async aggregate() {
    return (await import('@/lib/db')).getAggregateStats();
  },
  async yearReview(year) {
    return (await import('@/lib/db')).yearReview(year);
  },
  async readingGoal(year) {
    return (await import('@/lib/db')).getReadingGoal(year);
  },
  async countFinishedInYear(year) {
    return (await import('@/lib/db')).countFinishedInYear(year);
  },
  async setReadingGoal(year, target) {
    return (await import('@/lib/db')).setReadingGoal(year, target);
  },
  async ratingHistogram() {
    return (await import('@/lib/db')).ratingHistogram();
  },
  async bestRoi(limit) {
    return (await import('@/lib/db')).bestRoi(boundedLimit(limit, 20));
  },
  async tagsCompletedPerYear(limit) {
    return (await import('@/lib/db')).tagsCompletedPerYear(boundedLimit(limit, 6, 50));
  },
};

let postgresRepository: AnalyticsRepository | null = null;

/** Return the analytics repository selected by the configured backend. */
export function getAnalyticsRepository(): AnalyticsRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresAnalyticsRepository();
  return postgresRepository;
}
