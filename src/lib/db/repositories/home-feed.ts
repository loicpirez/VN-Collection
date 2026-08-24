import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** One reading-queue VN with the fields needed by the home strip. */
export interface ReadingQueueVn {
  vn_id: string;
  position: number;
  title: string;
  image_thumb: string | null;
  image_url: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
  length_minutes: number | null;
  egs_minutes: number | null;
}

/** One completed-title sample used to estimate the operator's reading speed. */
export interface ReadingSpeedSample {
  playtime: number;
  vndb: number | null;
  egs: number | null;
}

/** One collection title released on today's month and day. */
export interface AnniversaryEntry {
  id: string;
  title: string;
  released: string;
  image_thumb: string | null;
  image_url: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
  years: number;
}

/** Asynchronous persistence contract for home-page server feeds. */
export interface HomeFeedRepository {
  /** Return queued VNs in operator-defined order. */
  listReadingQueueVns(): Promise<ReadingQueueVn[]>;
  /** Return completed-title samples used by reading-speed estimation. */
  listReadingSpeedSamples(): Promise<ReadingSpeedSample[]>;
  /** Return collection anniversaries matching the supplied local date. */
  listAnniversaries(today?: Date): Promise<AnniversaryEntry[]>;
}

interface AnniversaryRow extends QueryResultRow {
  id: string;
  title: string;
  released: string;
  image_thumb: string | null;
  image_url: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
}

function anniversaryDate(today: Date): { monthDay: string; year: number } {
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return { monthDay: `${month}-${day}`, year: today.getFullYear() };
}

function withElapsedYears(rows: AnniversaryRow[], year: number): AnniversaryEntry[] {
  return rows
    .map((row) => {
      const releasedYear = Number(row.released.slice(0, 4));
      return {
        ...row,
        years: Number.isFinite(releasedYear) ? year - releasedYear : 0,
      };
    })
    .filter((row) => row.years > 0);
}

/** Create the PostgreSQL-backed home-feed repository. */
export function createPostgresHomeFeedRepository(): HomeFeedRepository {
  return {
    async listReadingQueueVns() {
      const result = await postgresQuery<ReadingQueueVn & QueryResultRow>(`
        SELECT q.vn_id, q.position, v.title, v.image_thumb, v.image_url,
          v.local_image_thumb, v.image_sexual, v.length_minutes,
          e.playtime_median_minutes AS egs_minutes
        FROM reading_queue q
        JOIN vn v ON v.id = q.vn_id
        LEFT JOIN egs_game e ON e.vn_id = v.id
        ORDER BY q.position ASC, q.added_at ASC
        LIMIT 1000
      `);
      return result.rows;
    },
    async listReadingSpeedSamples() {
      const result = await postgresQuery<ReadingSpeedSample & QueryResultRow>(`
        SELECT c.playtime_minutes AS playtime, v.length_minutes AS vndb,
          e.playtime_median_minutes AS egs
        FROM collection c
        JOIN vn v ON v.id = c.vn_id
        LEFT JOIN egs_game e ON e.vn_id = c.vn_id
        WHERE c.status = 'completed'
          AND c.playtime_minutes > 0
          AND (v.length_minutes IS NOT NULL OR e.playtime_median_minutes IS NOT NULL)
      `);
      return result.rows;
    },
    async listAnniversaries(today = new Date()) {
      const { monthDay, year } = anniversaryDate(today);
      const result = await postgresQuery<AnniversaryRow>(`
        SELECT v.id, v.title, v.released, v.image_thumb, v.image_url,
          v.image_sexual, v.local_image_thumb
        FROM collection c JOIN vn v ON v.id = c.vn_id
        WHERE SUBSTRING(v.released FROM 6 FOR 5) = $1
        ORDER BY v.released DESC
        LIMIT 500
      `, [monthDay]);
      return withElapsedYears(result.rows, year);
    },
  };
}

const sqliteRepository: HomeFeedRepository = {
  async listReadingQueueVns() {
    const { db } = await import('@/lib/db');
    return db.prepare(`
      SELECT q.vn_id, q.position, v.title, v.image_thumb, v.image_url,
        v.local_image_thumb, v.image_sexual, v.length_minutes,
        e.playtime_median_minutes AS egs_minutes
      FROM reading_queue q
      JOIN vn v ON v.id = q.vn_id
      LEFT JOIN egs_game e ON e.vn_id = v.id
      ORDER BY q.position ASC, q.added_at ASC
      LIMIT 1000
    `).all() as ReadingQueueVn[];
  },
  async listReadingSpeedSamples() {
    const { db } = await import('@/lib/db');
    return db.prepare(`
      SELECT c.playtime_minutes AS playtime, v.length_minutes AS vndb,
        e.playtime_median_minutes AS egs
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      LEFT JOIN egs_game e ON e.vn_id = c.vn_id
      WHERE c.status = 'completed'
        AND c.playtime_minutes > 0
        AND (v.length_minutes IS NOT NULL OR e.playtime_median_minutes IS NOT NULL)
    `).all() as ReadingSpeedSample[];
  },
  async listAnniversaries(today = new Date()) {
    const { monthDay, year } = anniversaryDate(today);
    const { db } = await import('@/lib/db');
    const rows = db.prepare(`
      SELECT v.id, v.title, v.released, v.image_thumb, v.image_url,
        v.image_sexual, v.local_image_thumb
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE SUBSTR(v.released, 6, 5) = ?
      ORDER BY v.released DESC
      LIMIT 500
    `).all(monthDay) as AnniversaryRow[];
    return withElapsedYears(rows, year);
  },
};

let postgresRepository: HomeFeedRepository | null = null;

/** Return the home-feed repository selected by the configured backend. */
export function getHomeFeedRepository(): HomeFeedRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresHomeFeedRepository();
  return postgresRepository;
}
