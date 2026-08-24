import type { PoolClient, QueryResultRow } from 'pg';
import type { CollectionExportPayload, ImportSummary, RawVnPayload } from '@/lib/db';
import { isRawVnImportPayload } from '@/lib/collection-import';
import { readDatabaseConfig } from '../postgres-config';
import { withPostgresTransaction } from '../postgres';
import { rebuildPostgresCollectionPlaceIndex } from './collection-core';
import { upsertPostgresVn } from './vn-write';

/** Asynchronous collection backup and restore contract shared by both database engines. */
export interface CollectionTransferRepository {
  /** Build one complete version-2 collection transfer payload. */
  exportData(): Promise<CollectionExportPayload>;
  /** Restore one validated transfer payload and return per-section counters. */
  importData(payload: CollectionExportPayload): Promise<ImportSummary>;
}

interface ExportedVnRow extends QueryResultRow {
  id: string;
  title: string;
  raw: string | null;
  fetched_at: number;
}

interface SeriesIdRow extends QueryResultRow {
  id: number;
}

function parseRawPayload(raw: string | null): Partial<RawVnPayload> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isRawVnImportPayload(value) ? value : null;
  } catch {
    return null;
  }
}

function createImportSummary(): ImportSummary {
  return {
    vns_upserted: 0,
    collection_upserted: 0,
    series_created: 0,
    series_links: 0,
    errors: [],
  };
}

async function withImportSavepoint(
  client: PoolClient,
  sequence: number,
  work: () => Promise<void>,
  onError: () => void,
): Promise<void> {
  const savepoint = `collection_import_row_${sequence}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  try {
    await work();
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    onError();
  }
}

async function exportPostgresCollection(client: PoolClient): Promise<CollectionExportPayload> {
  await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const vnResult = await client.query<ExportedVnRow>(`
    SELECT id, title, raw, fetched_at
    FROM vn WHERE id IN (SELECT vn_id FROM collection)
    ORDER BY id
  `);
  const collectionResult = await client.query<CollectionExportPayload['collection'][number] & QueryResultRow>(`
    SELECT vn_id, status, user_rating, playtime_minutes, started_date, finished_date, notes,
           favorite, location, edition_type, edition_label, physical_location, added_at, updated_at
    FROM collection ORDER BY vn_id
  `);
  const seriesResult = await client.query<CollectionExportPayload['series'][number] & QueryResultRow>(`
    SELECT id, name, description, cover_path, banner_path, created_at, updated_at
    FROM series ORDER BY id
  `);
  const linkResult = await client.query<CollectionExportPayload['series_vn'][number] & QueryResultRow>(`
    SELECT series_id, vn_id, order_index FROM series_vn ORDER BY series_id, order_index, vn_id
  `);
  return {
    version: 2,
    exported_at: Date.now(),
    vns: vnResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      raw: parseRawPayload(row.raw),
      fetched_at: row.fetched_at,
    })),
    collection: collectionResult.rows,
    series: seriesResult.rows,
    series_vn: linkResult.rows,
  };
}

async function importPostgresCollection(
  client: PoolClient,
  payload: CollectionExportPayload,
  summary: ImportSummary,
): Promise<void> {
  let sequence = 0;
  for (const vn of payload.vns) {
    sequence += 1;
    await withImportSavepoint(client, sequence, async () => {
      const raw = vn.raw ?? {};
      const materialized: RawVnPayload = {
        ...raw,
        id: vn.id,
        title: vn.title || raw.title || vn.id,
      };
      await upsertPostgresVn(client, materialized, vn.fetched_at ?? Date.now());
      summary.vns_upserted += 1;
    }, () => {
      summary.errors.push(`vn ${vn.id}: import failed`);
    });
  }

  for (const entry of payload.collection) {
    sequence += 1;
    await withImportSavepoint(client, sequence, async () => {
      await client.query(`
        INSERT INTO collection (
          vn_id, status, user_rating, playtime_minutes, started_date, finished_date, notes,
          favorite, location, edition_type, edition_label, physical_location, added_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT(vn_id) DO UPDATE SET
          status = EXCLUDED.status,
          user_rating = EXCLUDED.user_rating,
          playtime_minutes = EXCLUDED.playtime_minutes,
          started_date = EXCLUDED.started_date,
          finished_date = EXCLUDED.finished_date,
          notes = EXCLUDED.notes,
          favorite = EXCLUDED.favorite,
          location = EXCLUDED.location,
          edition_type = EXCLUDED.edition_type,
          edition_label = EXCLUDED.edition_label,
          physical_location = EXCLUDED.physical_location,
          updated_at = EXCLUDED.updated_at
      `, [
        entry.vn_id,
        entry.status,
        entry.user_rating,
        entry.playtime_minutes ?? 0,
        entry.started_date,
        entry.finished_date,
        entry.notes,
        entry.favorite ? 1 : 0,
        entry.location ?? 'unknown',
        entry.edition_type ?? 'none',
        entry.edition_label,
        entry.physical_location,
        entry.added_at ?? Date.now(),
        entry.updated_at ?? Date.now(),
      ]);
      await rebuildPostgresCollectionPlaceIndex(client, entry.vn_id);
      summary.collection_upserted += 1;
    }, () => {
      summary.errors.push(`collection ${entry.vn_id}: import failed`);
    });
  }

  const idMap = new Map<number, number>();
  for (const series of payload.series) {
    sequence += 1;
    await withImportSavepoint(client, sequence, async () => {
      const existing = await client.query<SeriesIdRow>('SELECT id FROM series WHERE name = $1', [series.name]);
      if (existing.rows[0]) {
        idMap.set(series.id, existing.rows[0].id);
        return;
      }
      const created = await client.query<SeriesIdRow>(`
        INSERT INTO series (name, description, cover_path, banner_path, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        series.name,
        series.description ?? null,
        series.cover_path ?? null,
        series.banner_path ?? null,
        series.created_at,
        series.updated_at,
      ]);
      const createdId = created.rows[0]?.id;
      if (createdId == null) throw new Error('series insert returned no identifier');
      idMap.set(series.id, createdId);
      summary.series_created += 1;
    }, () => {
      summary.errors.push(`series ${series.name}: import failed`);
    });
  }

  for (const link of payload.series_vn) {
    const seriesId = idMap.get(link.series_id);
    if (seriesId == null) continue;
    sequence += 1;
    await withImportSavepoint(client, sequence, async () => {
      await client.query(`
        INSERT INTO series_vn (series_id, vn_id, order_index) VALUES ($1, $2, $3)
        ON CONFLICT(series_id, vn_id) DO UPDATE SET order_index = EXCLUDED.order_index
      `, [seriesId, link.vn_id, link.order_index ?? 0]);
      summary.series_links += 1;
    }, () => {
      summary.errors.push(`series_vn ${link.series_id}/${link.vn_id}: import failed`);
    });
  }
}

/** Create the PostgreSQL-backed collection transfer repository. */
export function createPostgresCollectionTransferRepository(): CollectionTransferRepository {
  return {
    async exportData() {
      return withPostgresTransaction(exportPostgresCollection);
    },
    async importData(payload) {
      const summary = createImportSummary();
      await withPostgresTransaction((client) => importPostgresCollection(client, payload, summary));
      const database = await import('@/lib/db');
      database.invalidateAggregateStats();
      database.invalidateProducerStats();
      return summary;
    },
  };
}

const sqliteRepository: CollectionTransferRepository = {
  async exportData() {
    return (await import('@/lib/db')).exportData();
  },
  async importData(payload) {
    return (await import('@/lib/db')).importData(payload);
  },
};

let postgresRepository: CollectionTransferRepository | null = null;

/** Return the collection transfer repository selected by the configured backend. */
export function getCollectionTransferRepository(): CollectionTransferRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresCollectionTransferRepository();
  return postgresRepository;
}
