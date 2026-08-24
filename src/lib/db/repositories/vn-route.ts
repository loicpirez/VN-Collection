import type { QueryResultRow } from 'pg';
import type { RouteRow } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import {
  postgresQuery,
  withPostgresTransaction,
  type PostgresParameter,
} from '../postgres';

/** Mutable fields accepted by a VN route update. */
export interface RoutePatch {
  name?: string;
  completed?: boolean;
  completed_date?: string | null;
  order_index?: number;
  notes?: string | null;
}

interface RouteStorageRow extends QueryResultRow {
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

interface RouteUpdate {
  expression: string;
  value?: PostgresParameter;
}

/** Persistence boundary for one VN's ordered reading routes. */
export interface VnRouteRepository {
  /** List all routes for one VN. */
  listForVn(vnId: string): Promise<RouteRow[]>;
  /** Read one route by generated identifier. */
  get(id: number): Promise<RouteRow | null>;
  /** Patch one route and return the resulting row. */
  update(id: number, fields: RoutePatch): Promise<RouteRow | null>;
  /** Delete one route and report whether it existed. */
  delete(id: number): Promise<boolean>;
  /** Persist a partial or complete order for one VN's routes. */
  reorder(vnId: string, ids: readonly number[]): Promise<void>;
}

function decodeRoute(row: RouteStorageRow): RouteRow {
  return { ...row, completed: Boolean(row.completed) };
}

const ROUTE_COLUMNS = `
  id, vn_id, name, completed, completed_date, order_index, notes, created_at, updated_at
`;

/** Create the PostgreSQL-backed VN-route repository. */
export function createPostgresVnRouteRepository(): VnRouteRepository {
  const repository: VnRouteRepository = {
    async listForVn(vnId) {
      const result = await postgresQuery<RouteStorageRow>(`
        SELECT ${ROUTE_COLUMNS} FROM vn_route
        WHERE vn_id = $1 ORDER BY order_index, created_at, id
      `, [vnId]);
      return result.rows.map(decodeRoute);
    },
    async get(id) {
      const result = await postgresQuery<RouteStorageRow>(`
        SELECT ${ROUTE_COLUMNS} FROM vn_route WHERE id = $1
      `, [id]);
      return result.rows[0] ? decodeRoute(result.rows[0]) : null;
    },
    async update(id, fields) {
      const updates: RouteUpdate[] = [];
      if (fields.name !== undefined) updates.push({ expression: 'name', value: fields.name });
      if (fields.completed !== undefined) {
        updates.push({ expression: 'completed', value: fields.completed ? 1 : 0 });
        if (fields.completed_date === undefined) {
          updates.push(fields.completed
            ? { expression: 'completed_date = COALESCE(completed_date, CURRENT_DATE::text)' }
            : { expression: 'completed_date = NULL' });
        }
      }
      if (fields.completed_date !== undefined) {
        updates.push({ expression: 'completed_date', value: fields.completed_date });
      }
      if (fields.order_index !== undefined) updates.push({ expression: 'order_index', value: fields.order_index });
      if (fields.notes !== undefined) updates.push({ expression: 'notes', value: fields.notes });
      if (updates.length === 0) return repository.get(id);

      const values: PostgresParameter[] = [];
      const assignments = updates.map((update) => {
        if (update.value === undefined) return update.expression;
        values.push(update.value);
        return `${update.expression} = $${values.length}`;
      });
      values.push(Date.now(), id);
      const result = await postgresQuery<RouteStorageRow>(`
        UPDATE vn_route
        SET ${assignments.join(', ')}, updated_at = $${values.length - 1}
        WHERE id = $${values.length}
        RETURNING ${ROUTE_COLUMNS}
      `, values);
      return result.rows[0] ? decodeRoute(result.rows[0]) : null;
    },
    async delete(id) {
      return (await postgresQuery('DELETE FROM vn_route WHERE id = $1', [id])).rowCount === 1;
    },
    async reorder(vnId, ids) {
      const now = Date.now();
      await withPostgresTransaction(async (client) => {
        for (const [index, id] of ids.entries()) {
          await client.query(`
            UPDATE vn_route SET order_index = $1, updated_at = $2
            WHERE id = $3 AND vn_id = $4
          `, [index, now, id, vnId]);
        }
      });
    },
  };
  return repository;
}

const sqliteRepository: VnRouteRepository = {
  async listForVn(vnId) {
    return (await import('@/lib/db')).listRoutesForVn(vnId);
  },
  async get(id) {
    return (await import('@/lib/db')).getRoute(id);
  },
  async update(id, fields) {
    return (await import('@/lib/db')).updateRoute(id, fields);
  },
  async delete(id) {
    return (await import('@/lib/db')).deleteRoute(id);
  },
  async reorder(vnId, ids) {
    (await import('@/lib/db')).reorderRoutes(vnId, [...ids]);
  },
};

let postgresRepository: VnRouteRepository | null = null;

/** Return the VN-route repository selected by the configured backend. */
export function getVnRouteRepository(): VnRouteRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresVnRouteRepository();
  return postgresRepository;
}
