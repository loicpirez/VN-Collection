import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** One collection VN with a resolved ErogameScape record. */
export interface EgsOverviewLink {
  vn_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  egs_id: number;
  median: number | null;
  playtime_minutes: number | null;
  source: string | null;
}

/** One collection VN that still needs an ErogameScape mapping. */
export interface EgsOverviewUnlinked {
  vn_id: string;
  vn_title: string;
  vn_alttitle: string | null;
  vn_image_thumb: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
}

/** Data required to render the ErogameScape integration overview. */
export interface EgsOverviewData {
  links: EgsOverviewLink[];
  unlinkedRows: EgsOverviewUnlinked[];
  unmatched: number;
}

/** Persistence boundary for the ErogameScape integration overview. */
export interface EgsOverviewRepository {
  /** Load linked and unmapped collection rows in one operation. */
  load(): Promise<EgsOverviewData>;
}

interface CountRow extends QueryResultRow {
  count: number;
}

/** Create the PostgreSQL-backed ErogameScape overview repository. */
export function createPostgresEgsOverviewRepository(): EgsOverviewRepository {
  return {
    async load() {
      const [links, unmatched, unlinked] = await Promise.all([
        postgresQuery<EgsOverviewLink & QueryResultRow>(`
          SELECT
            vn.id AS vn_id,
            vn.title AS vn_title,
            vn.image_thumb AS vn_image_thumb,
            vn.local_image_thumb AS vn_local_image_thumb,
            vn.image_sexual AS vn_image_sexual,
            egs.egs_id,
            egs.median,
            egs.playtime_median_minutes AS playtime_minutes,
            egs.source
          FROM egs_game egs
          JOIN vn ON vn.id = egs.vn_id
          JOIN collection coll ON coll.vn_id = egs.vn_id
          WHERE egs.egs_id IS NOT NULL
          ORDER BY app_search_normalize(vn.title) COLLATE "C", vn.id
        `),
        postgresQuery<CountRow>(`
          SELECT COUNT(*)::int AS count FROM collection coll
          WHERE NOT EXISTS (
            SELECT 1 FROM egs_game egs
            WHERE egs.vn_id = coll.vn_id AND egs.source IS NOT NULL
          )
        `),
        postgresQuery<EgsOverviewUnlinked & QueryResultRow>(`
          SELECT
            vn.id AS vn_id,
            vn.title AS vn_title,
            vn.alttitle AS vn_alttitle,
            vn.image_thumb AS vn_image_thumb,
            vn.local_image_thumb AS vn_local_image_thumb,
            vn.image_sexual AS vn_image_sexual
          FROM collection coll
          JOIN vn ON vn.id = coll.vn_id
          WHERE NOT EXISTS (
            SELECT 1 FROM egs_game egs
            WHERE egs.vn_id = coll.vn_id AND egs.source IS NOT NULL
          )
          ORDER BY app_search_normalize(vn.title) COLLATE "C", vn.id
          LIMIT 50
        `),
      ]);
      return {
        links: links.rows,
        unlinkedRows: unlinked.rows,
        unmatched: unmatched.rows[0]?.count ?? 0,
      };
    },
  };
}

const sqliteRepository: EgsOverviewRepository = {
  async load() {
    const { db } = await import('@/lib/db');
    const links = db.prepare(`
      SELECT
        v.id AS vn_id,
        v.title AS vn_title,
        v.image_thumb AS vn_image_thumb,
        v.local_image_thumb AS vn_local_image_thumb,
        v.image_sexual AS vn_image_sexual,
        e.egs_id,
        e.median,
        e.playtime_median_minutes AS playtime_minutes,
        e.source
      FROM egs_game e
      JOIN vn v ON v.id = e.vn_id
      JOIN collection c ON c.vn_id = e.vn_id
      WHERE e.egs_id IS NOT NULL
      ORDER BY v.title COLLATE NOCASE ASC
    `).all() as EgsOverviewLink[];
    const unmatched = db.prepare(`
      SELECT COUNT(*) AS count FROM collection c
      WHERE NOT EXISTS (
        SELECT 1 FROM egs_game e WHERE e.vn_id = c.vn_id AND e.source IS NOT NULL
      )
    `).get() as { count: number };
    const unlinkedRows = db.prepare(`
      SELECT
        v.id AS vn_id,
        v.title AS vn_title,
        v.alttitle AS vn_alttitle,
        v.image_thumb AS vn_image_thumb,
        v.local_image_thumb AS vn_local_image_thumb,
        v.image_sexual AS vn_image_sexual
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      WHERE NOT EXISTS (
        SELECT 1 FROM egs_game e WHERE e.vn_id = c.vn_id AND e.source IS NOT NULL
      )
      ORDER BY v.title COLLATE NOCASE ASC
      LIMIT 50
    `).all() as EgsOverviewUnlinked[];
    return { links, unlinkedRows, unmatched: unmatched.count };
  },
};

let postgresRepository: EgsOverviewRepository | null = null;

/** Return the ErogameScape overview repository selected by the configured backend. */
export function getEgsOverviewRepository(): EgsOverviewRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresEgsOverviewRepository();
  return postgresRepository;
}
