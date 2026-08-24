import type { PoolClient, QueryResultRow } from 'pg';
import type { CollectionFields } from '@/lib/types';
import { parsePhysicalLocations, serializePhysicalLocations } from '@/lib/physical-locations';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction, type PostgresParameter } from '../postgres';

/** Mutable fields accepted by collection create and update operations. */
export type CollectionCorePatch = Partial<Omit<CollectionFields, 'added_at' | 'updated_at'>>;

/** Metadata fields that can select a preferred upstream source. */
export type CollectionSourceField = 'title' | 'description' | 'image' | 'brand' | 'rating' | 'playtime';
/** Supported source-selection values. */
export type CollectionSourceChoice = 'auto' | 'vndb' | 'egs' | 'custom';
/** Sparse per-field source-selection map. */
export type CollectionSourcePreferences = Partial<Record<CollectionSourceField, CollectionSourceChoice>>;

interface CollectionSnapshotRow extends QueryResultRow {
  status: string | null;
  user_rating: number | null;
  playtime_minutes: number;
  favorite: number;
  started_date: string | null;
  finished_date: string | null;
}

interface PhysicalLocationRow extends QueryResultRow {
  physical_location: string | null;
}

interface VnIdRow extends QueryResultRow {
  vn_id: string;
}

interface SourcePreferenceRow extends QueryResultRow {
  source_pref: string | null;
}

interface CollectionFieldUpdate {
  column: string;
  value: PostgresParameter;
}

/** Asynchronous persistence contract for core collection membership and ordering. */
export interface CollectionCoreRepository {
  /** Add a VN or patch its existing collection row atomically. */
  add(vnId: string, fields?: CollectionCorePatch): Promise<void>;
  /** Patch one collection row and append state-change activity entries. */
  update(vnId: string, fields: CollectionCorePatch): Promise<void>;
  /** Remove one collection row and its personal-list memberships. */
  remove(vnId: string): Promise<void>;
  /** Report whether one VN belongs to the collection. */
  contains(vnId: string): Promise<boolean>;
  /** Return the owned subset of a VN id list. */
  containsMany(vnIds: readonly string[]): Promise<Set<string>>;
  /** Persist custom positions for the supplied VN ids. */
  setCustomOrder(vnIds: readonly string[]): Promise<void>;
  /** Clear every custom collection position. */
  resetCustomOrder(): Promise<void>;
  /** List every VN id currently in the collection. */
  listIds(): Promise<string[]>;
  /** Set or clear the normalized user-authored synopsis. */
  setCustomDescription(vnId: string, text: string | null): Promise<void>;
  /** Read validated per-field source preferences. */
  getSourcePreferences(vnId: string): Promise<CollectionSourcePreferences>;
  /** Persist non-default per-field source preferences. */
  setSourcePreferences(vnId: string, preferences: CollectionSourcePreferences): Promise<void>;
}

const SOURCE_FIELDS = new Set<CollectionSourceField>(['title', 'description', 'image', 'brand', 'rating', 'playtime']);
const SOURCE_CHOICES = new Set<CollectionSourceChoice>(['auto', 'vndb', 'egs', 'custom']);

function decodeSourcePreferences(raw: string | null): CollectionSourcePreferences {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result: CollectionSourcePreferences = {};
    for (const [field, choice] of Object.entries(value as Record<string, unknown>)) {
      if (SOURCE_FIELDS.has(field as CollectionSourceField) && SOURCE_CHOICES.has(choice as CollectionSourceChoice)) {
        result[field as CollectionSourceField] = choice as CollectionSourceChoice;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function encodeSourcePreferences(preferences: CollectionSourcePreferences): string | null {
  const normalized: CollectionSourcePreferences = {};
  for (const [field, choice] of Object.entries(preferences)) {
    if (SOURCE_FIELDS.has(field as CollectionSourceField) && SOURCE_CHOICES.has(choice as CollectionSourceChoice) && choice !== 'auto') {
      normalized[field as CollectionSourceField] = choice as CollectionSourceChoice;
    }
  }
  return Object.keys(normalized).length > 0 ? JSON.stringify(normalized) : null;
}

function collectionFieldUpdates(fields: CollectionCorePatch): CollectionFieldUpdate[] {
  const updates: CollectionFieldUpdate[] = [];
  const add = (column: string, value: PostgresParameter | undefined): void => {
    if (value !== undefined) updates.push({ column, value });
  };
  add('status', fields.status);
  add('user_rating', fields.user_rating);
  add('playtime_minutes', fields.playtime_minutes);
  add('started_date', fields.started_date);
  add('finished_date', fields.finished_date);
  add('notes', fields.notes);
  add('favorite', fields.favorite === undefined ? undefined : fields.favorite ? 1 : 0);
  add('location', fields.location);
  add('edition_type', fields.edition_type);
  add('edition_label', fields.edition_label);
  add('physical_location', fields.physical_location === undefined
    ? undefined
    : serializePhysicalLocations(fields.physical_location));
  add('box_type', fields.box_type);
  add('download_url', fields.download_url);
  add('dumped', fields.dumped === undefined ? undefined : fields.dumped ? 1 : 0);
  add('dumped_ignored', fields.dumped_ignored === undefined ? undefined : fields.dumped_ignored ? 1 : 0);
  add('custom_description', fields.custom_description);
  return updates;
}

async function rebuildPlaceIndex(client: PoolClient, vnId: string): Promise<void> {
  const result = await client.query<PhysicalLocationRow>(`
    SELECT physical_location FROM collection WHERE vn_id = $1
    UNION ALL
    SELECT physical_location FROM owned_release WHERE vn_id = $1 AND physical_location IS NOT NULL
  `, [vnId]);
  const places = new Set(result.rows.flatMap((row) => parsePhysicalLocations(row.physical_location)));
  await client.query('DELETE FROM collection_place_index WHERE vn_id = $1', [vnId]);
  for (const place of places) {
    await client.query(`
      INSERT INTO collection_place_index (vn_id, place) VALUES ($1, $2)
      ON CONFLICT(vn_id, place) DO NOTHING
    `, [vnId, place]);
  }
}

async function appendActivity(
  client: PoolClient,
  vnId: string,
  kind: string,
  payload: Record<string, string | number | boolean | null>,
  occurredAt: number,
): Promise<void> {
  await client.query(
    'INSERT INTO vn_activity (vn_id, kind, payload, occurred_at) VALUES ($1, $2, $3, $4)',
    [vnId, kind, JSON.stringify(payload), occurredAt],
  );
}

async function updateWithinTransaction(
  client: PoolClient,
  vnId: string,
  fields: CollectionCorePatch,
): Promise<void> {
  const updates = collectionFieldUpdates(fields);
  if (updates.length === 0) return;
  const beforeResult = await client.query<CollectionSnapshotRow>(`
    SELECT status, user_rating, playtime_minutes, favorite, started_date, finished_date
    FROM collection WHERE vn_id = $1 FOR UPDATE
  `, [vnId]);
  const before = beforeResult.rows[0];
  const now = Date.now();
  const values = updates.map((update) => update.value);
  values.push(now, vnId);
  await client.query(
    `UPDATE collection SET ${updates.map((update, index) => `${update.column} = $${index + 1}`).join(', ')}, updated_at = $${updates.length + 1} WHERE vn_id = $${updates.length + 2}`,
    values,
  );
  if ('physical_location' in fields) await rebuildPlaceIndex(client, vnId);
  if (!before) return;

  if (fields.status !== undefined && fields.status !== before.status) {
    await appendActivity(client, vnId, 'status', { from: before.status, to: fields.status }, now);
  }
  if (fields.user_rating !== undefined && fields.user_rating !== before.user_rating) {
    await appendActivity(client, vnId, 'rating', { from: before.user_rating, to: fields.user_rating }, now);
  }
  if ('playtime_minutes' in fields && typeof fields.playtime_minutes === 'number') {
    const delta = fields.playtime_minutes - before.playtime_minutes;
    if (delta !== 0) {
      await appendActivity(client, vnId, 'playtime', { from: before.playtime_minutes, to: fields.playtime_minutes, delta }, now);
    }
  }
  if (fields.favorite !== undefined && fields.favorite !== Boolean(before.favorite)) {
    await appendActivity(client, vnId, 'favorite', { to: fields.favorite }, now);
  }
  if (fields.started_date !== undefined && fields.started_date !== before.started_date) {
    await appendActivity(client, vnId, 'started', { from: before.started_date, to: fields.started_date }, now);
  }
  if (fields.finished_date !== undefined && fields.finished_date !== before.finished_date) {
    await appendActivity(client, vnId, 'finished', { from: before.finished_date, to: fields.finished_date }, now);
  }
  if (fields.notes !== undefined) {
    await appendActivity(client, vnId, 'note', { length: typeof fields.notes === 'string' ? fields.notes.length : 0 }, now);
  }
}

/** Create the PostgreSQL-backed collection core repository. */
export function createPostgresCollectionCoreRepository(): CollectionCoreRepository {
  return {
    async add(vnId, fields = {}) {
      await withPostgresTransaction(async (client) => {
        const existing = await client.query<VnIdRow>('SELECT vn_id FROM collection WHERE vn_id = $1 FOR UPDATE', [vnId]);
        if (existing.rows[0]) {
          await updateWithinTransaction(client, vnId, fields);
          return;
        }
        const now = Date.now();
        await client.query(`
          INSERT INTO collection (
            vn_id, status, user_rating, playtime_minutes, started_date, finished_date, notes, favorite,
            location, edition_type, edition_label, physical_location, box_type, download_url, dumped,
            dumped_ignored, custom_description, added_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        `, [
          vnId,
          fields.status ?? 'planning',
          fields.user_rating ?? null,
          fields.playtime_minutes ?? 0,
          fields.started_date ?? null,
          fields.finished_date ?? null,
          fields.notes ?? null,
          fields.favorite ? 1 : 0,
          fields.location ?? 'unknown',
          fields.edition_type ?? 'none',
          fields.edition_label ?? null,
          serializePhysicalLocations(fields.physical_location),
          fields.box_type ?? 'none',
          fields.download_url ?? null,
          fields.dumped ? 1 : 0,
          fields.dumped_ignored ? 1 : 0,
          fields.custom_description ?? null,
          now,
          now,
        ]);
        await rebuildPlaceIndex(client, vnId);
      });
    },
    async update(vnId, fields) {
      await withPostgresTransaction((client) => updateWithinTransaction(client, vnId, fields));
    },
    async remove(vnId) {
      await withPostgresTransaction(async (client) => {
        await client.query('DELETE FROM collection_place_index WHERE vn_id = $1', [vnId]);
        await client.query('DELETE FROM collection WHERE vn_id = $1', [vnId]);
        await client.query('DELETE FROM user_list_vn WHERE vn_id = $1', [vnId]);
      });
    },
    async contains(vnId) {
      const result = await postgresQuery<VnIdRow>('SELECT vn_id FROM collection WHERE vn_id = $1', [vnId]);
      return Boolean(result.rows[0]);
    },
    async containsMany(vnIds) {
      if (vnIds.length === 0) return new Set();
      const result = await postgresQuery<VnIdRow>('SELECT vn_id FROM collection WHERE vn_id = ANY($1::text[])', [vnIds]);
      return new Set(result.rows.map((row) => row.vn_id));
    },
    async setCustomOrder(vnIds) {
      if (vnIds.length === 0) return;
      await withPostgresTransaction(async (client) => {
        for (const [index, vnId] of vnIds.entries()) {
          await client.query('UPDATE collection SET custom_order = $1 WHERE vn_id = $2', [index + 1, vnId]);
        }
      });
    },
    async resetCustomOrder() {
      await postgresQuery('UPDATE collection SET custom_order = 0');
    },
    async listIds() {
      const result = await postgresQuery<VnIdRow>('SELECT vn_id FROM collection');
      return result.rows.map((row) => row.vn_id);
    },
    async setCustomDescription(vnId, text) {
      const cleaned = text == null ? null : text.trim();
      await postgresQuery(
        'UPDATE collection SET custom_description = $1, updated_at = $2 WHERE vn_id = $3',
        [cleaned ? cleaned.slice(0, 8000) : null, Date.now(), vnId],
      );
    },
    async getSourcePreferences(vnId) {
      const result = await postgresQuery<SourcePreferenceRow>(
        'SELECT source_pref FROM collection WHERE vn_id = $1',
        [vnId],
      );
      return decodeSourcePreferences(result.rows[0]?.source_pref ?? null);
    },
    async setSourcePreferences(vnId, preferences) {
      await postgresQuery(
        'UPDATE collection SET source_pref = $1, updated_at = $2 WHERE vn_id = $3',
        [encodeSourcePreferences(preferences), Date.now(), vnId],
      );
    },
  };
}

const sqliteRepository: CollectionCoreRepository = {
  async add(vnId, fields) {
    (await import('@/lib/db')).addToCollection(vnId, fields);
  },
  async update(vnId, fields) {
    (await import('@/lib/db')).updateCollection(vnId, fields);
  },
  async remove(vnId) {
    (await import('@/lib/db')).removeFromCollection(vnId);
  },
  async contains(vnId) {
    return (await import('@/lib/db')).isInCollection(vnId);
  },
  async containsMany(vnIds) {
    return (await import('@/lib/db')).isInCollectionMany(vnIds);
  },
  async setCustomOrder(vnIds) {
    (await import('@/lib/db')).setCollectionCustomOrder([...vnIds]);
  },
  async resetCustomOrder() {
    (await import('@/lib/db')).resetCollectionCustomOrder();
  },
  async listIds() {
    return (await import('@/lib/db')).listInCollectionVnIds();
  },
  async setCustomDescription(vnId, text) {
    (await import('@/lib/db')).setCustomDescription(vnId, text);
  },
  async getSourcePreferences(vnId) {
    return (await import('@/lib/db')).getSourcePref(vnId);
  },
  async setSourcePreferences(vnId, preferences) {
    (await import('@/lib/db')).setSourcePref(vnId, preferences);
  },
};

let postgresRepository: CollectionCoreRepository | null = null;

/** Return the configured collection core repository. */
export function getCollectionCoreRepository(): CollectionCoreRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresCollectionCoreRepository();
  return postgresRepository;
}
