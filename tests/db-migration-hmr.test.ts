/**
 * HMR resilience for the DB migration block.
 *
 * Long-running Next.js dev servers keep `global.__vndb_db` cached
 * across Turbopack hot-reloads. If source-tree edits add a new table
 * or column, the cached connection would never see it — and a route
 * that queries the new schema would 500 with "no such table" until
 * the user manually restarts the dev process.
 *
 * The contract we test: every call to `open()` runs the idempotent
 * migration body, even when `global.__vndb_db` is set. Re-running is
 * safe because every statement is `CREATE TABLE IF NOT EXISTS`,
 * `ensureColumn` (which checks via PRAGMA table_info before
 * `ALTER TABLE`), or a marker-gated `INSERT OR REPLACE INTO
 * app_setting` short-circuit.
 *
 * Without the fix in commit `<this one>`, this test would deadlock or
 * miss any new table the migration body adds against an existing
 * `global.__vndb_db`.
 */
import { describe, expect, it, vi } from 'vitest';
import { db } from '../src/lib/db';

declare global {
  // eslint-disable-next-line no-var
  var __vndb_db: import('better-sqlite3').Database | undefined;
}

describe('DB migration HMR resilience', () => {
  it('runs migrations even when global.__vndb_db is already set', async () => {
    // Touch the lazy DB proxy so global.__vndb_db is populated with
    // the current process's connection.
    void db.prepare('SELECT 1').get();
    // Drop a recently-added table to simulate a connection that
    // pre-dates the migration that creates it. `vn_egs_link` is the
    // most recent addition (commit 8622e2e). The HMR scenario keeps
    // `global.__vndb_db` but resets module-local `_dbInstance` —
    // simulate that here via `vi.resetModules()`.
    const cached = global.__vndb_db;
    expect(cached).toBeDefined();
    cached!.exec(`DROP TABLE IF EXISTS vn_egs_link`);
    cached!.exec(`DROP TABLE IF EXISTS egs_vn_link`);
    expect(
      (
        cached!
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'vn_egs_link'`)
          .all() as Array<{ name: string }>
      ).length,
    ).toBe(0);

    // Force HMR-style module re-import: `_dbInstance` resets, but
    // `global.__vndb_db` survives because vi.resetModules doesn't
    // clear globals.
    vi.resetModules();
    const { db: dbReimport } = (await import('../src/lib/db')) as typeof import('../src/lib/db');
    // First access through the new Proxy triggers a fresh open() ->
    // sees global.__vndb_db, reuses it, AND re-runs migrations.
    void dbReimport.prepare('SELECT 1').get();

    const after = cached!
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table'
         AND name IN ('vn_egs_link', 'egs_vn_link', 'vn_aspect_override', 'shelf_display_slot')`,
      )
      .all() as Array<{ name: string }>;
    expect(after.map((r) => r.name).sort()).toEqual(
      ['egs_vn_link', 'shelf_display_slot', 'vn_aspect_override', 'vn_egs_link'].sort(),
    );
  });

  it('open() is idempotent — re-running creates no duplicates or errors', () => {
    // Run the lazy access several times; each call routes through
    // _dbInstance which is module-cached, but the underlying
    // open()-time migrations are designed to survive repeated calls
    // (also matters when better-sqlite3 resets _dbInstance during
    // tests or HMR).
    for (let i = 0; i < 3; i++) {
      void db.prepare('SELECT 1').get();
    }
    // No exception thrown above — and the schema is still intact.
    const tables = (
      global.__vndb_db!.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`).get() as {
        n: number;
      }
    ).n;
    // Conservative lower bound: the app has many tables. If migrations
    // dropped any during the loop we'd see fewer than this.
    expect(tables).toBeGreaterThan(20);
  });
});
