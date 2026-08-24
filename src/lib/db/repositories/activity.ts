import type { QueryResultRow } from 'pg';
import type { ActivityEntry, DailyCount, RecentActivityEntry } from '@/lib/db';
import { postgresContainsPattern } from '../postgres-search';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

/** One user-visible mutation recorded in the global audit feed. */
export interface UserActivity {
  id: number;
  occurred_at: number;
  kind: string;
  entity: string | null;
  entity_id: string | null;
  label: string | null;
  payload: string | null;
  actor: string;
}

/** Filters accepted by the global audit feed. */
export interface UserActivityListOptions {
  limit?: number;
  kind?: string | null;
  entity?: string | null;
  q?: string | null;
  from?: number | null;
  to?: number | null;
}

/** Sanitized global activity row ready for persistence. */
export interface PreparedUserActivity {
  occurredAt: number;
  kind: string;
  entity: string | null;
  entityId: string | null;
  label: string | null;
  payload: string | null;
  actor: string;
}

/** Asynchronous persistence contract for global and per-VN activity. */
export interface ActivityRepository {
  /** Persist one already-sanitized global activity row. */
  record(input: PreparedUserActivity): Promise<void>;
  /** List global activity with bounded optional filters. */
  listUser(options?: UserActivityListOptions): Promise<UserActivity[]>;
  /** List distinct global activity kinds. */
  listKinds(): Promise<string[]>;
  /** List recent activity for one VN. */
  listForVn(vnId: string, limit?: number): Promise<ActivityEntry[]>;
  /** List recent activity across all VNs. */
  listRecent(limit?: number): Promise<RecentActivityEntry[]>;
  /** Delete one activity row only when it belongs to the requested VN. */
  deleteForVn(id: number, vnId: string): Promise<boolean>;
  /** Count per-VN activity by UTC calendar day for one year. */
  heatmap(year: number): Promise<DailyCount[]>;
}

interface UserActivityRow extends QueryResultRow, UserActivity {}

interface KindRow extends QueryResultRow {
  kind: string;
}

interface ActivityRow extends QueryResultRow {
  id: number;
  vn_id: string;
  kind: ActivityEntry['kind'];
  payload: string | null;
  occurred_at: number;
}

interface RecentActivityRow extends ActivityRow {
  title: string | null;
}

interface DailyCountRow extends QueryResultRow {
  day: string;
  count: number;
}

function boundedLimit(limit: number | undefined, fallback: number, maximum = 500): number {
  const value = limit ?? fallback;
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(maximum, Math.floor(value)));
}

function parsePayload(payload: string | null): Record<string, unknown> | null {
  if (!payload) return null;
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function activityFromRow(row: ActivityRow): ActivityEntry {
  return {
    id: row.id,
    vn_id: row.vn_id,
    kind: row.kind,
    payload: parsePayload(row.payload),
    occurred_at: row.occurred_at,
  };
}

/** Create the PostgreSQL-backed activity repository. */
export function createPostgresActivityRepository(): ActivityRepository {
  return {
    async record(input) {
      await postgresQuery(`
        INSERT INTO user_activity (occurred_at, kind, entity, entity_id, label, payload, actor)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        input.occurredAt,
        input.kind,
        input.entity,
        input.entityId,
        input.label,
        input.payload,
        input.actor,
      ]);
    },
    async listUser(options = {}) {
      const where: string[] = [];
      const values: Array<string | number> = [];
      const parameter = (value: string | number): string => {
        values.push(value);
        return `$${values.length}`;
      };
      if (options.kind) where.push(`kind = ${parameter(options.kind)}`);
      if (options.entity) where.push(`entity = ${parameter(options.entity)}`);
      if (options.q) {
        const pattern = parameter(postgresContainsPattern(options.q));
        where.push(`(
          app_search_normalize(COALESCE(label, '')) LIKE ${pattern} ESCAPE '\\'
          OR app_search_normalize(COALESCE(entity_id, '')) LIKE ${pattern} ESCAPE '\\'
          OR app_search_normalize(COALESCE(payload, '')) LIKE ${pattern} ESCAPE '\\'
        )`);
      }
      if (options.from != null) where.push(`occurred_at >= ${parameter(options.from)}`);
      if (options.to != null) where.push(`occurred_at <= ${parameter(options.to)}`);
      const limit = parameter(boundedLimit(options.limit, 100));
      const result = await postgresQuery<UserActivityRow>(`
        SELECT id, occurred_at, kind, entity, entity_id, label, payload, actor
        FROM user_activity
        ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY occurred_at DESC, id DESC
        LIMIT ${limit}
      `, values);
      return result.rows;
    },
    async listKinds() {
      const result = await postgresQuery<KindRow>(`
        SELECT kind FROM (SELECT DISTINCT kind FROM user_activity) activity_kind
        ORDER BY kind COLLATE "C"
      `);
      return result.rows.map((row) => row.kind);
    },
    async listForVn(vnId, limit) {
      const result = await postgresQuery<ActivityRow>(`
        SELECT id, vn_id, kind, payload, occurred_at
        FROM vn_activity
        WHERE vn_id = $1
        ORDER BY occurred_at DESC, id DESC
        LIMIT $2
      `, [vnId, boundedLimit(limit, 50)]);
      return result.rows.map(activityFromRow);
    },
    async listRecent(limit) {
      const result = await postgresQuery<RecentActivityRow>(`
        SELECT activity.id, activity.vn_id, activity.kind, activity.payload,
          activity.occurred_at, vn.title
        FROM vn_activity activity
        LEFT JOIN vn ON vn.id = activity.vn_id
        ORDER BY activity.occurred_at DESC, activity.id DESC
        LIMIT $1
      `, [boundedLimit(limit, 10)]);
      return result.rows.map((row) => ({
        ...activityFromRow(row),
        title: row.title ?? row.vn_id,
      }));
    },
    async deleteForVn(id, vnId) {
      const result = await postgresQuery(
        'DELETE FROM vn_activity WHERE id = $1 AND vn_id = $2',
        [id, vnId],
      );
      return result.rowCount !== null && result.rowCount > 0;
    },
    async heatmap(year) {
      const start = new Date(`${year}-01-01T00:00:00Z`).getTime();
      const end = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
      const result = await postgresQuery<DailyCountRow>(`
        SELECT TO_CHAR(
          TO_TIMESTAMP(occurred_at / 1000.0) AT TIME ZONE 'UTC',
          'YYYY-MM-DD'
        ) AS day, COUNT(*)::int AS count
        FROM vn_activity
        WHERE occurred_at >= $1 AND occurred_at < $2
        GROUP BY day
        ORDER BY day
      `, [start, end]);
      return result.rows;
    },
  };
}

const sqliteRepository: ActivityRepository = {
  async record(input) {
    const { db } = await import('@/lib/db');
    db.prepare(`
      INSERT INTO user_activity (occurred_at, kind, entity, entity_id, label, payload, actor)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.occurredAt,
      input.kind,
      input.entity,
      input.entityId,
      input.label,
      input.payload,
      input.actor,
    );
  },
  async listUser(options) {
    const { listUserActivitySqlite } = await import('@/lib/activity');
    return listUserActivitySqlite(options);
  },
  async listKinds() {
    const { listActivityKindsSqlite } = await import('@/lib/activity');
    return listActivityKindsSqlite();
  },
  async listForVn(vnId, limit) {
    return (await import('@/lib/db')).listActivityForVn(vnId, limit);
  },
  async listRecent(limit) {
    return (await import('@/lib/db')).listRecentActivity(limit);
  },
  async deleteForVn(id, vnId) {
    return (await import('@/lib/db')).deleteActivityForVn(id, vnId);
  },
  async heatmap(year) {
    return (await import('@/lib/db')).activityHeatmap(year);
  },
};

let postgresRepository: ActivityRepository | null = null;

/** Return the activity repository for the configured database backend. */
export function getActivityRepository(): ActivityRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresActivityRepository();
  return postgresRepository;
}
