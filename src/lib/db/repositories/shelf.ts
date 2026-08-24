import type { PoolClient, QueryResultRow } from 'pg';
import type {
  PhysicalBundle,
  PhysicalBundleIdentity,
  PhysicalBundleMember,
  PhysicalBundleSummary,
  PlaceShelfDisplayItemInput,
  PlaceShelfItemInput,
  PlaceShelfItemResult,
  ShelfDisplaySlotEntry,
  ShelfEntry,
  ShelfPlacementForEdition,
  ShelfResizeResult,
  ShelfSlotEntry,
  ShelfUnit,
  ShelfUnitWithCount,
} from '@/lib/db';
import type { BoxType, ReleaseImage } from '@/lib/types';
import { parseJsonArray } from '@/lib/json-shape';
import { parsePhysicalLocations } from '@/lib/physical-locations';
import { isPersistedReleaseImages } from '@/lib/vn-persisted-json-shape';
import { readDatabaseConfig } from '../postgres-config';
import {
  postgresQuery,
  withPostgresTransaction,
  type PostgresParameter,
} from '../postgres';

/** Asynchronous persistence contract for physical shelves and bundle placement. */
export interface ShelfRepository {
  /** List shelves with their regular and display placement count. */
  list(): Promise<ShelfUnitWithCount[]>;
  /** Read one shelf. */
  get(id: number): Promise<ShelfUnit | null>;
  /** Rename one shelf. */
  rename(id: number, name: string): Promise<ShelfUnit | null>;
  /** Resize one shelf and return every evicted placement. */
  resize(id: number, cols: number, rows: number): Promise<ShelfResizeResult | null>;
  /** Delete one shelf. */
  delete(id: number): Promise<boolean>;
  /** Persist the complete shelf ordering supplied by the client. */
  reorder(orderedIds: readonly number[]): Promise<void>;
  /** List every visible owned edition for flat shelf views. */
  listAllOwned(): Promise<ShelfEntry[]>;
  /** List owned editions that have no regular or display placement. */
  listUnplaced(): Promise<ShelfEntry[]>;
  /** List regular cells on one shelf. */
  listSlots(shelfId: number): Promise<ShelfSlotEntry[]>;
  /** List front-display cells on one shelf. */
  listDisplaySlots(shelfId: number): Promise<ShelfDisplaySlotEntry[]>;
  /** Place or swap one edition in a regular shelf cell. */
  placeItem(input: PlaceShelfItemInput): Promise<PlaceShelfItemResult>;
  /** Place one edition in a front-display cell. */
  placeDisplayItem(input: PlaceShelfDisplayItemInput): Promise<void>;
  /** Remove an edition from either placement surface. */
  removePlacement(vnId: string, releaseId: string): Promise<boolean>;
  /** Remove an edition specifically from a front-display cell. */
  removeDisplayPlacement(vnId: string, releaseId: string): Promise<boolean>;
  /** Locate one edition on a regular or front-display cell. */
  getPlacement(vnId: string, releaseId: string): Promise<ShelfPlacementForEdition>;
  /** Return VN identifiers with at least one shelf placement. */
  listPlacedVnIds(): Promise<Set<string>>;
  /** List all physical multi-release bundles. */
  listBundles(): Promise<PhysicalBundle[]>;
  /** Read one physical bundle. */
  getBundle(id: number): Promise<PhysicalBundle | null>;
  /** Create one physical multi-release bundle atomically. */
  createBundle(input: {
    name: string;
    anchor: PhysicalBundleIdentity;
    members: PhysicalBundleIdentity[];
  }): Promise<PhysicalBundle>;
  /** Rename one physical bundle. */
  renameBundle(id: number, name: string): Promise<PhysicalBundle | null>;
  /** Delete one physical bundle. */
  deleteBundle(id: number): Promise<boolean>;
}

interface ShelfDatabaseRow extends ShelfUnit, QueryResultRow {}
interface ShelfCountDatabaseRow extends ShelfUnitWithCount, QueryResultRow {}

interface ShelfVisualDatabaseRow extends QueryResultRow {
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
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  vn_release_images: string | null;
  vn_platforms: string | null;
  vn_languages: string | null;
  vn_released: string | null;
  rel_title: string | null;
  rel_platforms: string | null;
  rel_languages: string | null;
  rel_released: string | null;
  rel_resolution: string | null;
  rel_minage: number | null;
  rel_patch: number | null;
  rel_freeware: number | null;
  rel_official: number | null;
  rel_has_ero: number | null;
  bundle_id: number | null;
  bundle_name: string | null;
  bundle_member_count: number | null;
}

interface ShelfSlotDatabaseRow extends ShelfVisualDatabaseRow {
  shelf_id: number;
  row: number;
  col: number;
}

interface ShelfDisplayDatabaseRow extends ShelfVisualDatabaseRow {
  shelf_id: number;
  after_row: number;
  position: number;
  placed_at: number;
}

interface CellPlacementRow extends QueryResultRow {
  shelf_id: number;
  shelf_name: string;
  row: number;
  col: number;
}

interface DisplayPlacementRow extends QueryResultRow {
  shelf_id: number;
  shelf_name: string;
  after_row: number;
  position: number;
}

interface OccupantRow extends QueryResultRow {
  vn_id: string;
  release_id: string;
}

interface BundleDatabaseRow extends QueryResultRow {
  id: number;
  name: string;
  anchor_vn_id: string;
  anchor_release_id: string;
  created_at: number;
  updated_at: number;
}

interface BundleAnchorRow extends QueryResultRow {
  anchor_vn_id: string;
  anchor_release_id: string;
}

interface BundleMemberDatabaseRow extends PhysicalBundleMember, QueryResultRow {
  bundle_id: number;
}

interface IdRow extends QueryResultRow { id: number }
interface VnIdRow extends QueryResultRow { vn_id: string }
interface ExistsRow extends QueryResultRow { exists: number }

interface ShelfCommandExecutor {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly PostgresParameter[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
}

const VISUAL_SELECT = `
  o.vn_id, o.release_id, o.notes, o.location, o.physical_location,
  o.box_type, o.edition_label, o.condition, o.price_paid, o.currency,
  o.acquired_date, o.owned_platform, o.dumped, o.added_at,
  v.title AS vn_title, v.image_thumb AS vn_image_thumb,
  v.image_url AS vn_image_url, v.local_image_thumb AS vn_local_image_thumb,
  v.image_sexual AS vn_image_sexual, v.release_images AS vn_release_images,
  v.platforms AS vn_platforms, v.languages AS vn_languages,
  v.released AS vn_released, rm.title AS rel_title,
  rm.platforms AS rel_platforms, rm.languages AS rel_languages,
  rm.released AS rel_released, rm.resolution AS rel_resolution,
  rm.minage AS rel_minage, rm.patch AS rel_patch,
  rm.freeware AS rel_freeware, rm.official AS rel_official,
  rm.has_ero AS rel_has_ero, bundle.bundle_id, bundle.bundle_name,
  bundle.bundle_member_count
`;

const VISUAL_JOINS = `
  JOIN vn v ON v.id = o.vn_id
  LEFT JOIN release_meta_cache rm ON rm.release_id = o.release_id
  LEFT JOIN (
    SELECT b.anchor_vn_id, b.anchor_release_id, b.id AS bundle_id,
      b.name AS bundle_name, COUNT(member.vn_id)::BIGINT AS bundle_member_count
    FROM physical_bundle b
    JOIN physical_bundle_member member ON member.bundle_id = b.id
    GROUP BY b.id, b.name, b.anchor_vn_id, b.anchor_release_id
  ) bundle ON bundle.anchor_vn_id = o.vn_id
    AND bundle.anchor_release_id = o.release_id
`;

function clampShelfDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function stringArray(raw: string | null): string[] {
  return parseJsonArray(raw).filter((value): value is string => typeof value === 'string');
}

function releaseLanguages(raw: string | null): string[] {
  return parseJsonArray(raw).flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const lang = Reflect.get(value, 'lang');
    return typeof lang === 'string' ? [lang] : [];
  });
}

function releaseCover(raw: string | null, releaseId: string): {
  rel_image_thumb: string | null;
  rel_image_url: string | null;
  rel_local_image_thumb: string | null;
  rel_image_sexual: number | null;
} {
  const parsed = parseJsonArray(raw);
  const images: ReleaseImage[] = isPersistedReleaseImages(parsed) ? parsed : [];
  const matches = images.filter((image) => image.release_id === releaseId);
  const chosen = matches.find((image) => image.type === 'pkgfront')
    ?? matches.find((image) => image.type === 'pkgside')
    ?? matches.find((image) => image.type === 'pkgcontent')
    ?? matches[0]
    ?? null;
  return {
    rel_image_thumb: chosen?.thumbnail ?? chosen?.url ?? null,
    rel_image_url: chosen?.url ?? chosen?.thumbnail ?? null,
    rel_local_image_thumb: chosen?.local_thumb ?? chosen?.local ?? null,
    rel_image_sexual: chosen?.sexual ?? null,
  };
}

function bundleSummary(row: ShelfVisualDatabaseRow): PhysicalBundleSummary {
  return {
    bundle_id: row.bundle_id,
    bundle_name: row.bundle_name,
    bundle_member_count: row.bundle_member_count ?? 0,
  };
}

function mapShelfEntry(row: ShelfVisualDatabaseRow): ShelfEntry {
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
    vn_title: row.vn_title,
    vn_image_thumb: row.vn_image_thumb,
    vn_image_url: row.vn_image_url,
    vn_local_image_thumb: row.vn_local_image_thumb,
    vn_image_sexual: row.vn_image_sexual,
    ...releaseCover(row.vn_release_images, row.release_id),
    vn_platforms: stringArray(row.vn_platforms),
    vn_languages: stringArray(row.vn_languages),
    vn_released: row.vn_released,
    rel_title: row.rel_title,
    rel_platforms: stringArray(row.rel_platforms),
    rel_languages: releaseLanguages(row.rel_languages),
    rel_released: row.rel_released,
    rel_resolution: row.rel_resolution,
    rel_minage: row.rel_minage,
    rel_patch: Boolean(row.rel_patch),
    rel_freeware: Boolean(row.rel_freeware),
    rel_official: row.rel_official == null ? true : Boolean(row.rel_official),
    rel_has_ero: Boolean(row.rel_has_ero),
    ...bundleSummary(row),
  };
}

function mapSlot(row: ShelfSlotDatabaseRow): ShelfSlotEntry {
  const entry = mapShelfEntry(row);
  return {
    shelf_id: row.shelf_id,
    row: row.row,
    col: row.col,
    vn_id: entry.vn_id,
    release_id: entry.release_id,
    vn_title: entry.vn_title,
    vn_image_thumb: entry.vn_image_thumb,
    vn_image_url: entry.vn_image_url,
    vn_local_image_thumb: entry.vn_local_image_thumb,
    vn_image_sexual: entry.vn_image_sexual,
    rel_image_thumb: entry.rel_image_thumb,
    rel_image_url: entry.rel_image_url,
    rel_local_image_thumb: entry.rel_local_image_thumb,
    rel_image_sexual: entry.rel_image_sexual,
    edition_label: entry.edition_label,
    box_type: entry.box_type as BoxType,
    condition: entry.condition,
    owned_platform: entry.owned_platform,
    physical_location: entry.physical_location,
    price_paid: entry.price_paid,
    currency: entry.currency,
    acquired_date: entry.acquired_date,
    vn_platforms: entry.vn_platforms,
    vn_languages: entry.vn_languages,
    vn_released: entry.vn_released,
    rel_title: entry.rel_title,
    rel_platforms: entry.rel_platforms,
    rel_languages: entry.rel_languages,
    rel_released: entry.rel_released,
    rel_resolution: entry.rel_resolution,
    dumped: entry.dumped,
    ...bundleSummary(row),
  };
}

function mapDisplaySlot(row: ShelfDisplayDatabaseRow): ShelfDisplaySlotEntry {
  return {
    ...mapSlot({ ...row, row: row.after_row, col: row.position }),
    after_row: row.after_row,
    position: row.position,
    placed_at: row.placed_at,
  };
}

function transactionExecutor(client: PoolClient): ShelfCommandExecutor {
  return {
    async query<Row extends QueryResultRow>(text: string, values: readonly PostgresParameter[] = []) {
      const result = await client.query<Row>(text, [...values]);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
}

async function readShelf(executor: ShelfCommandExecutor, id: number, lock = false): Promise<ShelfUnit | null> {
  const result = await executor.query<ShelfDatabaseRow>(`
    SELECT id, name, cols, rows, order_index, created_at, updated_at
    FROM shelf_unit WHERE id = $1${lock ? ' FOR UPDATE' : ''}
  `, [id]);
  return result.rows[0] ?? null;
}

async function assertBundleAnchor(
  executor: ShelfCommandExecutor,
  vnId: string,
  releaseId: string,
): Promise<void> {
  const result = await executor.query<BundleAnchorRow>(`
    SELECT bundle.anchor_vn_id, bundle.anchor_release_id
    FROM physical_bundle_member member
    JOIN physical_bundle bundle ON bundle.id = member.bundle_id
    WHERE member.vn_id = $1 AND member.release_id = $2
  `, [vnId, releaseId]);
  const bundle = result.rows[0];
  if (bundle && (bundle.anchor_vn_id !== vnId || bundle.anchor_release_id !== releaseId)) {
    throw new Error('bundle members must be placed through the anchor edition');
  }
}

async function bundleMembers(
  executor: ShelfCommandExecutor,
  bundleIds: readonly number[],
): Promise<Map<number, PhysicalBundleMember[]>> {
  if (bundleIds.length === 0) return new Map();
  const result = await executor.query<BundleMemberDatabaseRow>(`
    SELECT member.bundle_id, member.vn_id, member.release_id, member.position,
      vn.title AS vn_title, owned.edition_label
    FROM physical_bundle_member member
    JOIN owned_release owned
      ON owned.vn_id = member.vn_id AND owned.release_id = member.release_id
    JOIN vn ON vn.id = member.vn_id
    WHERE member.bundle_id = ANY($1::bigint[])
    ORDER BY member.bundle_id, member.position, member.vn_id, member.release_id
  `, [bundleIds]);
  const grouped = new Map<number, PhysicalBundleMember[]>();
  for (const row of result.rows) {
    const current = grouped.get(row.bundle_id) ?? [];
    current.push({
      vn_id: row.vn_id,
      release_id: row.release_id,
      vn_title: row.vn_title,
      edition_label: row.edition_label,
      position: row.position,
    });
    grouped.set(row.bundle_id, current);
  }
  return grouped;
}

function mapBundle(row: BundleDatabaseRow, members: Map<number, PhysicalBundleMember[]>): PhysicalBundle {
  return { ...row, members: members.get(row.id) ?? [] };
}

/** Create the PostgreSQL-backed shelf repository. */
export function createPostgresShelfRepository(): ShelfRepository {
  const direct: ShelfCommandExecutor = {
    async query<Row extends QueryResultRow>(text: string, values: readonly PostgresParameter[] = []) {
      const result = await postgresQuery<Row>(text, values);
      return { rows: result.rows, rowCount: result.rowCount };
    },
  };
  return {
    async list() {
      const result = await direct.query<ShelfCountDatabaseRow>(`
        WITH placement_counts AS (
          SELECT shelf_id, SUM(count)::BIGINT AS count
          FROM (
            SELECT shelf_id, COUNT(*)::BIGINT AS count FROM shelf_slot GROUP BY shelf_id
            UNION ALL
            SELECT shelf_id, COUNT(*)::BIGINT AS count FROM shelf_display_slot GROUP BY shelf_id
          ) placements
          GROUP BY shelf_id
        )
        SELECT shelf.id, shelf.name, shelf.cols, shelf.rows, shelf.order_index,
          shelf.created_at, shelf.updated_at,
          COALESCE(placement_counts.count, 0)::BIGINT AS placed_count
        FROM shelf_unit shelf
        LEFT JOIN placement_counts ON placement_counts.shelf_id = shelf.id
        ORDER BY shelf.order_index, shelf.id
      `);
      return result.rows;
    },
    async get(id) {
      return readShelf(direct, id);
    },
    async rename(id, name) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('shelf name required');
      const result = await direct.query<ShelfDatabaseRow>(`
        UPDATE shelf_unit SET name = $1, updated_at = $2 WHERE id = $3
        RETURNING id, name, cols, rows, order_index, created_at, updated_at
      `, [trimmed, Date.now(), id]);
      return result.rows[0] ?? null;
    },
    async resize(id, cols, rows) {
      return withPostgresTransaction(async (client) => {
        const executor = transactionExecutor(client);
        const shelf = await readShelf(executor, id, true);
        if (!shelf) return null;
        const nextCols = clampShelfDimension(cols, shelf.cols);
        const nextRows = clampShelfDimension(rows, shelf.rows);
        const regular = await executor.query<{ vn_id: string; release_id: string; row: number; col: number } & QueryResultRow>(`
          SELECT vn_id, release_id, row, col FROM shelf_slot
          WHERE shelf_id = $1 AND (row >= $2 OR col >= $3)
        `, [id, nextRows, nextCols]);
        const display = await executor.query<{ vn_id: string; release_id: string; row: number; col: number } & QueryResultRow>(`
          SELECT vn_id, release_id, after_row AS row, position AS col
          FROM shelf_display_slot
          WHERE shelf_id = $1 AND (after_row > $2 OR position >= $3)
        `, [id, nextRows, nextCols]);
        await executor.query(
          'DELETE FROM shelf_slot WHERE shelf_id = $1 AND (row >= $2 OR col >= $3)',
          [id, nextRows, nextCols],
        );
        await executor.query(
          'DELETE FROM shelf_display_slot WHERE shelf_id = $1 AND (after_row > $2 OR position >= $3)',
          [id, nextRows, nextCols],
        );
        const updated = await executor.query<ShelfDatabaseRow>(`
          UPDATE shelf_unit SET cols = $1, rows = $2, updated_at = $3 WHERE id = $4
          RETURNING id, name, cols, rows, order_index, created_at, updated_at
        `, [nextCols, nextRows, Date.now(), id]);
        return {
          shelf: updated.rows[0]!,
          evicted: [...regular.rows, ...display.rows],
        };
      });
    },
    async delete(id) {
      return (await direct.query('DELETE FROM shelf_unit WHERE id = $1', [id])).rowCount! > 0;
    },
    async reorder(orderedIds) {
      await withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shelf-order', 0))");
        const now = Date.now();
        for (const [index, id] of orderedIds.entries()) {
          await client.query(
            'UPDATE shelf_unit SET order_index = $1, updated_at = $2 WHERE id = $3',
            [index, now, id],
          );
        }
      });
    },
    async listAllOwned() {
      const result = await direct.query<ShelfVisualDatabaseRow>(`
        SELECT ${VISUAL_SELECT}
        FROM owned_release o
        ${VISUAL_JOINS}
        WHERE NOT EXISTS (
          SELECT 1 FROM physical_bundle_member member
          JOIN physical_bundle physical ON physical.id = member.bundle_id
          WHERE member.vn_id = o.vn_id AND member.release_id = o.release_id
            AND (physical.anchor_vn_id <> o.vn_id OR physical.anchor_release_id <> o.release_id)
        )
        ORDER BY app_search_normalize(v.title) COLLATE "C", v.id, o.release_id
        LIMIT 50000
      `);
      return result.rows.map(mapShelfEntry);
    },
    async listUnplaced() {
      const result = await direct.query<ShelfVisualDatabaseRow>(`
        SELECT ${VISUAL_SELECT}
        FROM owned_release o
        ${VISUAL_JOINS}
        WHERE NOT EXISTS (
          SELECT 1 FROM shelf_slot slot
          WHERE slot.vn_id = o.vn_id AND slot.release_id = o.release_id
        ) AND NOT EXISTS (
          SELECT 1 FROM shelf_display_slot display
          WHERE display.vn_id = o.vn_id AND display.release_id = o.release_id
        ) AND NOT EXISTS (
          SELECT 1 FROM physical_bundle_member member
          JOIN physical_bundle physical ON physical.id = member.bundle_id
          WHERE member.vn_id = o.vn_id AND member.release_id = o.release_id
            AND (physical.anchor_vn_id <> o.vn_id OR physical.anchor_release_id <> o.release_id)
        )
        ORDER BY app_search_normalize(v.title) COLLATE "C", v.id, o.release_id
        LIMIT 5000
      `);
      return result.rows.map(mapShelfEntry);
    },
    async listSlots(shelfId) {
      const result = await direct.query<ShelfSlotDatabaseRow>(`
        SELECT slot.shelf_id, slot.row, slot.col, ${VISUAL_SELECT}
        FROM shelf_slot slot
        JOIN owned_release o ON o.vn_id = slot.vn_id AND o.release_id = slot.release_id
        ${VISUAL_JOINS}
        WHERE slot.shelf_id = $1
        ORDER BY slot.row, slot.col
      `, [shelfId]);
      return result.rows.map(mapSlot);
    },
    async listDisplaySlots(shelfId) {
      const result = await direct.query<ShelfDisplayDatabaseRow>(`
        SELECT display.shelf_id, display.after_row, display.position,
          display.placed_at, ${VISUAL_SELECT}
        FROM shelf_display_slot display
        JOIN owned_release o
          ON o.vn_id = display.vn_id AND o.release_id = display.release_id
        ${VISUAL_JOINS}
        WHERE display.shelf_id = $1
        ORDER BY display.after_row, display.position
      `, [shelfId]);
      return result.rows.map(mapDisplaySlot);
    },
    async placeItem(input) {
      if (!Number.isInteger(input.shelfId)) throw new Error('shelf id must be integer');
      if (!Number.isInteger(input.row) || !Number.isInteger(input.col)) throw new Error('row/col must be integers');
      return withPostgresTransaction(async (client) => {
        const executor = transactionExecutor(client);
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shelf-placement', 0))");
        const shelf = await readShelf(executor, input.shelfId, true);
        if (!shelf) throw new Error('shelf not found');
        if (input.row < 0 || input.row >= shelf.rows) throw new Error('row out of bounds');
        if (input.col < 0 || input.col >= shelf.cols) throw new Error('col out of bounds');
        const owned = await executor.query<ExistsRow>(
          'SELECT 1 AS exists FROM owned_release WHERE vn_id = $1 AND release_id = $2 FOR UPDATE',
          [input.vnId, input.releaseId],
        );
        if (!owned.rows[0]) throw new Error('owned edition not found');
        await assertBundleAnchor(executor, input.vnId, input.releaseId);
        const prior = await executor.query<CellPlacementRow>(`
          SELECT slot.shelf_id, shelf.name AS shelf_name, slot.row, slot.col
          FROM shelf_slot slot JOIN shelf_unit shelf ON shelf.id = slot.shelf_id
          WHERE slot.vn_id = $1 AND slot.release_id = $2 FOR UPDATE OF slot
        `, [input.vnId, input.releaseId]);
        const occupant = await executor.query<OccupantRow>(`
          SELECT vn_id, release_id FROM shelf_slot
          WHERE shelf_id = $1 AND row = $2 AND col = $3 FOR UPDATE
        `, [input.shelfId, input.row, input.col]);
        const current = occupant.rows[0];
        if (current?.vn_id === input.vnId && current.release_id === input.releaseId) {
          return { swapped: null };
        }
        await executor.query(
          'DELETE FROM shelf_slot WHERE shelf_id = $1 AND row = $2 AND col = $3',
          [input.shelfId, input.row, input.col],
        );
        await executor.query(
          'DELETE FROM shelf_slot WHERE vn_id = $1 AND release_id = $2',
          [input.vnId, input.releaseId],
        );
        await executor.query(
          'DELETE FROM shelf_display_slot WHERE vn_id = $1 AND release_id = $2',
          [input.vnId, input.releaseId],
        );
        await executor.query(`
          INSERT INTO shelf_slot (shelf_id, row, col, vn_id, release_id, placed_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [input.shelfId, input.row, input.col, input.vnId, input.releaseId, Date.now()]);
        const source = prior.rows[0];
        if (!current || !source) return { swapped: null };
        await executor.query(`
          INSERT INTO shelf_slot (shelf_id, row, col, vn_id, release_id, placed_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [source.shelf_id, source.row, source.col, current.vn_id, current.release_id, Date.now()]);
        return {
          swapped: {
            vn_id: current.vn_id,
            release_id: current.release_id,
            row: source.row,
            col: source.col,
          },
        };
      });
    },
    async placeDisplayItem(input) {
      if (!Number.isInteger(input.shelfId)) throw new Error('shelf id must be integer');
      if (!Number.isInteger(input.afterRow) || !Number.isInteger(input.position)) {
        throw new Error('after_row/position must be integers');
      }
      await withPostgresTransaction(async (client) => {
        const executor = transactionExecutor(client);
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shelf-placement', 0))");
        const shelf = await readShelf(executor, input.shelfId, true);
        if (!shelf) throw new Error('shelf not found');
        if (input.afterRow < 0 || input.afterRow > shelf.rows) throw new Error('after_row out of bounds');
        if (input.position < 0 || input.position >= shelf.cols) throw new Error('position out of bounds');
        const owned = await executor.query<ExistsRow>(
          'SELECT 1 AS exists FROM owned_release WHERE vn_id = $1 AND release_id = $2 FOR UPDATE',
          [input.vnId, input.releaseId],
        );
        if (!owned.rows[0]) throw new Error('owned edition not found');
        await assertBundleAnchor(executor, input.vnId, input.releaseId);
        await executor.query(
          'DELETE FROM shelf_slot WHERE vn_id = $1 AND release_id = $2',
          [input.vnId, input.releaseId],
        );
        await executor.query(
          'DELETE FROM shelf_display_slot WHERE vn_id = $1 AND release_id = $2',
          [input.vnId, input.releaseId],
        );
        await executor.query(
          'DELETE FROM shelf_display_slot WHERE shelf_id = $1 AND after_row = $2 AND position = $3',
          [input.shelfId, input.afterRow, input.position],
        );
        await executor.query(`
          INSERT INTO shelf_display_slot
            (shelf_id, after_row, position, vn_id, release_id, placed_at)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [input.shelfId, input.afterRow, input.position, input.vnId, input.releaseId, Date.now()]);
      });
    },
    async removePlacement(vnId, releaseId) {
      return withPostgresTransaction(async (client) => {
        const cell = await client.query(
          'DELETE FROM shelf_slot WHERE vn_id = $1 AND release_id = $2',
          [vnId, releaseId],
        );
        if ((cell.rowCount ?? 0) > 0) return true;
        const display = await client.query(
          'DELETE FROM shelf_display_slot WHERE vn_id = $1 AND release_id = $2',
          [vnId, releaseId],
        );
        return (display.rowCount ?? 0) > 0;
      });
    },
    async removeDisplayPlacement(vnId, releaseId) {
      return (await direct.query(
        'DELETE FROM shelf_display_slot WHERE vn_id = $1 AND release_id = $2',
        [vnId, releaseId],
      )).rowCount! > 0;
    },
    async getPlacement(vnId, releaseId) {
      const cell = await direct.query<CellPlacementRow>(`
        SELECT slot.shelf_id, shelf.name AS shelf_name, slot.row, slot.col
        FROM shelf_slot slot JOIN shelf_unit shelf ON shelf.id = slot.shelf_id
        WHERE slot.vn_id = $1 AND slot.release_id = $2
      `, [vnId, releaseId]);
      if (cell.rows[0]) return { kind: 'cell', ...cell.rows[0] };
      const display = await direct.query<DisplayPlacementRow>(`
        SELECT slot.shelf_id, shelf.name AS shelf_name, slot.after_row, slot.position
        FROM shelf_display_slot slot JOIN shelf_unit shelf ON shelf.id = slot.shelf_id
        WHERE slot.vn_id = $1 AND slot.release_id = $2
      `, [vnId, releaseId]);
      return display.rows[0] ? { kind: 'display', ...display.rows[0] } : null;
    },
    async listPlacedVnIds() {
      const result = await direct.query<VnIdRow>(`
        SELECT vn_id FROM shelf_slot UNION SELECT vn_id FROM shelf_display_slot
      `);
      return new Set(result.rows.map((row) => row.vn_id));
    },
    async listBundles() {
      const result = await direct.query<BundleDatabaseRow>(`
        SELECT id, name, anchor_vn_id, anchor_release_id, created_at, updated_at
        FROM physical_bundle ORDER BY app_search_normalize(name) COLLATE "C", id
      `);
      const members = await bundleMembers(direct, result.rows.map((row) => row.id));
      return result.rows.map((row) => mapBundle(row, members));
    },
    async getBundle(id) {
      const result = await direct.query<BundleDatabaseRow>(`
        SELECT id, name, anchor_vn_id, anchor_release_id, created_at, updated_at
        FROM physical_bundle WHERE id = $1
      `, [id]);
      if (!result.rows[0]) return null;
      const members = await bundleMembers(direct, [id]);
      return mapBundle(result.rows[0], members);
    },
    async createBundle(input) {
      const name = input.name.trim();
      if (!name) throw new Error('bundle name required');
      const unique = Array.from(new Map(input.members.map((member) => [
        `${member.vnId}\u0000${member.releaseId}`,
        member,
      ])).values());
      const anchorKey = `${input.anchor.vnId}\u0000${input.anchor.releaseId}`;
      if (!unique.some((member) => `${member.vnId}\u0000${member.releaseId}` === anchorKey)) {
        unique.unshift(input.anchor);
      }
      if (unique.length < 2) throw new Error('bundle requires at least two editions');
      const bundleId = await withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('physical-bundle', 0))");
        for (const member of unique) {
          const owned = await client.query<ExistsRow>(
            'SELECT 1 AS exists FROM owned_release WHERE vn_id = $1 AND release_id = $2 FOR UPDATE',
            [member.vnId, member.releaseId],
          );
          if (!owned.rows[0]) throw new Error('owned edition not found');
          const bundled = await client.query<ExistsRow>(
            'SELECT 1 AS exists FROM physical_bundle_member WHERE vn_id = $1 AND release_id = $2',
            [member.vnId, member.releaseId],
          );
          if (bundled.rows[0]) throw new Error('edition already belongs to a bundle');
        }
        const now = Date.now();
        const inserted = await client.query<IdRow>(`
          INSERT INTO physical_bundle
            (name, anchor_vn_id, anchor_release_id, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5) RETURNING id
        `, [name, input.anchor.vnId, input.anchor.releaseId, now, now]);
        const id = inserted.rows[0]!.id;
        for (const [position, member] of unique.entries()) {
          await client.query(`
            INSERT INTO physical_bundle_member (bundle_id, vn_id, release_id, position)
            VALUES ($1, $2, $3, $4)
          `, [id, member.vnId, member.releaseId, position]);
          if (`${member.vnId}\u0000${member.releaseId}` !== anchorKey) {
            await client.query(
              'DELETE FROM shelf_slot WHERE vn_id = $1 AND release_id = $2',
              [member.vnId, member.releaseId],
            );
            await client.query(
              'DELETE FROM shelf_display_slot WHERE vn_id = $1 AND release_id = $2',
              [member.vnId, member.releaseId],
            );
          }
        }
        return id;
      });
      return (await this.getBundle(bundleId))!;
    },
    async renameBundle(id, name) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('bundle name required');
      const result = await direct.query(
        'UPDATE physical_bundle SET name = $1, updated_at = $2 WHERE id = $3',
        [trimmed, Date.now(), id],
      );
      return (result.rowCount ?? 0) > 0 ? this.getBundle(id) : null;
    },
    async deleteBundle(id) {
      return (await direct.query('DELETE FROM physical_bundle WHERE id = $1', [id])).rowCount! > 0;
    },
  };
}

const sqliteRepository: ShelfRepository = {
  async list() { return (await import('@/lib/db')).listShelves(); },
  async get(id) { return (await import('@/lib/db')).getShelf(id); },
  async rename(id, name) { return (await import('@/lib/db')).renameShelf(id, name); },
  async resize(id, cols, rows) { return (await import('@/lib/db')).resizeShelf(id, cols, rows); },
  async delete(id) { return (await import('@/lib/db')).deleteShelf(id); },
  async reorder(ids) { (await import('@/lib/db')).reorderShelves([...ids]); },
  async listAllOwned() { return (await import('@/lib/db')).listAllOwnedReleases(); },
  async listUnplaced() { return (await import('@/lib/db')).listUnplacedOwnedReleases(); },
  async listSlots(id) { return (await import('@/lib/db')).listShelfSlots(id); },
  async listDisplaySlots(id) { return (await import('@/lib/db')).listShelfDisplaySlots(id); },
  async placeItem(input) { return (await import('@/lib/db')).placeShelfItem(input); },
  async placeDisplayItem(input) { (await import('@/lib/db')).placeShelfDisplayItem(input); },
  async removePlacement(vnId, releaseId) { return (await import('@/lib/db')).removeShelfPlacement(vnId, releaseId); },
  async removeDisplayPlacement(vnId, releaseId) { return (await import('@/lib/db')).removeShelfDisplayPlacement(vnId, releaseId); },
  async getPlacement(vnId, releaseId) { return (await import('@/lib/db')).getShelfPlacementForEdition(vnId, releaseId); },
  async listPlacedVnIds() { return (await import('@/lib/db')).listVnIdsOnShelf(); },
  async listBundles() { return (await import('@/lib/db')).listPhysicalBundles(); },
  async getBundle(id) { return (await import('@/lib/db')).getPhysicalBundle(id); },
  async createBundle(input) { return (await import('@/lib/db')).createPhysicalBundle(input); },
  async renameBundle(id, name) { return (await import('@/lib/db')).renamePhysicalBundle(id, name); },
  async deleteBundle(id) { return (await import('@/lib/db')).deletePhysicalBundle(id); },
};

let postgresRepository: ShelfRepository | null = null;

/** Return the shelf repository configured for the active database engine. */
export function getShelfRepository(): ShelfRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresShelfRepository();
  return postgresRepository;
}
