import { db } from './db';

export interface LocalColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
  dflt_value: string | null;
}

export interface LocalTableInfo {
  name: string;
  columns: LocalColumnInfo[];
}

/**
 * Enumerate every user-defined SQLite table plus its column metadata.
 * Drives the local-DB side of the `/schema` browser. Skips `sqlite_*`
 * internal tables.
 */
export function listLocalSqliteSchema(): LocalTableInfo[] {
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
       ORDER BY name COLLATE NOCASE`,
    )
    .all() as Array<{ name: string }>;
  return tables.map((table) => ({
    name: table.name,
    columns: db.prepare(`PRAGMA table_info("${table.name.replace(/"/g, '""')}")`).all() as LocalColumnInfo[],
  }));
}

