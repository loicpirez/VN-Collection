import type { PoolClient, QueryResultRow } from 'pg';
import { asJsonRecord } from '@/lib/json-shape';
import { decodeVndbRelease } from '@/lib/vndb-release-shape';
import type { VndbRelease } from '@/lib/vndb-types';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { aspectKeyForResolution, parseResolutionValue } from '@/lib/aspect-ratio';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction, type PostgresParameter } from '../postgres';

/** Asynchronous persistence contract for materialized VNDB release metadata. */
export interface ReleaseMetadataRepository {
  /** Delete every materialized release-metadata row. */
  clear(): Promise<number>;
  /** Materialize cached release payloads for the supplied VN identifiers. */
  materializeForVns(vnIds: readonly string[]): Promise<number>;
  /** Materialize cached release resolutions for one VN. */
  materializeAspectsForVn(vnId: string): Promise<number>;
}

interface CachedReleaseBody extends QueryResultRow {
  body: string;
}

function decodeReleaseBody(body: string): VndbRelease[] {
  try {
    const envelope = asJsonRecord(JSON.parse(body));
    if (!envelope || !Array.isArray(envelope.results)) return [];
    return envelope.results.flatMap((value) => {
      const release = decodeVndbRelease(value);
      return release ? [release] : [];
    });
  } catch {
    return [];
  }
}

function resolutionText(resolution: VndbRelease['resolution']): string | null {
  return Array.isArray(resolution) ? `${resolution[0]}x${resolution[1]}` : resolution;
}

async function upsertReleaseAspect(
  client: PoolClient,
  release: VndbRelease,
  vnId: string,
  fetchedAt: number,
): Promise<void> {
  const parsed = parseResolutionValue(release.resolution);
  const raw = resolutionText(release.resolution);
  await client.query(`
    INSERT INTO release_resolution_cache (
      release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(release_id) DO UPDATE SET
      vn_id = COALESCE(EXCLUDED.vn_id, release_resolution_cache.vn_id),
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      raw_resolution = EXCLUDED.raw_resolution,
      aspect_key = EXCLUDED.aspect_key,
      fetched_at = EXCLUDED.fetched_at
  `, [
    release.id.toLowerCase(),
    vnId,
    parsed?.width ?? null,
    parsed?.height ?? null,
    raw,
    parsed ? aspectKeyForResolution(parsed.width, parsed.height) : 'unknown',
    fetchedAt,
  ]);
}

function releaseValues(release: VndbRelease, vnId: string, fetchedAt: number): PostgresParameter[] {
  return [
    release.id,
    vnId,
    release.title,
    release.alttitle,
    JSON.stringify(release.platforms),
    JSON.stringify(release.languages),
    release.released,
    release.minage,
    release.patch ? 1 : 0,
    release.freeware ? 1 : 0,
    release.uncensored === null ? null : release.uncensored ? 1 : 0,
    release.official ? 1 : 0,
    release.has_ero ? 1 : 0,
    release.voiced,
    release.engine,
    release.notes,
    release.gtin,
    release.catalog,
    resolutionText(release.resolution),
    JSON.stringify(release.media),
    JSON.stringify(release.producers),
    JSON.stringify(release.extlinks),
    fetchedAt,
  ];
}

async function upsertReleaseMetadata(
  client: PoolClient,
  release: VndbRelease,
  vnId: string,
  fetchedAt: number,
): Promise<void> {
  const values = releaseValues(release, vnId, fetchedAt);
  await client.query(`
    INSERT INTO release_meta_cache (
      release_id, vn_id, title, alttitle, platforms, languages, released,
      minage, patch, freeware, uncensored, official, has_ero, voiced,
      engine, notes, gtin, catalog, resolution, media, producers, extlinks,
      fetched_at
    ) VALUES (${values.map((_value, index) => `$${index + 1}`).join(', ')})
    ON CONFLICT(release_id) DO UPDATE SET
      vn_id = EXCLUDED.vn_id,
      title = EXCLUDED.title,
      alttitle = EXCLUDED.alttitle,
      platforms = EXCLUDED.platforms,
      languages = EXCLUDED.languages,
      released = EXCLUDED.released,
      minage = EXCLUDED.minage,
      patch = EXCLUDED.patch,
      freeware = EXCLUDED.freeware,
      uncensored = EXCLUDED.uncensored,
      official = EXCLUDED.official,
      has_ero = EXCLUDED.has_ero,
      voiced = EXCLUDED.voiced,
      engine = EXCLUDED.engine,
      notes = EXCLUDED.notes,
      gtin = EXCLUDED.gtin,
      catalog = EXCLUDED.catalog,
      resolution = EXCLUDED.resolution,
      media = EXCLUDED.media,
      producers = EXCLUDED.producers,
      extlinks = EXCLUDED.extlinks,
      fetched_at = EXCLUDED.fetched_at
  `, values);
}

/** Create the PostgreSQL-backed release-metadata repository. */
export function createPostgresReleaseMetadataRepository(): ReleaseMetadataRepository {
  return {
    async clear() {
      const result = await postgresQuery('DELETE FROM release_meta_cache');
      return result.rowCount ?? 0;
    },
    async materializeForVns(vnIds) {
      const normalized = [...new Set(vnIds.filter(isVndbVnId).map((vnId) => vnId.toLowerCase()))];
      if (normalized.length === 0) return 0;
      const owned = new Set(normalized);
      return withPostgresTransaction(async (client) => {
        const rows = await client.query<CachedReleaseBody>(`
          SELECT body FROM vndb_cache WHERE cache_key LIKE 'POST /release|%'
        `);
        const fetchedAt = Date.now();
        let count = 0;
        for (const row of rows.rows) {
          for (const release of decodeReleaseBody(row.body)) {
            for (const vn of release.vns) {
              if (!owned.has(vn.id)) continue;
              await upsertReleaseMetadata(client, release, vn.id, fetchedAt);
              count += 1;
            }
          }
        }
        await client.query(`
          UPDATE owned_release
          SET owned_platform = release_platform.platform
          FROM (
            SELECT release_id, MIN(platform) AS platform
            FROM release_platform_index
            GROUP BY release_id
            HAVING COUNT(*) = 1
          ) release_platform
          WHERE owned_release.release_id = release_platform.release_id
            AND owned_release.vn_id = ANY($1::text[])
            AND owned_release.owned_platform IS NULL
        `, [normalized]);
        return count;
      });
    },
    async materializeAspectsForVn(vnId) {
      if (!isVndbVnId(vnId)) return 0;
      return withPostgresTransaction(async (client) => {
        const existing = await client.query(`
          SELECT 1 FROM release_resolution_cache
          WHERE vn_id = $1 AND aspect_key <> 'unknown' LIMIT 1
        `, [vnId]);
        if (existing.rows[0]) return 0;
        const rows = await client.query<CachedReleaseBody>(`
          SELECT body FROM vndb_cache WHERE cache_key LIKE 'POST /release|%'
        `);
        const fetchedAt = Date.now();
        let count = 0;
        for (const row of rows.rows) {
          for (const release of decodeReleaseBody(row.body)) {
            if (!release.vns.some((vn) => vn.id === vnId)) continue;
            await upsertReleaseAspect(client, release, vnId, fetchedAt);
            count += 1;
          }
        }
        return count;
      });
    },
  };
}

const sqliteRepository: ReleaseMetadataRepository = {
  async clear() {
    return (await import('@/lib/db')).db.prepare('DELETE FROM release_meta_cache').run().changes;
  },
  async materializeForVns(vnIds) {
    return (await import('@/lib/db')).materializeReleaseMetaForCollectionVns([...vnIds]);
  },
  async materializeAspectsForVn(vnId) {
    const legacy = await import('@/lib/db');
    const before = legacy.db.prepare(
      'SELECT COUNT(*) AS count FROM release_resolution_cache WHERE vn_id = ?',
    ).get(vnId) as { count: number };
    legacy.materializeReleaseAspectsForVn(vnId);
    const after = legacy.db.prepare(
      'SELECT COUNT(*) AS count FROM release_resolution_cache WHERE vn_id = ?',
    ).get(vnId) as { count: number };
    return Math.max(0, after.count - before.count);
  },
};

let postgresRepository: ReleaseMetadataRepository | null = null;

/** Return the release-metadata repository selected by the configured backend. */
export function getReleaseMetadataRepository(): ReleaseMetadataRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresReleaseMetadataRepository();
  return postgresRepository;
}
