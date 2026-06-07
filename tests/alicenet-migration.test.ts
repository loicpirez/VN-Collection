import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalDbPath = process.env.DB_PATH;
const originalCwd = process.cwd();
const createdDirs: string[] = [];

function dbGlobal(): { __vndb_db?: Database.Database } {
  return globalThis as typeof globalThis & { __vndb_db?: Database.Database };
}

afterEach(() => {
  dbGlobal().__vndb_db?.close();
  delete dbGlobal().__vndb_db;
  process.chdir(originalCwd);
  process.env.DB_PATH = originalDbPath;
  vi.resetModules();
  for (const path of createdDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('AliceNet persisted identifier migration', () => {
  it('uses the default relative DB path below the current working directory when DB_PATH is absent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alicenet-default-db-path-'));
    createdDirs.push(dir);
    process.chdir(dir);
    delete process.env.DB_PATH;
    const cwd = process.cwd();

    vi.resetModules();
    const mod = await import('@/lib/db');
    expect(mod.getDbPath()).toBe(`${cwd}/data/collection.db`);
    expect(mod.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'vn'`).get()).toEqual({ name: 'vn' });
  });

  it.each([
    ['plain relative', (path: string) => path],
    ['dot relative', (path: string) => `./${path}`],
  ])('opens %s DB_PATH values inside the current working directory', async (_label, toEnvPath) => {
    const dir = mkdtempSync(join(process.cwd(), '.tmp-alicenet-db-path-'));
    createdDirs.push(dir);
    const relPath = relative(process.cwd(), join(dir, 'collection.db'));
    process.env.DB_PATH = toEnvPath(relPath);

    vi.resetModules();
    const mod = await import('@/lib/db');
    expect(mod.getDbPath()).toBe(`${process.cwd()}/${relPath}`);
    expect(mod.db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = 'vn'`).get()).toEqual({ name: 'vn' });
  });

  it('keeps an existing canonical AliceNet table in place during markerless migration', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alicenet-canonical-migration-'));
    createdDirs.push(dir);
    process.env.DB_PATH = join(dir, 'collection.db');

    const seeded = new Database(process.env.DB_PATH);
    seeded.exec(`
      CREATE TABLE app_setting (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE alicenet_stock (
        code             TEXT PRIMARY KEY,
        title            TEXT NOT NULL,
        jan              TEXT,
        release_date     TEXT,
        list_price       TEXT,
        sale_price       TEXT,
        vn_id            TEXT,
        vn_match_source  TEXT,
        egs_id           INTEGER,
        egs_match_source TEXT,
        fetched_at       INTEGER NOT NULL DEFAULT 0,
        updated_at       INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO alicenet_stock (code, title, fetched_at, updated_at)
      VALUES ('333-444444-555', 'Canonical stock row', 1, 1);
    `);
    seeded.close();

    vi.resetModules();
    const mod = await import('@/lib/db');
    expect(mod.db.prepare(`SELECT title FROM alicenet_stock WHERE code = ?`).get('333-444444-555')).toEqual({
      title: 'Canonical stock row',
    });
  });

  it('promotes the oldest AliceNet table name when no newer legacy table exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alicenet-oldest-migration-'));
    createdDirs.push(dir);
    process.env.DB_PATH = join(dir, 'collection.db');

    const seeded = new Database(process.env.DB_PATH);
    seeded.exec(`
      CREATE TABLE app_setting (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE alice_kobe_stock (
        code             TEXT PRIMARY KEY,
        title            TEXT NOT NULL,
        jan              TEXT,
        release_date     TEXT,
        list_price       TEXT,
        sale_price       TEXT,
        vn_id            TEXT,
        vn_match_source  TEXT,
        egs_id           INTEGER,
        egs_match_source TEXT,
        fetched_at       INTEGER NOT NULL DEFAULT 0,
        updated_at       INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO alice_kobe_stock (code, title, fetched_at, updated_at)
      VALUES ('222-333333-444', 'Oldest stock row', 1, 1);
    `);
    seeded.close();

    vi.resetModules();
    const mod = await import('@/lib/db');
    expect(mod.db.prepare(`SELECT title FROM alicenet_stock WHERE code = ?`).get('222-333333-444')).toEqual({
      title: 'Oldest stock row',
    });
  });

  it('promotes prior table, settings, cached stock rows, and activity rows', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'alicenet-migration-'));
    createdDirs.push(dir);
    process.env.DB_PATH = join(dir, 'collection.db');

    const seeded = new Database(process.env.DB_PATH);
    seeded.exec(`
      CREATE TABLE app_setting (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO app_setting (key, value) VALUES
        ('alicesoft_kobe_proxy_config', '{"enabled":true}'),
        ('alicesoft_kobe_last_fetch', '123');
      CREATE TABLE alicesoft_kobe_stock (
        code             TEXT PRIMARY KEY,
        title            TEXT NOT NULL,
        jan              TEXT,
        release_date     TEXT,
        list_price       TEXT,
        sale_price       TEXT,
        vn_id            TEXT,
        vn_match_source  TEXT,
        egs_id           INTEGER,
        egs_match_source TEXT,
        fetched_at       INTEGER NOT NULL DEFAULT 0,
        updated_at       INTEGER NOT NULL DEFAULT 0
      );
      INSERT INTO alicesoft_kobe_stock (code, title, fetched_at, updated_at)
      VALUES ('111-222222-333', 'Prior stock row', 1, 1);
    `);
    seeded.close();

    vi.resetModules();
    const first = await import('@/lib/db');
    expect(first.db.prepare(`SELECT title FROM alicenet_stock WHERE code = ?`).get('111-222222-333')).toEqual({
      title: 'Prior stock row',
    });
    expect(first.getAppSetting('alicenet_proxy_config')).toBe('{"enabled":true}');
    expect(first.getAppSetting('alicenet_last_fetch')).toBe('123');

    first.db.prepare(`
      INSERT INTO vn_stock_offer (
        vn_id, provider, provider_offer_id, source, title, url, availability,
        availability_label, fetched_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('v90001', 'alicesoft_kobe', 'prior-offer', 'alicesoft_kobe', 'Prior offer', 'https://example.com', 'in_stock', 'alicesoft_kobe_stock', 1, 1);
    first.db.prepare(`
      INSERT INTO vn_stock_provider_status (vn_id, provider, status, fetched_at)
      VALUES (?, ?, ?, ?)
    `).run('v90001', 'alicesoft_kobe', 'ok', 1);
    first.db.prepare(`
      INSERT INTO vn_stock_source (vn_id, provider, url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run('v90001', 'alicesoft_kobe', 'https://example.com', 1, 1);
    first.db.prepare(`
      INSERT INTO user_activity (occurred_at, kind, entity, entity_id)
      VALUES (?, ?, ?, ?)
    `).run(1, 'kobe.link', 'alicesoft_kobe_stock', '111-222222-333');
    first.db.prepare(`DELETE FROM app_setting WHERE key = 'migration_alicenet_persisted_ids_v1'`).run();

    vi.resetModules();
    const second = await import('@/lib/db');
    expect(second.db.prepare(`SELECT provider, source, availability_label FROM vn_stock_offer`).get()).toEqual({
      provider: 'alicenet',
      source: 'alicenet',
      availability_label: 'alicenet_stock',
    });
    expect(second.db.prepare(`SELECT provider FROM vn_stock_provider_status`).get()).toEqual({ provider: 'alicenet' });
    expect(second.db.prepare(`SELECT provider FROM vn_stock_source`).get()).toEqual({ provider: 'alicenet' });
    expect(second.db.prepare(`SELECT kind, entity FROM user_activity`).get()).toEqual({
      kind: 'alicenet.link',
      entity: 'alicenet_stock',
    });
  });
});
