import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalDbPath = process.env.DB_PATH;
const createdDirs: string[] = [];

function dbGlobal(): { __vndb_db?: Database.Database } {
  return globalThis as typeof globalThis & { __vndb_db?: Database.Database };
}

afterEach(() => {
  dbGlobal().__vndb_db?.close();
  delete dbGlobal().__vndb_db;
  process.env.DB_PATH = originalDbPath;
  vi.resetModules();
  for (const path of createdDirs.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe('AliceNet persisted identifier migration', () => {
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
