/**
 * Pin the EGS section payload surfaced on `/schema`.
 *
 * The page handler reads `getSchemaEgsSummary()` and renders one tile
 * per table. The test exercises the helper against a real per-worker
 * SQLite (set up in `tests/setup.ts`) so the row-count + fetched-at
 * shape is locked end-to-end, and a stale-while-error flag in the
 * cache body promotes the section's badge.
 */
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { db, setAppSetting } from '@/lib/db';
import { getSchemaEgsSummary } from '@/lib/schema-egs';

function reset(d: Database.Database) {
  d.exec('DELETE FROM egs_game');
  d.exec("DELETE FROM vndb_cache WHERE cache_key LIKE 'egs:%'");
  d.exec('DELETE FROM vn_egs_link');
  d.exec('DELETE FROM egs_vn_link');
  d.exec("DELETE FROM app_setting WHERE key = 'egs_username'");
}

afterEach(() => reset(db as unknown as Database.Database));

describe('getSchemaEgsSummary', () => {
  it('returns zeroes and a "username not set" flag on an empty DB', () => {
    const out = getSchemaEgsSummary();
    expect(out.tables).toHaveLength(4);
    for (const t of out.tables) expect(t.rowCount).toBe(0);
    for (const t of out.tables) expect(t.lastFetchedAt).toBeNull();
    expect(out.staleWhileError).toBe(false);
    expect(out.egsUsernameSet).toBe(false);
  });

  it('aggregates row counts + max(fetched_at) for each table', () => {
    const now = Date.now();
    // Seed two placeholder VN rows so the FK on egs_game / vn_egs_link
    // resolves. Titles are synthetic ("Title Y" / "Title Z").
    db.prepare(
      `INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
    ).run('v1001', 'Title Y', now);
    db.prepare(
      `INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
    ).run('v1002', 'Title Z', now);
    db.prepare(
      `INSERT OR IGNORE INTO vn (id, title, fetched_at) VALUES (?, ?, ?)`,
    ).run('v9000', 'Title W', now);
    db.prepare(
      `INSERT INTO egs_game (vn_id, egs_id, gamename, fetched_at) VALUES (?, ?, ?, ?)`,
    ).run('v1001', 100, 'Title Y', now - 1000);
    db.prepare(
      `INSERT INTO egs_game (vn_id, egs_id, gamename, fetched_at) VALUES (?, ?, ?, ?)`,
    ).run('v1002', 200, 'Title Z', now);

    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).run('egs:cover-resolved:100', '{}', now - 2000, now + 60000);
    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).run('egs:cover-resolved:200', '{}', now - 500, now + 60000);

    db.prepare(
      `INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('v9000', 999, '', now - 100);

    db.prepare(
      `INSERT INTO egs_vn_link (egs_id, vn_id, note, updated_at) VALUES (?, ?, ?, ?)`,
    ).run(123, 'v123', '', now - 200);

    const out = getSchemaEgsSummary();
    const eg = out.tables.find((t) => t.key === 'egs_game')!;
    const cache = out.tables.find((t) => t.key === 'vndb_cache_egs')!;
    const vnEgs = out.tables.find((t) => t.key === 'vn_egs_link')!;
    const egsVn = out.tables.find((t) => t.key === 'egs_vn_link')!;
    expect(eg.rowCount).toBe(2);
    expect(eg.lastFetchedAt).toBe(now);
    expect(cache.rowCount).toBe(2);
    expect(cache.lastFetchedAt).toBe(now - 500);
    expect(vnEgs.rowCount).toBe(1);
    expect(vnEgs.lastFetchedAt).toBe(now - 100);
    expect(egsVn.rowCount).toBe(1);
    expect(egsVn.lastFetchedAt).toBe(now - 200);
  });

  it('flips staleWhileError=true when any egs cache row carries the stale flag', () => {
    const now = Date.now();
    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, fetched_at, expires_at) VALUES (?, ?, ?, ?)`,
    ).run('egs:cover-resolved:42', '{"staleWhileError":true}', now, now + 60000);
    const out = getSchemaEgsSummary();
    expect(out.staleWhileError).toBe(true);
  });

  it('flips egsUsernameSet=true when app_setting.egs_username is populated', () => {
    setAppSetting('egs_username', 'manual-qa-placeholder');
    const out = getSchemaEgsSummary();
    expect(out.egsUsernameSet).toBe(true);
  });

  it('does not leak the egs_username VALUE — only its presence', () => {
    setAppSetting('egs_username', 'secret-uid-the-operator-pasted');
    const out = getSchemaEgsSummary();
    // The summary is shown on a localhost-gated page, but echoing the
    // value risks leaking it via screenshots / log exports. Pin the
    // contract: only the boolean.
    expect(JSON.stringify(out)).not.toContain('secret-uid');
  });
});
