import type { PoolClient, QueryResultRow } from 'pg';
import type {
  OwnedReleasePatch,
  OwnedReleaseRow,
  OwnedReleaseWithShelf,
  ReleaseAspectInfo,
} from '@/lib/db';
import {
  aspectKeyForResolution,
  isAspectKey,
  parseResolutionValue,
  type AspectKey,
} from '@/lib/aspect-ratio';
import { parseJsonArray } from '@/lib/json-shape';
import {
  parsePhysicalLocations,
  serializePhysicalLocations,
} from '@/lib/physical-locations';
import { readDatabaseConfig } from '../postgres-config';
import {
  postgresQuery,
  withPostgresTransaction,
  type PostgresParameter,
} from '../postgres';

/** Manual aspect-ratio value stored for one owned edition. */
export interface OwnedReleaseAspectOverrideInput {
  /** Optional source width in pixels. */
  width?: number | null;
  /** Optional source height in pixels. */
  height?: number | null;
  /** Explicit aspect bucket when dimensions are unavailable. */
  aspectKey?: AspectKey | null;
  /** Optional user-facing provenance note. */
  note?: string | null;
}

/** Resolution metadata cached after reading one VNDB release. */
export interface ReleaseResolutionCacheInput {
  /** VNDB release identifier. */
  releaseId: string;
  /** Raw VNDB resolution value. */
  resolution: unknown;
  /** Optional VN linked to the release. */
  vnId?: string | null;
  /** Optional deterministic fetch timestamp. */
  fetchedAt?: number;
}

/** Asynchronous persistence contract for owned editions and their aspect metadata. */
export interface OwnedReleaseRepository {
  /** Read one owned edition. */
  get(vnId: string, releaseId: string): Promise<OwnedReleaseRow | null>;
  /** List the owned editions of one VN. */
  listForVn(vnId: string): Promise<OwnedReleaseRow[]>;
  /** List owned editions with shelf placement, release platforms, and aspect provenance. */
  listWithShelfForVn(vnId: string): Promise<OwnedReleaseWithShelf[]>;
  /** Create an owned edition, or patch the existing row. */
  mark(vnId: string, releaseId: string, patch?: OwnedReleasePatch): Promise<void>;
  /** Patch one owned edition. */
  update(vnId: string, releaseId: string, patch: OwnedReleasePatch): Promise<void>;
  /** Atomically patch an edition and optionally replace or clear its aspect override. */
  updateWithAspect(
    vnId: string,
    releaseId: string,
    patch: OwnedReleasePatch,
    aspectOverride?: OwnedReleaseAspectOverrideInput | null,
  ): Promise<void>;
  /** Remove one owned edition and rebuild its physical-place index. */
  remove(vnId: string, releaseId: string): Promise<void>;
  /** Replace or clear one owned-edition aspect override. */
  setAspectOverride(vnId: string, releaseId: string, input: OwnedReleaseAspectOverrideInput | null): Promise<void>;
  /** Upsert cached release-resolution metadata. */
  upsertResolutionCache(input: ReleaseResolutionCacheInput): Promise<void>;
}

interface OwnedReleaseDatabaseRow extends QueryResultRow {
  vn_id: string;
  release_id: string;
  notes: string | null;
  location: string;
  physical_location: string | null;
  box_type: string;
  edition_label: string | null;
  condition: string | null;
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  owned_platform: string | null;
  dumped: number | null;
  added_at: number;
}

interface OwnedReleaseShelfDatabaseRow extends OwnedReleaseDatabaseRow {
  shelf_id: number | null;
  shelf_row: number | null;
  shelf_col: number | null;
  shelf_name: string | null;
  display_shelf_id: number | null;
  display_after_row: number | null;
  display_position: number | null;
  display_shelf_name: string | null;
  override_width: number | null;
  override_height: number | null;
  override_aspect: string | null;
  override_note: string | null;
  cache_width: number | null;
  cache_height: number | null;
  cache_raw: string | null;
  cache_aspect: string | null;
  rel_platforms: string | null;
}

interface PhysicalLocationDatabaseRow extends QueryResultRow {
  physical_location: string | null;
}

interface ExistsRow extends QueryResultRow {
  exists: number;
}

interface PostgresCommandExecutor {
  query<Row extends QueryResultRow>(text: string, values?: readonly PostgresParameter[]): Promise<{ rows: Row[]; rowCount: number | null }>;
}

const OWNED_RELEASE_SELECT = `
  vn_id, release_id, notes, location, physical_location, box_type,
  edition_label, condition, price_paid, currency, acquired_date,
  owned_platform, dumped, added_at
`;

function mapOwnedRelease(row: OwnedReleaseDatabaseRow): OwnedReleaseRow {
  return {
    vn_id: row.vn_id,
    release_id: row.release_id,
    notes: row.notes,
    location: row.location,
    physical_location: parsePhysicalLocations(row.physical_location),
    box_type: row.box_type,
    edition_label: row.edition_label,
    condition: row.condition,
    price_paid: row.price_paid,
    currency: row.currency,
    acquired_date: row.acquired_date,
    owned_platform: row.owned_platform,
    dumped: Boolean(row.dumped),
    added_at: row.added_at,
  };
}

function stringArray(raw: string | null): string[] {
  return parseJsonArray(raw).filter((value): value is string => typeof value === 'string');
}

function aspectInfo(row: OwnedReleaseShelfDatabaseRow): ReleaseAspectInfo {
  if (isAspectKey(row.override_aspect)) {
    return {
      width: row.override_width,
      height: row.override_height,
      raw_resolution: null,
      aspect_key: row.override_aspect,
      source: 'manual',
      note: row.override_note,
    };
  }
  if (isAspectKey(row.cache_aspect) && row.cache_aspect !== 'unknown') {
    return {
      width: row.cache_width,
      height: row.cache_height,
      raw_resolution: row.cache_raw,
      aspect_key: row.cache_aspect,
      source: 'vndb',
      note: null,
    };
  }
  return {
    width: null,
    height: null,
    raw_resolution: row.cache_raw,
    aspect_key: 'unknown',
    source: 'unknown',
    note: null,
  };
}

function mapOwnedReleaseWithShelf(row: OwnedReleaseShelfDatabaseRow): OwnedReleaseWithShelf {
  return {
    ...mapOwnedRelease(row),
    rel_platforms: stringArray(row.rel_platforms),
    shelf:
      row.shelf_id != null && row.shelf_row != null && row.shelf_col != null && row.shelf_name != null
        ? { kind: 'cell', id: row.shelf_id, name: row.shelf_name, row: row.shelf_row, col: row.shelf_col }
        : row.display_shelf_id != null
            && row.display_after_row != null
            && row.display_position != null
            && row.display_shelf_name != null
          ? {
              kind: 'display',
              id: row.display_shelf_id,
              name: row.display_shelf_name,
              afterRow: row.display_after_row,
              position: row.display_position,
            }
          : null,
    aspect: aspectInfo(row),
  };
}

async function rebuildPlaceIndex(executor: PostgresCommandExecutor, vnId: string): Promise<void> {
  const [collectionResult, ownedResult] = await Promise.all([
    executor.query<PhysicalLocationDatabaseRow>(
      'SELECT physical_location FROM collection WHERE vn_id = $1',
      [vnId],
    ),
    executor.query<PhysicalLocationDatabaseRow>(
      'SELECT physical_location FROM owned_release WHERE vn_id = $1 AND physical_location IS NOT NULL',
      [vnId],
    ),
  ]);
  const places = new Set<string>();
  for (const place of parsePhysicalLocations(collectionResult.rows[0]?.physical_location)) places.add(place);
  for (const row of ownedResult.rows) {
    for (const place of parsePhysicalLocations(row.physical_location)) places.add(place);
  }
  await executor.query('DELETE FROM collection_place_index WHERE vn_id = $1', [vnId]);
  for (const place of places) {
    await executor.query(
      'INSERT INTO collection_place_index (vn_id, place) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [vnId, place],
    );
  }
}

function patchUpdates(patch: OwnedReleasePatch): Array<{ column: string; value: PostgresParameter }> {
  const updates: Array<{ column: string; value: PostgresParameter }> = [];
  const values: Array<[keyof OwnedReleasePatch, string, (value: OwnedReleasePatch[keyof OwnedReleasePatch]) => PostgresParameter]> = [
    ['notes', 'notes', (value) => value as string | null],
    ['location', 'location', (value) => value as string],
    ['physical_location', 'physical_location', (value) => serializePhysicalLocations(value)],
    ['box_type', 'box_type', (value) => value as string],
    ['edition_label', 'edition_label', (value) => value as string | null],
    ['condition', 'condition', (value) => value as string | null],
    ['price_paid', 'price_paid', (value) => value as number | null],
    ['currency', 'currency', (value) => value as string | null],
    ['acquired_date', 'acquired_date', (value) => value as string | null],
    ['purchase_place', 'purchase_place', (value) => value as string | null],
    ['owned_platform', 'owned_platform', (value) => value as string | null],
    ['dumped', 'dumped', (value) => value ? 1 : 0],
  ];
  for (const [key, column, normalize] of values) {
    if (key in patch) updates.push({ column, value: normalize(patch[key]) });
  }
  return updates;
}

async function updateOwnedRelease(
  executor: PostgresCommandExecutor,
  vnId: string,
  releaseId: string,
  patch: OwnedReleasePatch,
): Promise<void> {
  const updates = patchUpdates(patch);
  if (updates.length === 0) return;
  const values = updates.map((update) => update.value);
  values.push(vnId, releaseId);
  await executor.query(
    `UPDATE owned_release SET ${updates.map((update, index) => `${update.column} = $${index + 1}`).join(', ')} WHERE vn_id = $${updates.length + 1} AND release_id = $${updates.length + 2}`,
    values,
  );
  if ('physical_location' in patch) await rebuildPlaceIndex(executor, vnId);
}

async function setAspectOverride(
  executor: PostgresCommandExecutor,
  vnId: string,
  releaseId: string,
  input: OwnedReleaseAspectOverrideInput | null,
): Promise<void> {
  const owned = await executor.query<ExistsRow>(
    'SELECT 1 AS exists FROM owned_release WHERE vn_id = $1 AND release_id = $2',
    [vnId, releaseId],
  );
  if (!owned.rows[0]) throw new Error('owned edition not found');
  const hasResolution = input != null
    && typeof input.width === 'number'
    && typeof input.height === 'number'
    && input.width > 0
    && input.height > 0;
  const aspect = hasResolution
    ? aspectKeyForResolution(input.width!, input.height!)
    : input?.aspectKey && isAspectKey(input.aspectKey)
      ? input.aspectKey
      : null;
  if (!aspect || aspect === 'unknown') {
    await executor.query(
      'DELETE FROM owned_release_aspect_override WHERE vn_id = $1 AND release_id = $2',
      [vnId, releaseId],
    );
    return;
  }
  await executor.query(`
    INSERT INTO owned_release_aspect_override
      (vn_id, release_id, width, height, aspect_key, note, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT(vn_id, release_id) DO UPDATE SET
      width = EXCLUDED.width,
      height = EXCLUDED.height,
      aspect_key = EXCLUDED.aspect_key,
      note = EXCLUDED.note,
      updated_at = EXCLUDED.updated_at
  `, [
    vnId,
    releaseId,
    hasResolution ? Math.round(input!.width!) : null,
    hasResolution ? Math.round(input!.height!) : null,
    aspect,
    input?.note?.trim() || null,
    Date.now(),
  ]);
}

function transactionExecutor(client: PoolClient): PostgresCommandExecutor {
  return {
    async query<Row extends QueryResultRow>(text: string, values: readonly PostgresParameter[] = []) {
      const result = await client.query<Row>(text, [...values]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

/** Create the PostgreSQL-backed owned-edition repository. */
export function createPostgresOwnedReleaseRepository(): OwnedReleaseRepository {
  const direct: PostgresCommandExecutor = {
    async query<Row extends QueryResultRow>(text: string, values: readonly PostgresParameter[] = []) {
      const result = await postgresQuery<Row>(text, values);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
  return {
    async get(vnId, releaseId) {
      const result = await direct.query<OwnedReleaseDatabaseRow>(
        `SELECT ${OWNED_RELEASE_SELECT} FROM owned_release WHERE vn_id = $1 AND release_id = $2`,
        [vnId, releaseId],
      );
      return result.rows[0] ? mapOwnedRelease(result.rows[0]) : null;
    },
    async listForVn(vnId) {
      const result = await direct.query<OwnedReleaseDatabaseRow>(
        `SELECT ${OWNED_RELEASE_SELECT} FROM owned_release WHERE vn_id = $1 ORDER BY added_at DESC`,
        [vnId],
      );
      return result.rows.map(mapOwnedRelease);
    },
    async listWithShelfForVn(vnId) {
      const result = await direct.query<OwnedReleaseShelfDatabaseRow>(`
        SELECT o.*, s.shelf_id, s.row AS shelf_row, s.col AS shelf_col,
          u.name AS shelf_name, d.shelf_id AS display_shelf_id,
          d.after_row AS display_after_row, d.position AS display_position,
          du.name AS display_shelf_name, ao.width AS override_width,
          ao.height AS override_height, ao.aspect_key AS override_aspect,
          ao.note AS override_note, rc.width AS cache_width,
          rc.height AS cache_height, rc.raw_resolution AS cache_raw,
          rc.aspect_key AS cache_aspect, rm.platforms AS rel_platforms
        FROM owned_release o
        LEFT JOIN shelf_slot s ON s.vn_id = o.vn_id AND s.release_id = o.release_id
        LEFT JOIN shelf_unit u ON u.id = s.shelf_id
        LEFT JOIN shelf_display_slot d ON d.vn_id = o.vn_id AND d.release_id = o.release_id
        LEFT JOIN shelf_unit du ON du.id = d.shelf_id
        LEFT JOIN owned_release_aspect_override ao
          ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
        LEFT JOIN release_resolution_cache rc ON rc.release_id = o.release_id
        LEFT JOIN release_meta_cache rm ON rm.release_id = o.release_id
        WHERE o.vn_id = $1
        ORDER BY o.added_at DESC
      `, [vnId]);
      return result.rows.map(mapOwnedReleaseWithShelf);
    },
    async mark(vnId, releaseId, patch = {}) {
      await withPostgresTransaction(async (client) => {
        const executor = transactionExecutor(client);
        const exists = await executor.query<ExistsRow>(
          'SELECT 1 AS exists FROM owned_release WHERE vn_id = $1 AND release_id = $2 FOR UPDATE',
          [vnId, releaseId],
        );
        if (exists.rows[0]) {
          await updateOwnedRelease(executor, vnId, releaseId, patch);
          return;
        }
        await executor.query(`
          INSERT INTO owned_release (
            vn_id, release_id, notes, location, physical_location, box_type,
            edition_label, condition, price_paid, currency, acquired_date,
            purchase_place, owned_platform, dumped, added_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        `, [
          vnId,
          releaseId,
          patch.notes ?? null,
          patch.location ?? 'unknown',
          serializePhysicalLocations(patch.physical_location ?? null),
          patch.box_type ?? 'none',
          patch.edition_label ?? null,
          patch.condition ?? null,
          patch.price_paid ?? null,
          patch.currency ?? null,
          patch.acquired_date ?? null,
          patch.purchase_place ?? null,
          patch.owned_platform ?? null,
          patch.dumped ? 1 : 0,
          Date.now(),
        ]);
        if (patch.owned_platform == null) {
          await executor.query(`
            UPDATE owned_release SET owned_platform = (
              SELECT MIN(platform)
              FROM release_platform_index
              WHERE release_id = owned_release.release_id
              GROUP BY release_id
              HAVING COUNT(*) = 1
            )
            WHERE vn_id = $1 AND release_id = $2 AND owned_platform IS NULL
              AND EXISTS (
                SELECT 1 FROM release_platform_index
                WHERE release_id = owned_release.release_id
                GROUP BY release_id
                HAVING COUNT(*) = 1
              )
          `, [vnId, releaseId]);
        }
        await rebuildPlaceIndex(executor, vnId);
      });
    },
    async update(vnId, releaseId, patch) {
      await withPostgresTransaction(async (client) => {
        await updateOwnedRelease(transactionExecutor(client), vnId, releaseId, patch);
      });
    },
    async updateWithAspect(vnId, releaseId, patch, aspectOverride) {
      await withPostgresTransaction(async (client) => {
        const executor = transactionExecutor(client);
        await updateOwnedRelease(executor, vnId, releaseId, patch);
        if (aspectOverride !== undefined) {
          await setAspectOverride(executor, vnId, releaseId, aspectOverride);
        }
      });
    },
    async remove(vnId, releaseId) {
      await withPostgresTransaction(async (client) => {
        const executor = transactionExecutor(client);
        await executor.query(
          'DELETE FROM owned_release WHERE vn_id = $1 AND release_id = $2',
          [vnId, releaseId],
        );
        await rebuildPlaceIndex(executor, vnId);
      });
    },
    async setAspectOverride(vnId, releaseId, input) {
      await withPostgresTransaction(async (client) => {
        await setAspectOverride(transactionExecutor(client), vnId, releaseId, input);
      });
    },
    async upsertResolutionCache(input) {
      const parsed = parseResolutionValue(input.resolution);
      const raw = typeof input.resolution === 'string'
        ? input.resolution
        : parsed
          ? `${parsed.width}x${parsed.height}`
          : input.resolution == null
            ? null
            : JSON.stringify(input.resolution);
      await direct.query(`
        INSERT INTO release_resolution_cache
          (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT(release_id) DO UPDATE SET
          vn_id = COALESCE(EXCLUDED.vn_id, release_resolution_cache.vn_id),
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          raw_resolution = EXCLUDED.raw_resolution,
          aspect_key = EXCLUDED.aspect_key,
          fetched_at = EXCLUDED.fetched_at
      `, [
        input.releaseId,
        input.vnId ?? null,
        parsed?.width ?? null,
        parsed?.height ?? null,
        raw,
        parsed ? aspectKeyForResolution(parsed.width, parsed.height) : 'unknown',
        input.fetchedAt ?? Date.now(),
      ]);
    },
  };
}

const sqliteRepository: OwnedReleaseRepository = {
  async get(vnId, releaseId) {
    return (await import('@/lib/db')).getOwnedRelease(vnId, releaseId);
  },
  async listForVn(vnId) {
    return (await import('@/lib/db')).listOwnedReleasesForVn(vnId);
  },
  async listWithShelfForVn(vnId) {
    return (await import('@/lib/db')).listOwnedReleasesWithShelfForVn(vnId);
  },
  async mark(vnId, releaseId, patch = {}) {
    (await import('@/lib/db')).markReleaseOwned(vnId, releaseId, patch);
  },
  async update(vnId, releaseId, patch) {
    (await import('@/lib/db')).updateOwnedRelease(vnId, releaseId, patch);
  },
  async updateWithAspect(vnId, releaseId, patch, aspectOverride) {
    const legacy = await import('@/lib/db');
    legacy.db.transaction(() => {
      legacy.updateOwnedRelease(vnId, releaseId, patch);
      if (aspectOverride === undefined) return;
      legacy.setOwnedReleaseAspectOverride({
        vnId,
        releaseId,
        ...(aspectOverride ?? { aspectKey: 'unknown' as const }),
      });
    })();
  },
  async remove(vnId, releaseId) {
    (await import('@/lib/db')).unmarkReleaseOwned(vnId, releaseId);
  },
  async setAspectOverride(vnId, releaseId, input) {
    (await import('@/lib/db')).setOwnedReleaseAspectOverride({
      vnId,
      releaseId,
      ...(input ?? { aspectKey: 'unknown' as const }),
    });
  },
  async upsertResolutionCache(input) {
    (await import('@/lib/db')).upsertReleaseResolutionCache(input);
  },
};

let postgresRepository: OwnedReleaseRepository | null = null;

/** Return the owned-edition repository configured for the active database engine. */
export function getOwnedReleaseRepository(): OwnedReleaseRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresOwnedReleaseRepository();
  return postgresRepository;
}
