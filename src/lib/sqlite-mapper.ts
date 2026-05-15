import 'server-only';

/**
 * Tiny mapping helper that pairs a prepared statement with a row
 * mapper. better-sqlite3's `.all()` / `.get()` return `unknown`,
 * so every callsite in `lib/db.ts` casts the result inline. A
 * column rename or schema drift compiles fine and crashes at
 * runtime.
 *
 * Pattern:
 *
 *   const listShelves = makeQuery(
 *     'SELECT id, name, cols, rows FROM shelf_unit ORDER BY order_index',
 *     (r: { id: number; name: string; cols: number; rows: number }) => ({
 *       id: r.id, name: r.name, cols: r.cols, rows: r.rows,
 *     }),
 *   );
 *   // …
 *   const shelves = listShelves.all();
 *
 * The mapper runs per row, so the cast surface is one declared shape
 * per query instead of one cast per callsite. Migration is gradual —
 * existing inline-cast queries keep working; new ones flow through
 * this helper.
 */
import type { Database, Statement } from 'better-sqlite3';

export interface MappedQuery<Args extends unknown[], Out> {
  all(...args: Args): Out[];
  get(...args: Args): Out | undefined;
}

export function makeQuery<Row, Out, Args extends unknown[] = []>(
  db: Database,
  sql: string,
  mapper: (row: Row) => Out,
): MappedQuery<Args, Out> {
  const stmt = db.prepare(sql) as Statement<Args>;
  return {
    all(...args: Args): Out[] {
      return (stmt.all(...args) as Row[]).map(mapper);
    },
    get(...args: Args): Out | undefined {
      const row = stmt.get(...args) as Row | undefined;
      return row ? mapper(row) : undefined;
    },
  };
}
