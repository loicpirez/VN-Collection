import type { PoolClient, QueryResultRow } from 'pg';
import type {
  ActivityEntry,
  GameLogEntry,
  PlacePayload,
  SavedFilter,
  ShelfUnit,
  UserList,
} from '@/lib/db';
import type { RouteRow, SeriesRow } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction } from '../postgres';

const GAME_LOG_NOTE_MAX = 8000;

interface IdRow extends QueryResultRow {
  id: number;
}

interface RouteDbRow extends QueryResultRow {
  id: number;
  vn_id: string;
  name: string;
  completed: number;
  completed_date: string | null;
  order_index: number;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

interface ShelfRow extends QueryResultRow, ShelfUnit {}
interface SeriesDbRow extends QueryResultRow, SeriesRow {}
interface SavedFilterRow extends QueryResultRow, SavedFilter {}
interface UserListRow extends QueryResultRow, UserList {}

/** Asynchronous persistence contract for rows whose identifier is database-generated. */
export interface GeneratedIdRepository {
  /** Append one manual collection activity and return its generated identifier. */
  addManualActivity(vnId: string, text: string, occurredAt?: number): Promise<ActivityEntry>;
  /** Append one game-log row and return its generated identifier. */
  addGameLogEntry(vnId: string, note: string, loggedAt?: number, sessionMinutes?: number | null): Promise<GameLogEntry>;
  /** Create one ordered VN route. */
  createRoute(vnId: string, name: string, orderIndex?: number): Promise<RouteRow>;
  /** Create one ordered shelf with bounded dimensions. */
  createShelf(input: { name: string; cols?: number; rows?: number }): Promise<ShelfUnit>;
  /** Create one physical place and return its generated identifier. */
  createPlace(payload: PlacePayload): Promise<number>;
  /** Create one series and return the persisted row. */
  createSeries(name: string, description?: string | null): Promise<SeriesRow>;
  /** Create one ordered saved filter. */
  createSavedFilter(name: string, params: string): Promise<SavedFilter>;
  /** Create one user list with a collision-free slug. */
  createUserList(input: { name: string; description?: string | null; color?: string | null; icon?: string | null }): Promise<UserList>;
}

function requireRow<Row>(row: Row | undefined, operation: string): Row {
  if (!row) throw new Error(`${operation} did not return a row`);
  return row;
}

function routeFromRow(row: RouteDbRow): RouteRow {
  return {
    ...row,
    completed: Boolean(row.completed),
  };
}

function clampShelfDimension(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function normalizeCoordinate(value: number | null | undefined, field: 'lat' | 'lng'): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number`);
  const limit = field === 'lat' ? 90 : 180;
  if (value < -limit || value > limit) throw new Error(`${field} must be between ${-limit} and ${limit}`);
  return value;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'list';
}

async function nextRouteOrder(client: PoolClient, vnId: string): Promise<number> {
  const result = await client.query<{ order_index: number } & QueryResultRow>(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS order_index FROM vn_route WHERE vn_id = $1',
    [vnId],
  );
  return requireRow(result.rows[0], 'route order').order_index;
}

async function nextShelfOrder(client: PoolClient): Promise<number> {
  const result = await client.query<{ order_index: number } & QueryResultRow>(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS order_index FROM shelf_unit',
  );
  return requireRow(result.rows[0], 'shelf order').order_index;
}

async function nextSavedFilterPosition(client: PoolClient): Promise<number> {
  const result = await client.query<{ position: number } & QueryResultRow>(
    'SELECT COALESCE(MAX(position), 0) + 1 AS position FROM saved_filter',
  );
  return requireRow(result.rows[0], 'saved filter position').position;
}

async function uniqueUserListSlug(client: PoolClient, base: string): Promise<string> {
  let candidate = base;
  let suffix = 2;
  while ((await client.query<IdRow>('SELECT id FROM user_list WHERE slug = $1', [candidate])).rows[0]) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

/** Create the PostgreSQL-backed generated-identifier repository. */
export function createPostgresGeneratedIdRepository(): GeneratedIdRepository {
  return {
    async addManualActivity(vnId, text, occurredAt) {
      const occurred_at = occurredAt ?? Date.now();
      const payload = { text: text.trim().slice(0, 2000) };
      const result = await postgresQuery<IdRow>(`
        INSERT INTO vn_activity (vn_id, kind, payload, occurred_at) VALUES ($1, 'manual', $2, $3)
        RETURNING id
      `, [vnId, JSON.stringify(payload), occurred_at]);
      return {
        id: requireRow(result.rows[0], 'manual activity insert').id,
        vn_id: vnId,
        kind: 'manual',
        payload,
        occurred_at,
      };
    },
    async addGameLogEntry(vnId, note, loggedAt, sessionMinutes) {
      const trimmed = note.trim().slice(0, GAME_LOG_NOTE_MAX);
      if (trimmed.length === 0) throw new Error('empty note');
      const now = Date.now();
      const logged_at = loggedAt ?? now;
      const session_minutes = sessionMinutes != null && sessionMinutes > 0 ? Math.round(sessionMinutes) : null;
      const result = await postgresQuery<IdRow>(`
        INSERT INTO vn_game_log (vn_id, note, logged_at, session_minutes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [vnId, trimmed, logged_at, session_minutes, now, now]);
      return {
        id: requireRow(result.rows[0], 'game log insert').id,
        vn_id: vnId,
        note: trimmed,
        logged_at,
        session_minutes,
        created_at: now,
        updated_at: now,
      };
    },
    async createRoute(vnId, name, orderIndex) {
      return withPostgresTransaction(async (client) => {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`vn_route:${vnId}`]);
        const order = orderIndex ?? await nextRouteOrder(client, vnId);
        const now = Date.now();
        const result = await client.query<RouteDbRow>(`
          INSERT INTO vn_route (vn_id, name, order_index, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
          RETURNING id, vn_id, name, completed, completed_date, order_index, notes, created_at, updated_at
        `, [vnId, name, order, now, now]);
        return routeFromRow(requireRow(result.rows[0], 'route insert'));
      });
    },
    async createShelf(input) {
      const name = input.name.trim();
      if (!name) throw new Error('shelf name required');
      return withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('shelf_unit:create', 0))");
        const order = await nextShelfOrder(client);
        const now = Date.now();
        const result = await client.query<ShelfRow>(`
          INSERT INTO shelf_unit (name, cols, rows, order_index, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING id, name, cols, rows, order_index, created_at, updated_at
        `, [name, clampShelfDimension(input.cols, 8), clampShelfDimension(input.rows, 4), order, now, now]);
        return requireRow(result.rows[0], 'shelf insert');
      });
    },
    async createPlace(payload) {
      const now = Date.now();
      const result = await postgresQuery<IdRow>(`
        INSERT INTO place_registry (name, name_ja, kind, address, lat, lng, url, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id
      `, [
        payload.name,
        payload.name_ja ?? null,
        payload.kind ?? 'shop',
        payload.address ?? null,
        normalizeCoordinate(payload.lat, 'lat'),
        normalizeCoordinate(payload.lng, 'lng'),
        payload.url ?? null,
        payload.notes ?? null,
        now,
        now,
      ]);
      return requireRow(result.rows[0], 'place insert').id;
    },
    async createSeries(name, description = null) {
      const now = Date.now();
      const result = await postgresQuery<SeriesDbRow>(`
        INSERT INTO series (name, description, created_at, updated_at) VALUES ($1, $2, $3, $4)
        RETURNING id, name, description, cover_path, banner_path, created_at, updated_at
      `, [name, description, now, now]);
      return requireRow(result.rows[0], 'series insert');
    },
    async createSavedFilter(name, params) {
      return withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('saved_filter:create', 0))");
        const position = await nextSavedFilterPosition(client);
        const now = Date.now();
        const result = await client.query<SavedFilterRow>(`
          INSERT INTO saved_filter (name, params, position, created_at) VALUES ($1, $2, $3, $4)
          RETURNING id, name, params, position, created_at
        `, [name.trim(), params, position, now]);
        return requireRow(result.rows[0], 'saved filter insert');
      });
    },
    async createUserList(input) {
      const name = input.name.trim().slice(0, 120);
      if (!name) throw new Error('name required');
      return withPostgresTransaction(async (client) => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended('user_list:slug', 0))");
        const slug = await uniqueUserListSlug(client, slugify(name));
        const now = Date.now();
        const result = await client.query<UserListRow>(`
          INSERT INTO user_list (name, slug, description, color, icon, pinned, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
          RETURNING id, name, slug, description, color, icon, pinned, created_at, updated_at
        `, [name, slug, input.description ?? null, input.color ?? null, input.icon ?? null, now, now]);
        return requireRow(result.rows[0], 'user list insert');
      });
    },
  };
}

const sqliteRepository: GeneratedIdRepository = {
  async addManualActivity(vnId, text, occurredAt) {
    return (await import('@/lib/db')).addManualActivity(vnId, text, occurredAt);
  },
  async addGameLogEntry(vnId, note, loggedAt, sessionMinutes) {
    return (await import('@/lib/db')).addGameLogEntry(vnId, note, loggedAt, sessionMinutes);
  },
  async createRoute(vnId, name, orderIndex) {
    const { createRoute } = await import('@/lib/db');
    return orderIndex === undefined
      ? createRoute(vnId, name)
      : createRoute(vnId, name, orderIndex);
  },
  async createShelf(input) {
    return (await import('@/lib/db')).createShelf(input);
  },
  async createPlace(payload) {
    return (await import('@/lib/db')).createPlace(payload);
  },
  async createSeries(name, description) {
    return (await import('@/lib/db')).createSeries(name, description);
  },
  async createSavedFilter(name, params) {
    return (await import('@/lib/db')).createSavedFilter(name, params);
  },
  async createUserList(input) {
    return (await import('@/lib/db')).createUserList(input);
  },
};

let postgresRepository: GeneratedIdRepository | null = null;

/** Return the configured generated-identifier repository. */
export function getGeneratedIdRepository(): GeneratedIdRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresGeneratedIdRepository();
  return postgresRepository;
}
