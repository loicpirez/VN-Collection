import type { PoolClient, QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { withPostgresTransaction } from '../postgres';

interface PlaceRow extends QueryResultRow {
  place: string;
}

/** Atomic persistence boundary for promoting a synthetic VN identifier. */
export interface VnIdentityRepository {
  /** Move every user-owned reference from a synthetic id to an existing canonical id. */
  migrate(fromId: string, toId: string): Promise<void>;
}

async function replaceSingleton(client: PoolClient, table: string, fromId: string, toId: string): Promise<void> {
  await client.query(`
    DELETE FROM ${table}
    WHERE vn_id = $2 AND EXISTS (SELECT 1 FROM ${table} WHERE vn_id = $1)
  `, [fromId, toId]);
  await client.query(`UPDATE ${table} SET vn_id = $2 WHERE vn_id = $1`, [fromId, toId]);
}

async function mergeComposite(
  client: PoolClient,
  table: string,
  keyColumns: readonly string[],
  fromId: string,
  toId: string,
): Promise<void> {
  const collision = keyColumns.map((column) => `target.${column} = source.${column}`).join(' AND ');
  await client.query(`
    DELETE FROM ${table} AS target
    USING ${table} AS source
    WHERE target.vn_id = $2 AND source.vn_id = $1 AND ${collision}
  `, [fromId, toId]);
  await client.query(`UPDATE ${table} SET vn_id = $2 WHERE vn_id = $1`, [fromId, toId]);
}

async function migrateCollection(client: PoolClient, fromId: string, toId: string): Promise<void> {
  const places = await client.query<PlaceRow>(
    'SELECT place FROM collection_place_index WHERE vn_id = $1 ORDER BY place',
    [fromId],
  );
  const source = await client.query('SELECT 1 FROM collection WHERE vn_id = $1', [fromId]);
  if (!source.rows[0]) return;
  await client.query('DELETE FROM collection_place_index WHERE vn_id IN ($1, $2)', [fromId, toId]);
  await client.query('DELETE FROM collection WHERE vn_id = $1', [toId]);
  await client.query('UPDATE collection SET vn_id = $2 WHERE vn_id = $1', [fromId, toId]);
  for (const row of places.rows) {
    await client.query(
      'INSERT INTO collection_place_index (vn_id, place) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [toId, row.place],
    );
  }
}

async function migrateOwnedReleases(client: PoolClient, fromId: string, toId: string): Promise<void> {
  await client.query(`
    INSERT INTO owned_release (
      vn_id, release_id, notes, added_at, location, physical_location, box_type,
      edition_label, condition, price_paid, currency, acquired_date, dumped,
      purchase_place, owned_platform, cover_rotation
    )
    SELECT $2, release_id, notes, added_at, location, physical_location, box_type,
      edition_label, condition, price_paid, currency, acquired_date, dumped,
      purchase_place, owned_platform, cover_rotation
    FROM owned_release WHERE vn_id = $1
    ON CONFLICT (vn_id, release_id) DO UPDATE SET
      notes = EXCLUDED.notes,
      added_at = EXCLUDED.added_at,
      location = EXCLUDED.location,
      physical_location = EXCLUDED.physical_location,
      box_type = EXCLUDED.box_type,
      edition_label = EXCLUDED.edition_label,
      condition = EXCLUDED.condition,
      price_paid = EXCLUDED.price_paid,
      currency = EXCLUDED.currency,
      acquired_date = EXCLUDED.acquired_date,
      dumped = EXCLUDED.dumped,
      purchase_place = EXCLUDED.purchase_place,
      owned_platform = EXCLUDED.owned_platform,
      cover_rotation = EXCLUDED.cover_rotation
  `, [fromId, toId]);

  await client.query(`
    DELETE FROM physical_bundle
    WHERE anchor_vn_id = $2 AND anchor_release_id IN (
      SELECT anchor_release_id FROM physical_bundle WHERE anchor_vn_id = $1
    )
  `, [fromId, toId]);
  await client.query('UPDATE physical_bundle SET anchor_vn_id = $2 WHERE anchor_vn_id = $1', [fromId, toId]);

  await mergeComposite(client, 'physical_bundle_member', ['release_id'], fromId, toId);
  await mergeComposite(client, 'owned_release_aspect_override', ['release_id'], fromId, toId);
  await mergeComposite(client, 'shelf_slot', ['release_id'], fromId, toId);
  await mergeComposite(client, 'shelf_display_slot', ['release_id'], fromId, toId);
  await client.query('DELETE FROM owned_release WHERE vn_id = $1', [fromId]);
}

async function migrateDerivedIndexes(client: PoolClient, fromId: string, toId: string): Promise<void> {
  await client.query(`
    INSERT INTO staff_credit_index (sid, vn_id, is_va)
    SELECT sid, $2, is_va FROM staff_credit_index WHERE vn_id = $1
    ON CONFLICT DO NOTHING
  `, [fromId, toId]);
  await client.query(`
    INSERT INTO character_vn_index (character_id, vn_id)
    SELECT character_id, $2 FROM character_vn_index WHERE vn_id = $1
    ON CONFLICT DO NOTHING
  `, [fromId, toId]);
  await client.query('DELETE FROM staff_credit_index WHERE vn_id = $1', [fromId]);
  await client.query('DELETE FROM character_vn_index WHERE vn_id = $1', [fromId]);

  for (const table of [
    'vn_staff_credit',
    'vn_va_credit',
    'vn_tag_index',
    'vn_developer_index',
    'vn_publisher_index',
    'vn_language_index',
    'vn_platform_index',
  ]) {
    await client.query(`DELETE FROM ${table} WHERE vn_id = $1`, [fromId]);
  }
}

/** Create the PostgreSQL-backed VN identity repository. */
export function createPostgresVnIdentityRepository(): VnIdentityRepository {
  return {
    async migrate(fromId, toId) {
      if (fromId === toId) return;
      await withPostgresTransaction(async (client) => {
        const target = await client.query('SELECT id FROM vn WHERE id = $1 FOR UPDATE', [toId]);
        if (!target.rows[0]) throw new Error(`migrateVnId: target ${toId} not in vn table`);
        const source = await client.query('SELECT id FROM vn WHERE id = $1 FOR UPDATE', [fromId]);
        if (!source.rows[0]) throw new Error(`migrateVnId: source ${fromId} not in vn table`);

        await migrateCollection(client, fromId, toId);
        await migrateOwnedReleases(client, fromId, toId);

        for (const table of ['egs_game', 'reading_queue', 'steam_link', 'vn_aspect_override', 'vn_egs_link']) {
          await replaceSingleton(client, table, fromId, toId);
        }
        for (const [table, keys] of [
          ['series_vn', ['series_id']],
          ['user_list_vn', ['list_id']],
          ['vn_stock_offer', ['provider', 'provider_offer_id']],
          ['vn_stock_provider_status', ['provider']],
          ['vn_stock_alias', ['alias_term']],
          ['vn_stock_source', ['url']],
        ] as const) {
          await mergeComposite(client, table, keys, fromId, toId);
        }

        for (const table of ['vn_quote', 'vn_route', 'vn_activity', 'vn_game_log']) {
          await client.query(`UPDATE ${table} SET vn_id = $2 WHERE vn_id = $1`, [fromId, toId]);
        }
        await migrateDerivedIndexes(client, fromId, toId);

        await client.query('UPDATE egs_vn_link SET vn_id = $2 WHERE vn_id = $1', [fromId, toId]);
        await client.query('UPDATE alicenet_stock SET vn_id = $2 WHERE vn_id = $1', [fromId, toId]);
        await client.query('UPDATE release_resolution_cache SET vn_id = $2 WHERE vn_id = $1', [fromId, toId]);
        await client.query('UPDATE release_meta_cache SET vn_id = $2 WHERE vn_id = $1', [fromId, toId]);
        await client.query('UPDATE vn_title_resolve_cache SET vn_id = $2 WHERE vn_id = $1', [fromId, toId]);
        await client.query(`
          UPDATE user_activity SET entity_id = $2
          WHERE entity = 'vn' AND entity_id = $1
        `, [fromId, toId]);
        await client.query('DELETE FROM vn WHERE id = $1', [fromId]);
      });
    },
  };
}

const sqliteRepository: VnIdentityRepository = {
  async migrate(fromId, toId) {
    (await import('@/lib/db')).migrateVnId(fromId, toId);
  },
};

let postgresRepository: VnIdentityRepository | null = null;

/** Return the VN identity repository selected by the configured backend. */
export function getVnIdentityRepository(): VnIdentityRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresVnIdentityRepository();
  return postgresRepository;
}
