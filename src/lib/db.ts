import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  STATUSES,
  EDITION_TYPES,
  LOCATIONS,
  BOX_TYPES,
  type BoxType,
  type CollectionFields,
  type CollectionItem,
  type EditionType,
  type Location,
  type ProducerRow,
  type ProducerStat,
  type ReleaseImage,
  type RouteRow,
  type Screenshot,
  type SeriesLite,
  type SeriesRow,
  type SeriesWithVns,
  type Stats,
  type Status,
} from './types';
import { pushStatusToVndb } from './vndb-sync';

const DB_PATH = resolve(process.cwd(), process.env.DB_PATH || './data/collection.db');
mkdirSync(dirname(DB_PATH), { recursive: true });

declare global {
  // eslint-disable-next-line no-var
  var __vndb_db: Database.Database | undefined;
}

interface ColInfo {
  name: string;
}

function ensureColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as ColInfo[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function open(): Database.Database {
  if (global.__vndb_db) return global.__vndb_db;
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS vn (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      alttitle        TEXT,
      image_url       TEXT,
      image_thumb     TEXT,
      released        TEXT,
      olang           TEXT,
      languages       TEXT,
      platforms       TEXT,
      length_minutes  INTEGER,
      length          INTEGER,
      rating          REAL,
      votecount       INTEGER,
      description     TEXT,
      developers      TEXT,
      tags            TEXT,
      raw             TEXT,
      fetched_at      INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS collection (
      vn_id            TEXT PRIMARY KEY REFERENCES vn(id) ON DELETE CASCADE,
      status           TEXT NOT NULL DEFAULT 'planning',
      user_rating      INTEGER,
      playtime_minutes INTEGER NOT NULL DEFAULT 0,
      started_date     TEXT,
      finished_date    TEXT,
      notes            TEXT,
      favorite         INTEGER NOT NULL DEFAULT 0,
      added_at         INTEGER NOT NULL,
      updated_at       INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_collection_status ON collection(status);
    CREATE INDEX IF NOT EXISTS idx_collection_updated ON collection(updated_at DESC);

    CREATE TABLE IF NOT EXISTS producer (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      original    TEXT,
      lang        TEXT,
      type        TEXT,
      description TEXT,
      aliases     TEXT,
      extlinks    TEXT,
      logo_path   TEXT,
      fetched_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT,
      cover_path  TEXT,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS series_vn (
      series_id   INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
      vn_id       TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      order_index INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (series_id, vn_id)
    );
    CREATE INDEX IF NOT EXISTS idx_series_vn_vn ON series_vn(vn_id);

    CREATE TABLE IF NOT EXISTS owned_release (
      vn_id      TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      release_id TEXT NOT NULL,
      notes      TEXT,
      added_at   INTEGER NOT NULL,
      PRIMARY KEY (vn_id, release_id)
    );
    CREATE INDEX IF NOT EXISTS idx_owned_release_release ON owned_release(release_id);

    CREATE TABLE IF NOT EXISTS vn_route (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      vn_id          TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      name           TEXT NOT NULL,
      completed      INTEGER NOT NULL DEFAULT 0,
      completed_date TEXT,
      order_index    INTEGER NOT NULL DEFAULT 0,
      notes          TEXT,
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vn_route_vn ON vn_route(vn_id, order_index);

    CREATE TABLE IF NOT EXISTS vndb_cache (
      cache_key     TEXT PRIMARY KEY,
      body          TEXT NOT NULL,
      etag          TEXT,
      last_modified TEXT,
      fetched_at    INTEGER NOT NULL,
      expires_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vndb_cache_expires ON vndb_cache(expires_at);

    CREATE TABLE IF NOT EXISTS character_image (
      char_id    TEXT PRIMARY KEY,
      url        TEXT,
      local_path TEXT,
      fetched_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vn_quote (
      quote_id        TEXT PRIMARY KEY,
      vn_id           TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      quote           TEXT NOT NULL,
      score           INTEGER NOT NULL DEFAULT 0,
      character_id    TEXT,
      character_name  TEXT,
      fetched_at      INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vn_quote_vn ON vn_quote(vn_id);

    CREATE TABLE IF NOT EXISTS app_setting (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS egs_game (
      vn_id      TEXT PRIMARY KEY REFERENCES vn(id) ON DELETE CASCADE,
      egs_id     INTEGER,
      gamename   TEXT,
      median     REAL,
      average    REAL,
      dispersion REAL,
      count      INTEGER,
      sellday    TEXT,
      playtime_median_minutes INTEGER,
      source     TEXT,
      fetched_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_egs_game_median ON egs_game(median);

    CREATE TABLE IF NOT EXISTS vn_staff_credit (
      vn_id    TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      sid      TEXT NOT NULL,
      aid      INTEGER,
      eid      INTEGER,
      role     TEXT NOT NULL,
      note     TEXT,
      name     TEXT NOT NULL,
      original TEXT,
      lang     TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vn_staff_credit_sid ON vn_staff_credit(sid);
    CREATE INDEX IF NOT EXISTS idx_vn_staff_credit_vn  ON vn_staff_credit(vn_id);

    CREATE TABLE IF NOT EXISTS vn_va_credit (
      vn_id       TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      sid         TEXT NOT NULL,
      aid         INTEGER,
      c_id        TEXT NOT NULL,
      c_name      TEXT NOT NULL,
      c_original  TEXT,
      c_image_url TEXT,
      va_name     TEXT NOT NULL,
      va_original TEXT,
      va_lang     TEXT,
      note        TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vn_va_credit_sid ON vn_va_credit(sid);
    CREATE INDEX IF NOT EXISTS idx_vn_va_credit_cid ON vn_va_credit(c_id);
    CREATE INDEX IF NOT EXISTS idx_vn_va_credit_vn  ON vn_va_credit(vn_id);

    CREATE TABLE IF NOT EXISTS vn_activity (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      vn_id       TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      kind        TEXT NOT NULL,
      payload     TEXT,
      occurred_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vn_activity_vn ON vn_activity(vn_id, occurred_at DESC);

    CREATE TABLE IF NOT EXISTS vn_game_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      vn_id        TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
      note         TEXT NOT NULL,
      logged_at    INTEGER NOT NULL,
      session_minutes INTEGER,
      created_at   INTEGER NOT NULL,
      updated_at   INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vn_game_log_vn ON vn_game_log(vn_id, logged_at DESC);

    CREATE TABLE IF NOT EXISTS user_list (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      description TEXT,
      color       TEXT,
      icon        TEXT,
      pinned      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_list_pinned ON user_list(pinned DESC, updated_at DESC);

    CREATE TABLE IF NOT EXISTS user_list_vn (
      list_id     INTEGER NOT NULL REFERENCES user_list(id) ON DELETE CASCADE,
      vn_id       TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      added_at    INTEGER NOT NULL,
      note        TEXT,
      PRIMARY KEY (list_id, vn_id)
    );
    CREATE INDEX IF NOT EXISTS idx_user_list_vn_vn   ON user_list_vn(vn_id);
    CREATE INDEX IF NOT EXISTS idx_user_list_vn_list ON user_list_vn(list_id, order_index);

    CREATE TABLE IF NOT EXISTS saved_filter (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      name     TEXT NOT NULL,
      params   TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_queue (
      vn_id    TEXT PRIMARY KEY REFERENCES vn(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      added_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_goal (
      year   INTEGER PRIMARY KEY,
      target INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS steam_link (
      vn_id      TEXT PRIMARY KEY REFERENCES vn(id) ON DELETE CASCADE,
      appid      INTEGER NOT NULL,
      steam_name TEXT NOT NULL,
      /** 'auto' = derived from VNDB release extlinks, 'manual' = user-set. */
      source     TEXT NOT NULL DEFAULT 'manual',
      last_synced_minutes INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_steam_link_appid ON steam_link(appid);

    -- Physical shelf units: a named row × column grid the user lays out
    -- in /shelf?view=layout. Each owned edition can occupy one slot.
    CREATE TABLE IF NOT EXISTS shelf_unit (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      cols        INTEGER NOT NULL DEFAULT 8,
      rows        INTEGER NOT NULL DEFAULT 4,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    -- Sparse placement table: a row exists only for occupied slots.
    -- UNIQUE on (vn_id, release_id) enforces "one slot per edition";
    -- the composite PK enforces "one edition per slot".
    CREATE TABLE IF NOT EXISTS shelf_slot (
      shelf_id   INTEGER NOT NULL REFERENCES shelf_unit(id) ON DELETE CASCADE,
      row        INTEGER NOT NULL,
      col        INTEGER NOT NULL,
      vn_id      TEXT NOT NULL,
      release_id TEXT NOT NULL,
      placed_at  INTEGER NOT NULL,
      PRIMARY KEY (shelf_id, row, col),
      UNIQUE (vn_id, release_id),
      FOREIGN KEY (vn_id, release_id) REFERENCES owned_release(vn_id, release_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_shelf_slot_item ON shelf_slot(vn_id, release_id);
  `);

  ensureColumn(db, 'vn', 'screenshots', 'TEXT');
  ensureColumn(db, 'vn', 'image_sexual', 'REAL');
  ensureColumn(db, 'vn', 'image_violence', 'REAL');
  ensureColumn(db, 'vn', 'local_image', 'TEXT');
  ensureColumn(db, 'vn', 'local_image_thumb', 'TEXT');
  ensureColumn(db, 'vn', 'custom_cover', 'TEXT');
  ensureColumn(db, 'vn', 'release_images', 'TEXT');
  ensureColumn(db, 'vn', 'banner_image', 'TEXT');
  ensureColumn(db, 'vn', 'banner_position', 'TEXT');
  ensureColumn(db, 'vn', 'relations', 'TEXT');
  // Publishers (JSON [{id, name}]) — distinct from `developers`. VNDB's
  // `/vn` endpoint only carries the developer role; publishers live on
  // each release's `producers[]` entry with `publisher = true`. We
  // aggregate + dedupe across releases at fetch time and persist here.
  ensureColumn(db, 'vn', 'publishers', 'TEXT');
  ensureColumn(db, 'vn', 'aliases', 'TEXT'); // JSON array of strings
  ensureColumn(db, 'vn', 'extlinks', 'TEXT'); // JSON [{url,label,name}]
  ensureColumn(db, 'vn', 'length_votes', 'INTEGER');
  ensureColumn(db, 'vn', 'average', 'REAL'); // raw vote average (vs Bayesian `rating`)
  ensureColumn(db, 'vn', 'has_anime', 'INTEGER'); // boolean 0/1/NULL
  ensureColumn(db, 'vn', 'devstatus', 'INTEGER'); // 0=Finished, 1=In development, 2=Cancelled
  ensureColumn(db, 'vn', 'titles', 'TEXT'); // JSON [{lang,title,latin,official,main}]
  ensureColumn(db, 'vn', 'editions', 'TEXT'); // JSON [{eid,lang,name,official}]
  ensureColumn(db, 'vn', 'staff', 'TEXT'); // JSON [{eid,role,note,id,aid,name,original,lang}]
  ensureColumn(db, 'vn', 'va', 'TEXT'); // JSON [{note,character,staff}]
  ensureColumn(db, 'collection', 'location', "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, 'collection', 'edition_type', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'collection', 'edition_label', 'TEXT');
  ensureColumn(db, 'collection', 'physical_location', 'TEXT');
  ensureColumn(db, 'collection', 'box_type', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'collection', 'download_url', 'TEXT');
  ensureColumn(db, 'collection', 'dumped', 'INTEGER NOT NULL DEFAULT 0');
  // User-authored synopsis — overrides VNDB / EGS when non-null. Persists
  // VNDB BBCode / Markdown verbatim; the renderer strips formatting.
  ensureColumn(db, 'collection', 'custom_description', 'TEXT');
  // 0 means "unset" — when the user uses the custom sort, all 0s fall to the
  // bottom and the manually-ordered VNs float to the top. Set when the user
  // drags an item; reset to 0 on collection removal.
  ensureColumn(db, 'collection', 'custom_order', 'INTEGER NOT NULL DEFAULT 0');

  ensureColumn(db, 'owned_release', 'location', "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, 'owned_release', 'physical_location', 'TEXT');
  ensureColumn(db, 'owned_release', 'box_type', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'owned_release', 'edition_label', 'TEXT');
  ensureColumn(db, 'owned_release', 'condition', 'TEXT');
  ensureColumn(db, 'owned_release', 'price_paid', 'REAL');
  ensureColumn(db, 'owned_release', 'currency', 'TEXT');
  ensureColumn(db, 'owned_release', 'acquired_date', 'TEXT');
  // Where the edition was purchased (store name, URL, second-hand source).
  // Free text — pairs with `acquired_date` for full provenance.
  ensureColumn(db, 'owned_release', 'purchase_place', 'TEXT');
  ensureColumn(db, 'owned_release', 'dumped', 'INTEGER NOT NULL DEFAULT 0');

  // Richer EGS payload — added incrementally, all nullable so old rows are fine.
  ensureColumn(db, 'egs_game', 'gamename_furigana', 'TEXT');
  ensureColumn(db, 'egs_game', 'brand_id', 'INTEGER');
  ensureColumn(db, 'egs_game', 'brand_name', 'TEXT');
  ensureColumn(db, 'egs_game', 'model', 'TEXT');
  ensureColumn(db, 'egs_game', 'description', 'TEXT');
  ensureColumn(db, 'egs_game', 'image_url', 'TEXT');
  ensureColumn(db, 'egs_game', 'local_image', 'TEXT');
  ensureColumn(db, 'egs_game', 'okazu', 'INTEGER');
  ensureColumn(db, 'egs_game', 'erogame', 'INTEGER');
  ensureColumn(db, 'egs_game', 'raw_json', 'TEXT');

  // Per-VN preference for which side wins for each field. Stored as JSON,
  // e.g. {"description":"egs","image":"vndb"}. Missing keys = 'auto' (fallback).
  ensureColumn(db, 'collection', 'source_pref', 'TEXT');

  // Mark VNs that came from EGS (no VNDB id available) so we can skip
  // VNDB-only operations gracefully.
  ensureColumn(db, 'vn', 'egs_only', 'INTEGER NOT NULL DEFAULT 0');

  // Legacy migration: physical_location used to be a free-form string.
  // Convert any non-JSON value into a JSON array (split on commas).
  const legacy = db
    .prepare(`SELECT vn_id, physical_location FROM collection WHERE physical_location IS NOT NULL AND NOT json_valid(physical_location)`)
    .all() as { vn_id: string; physical_location: string }[];
  for (const r of legacy) {
    const parts = r.physical_location.split(',').map((s) => s.trim()).filter(Boolean);
    db.prepare(`UPDATE collection SET physical_location = ? WHERE vn_id = ?`).run(
      parts.length ? JSON.stringify(parts) : null,
      r.vn_id,
    );
  }

  // Legacy migration: EGS-only synthetic ids used `egs:NNN` (colon). The
  // colon breaks Next.js' dynamic-route matcher — a request for /vn/egs:894
  // arrives at the server as `params.id = 'egs%3A894'`, which fails the
  // /^egs_\d+$/ check and triggers a 404. Convert every reference to use an
  // underscore. Runs once and is idempotent.
  const legacyEgs = db
    .prepare(`SELECT id FROM vn WHERE id LIKE 'egs:%'`)
    .all() as { id: string }[];
  if (legacyEgs.length > 0) {
    const fix = db.transaction(() => {
      for (const { id } of legacyEgs) {
        const fixed = `egs_${id.slice(4)}`;
        db.prepare('UPDATE vn SET id = ? WHERE id = ?').run(fixed, id);
        // FKs aren't ON UPDATE CASCADE in the legacy schema, so update each side.
        db.prepare('UPDATE collection SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE egs_game SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE vn_quote SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE owned_release SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE vn_route SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE series_vn SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
      }
    });
    db.pragma('foreign_keys = OFF');
    try {
      fix();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // Legacy migration: `egs_game.playtime_median_minutes` used to store the
  // raw value from EGS (which is in HOURS, not minutes). Fix by ×60. Marker
  // stored in app_setting so this runs at most once.
  //
  // Defensive cap: only multiply rows where the existing value is at most
  // ~50 000 (any real EGS median is < 1 000 hours, so a value bigger than
  // that has already been migrated and must NOT be multiplied again — even
  // if the marker check above somehow misses).
  const migrated = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'egs_playtime_hours_to_minutes_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (migrated !== '1') {
    db.transaction(() => {
      db.prepare(`
        UPDATE egs_game
        SET playtime_median_minutes = playtime_median_minutes * 60
        WHERE playtime_median_minutes IS NOT NULL
          AND playtime_median_minutes <= 50000
      `).run();
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('egs_playtime_hours_to_minutes_v1', '1')`).run();
    })();
  }

  // Allow custom banner per series — added incrementally so existing rows are fine.
  ensureColumn(db, 'series', 'banner_path', 'TEXT');

  // Migration: rewrite EGS cover URLs to point at the resolver endpoint
  // (/api/egs-cover/{egs_id}) instead of hardcoded DMM / Suruga-ya / image.php
  // URLs. The resolver picks the right source per game by reading og:image
  // from the upstream product page. Idempotent — gated by an app_setting key.
  const coversMigrated = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'egs_cover_resolver_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (coversMigrated !== '1') {
    db.transaction(() => {
      db.prepare(`
        UPDATE egs_game
        SET image_url = '/api/egs-cover/' || egs_id
        WHERE egs_id IS NOT NULL
      `).run();
      db.prepare(`
        UPDATE vn
        SET image_url = '/api/egs-cover/' || substr(id, 5)
        WHERE id LIKE 'egs_%'
      `).run();
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('egs_cover_resolver_v1', '1')`).run();
    })();
  }

  // Backfill vn_staff_credit / vn_va_credit from each row's JSON staff/va
  // payloads. One-shot migration, gated by an app_setting marker.
  const creditsBackfilled = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'staff_va_credits_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (creditsBackfilled !== '1') {
    const rows = db.prepare(`SELECT id, staff, va FROM vn WHERE staff IS NOT NULL OR va IS NOT NULL`).all() as { id: string; staff: string | null; va: string | null }[];
    const delStaff = db.prepare('DELETE FROM vn_staff_credit WHERE vn_id = ?');
    const delVa = db.prepare('DELETE FROM vn_va_credit WHERE vn_id = ?');
    const insStaff = db.prepare(`
      INSERT INTO vn_staff_credit (vn_id, sid, aid, eid, role, note, name, original, lang)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insVa = db.prepare(`
      INSERT INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const r of rows) {
        delStaff.run(r.id);
        delVa.run(r.id);
        let staff: StaffEntry[] = [];
        let va: VaEntry[] = [];
        try { staff = r.staff ? (JSON.parse(r.staff) as StaffEntry[]) : []; } catch { staff = []; }
        try { va = r.va ? (JSON.parse(r.va) as VaEntry[]) : []; } catch { va = []; }
        for (const s of staff) {
          if (!s?.id || !s.name) continue;
          insStaff.run(r.id, s.id, s.aid ?? null, s.eid ?? null, s.role ?? '', s.note ?? null, s.name, s.original ?? null, s.lang ?? null);
        }
        for (const v of va) {
          if (!v?.staff?.id || !v.character?.id || !v.character.name || !v.staff.name) continue;
          insVa.run(
            r.id,
            v.staff.id,
            v.staff.aid ?? null,
            v.character.id,
            v.character.name,
            v.character.original ?? null,
            v.character.image?.url ?? null,
            v.staff.name,
            v.staff.original ?? null,
            v.staff.lang ?? null,
            v.note ?? null,
          );
        }
      }
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('staff_va_credits_v1', '1')`).run();
    })();
  }

  global.__vndb_db = db;
  return db;
}

export const db = open();

function parsePlaces(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
  } catch {
    // legacy CSV
  }
  return s.split(',').map((p) => p.trim()).filter(Boolean);
}

function serializePlaces(value: unknown): string | null {
  if (value == null) return null;
  const arr = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const cleaned = arr
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v): v is string => v.length > 0)
    .slice(0, 32)
    .map((v) => v.slice(0, 200));
  return cleaned.length ? JSON.stringify(cleaned) : null;
}

export interface RawVnPayload {
  id: string;
  title: string;
  alttitle?: string | null;
  aliases?: string[];
  titles?: { lang: string; title: string; latin: string | null; official: boolean; main: boolean }[];
  released?: string | null;
  olang?: string | null;
  devstatus?: 0 | 1 | 2 | null;
  languages?: string[];
  platforms?: string[];
  length_minutes?: number | null;
  length?: number | null;
  length_votes?: number | null;
  rating?: number | null;
  votecount?: number | null;
  average?: number | null;
  description?: string | null;
  image?: { url?: string; thumbnail?: string; sexual?: number; violence?: number; dims?: [number, number] } | null;
  extlinks?: { url: string; label: string; name: string }[];
  has_anime?: boolean | null;
  editions?: { eid: number; lang: string | null; name: string; official: boolean }[];
  staff?: unknown[]; // forwarded verbatim — typed in vndb.ts
  va?: unknown[];
  developers?: { id: string; name: string }[];
  tags?: { id: string; name: string; rating: number; spoiler: number; lie?: boolean; category?: 'cont' | 'ero' | 'tech' | null }[];
  screenshots?: Screenshot[];
  relations?: {
    id: string;
    title: string;
    alttitle?: string | null;
    released?: string | null;
    rating?: number | null;
    votecount?: number | null;
    length_minutes?: number | null;
    languages?: string[];
    platforms?: string[];
    developers?: { id?: string; name: string }[];
    image?: { url?: string; thumbnail?: string; sexual?: number } | null;
    relation: string;
    relation_official: boolean;
  }[];
}

interface StaffEntry {
  eid?: number | null;
  role?: string;
  note?: string | null;
  id?: string;
  aid?: number;
  name?: string;
  original?: string | null;
  lang?: string | null;
}

interface VaEntry {
  note?: string | null;
  character?: {
    id?: string;
    name?: string;
    original?: string | null;
    image?: { url?: string } | null;
  } | null;
  staff?: {
    id?: string;
    aid?: number;
    name?: string;
    original?: string | null;
    lang?: string | null;
  } | null;
}

const upsertVnTx = db.transaction((vn: RawVnPayload) => {
  db.prepare(`
    INSERT INTO vn (id, title, alttitle, image_url, image_thumb, image_sexual, image_violence,
                    released, olang, devstatus, titles, languages, platforms, length_minutes, length, length_votes, rating, votecount, average,
                    description, developers, tags, screenshots, relations, aliases, extlinks,
                    has_anime, editions, staff, va, raw, fetched_at)
    VALUES (@id, @title, @alttitle, @image_url, @image_thumb, @image_sexual, @image_violence,
            @released, @olang, @devstatus, @titles, @languages, @platforms, @length_minutes, @length, @length_votes, @rating, @votecount, @average,
            @description, @developers, @tags, @screenshots, @relations, @aliases, @extlinks,
            @has_anime, @editions, @staff, @va, @raw, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, alttitle=excluded.alttitle, image_url=excluded.image_url,
      image_thumb=excluded.image_thumb, image_sexual=excluded.image_sexual, image_violence=excluded.image_violence,
      released=excluded.released, olang=excluded.olang, devstatus=excluded.devstatus, titles=excluded.titles,
      languages=excluded.languages, platforms=excluded.platforms,
      length_minutes=excluded.length_minutes, length=excluded.length, length_votes=excluded.length_votes,
      rating=excluded.rating, votecount=excluded.votecount, average=excluded.average,
      description=excluded.description,
      -- Preserve developers when the incoming payload is empty. VNDB
      -- /vn occasionally returns the row with an empty developers list
      -- (rate-limit short response, partial cache hit upstream); we
      -- used to overwrite unconditionally and that wiped the local
      -- studio list on every such refresh, which then made the
      -- publisher chip leak everywhere we dedup by developer name.
      developers=CASE
        WHEN excluded.developers IS NULL OR excluded.developers IN ('[]', '')
          THEN vn.developers
          ELSE excluded.developers
      END,
      tags=excluded.tags, screenshots=excluded.screenshots, relations=excluded.relations,
      aliases=excluded.aliases, extlinks=excluded.extlinks,
      has_anime=excluded.has_anime, editions=excluded.editions, staff=excluded.staff, va=excluded.va,
      raw=excluded.raw,
      -- Monotonic fetched_at. A second writer with an OLDER timestamp
      -- (concurrent refresh, retried import, slow VNDB response that
      -- finished after a faster one) used to clobber the newer
      -- timestamp and the data with it. Now the older write is a
      -- no-op on every column.
      fetched_at=CASE
        WHEN excluded.fetched_at >= vn.fetched_at
          THEN excluded.fetched_at
          ELSE vn.fetched_at
      END
    WHERE excluded.fetched_at >= vn.fetched_at
  `).run({
    id: vn.id,
    title: vn.title,
    alttitle: vn.alttitle ?? null,
    aliases: JSON.stringify(vn.aliases ?? []),
    extlinks: JSON.stringify(vn.extlinks ?? []),
    has_anime: vn.has_anime == null ? null : vn.has_anime ? 1 : 0,
    devstatus: vn.devstatus ?? null,
    titles: JSON.stringify(vn.titles ?? []),
    editions: JSON.stringify(vn.editions ?? []),
    staff: JSON.stringify(vn.staff ?? []),
    va: JSON.stringify(vn.va ?? []),
    image_url: vn.image?.url ?? null,
    image_thumb: vn.image?.thumbnail ?? null,
    image_sexual: vn.image?.sexual ?? null,
    image_violence: vn.image?.violence ?? null,
    released: vn.released ?? null,
    olang: vn.olang ?? null,
    languages: JSON.stringify(vn.languages ?? []),
    platforms: JSON.stringify(vn.platforms ?? []),
    length_minutes: vn.length_minutes ?? null,
    length: vn.length ?? null,
    length_votes: vn.length_votes ?? null,
    rating: vn.rating ?? null,
    votecount: vn.votecount ?? null,
    average: vn.average ?? null,
    description: vn.description ?? null,
    developers: JSON.stringify((vn.developers ?? []).map((d) => ({ id: d.id, name: d.name }))),
    // Top-50 tags by rating-implicit order from VNDB. We do drop some
    // VNs' long tail (a few popular VNs have 80+ applied tags), but
    // the dropped tags are always the lowest-rated ones and we log
    // when it happens so it's not invisible.
    tags: (() => {
      const all = (vn.tags ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        rating: t.rating,
        spoiler: t.spoiler,
        lie: !!t.lie,
        category: t.category ?? null,
      }));
      const TAG_LIMIT = 50;
      if (all.length > TAG_LIMIT) {
        console.warn(
          `[upsertVn] ${vn.id}: dropping ${all.length - TAG_LIMIT} tags (kept top ${TAG_LIMIT}).`,
        );
      }
      return JSON.stringify(all.slice(0, TAG_LIMIT));
    })(),
    screenshots: JSON.stringify(vn.screenshots ?? []),
    relations: JSON.stringify(
      (vn.relations ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        alttitle: r.alttitle ?? null,
        released: r.released ?? null,
        rating: r.rating ?? null,
        votecount: r.votecount ?? null,
        length_minutes: r.length_minutes ?? null,
        languages: r.languages ?? [],
        platforms: r.platforms ?? [],
        developers: (r.developers ?? []).map((d) => ({ id: d.id, name: d.name })),
        image_url: r.image?.url ?? null,
        image_thumb: r.image?.thumbnail ?? null,
        image_sexual: r.image?.sexual ?? null,
        relation: r.relation,
        relation_official: !!r.relation_official,
      })),
    ),
    raw: JSON.stringify(vn),
    fetched_at: Date.now(),
  });
  rebuildStaffVaCredits(vn.id, (vn.staff as StaffEntry[] | undefined) ?? [], (vn.va as VaEntry[] | undefined) ?? []);
});

export function upsertVn(vn: RawVnPayload): void {
  upsertVnTx(vn);
}

function rebuildStaffVaCredits(vnId: string, staff: StaffEntry[], va: VaEntry[]): void {
  db.prepare('DELETE FROM vn_staff_credit WHERE vn_id = ?').run(vnId);
  db.prepare('DELETE FROM vn_va_credit WHERE vn_id = ?').run(vnId);
  const insStaff = db.prepare(`
    INSERT INTO vn_staff_credit (vn_id, sid, aid, eid, role, note, name, original, lang)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of staff) {
    if (!s?.id || !s.name) continue;
    insStaff.run(vnId, s.id, s.aid ?? null, s.eid ?? null, s.role ?? '', s.note ?? null, s.name, s.original ?? null, s.lang ?? null);
  }
  const insVa = db.prepare(`
    INSERT INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const v of va) {
    if (!v?.staff?.id || !v.character?.id || !v.character.name || !v.staff.name) continue;
    insVa.run(
      vnId,
      v.staff.id,
      v.staff.aid ?? null,
      v.character.id,
      v.character.name,
      v.character.original ?? null,
      v.character.image?.url ?? null,
      v.staff.name,
      v.staff.original ?? null,
      v.staff.lang ?? null,
      v.note ?? null,
    );
  }
}

export interface StaffProfile {
  sid: string;
  name: string;
  original: string | null;
  lang: string | null;
}

interface VnSummary {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  local_image: string | null;
  local_image_thumb: string | null;
  released: string | null;
  rating: number | null;
  in_collection: boolean;
}

export interface StaffWorkCredit {
  vn: VnSummary;
  roles: { role: string; eid: number | null; note: string | null; credited_as: string }[];
}

export interface StaffVaCredit {
  vn: VnSummary;
  characters: {
    id: string;
    name: string;
    original: string | null;
    /** Original CDN URL VNDB returned. */
    image_url: string | null;
    /**
     * Local mirror under `data/storage/character/` (populated by
     * `downloadCharacterImages` after a full /assets fan-out). When
     * present, SafeImage prefers this over the remote URL.
     */
    local_image: string | null;
    credited_as: string;
    note: string | null;
  }[];
}

export function getStaffProfileFromCredits(sid: string): StaffProfile | null {
  const staff = db
    .prepare(`SELECT name, original, lang FROM vn_staff_credit WHERE sid = ? LIMIT 1`)
    .get(sid) as { name: string; original: string | null; lang: string | null } | undefined;
  if (staff) return { sid, name: staff.name, original: staff.original, lang: staff.lang };
  const va = db
    .prepare(`SELECT va_name AS name, va_original AS original, va_lang AS lang FROM vn_va_credit WHERE sid = ? LIMIT 1`)
    .get(sid) as { name: string; original: string | null; lang: string | null } | undefined;
  if (va) return { sid, name: va.name, original: va.original, lang: va.lang };
  return null;
}

export function listStaffProductionCredits(sid: string, opts: { inCollectionOnly?: boolean } = {}): StaffWorkCredit[] {
  const where = opts.inCollectionOnly ? `AND c.vn_id IS NOT NULL` : '';
  const rows = db.prepare(`
    SELECT
      v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual,
      v.local_image, v.local_image_thumb, v.released, v.rating,
      sc.role, sc.eid, sc.note, sc.name AS credited_as,
      CASE WHEN c.vn_id IS NULL THEN 0 ELSE 1 END AS in_collection
    FROM vn_staff_credit sc
    JOIN vn v ON v.id = sc.vn_id
    LEFT JOIN collection c ON c.vn_id = sc.vn_id
    WHERE sc.sid = ? ${where}
    ORDER BY v.released DESC NULLS LAST, v.title
  `).all(sid) as Array<{
    id: string; title: string; alttitle: string | null;
    image_url: string | null; image_thumb: string | null; image_sexual: number | null;
    local_image: string | null; local_image_thumb: string | null;
    released: string | null; rating: number | null;
    role: string; eid: number | null; note: string | null; credited_as: string;
    in_collection: number;
  }>;
  const map = new Map<string, StaffWorkCredit>();
  for (const r of rows) {
    let entry = map.get(r.id);
    if (!entry) {
      entry = {
        vn: {
          id: r.id, title: r.title, alttitle: r.alttitle,
          image_url: r.image_url, image_thumb: r.image_thumb, image_sexual: r.image_sexual,
          local_image: r.local_image, local_image_thumb: r.local_image_thumb,
          released: r.released, rating: r.rating, in_collection: !!r.in_collection,
        },
        roles: [],
      };
      map.set(r.id, entry);
    }
    entry.roles.push({ role: r.role, eid: r.eid, note: r.note, credited_as: r.credited_as });
  }
  return Array.from(map.values());
}

export function listStaffVaCredits(sid: string, opts: { inCollectionOnly?: boolean } = {}): StaffVaCredit[] {
  const where = opts.inCollectionOnly ? `AND c.vn_id IS NOT NULL` : '';
  const rows = db.prepare(`
    SELECT
      v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual,
      v.local_image, v.local_image_thumb, v.released, v.rating,
      va.c_id, va.c_name, va.c_original, va.c_image_url, ci.local_path AS c_local_image,
      va.va_name AS credited_as, va.note,
      CASE WHEN c.vn_id IS NULL THEN 0 ELSE 1 END AS in_collection
    FROM vn_va_credit va
    JOIN vn v ON v.id = va.vn_id
    LEFT JOIN collection c ON c.vn_id = va.vn_id
    LEFT JOIN character_image ci ON ci.char_id = va.c_id
    WHERE va.sid = ? ${where}
    ORDER BY v.released DESC NULLS LAST, v.title, va.c_name
  `).all(sid) as Array<{
    id: string; title: string; alttitle: string | null;
    image_url: string | null; image_thumb: string | null; image_sexual: number | null;
    local_image: string | null; local_image_thumb: string | null;
    released: string | null; rating: number | null;
    c_id: string; c_name: string; c_original: string | null;
    c_image_url: string | null; c_local_image: string | null;
    credited_as: string; note: string | null;
    in_collection: number;
  }>;
  const map = new Map<string, StaffVaCredit>();
  for (const r of rows) {
    let entry = map.get(r.id);
    if (!entry) {
      entry = {
        vn: {
          id: r.id, title: r.title, alttitle: r.alttitle,
          image_url: r.image_url, image_thumb: r.image_thumb, image_sexual: r.image_sexual,
          local_image: r.local_image, local_image_thumb: r.local_image_thumb,
          released: r.released, rating: r.rating, in_collection: !!r.in_collection,
        },
        characters: [],
      };
      map.set(r.id, entry);
    }
    entry.characters.push({
      id: r.c_id,
      name: r.c_name,
      original: r.c_original,
      image_url: r.c_image_url,
      local_image: r.c_local_image,
      credited_as: r.credited_as,
      note: r.note,
    });
  }
  return Array.from(map.values());
}

export interface VaYearBucket {
  year: number;
  total: number;
  inCollection: number;
  /** VN ids in that year so the cell can deep-link to specific entries. */
  vnIds: string[];
}

/**
 * Year-by-year breakdown of a VA's credits, joined with `collection` so the
 * UI can highlight which years overlap with your library. Used by the
 * heatmap rendered above the per-year credit list on /staff/[id].
 *
 * VNs without a released date are bucketed under year=0 and surfaced as
 * "année inconnue" by the renderer.
 */
export function getVaTimeline(sid: string): VaYearBucket[] {
  const rows = db
    .prepare(`
      SELECT
        CAST(COALESCE(substr(v.released, 1, 4), '0') AS INTEGER) AS year,
        v.id AS vn_id,
        CASE WHEN c.vn_id IS NULL THEN 0 ELSE 1 END AS in_col
      FROM vn_va_credit va
      JOIN vn v ON v.id = va.vn_id
      LEFT JOIN collection c ON c.vn_id = va.vn_id
      WHERE va.sid = ?
      GROUP BY v.id
    `)
    .all(sid) as Array<{ year: number; vn_id: string; in_col: number }>;

  const buckets = new Map<number, VaYearBucket>();
  for (const r of rows) {
    let entry = buckets.get(r.year);
    if (!entry) {
      entry = { year: r.year, total: 0, inCollection: 0, vnIds: [] };
      buckets.set(r.year, entry);
    }
    entry.total += 1;
    if (r.in_col) entry.inCollection += 1;
    entry.vnIds.push(r.vn_id);
  }
  return Array.from(buckets.values()).sort((a, b) => a.year - b.year);
}

export interface CharacterVoiceCredit {
  sid: string;
  va_name: string;
  va_original: string | null;
  va_lang: string | null;
  vns: { id: string; title: string; released: string | null; in_collection: boolean }[];
}

export interface CharacterSibling {
  c_id: string;
  c_name: string;
  c_original: string | null;
  c_image_url: string | null;
  vns: { vn_id: string; vn_title: string }[];
}

/**
 * Other character records (different c_id) that share the same display name
 * as `charId`. VNDB tracks recurring cast inconsistently — sometimes one
 * character id is reused across every VN in a series, sometimes each VN
 * gets its own id for the same person (e.g. "Saegusa Hinata" in Ai Kiss 1
 * vs Ai Kiss 3 might be c11994 + c89053). This surfaces those sibling
 * pages so the user can navigate between them.
 *
 * Pulls from vn_va_credit (covers every owned VN's voice cast). Filters to
 * names with at least 2 characters and excludes the original c_id.
 */
export function findCharacterSiblings(charId: string): CharacterSibling[] {
  const me = db
    .prepare('SELECT c_name, c_original FROM vn_va_credit WHERE c_id = ? LIMIT 1')
    .get(charId) as { c_name: string; c_original: string | null } | undefined;
  if (!me || !me.c_name || me.c_name.length < 2) return [];

  const rows = db
    .prepare(`
      SELECT va.c_id, va.c_name, va.c_original, va.c_image_url, va.vn_id, v.title AS vn_title
      FROM vn_va_credit va
      JOIN vn v ON v.id = va.vn_id
      WHERE va.c_name = ? AND va.c_id != ?
      ORDER BY v.released DESC NULLS LAST
    `)
    .all(me.c_name, charId) as Array<{
      c_id: string;
      c_name: string;
      c_original: string | null;
      c_image_url: string | null;
      vn_id: string;
      vn_title: string;
    }>;

  const byChar = new Map<string, CharacterSibling>();
  for (const r of rows) {
    let entry = byChar.get(r.c_id);
    if (!entry) {
      entry = {
        c_id: r.c_id,
        c_name: r.c_name,
        c_original: r.c_original,
        c_image_url: r.c_image_url,
        vns: [],
      };
      byChar.set(r.c_id, entry);
    }
    if (!entry.vns.some((v) => v.vn_id === r.vn_id)) {
      entry.vns.push({ vn_id: r.vn_id, vn_title: r.vn_title });
    }
  }
  return Array.from(byChar.values());
}

export function getVasForCharacter(charId: string): CharacterVoiceCredit[] {
  const rows = db.prepare(`
    SELECT va.sid, va.va_name, va.va_original, va.va_lang,
           v.id, v.title, v.released,
           CASE WHEN c.vn_id IS NULL THEN 0 ELSE 1 END AS in_collection
    FROM vn_va_credit va
    JOIN vn v ON v.id = va.vn_id
    LEFT JOIN collection c ON c.vn_id = va.vn_id
    WHERE va.c_id = ?
    ORDER BY v.released DESC NULLS LAST, v.title
  `).all(charId) as Array<{
    sid: string; va_name: string; va_original: string | null; va_lang: string | null;
    id: string; title: string; released: string | null;
    in_collection: number;
  }>;
  const map = new Map<string, CharacterVoiceCredit>();
  for (const r of rows) {
    let entry = map.get(r.sid);
    if (!entry) {
      entry = { sid: r.sid, va_name: r.va_name, va_original: r.va_original, va_lang: r.va_lang, vns: [] };
      map.set(r.sid, entry);
    }
    entry.vns.push({ id: r.id, title: r.title, released: r.released, in_collection: !!r.in_collection });
  }
  return Array.from(map.values());
}

export function setLocalImagePaths(vnId: string, full: string | null, thumb: string | null): void {
  db.prepare('UPDATE vn SET local_image = ?, local_image_thumb = ? WHERE id = ?').run(full, thumb, vnId);
}

export function setCustomCover(vnId: string, path: string | null): void {
  db.prepare('UPDATE vn SET custom_cover = ? WHERE id = ?').run(path, vnId);
}

export function setBanner(vnId: string, value: string | null): void {
  db.prepare('UPDATE vn SET banner_image = ? WHERE id = ?').run(value, vnId);
}

export function setBannerPosition(vnId: string, value: string | null): void {
  db.prepare('UPDATE vn SET banner_position = ? WHERE id = ?').run(value, vnId);
}

export function setLocalScreenshots(vnId: string, shots: Screenshot[]): void {
  db.prepare('UPDATE vn SET screenshots = ? WHERE id = ?').run(JSON.stringify(shots), vnId);
}

export function setReleaseImages(vnId: string, images: ReleaseImage[]): void {
  db.prepare('UPDATE vn SET release_images = ? WHERE id = ?').run(JSON.stringify(images), vnId);
}

/**
 * Persist the deduped publisher list for a VN. Computed at fetch time
 * by walking every release's `producers[]` and keeping the rows where
 * `publisher = true`. VNDB only exposes producer roles at the release
 * level, so this column is the only place to read "who publishes this
 * VN" from once releases are fetched.
 */
export function setVnPublishers(vnId: string, publishers: { id: string; name: string }[]): void {
  const dedup = new Map<string, { id: string; name: string }>();
  for (const p of publishers) {
    if (!p.id || !p.name) continue;
    if (!dedup.has(p.id)) dedup.set(p.id, { id: p.id, name: p.name });
  }
  const json = JSON.stringify(Array.from(dedup.values()));
  db.prepare('UPDATE vn SET publishers = ? WHERE id = ?').run(json, vnId);
}

export interface CharacterImageRecord {
  url: string | null;
  local_path: string | null;
  fetched_at: number;
}

export function getCharacterImage(charId: string): CharacterImageRecord | null {
  const row = db
    .prepare('SELECT url, local_path, fetched_at FROM character_image WHERE char_id = ?')
    .get(charId) as CharacterImageRecord | undefined;
  return row ?? null;
}

export function getCharacterImages(charIds: string[]): Map<string, CharacterImageRecord> {
  const out = new Map<string, CharacterImageRecord>();
  if (charIds.length === 0) return out;
  const placeholders = charIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT char_id, url, local_path, fetched_at FROM character_image WHERE char_id IN (${placeholders})`)
    .all(...charIds) as (CharacterImageRecord & { char_id: string })[];
  for (const r of rows) out.set(r.char_id, { url: r.url, local_path: r.local_path, fetched_at: r.fetched_at });
  return out;
}

export interface EgsRow {
  vn_id: string;
  egs_id: number | null;
  gamename: string | null;
  gamename_furigana: string | null;
  brand_id: number | null;
  brand_name: string | null;
  model: string | null;
  description: string | null;
  image_url: string | null;
  local_image: string | null;
  okazu: number | null;
  erogame: number | null;
  raw_json: string | null;
  median: number | null;
  average: number | null;
  dispersion: number | null;
  count: number | null;
  sellday: string | null;
  playtime_median_minutes: number | null;
  source: 'extlink' | 'search' | 'manual' | null;
  fetched_at: number;
}

export function getEgsForVn(vnId: string): EgsRow | null {
  const row = db
    .prepare('SELECT * FROM egs_game WHERE vn_id = ?')
    .get(vnId) as EgsRow | undefined;
  return row ?? null;
}

export function getEgsForVns(vnIds: string[]): Map<string, EgsRow> {
  const out = new Map<string, EgsRow>();
  if (vnIds.length === 0) return out;
  const placeholders = vnIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT * FROM egs_game WHERE vn_id IN (${placeholders})`)
    .all(...vnIds) as EgsRow[];
  for (const r of rows) out.set(r.vn_id, r);
  return out;
}

export function upsertEgsForVn(row: Omit<EgsRow, 'fetched_at' | 'local_image'> & { local_image?: string | null }): void {
  db.prepare(`
    INSERT INTO egs_game (
      vn_id, egs_id, gamename, gamename_furigana, brand_id, brand_name, model,
      description, image_url, local_image, okazu, erogame, raw_json,
      median, average, dispersion, count, sellday, playtime_median_minutes,
      source, fetched_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(vn_id) DO UPDATE SET
      egs_id = excluded.egs_id,
      gamename = excluded.gamename,
      gamename_furigana = excluded.gamename_furigana,
      brand_id = excluded.brand_id,
      brand_name = excluded.brand_name,
      model = excluded.model,
      description = excluded.description,
      image_url = excluded.image_url,
      local_image = COALESCE(excluded.local_image, egs_game.local_image),
      okazu = excluded.okazu,
      erogame = excluded.erogame,
      raw_json = excluded.raw_json,
      median = excluded.median,
      average = excluded.average,
      dispersion = excluded.dispersion,
      count = excluded.count,
      sellday = excluded.sellday,
      playtime_median_minutes = excluded.playtime_median_minutes,
      source = excluded.source,
      fetched_at = excluded.fetched_at
  `).run(
    row.vn_id,
    row.egs_id,
    row.gamename,
    row.gamename_furigana ?? null,
    row.brand_id ?? null,
    row.brand_name ?? null,
    row.model ?? null,
    row.description ?? null,
    row.image_url ?? null,
    row.local_image ?? null,
    row.okazu ?? null,
    row.erogame ?? null,
    row.raw_json ?? null,
    row.median,
    row.average,
    row.dispersion,
    row.count,
    row.sellday,
    row.playtime_median_minutes,
    row.source,
    Date.now(),
  );
}

export function setEgsLocalImage(vnId: string, localPath: string | null): void {
  db.prepare('UPDATE egs_game SET local_image = ? WHERE vn_id = ?').run(localPath, vnId);
}

export function clearEgsForVn(vnId: string): void {
  db.prepare('DELETE FROM egs_game WHERE vn_id = ?').run(vnId);
}

export type SourceChoice = 'auto' | 'vndb' | 'egs' | 'custom';
export type SourceField = 'title' | 'description' | 'image' | 'brand' | 'rating' | 'playtime';

export type SourcePrefMap = Partial<Record<SourceField, SourceChoice>>;

export function getSourcePref(vnId: string): SourcePrefMap {
  const row = db
    .prepare('SELECT source_pref FROM collection WHERE vn_id = ?')
    .get(vnId) as { source_pref: string | null } | undefined;
  if (!row?.source_pref) return {};
  try {
    const parsed = JSON.parse(row.source_pref) as unknown;
    if (parsed && typeof parsed === 'object') return parsed as SourcePrefMap;
  } catch {
    // ignore — malformed JSON, treat as empty
  }
  return {};
}

export interface DbStatus {
  db_path: string;
  rows: { table: string; count: number }[];
  egs_matched: number;
  egs_unmatched: number;
  cache_total: number;
  cache_fresh: number;
  cache_stale: number;
  vndb_token: 'db' | 'env' | 'none';
}

/** Snapshot of local DB state for the /data status panel. */
export function getDbStatus(): DbStatus {
  const tables = [
    'vn',
    'collection',
    'producer',
    'series',
    'series_vn',
    'owned_release',
    'vn_route',
    'character_image',
    'egs_game',
    'vndb_cache',
    'app_setting',
  ];
  const rows = tables.map((table) => ({
    table,
    count: (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
  }));
  const egsCounts = db
    .prepare(`
      SELECT
        SUM(CASE WHEN egs_id IS NOT NULL THEN 1 ELSE 0 END) AS matched,
        SUM(CASE WHEN egs_id IS NULL THEN 1 ELSE 0 END) AS unmatched
      FROM egs_game
    `)
    .get() as { matched: number | null; unmatched: number | null };
  const cacheCounts = db
    .prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN expires_at >= ? THEN 1 ELSE 0 END) AS fresh,
        SUM(CASE WHEN expires_at < ? THEN 1 ELSE 0 END) AS stale
      FROM vndb_cache
    `)
    .get(Date.now(), Date.now()) as { total: number; fresh: number | null; stale: number | null };
  const dbToken = (db.prepare('SELECT value FROM app_setting WHERE key = ?').get('vndb_token') as { value: string | null } | undefined)?.value;
  const tokenSource: 'db' | 'env' | 'none' = dbToken ? 'db' : process.env.VNDB_TOKEN ? 'env' : 'none';
  return {
    db_path: DB_PATH,
    rows,
    egs_matched: egsCounts.matched ?? 0,
    egs_unmatched: egsCounts.unmatched ?? 0,
    cache_total: cacheCounts.total ?? 0,
    cache_fresh: cacheCounts.fresh ?? 0,
    cache_stale: cacheCounts.stale ?? 0,
    vndb_token: tokenSource,
  };
}

/** Read a free-form app setting (used for the user-settable VNDB token, etc.). */
export function getAppSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_setting WHERE key = ?').get(key) as { value: string | null } | undefined;
  return row?.value ?? null;
}

export function setAppSetting(key: string, value: string | null): void {
  if (value == null || value.length === 0) {
    db.prepare('DELETE FROM app_setting WHERE key = ?').run(key);
    return;
  }
  db.prepare(`
    INSERT INTO app_setting (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

/**
 * Migrate every reference from `fromId` (typically an `egs_NNN` synthetic) to
 * `toId` (a real VNDB `vNNN`). Used when the user manually links an
 * EGS-only collection entry to its VNDB equivalent: the collection row,
 * owned_release, custom quotes, routes, series membership, and the EGS
 * link all move to the real VN, then the synthetic vn row is dropped.
 *
 * `toId` must already exist in the `vn` table — call `upsertVn` first with
 * the freshly-fetched VNDB payload.
 */
export function migrateVnId(fromId: string, toId: string): void {
  if (fromId === toId) return;
  const target = db.prepare('SELECT id FROM vn WHERE id = ?').get(toId);
  if (!target) throw new Error(`migrateVnId: target ${toId} not in vn table`);

  const tx = db.transaction(() => {
    // Drop a possible duplicate collection row on the target before moving.
    const targetCol = db.prepare('SELECT 1 FROM collection WHERE vn_id = ?').get(toId);
    if (targetCol) {
      db.prepare('DELETE FROM collection WHERE vn_id = ?').run(toId);
    }
    db.prepare('UPDATE collection SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE egs_game SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE vn_quote SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE owned_release SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE vn_route SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE series_vn SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE vn_activity SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE vn_staff_credit SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE vn_va_credit SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    // Synthetic row is no longer referenced — clean up.
    db.prepare('DELETE FROM vn WHERE id = ?').run(fromId);
  });
  db.pragma('foreign_keys = OFF');
  try {
    tx();
  } finally {
    db.pragma('foreign_keys = ON');
  }
}

/** Stamp a VN row with the `egs_only` flag (used for EGS-sourced synthetic entries). */
export function markVnEgsOnly(vnId: string, egsOnly: boolean): void {
  db.prepare('UPDATE vn SET egs_only = ? WHERE id = ?').run(egsOnly ? 1 : 0, vnId);
}

export function isEgsOnly(vnId: string): boolean {
  const row = db.prepare('SELECT egs_only FROM vn WHERE id = ?').get(vnId) as { egs_only: number } | undefined;
  return !!row?.egs_only;
}

/**
 * Insert a minimal synthetic VN row driven by an EGS payload (no VNDB id available).
 * Used by the "search from EGS" flow when a game isn't on VNDB.
 * The synthetic id format is `egs_<numeric-id>` (underscore, not colon —
 * a literal colon breaks Next.js dynamic-route matching).
 */
export function upsertEgsOnlyVn(args: {
  vnId: string;
  title: string;
  alttitle: string | null;
  released: string | null;
  description: string | null;
  imageUrl: string | null;
}): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vn (id, title, alttitle, image_url, image_thumb, image_sexual, image_violence,
                    released, olang, languages, platforms, length_minutes, length, rating, votecount,
                    description, developers, tags, screenshots, relations, raw, fetched_at, egs_only)
    VALUES (?, ?, ?, ?, NULL, NULL, NULL,
            ?, NULL, '[]', '[]', NULL, NULL, NULL, NULL,
            ?, '[]', '[]', '[]', '[]', '{}', ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      alttitle = excluded.alttitle,
      image_url = COALESCE(excluded.image_url, vn.image_url),
      released = COALESCE(excluded.released, vn.released),
      description = COALESCE(excluded.description, vn.description),
      fetched_at = excluded.fetched_at,
      egs_only = 1
  `).run(
    args.vnId,
    args.title,
    args.alttitle,
    args.imageUrl,
    args.released,
    args.description,
    now,
  );
}

export function setCustomDescription(vnId: string, text: string | null): void {
  const cleaned = text == null ? null : text.trim();
  const payload = cleaned ? cleaned.slice(0, 8000) : null;
  db.prepare('UPDATE collection SET custom_description = ? WHERE vn_id = ?').run(payload, vnId);
}

export function setSourcePref(vnId: string, prefs: SourcePrefMap): void {
  // Drop "auto" keys to keep the JSON tidy — "auto" is the implicit default.
  const cleaned: SourcePrefMap = {};
  for (const [k, v] of Object.entries(prefs)) {
    if (v && v !== 'auto') cleaned[k as SourceField] = v;
  }
  const payload = Object.keys(cleaned).length === 0 ? null : JSON.stringify(cleaned);
  db.prepare('UPDATE collection SET source_pref = ? WHERE vn_id = ?').run(payload, vnId);
}

export interface LocalQuote {
  quote_id: string;
  vn_id: string;
  vn_title: string;
  quote: string;
  score: number;
  character_id: string | null;
  character_name: string | null;
}

/**
 * Persist (replace) the quotes we already fetched from VNDB for one VN.
 * Called inside `ensureLocalImagesForVn` so the local data set grows as the
 * user adds VNs, then the random-quote footer can serve from local without
 * touching VNDB again when `random_quote_source = 'mine'`.
 */
export function setQuotesForVn(
  vnId: string,
  quotes: { id: string; quote: string; score: number; character: { id: string; name: string } | null }[],
): void {
  const now = Date.now();
  const tx = db.transaction((rows: typeof quotes) => {
    db.prepare('DELETE FROM vn_quote WHERE vn_id = ?').run(vnId);
    const insert = db.prepare(`
      INSERT INTO vn_quote (quote_id, vn_id, quote, score, character_id, character_name, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const q of rows) {
      insert.run(q.id, vnId, q.quote, q.score, q.character?.id ?? null, q.character?.name ?? null, now);
    }
  });
  tx(quotes);
}

/**
 * Pick a random quote from the user's own collection. Pure SQL — no VNDB call.
 * Returns `null` when no quotes are cached yet (collection has zero quote-bearing VNs).
 */
export interface QuoteWithVn {
  quote_id: string;
  vn_id: string;
  vn_title: string;
  quote: string;
  score: number;
  character_id: string | null;
  character_name: string | null;
}

/**
 * Cross-VN quotes feed — every quote we've cached for VNs in the user's
 * collection, ordered by score then VN title. `q` is an optional case-
 * insensitive substring filter applied to the quote text or character
 * name.
 */
export function listAllQuotes(q?: string, limit = 200): QuoteWithVn[] {
  const trimmed = q?.trim() ?? '';
  if (!trimmed) {
    return db
      .prepare(`
        SELECT q.quote_id, q.vn_id, v.title AS vn_title, q.quote, q.score,
               q.character_id, q.character_name
        FROM vn_quote q
        JOIN collection c ON c.vn_id = q.vn_id
        JOIN vn v ON v.id = q.vn_id
        ORDER BY q.score DESC, v.title COLLATE NOCASE ASC
        LIMIT ?
      `)
      .all(limit) as QuoteWithVn[];
  }
  const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
  return db
    .prepare(`
      SELECT q.quote_id, q.vn_id, v.title AS vn_title, q.quote, q.score,
             q.character_id, q.character_name
      FROM vn_quote q
      JOIN collection c ON c.vn_id = q.vn_id
      JOIN vn v ON v.id = q.vn_id
      WHERE q.quote LIKE ? ESCAPE '\\' OR q.character_name LIKE ? ESCAPE '\\'
      ORDER BY q.score DESC, v.title COLLATE NOCASE ASC
      LIMIT ?
    `)
    .all(like, like, limit) as QuoteWithVn[];
}

export function getRandomLocalQuote(): LocalQuote | null {
  const row = db
    .prepare(`
      SELECT q.quote_id, q.vn_id, v.title AS vn_title, q.quote, q.score,
             q.character_id, q.character_name
      FROM vn_quote q
      JOIN collection c ON c.vn_id = q.vn_id
      JOIN vn v ON v.id = q.vn_id
      ORDER BY RANDOM()
      LIMIT 1
    `)
    .get() as LocalQuote | undefined;
  return row ?? null;
}

export function upsertCharacterImage(charId: string, url: string | null, localPath: string | null): void {
  db.prepare(`
    INSERT INTO character_image (char_id, url, local_path, fetched_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(char_id) DO UPDATE SET
      url = excluded.url,
      local_path = excluded.local_path,
      fetched_at = excluded.fetched_at
  `).run(charId, url, localPath, Date.now());
}

export type CollectionPatch = Partial<Omit<CollectionFields, 'added_at' | 'updated_at'>>;

export function addToCollection(vnId: string, fields: CollectionPatch = {}): void {
  const now = Date.now();
  const exists = db.prepare('SELECT 1 FROM collection WHERE vn_id = ?').get(vnId);
  if (exists) {
    updateCollection(vnId, fields);
    return;
  }
  db.prepare(`
    INSERT INTO collection (vn_id, status, user_rating, playtime_minutes,
                            started_date, finished_date, notes, favorite,
                            location, edition_type, edition_label, physical_location,
                            box_type, download_url, dumped, added_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vnId,
    fields.status ?? 'planning',
    fields.user_rating ?? null,
    fields.playtime_minutes ?? 0,
    fields.started_date ?? null,
    fields.finished_date ?? null,
    fields.notes ?? null,
    fields.favorite ? 1 : 0,
    fields.location ?? 'unknown',
    fields.edition_type ?? 'none',
    fields.edition_label ?? null,
    serializePlaces(fields.physical_location ?? null),
    fields.box_type ?? 'none',
    fields.download_url ?? null,
    fields.dumped ? 1 : 0,
    now,
    now,
  );
}

const updateCollectionTx = db.transaction((vnId: string, fields: CollectionPatch) => {
  const sets: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, (v: unknown) => unknown> = {
    status: (v) => v,
    user_rating: (v) => v,
    playtime_minutes: (v) => v,
    started_date: (v) => v,
    finished_date: (v) => v,
    notes: (v) => v,
    favorite: (v) => (v ? 1 : 0),
    location: (v) => v,
    edition_type: (v) => v,
    edition_label: (v) => v,
    physical_location: (v) => serializePlaces(v),
    box_type: (v) => v,
    download_url: (v) => v,
    dumped: (v) => (v ? 1 : 0),
  };

  // Snapshot the columns we may diff against before the UPDATE so the activity
  // payload can record "from -> to" without an extra round-trip per field.
  const before = db.prepare(`
    SELECT status, user_rating, playtime_minutes, favorite, started_date, finished_date
    FROM collection WHERE vn_id = ?
  `).get(vnId) as
    | { status: string | null; user_rating: number | null; playtime_minutes: number | null;
        favorite: number; started_date: string | null; finished_date: string | null }
    | undefined;

  for (const key of Object.keys(map) as (keyof typeof map)[]) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      params.push(map[key]((fields as Record<string, unknown>)[key]));
    }
  }
  if (sets.length === 0) return;
  const now = Date.now();
  sets.push('updated_at = ?');
  params.push(now);
  params.push(vnId);
  db.prepare(`UPDATE collection SET ${sets.join(', ')} WHERE vn_id = ?`).run(...params);

  if (!before) return;
  const insertActivity = db.prepare(`
    INSERT INTO vn_activity (vn_id, kind, payload, occurred_at) VALUES (?, ?, ?, ?)
  `);
  const log = (kind: string, payload: Record<string, unknown>) => {
    insertActivity.run(vnId, kind, JSON.stringify(payload), now);
  };

  if ('status' in fields && fields.status !== before.status) {
    log('status', { from: before.status, to: fields.status ?? null });
  }
  if ('user_rating' in fields && fields.user_rating !== before.user_rating) {
    log('rating', { from: before.user_rating, to: fields.user_rating ?? null });
  }
  if ('playtime_minutes' in fields && typeof fields.playtime_minutes === 'number') {
    const delta = fields.playtime_minutes - (before.playtime_minutes ?? 0);
    if (delta !== 0) log('playtime', { from: before.playtime_minutes ?? 0, to: fields.playtime_minutes, delta });
  }
  if ('favorite' in fields && !!fields.favorite !== !!before.favorite) {
    log('favorite', { to: !!fields.favorite });
  }
  if ('started_date' in fields && fields.started_date !== before.started_date) {
    log('started', { from: before.started_date, to: fields.started_date ?? null });
  }
  if ('finished_date' in fields && fields.finished_date !== before.finished_date) {
    log('finished', { from: before.finished_date, to: fields.finished_date ?? null });
  }
  if ('notes' in fields) {
    log('note', { length: typeof fields.notes === 'string' ? fields.notes.length : 0 });
  }
});

/**
 * Push a status change to VNDB if write-back is enabled.
 *
 * Decoupled from `updateCollection` so it can run *after* the transaction
 * commits — VNDB latency or 5xx errors must never roll back the local
 * state. Called from the PATCH /api/collection/[id] route handler.
 */
export async function maybePushStatusToVndb(vnId: string, status: Status | null | undefined): Promise<void> {
  if (status === undefined) return;
  if (!/^v\d+$/i.test(vnId)) return;
  const enabled = getAppSetting('vndb_writeback') === '1';
  if (!enabled) return;
  const token = getAppSetting('vndb_token');
  if (!token || !token.trim()) return;
  try {
    await pushStatusToVndb(vnId, status, token.trim());
  } catch {
    // never fail the request because the remote echo didn't go through.
  }
}

export function updateCollection(vnId: string, fields: CollectionPatch): void {
  updateCollectionTx(vnId, fields);
}

export interface ActivityEntry {
  id: number;
  vn_id: string;
  kind: 'status' | 'rating' | 'playtime' | 'favorite' | 'started' | 'finished' | 'note' | 'manual';
  payload: Record<string, unknown> | null;
  occurred_at: number;
}

export function listActivityForVn(vnId: string, limit = 50): ActivityEntry[] {
  const rows = db
    .prepare(`
      SELECT id, vn_id, kind, payload, occurred_at
      FROM vn_activity WHERE vn_id = ?
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?
    `)
    .all(vnId, limit) as Array<{ id: number; vn_id: string; kind: string; payload: string | null; occurred_at: number }>;
  return rows.map((r) => ({
    id: r.id,
    vn_id: r.vn_id,
    kind: r.kind as ActivityEntry['kind'],
    payload: r.payload ? safeParseJson(r.payload) : null,
    occurred_at: r.occurred_at,
  }));
}

export interface RecentActivityEntry extends ActivityEntry {
  title: string;
}

/**
 * Last N activity rows across every VN — feeds the dashboard "what have I
 * been doing lately" tile. Joins on `vn.title` so the UI can render the VN
 * name without a second lookup per row.
 */
export function listRecentActivity(limit = 10): RecentActivityEntry[] {
  const rows = db
    .prepare(`
      SELECT a.id, a.vn_id, a.kind, a.payload, a.occurred_at, v.title
      FROM vn_activity a
      LEFT JOIN vn v ON v.id = a.vn_id
      ORDER BY a.occurred_at DESC, a.id DESC
      LIMIT ?
    `)
    .all(limit) as Array<{
      id: number; vn_id: string; kind: string; payload: string | null; occurred_at: number; title: string | null;
    }>;
  return rows.map((r) => ({
    id: r.id,
    vn_id: r.vn_id,
    kind: r.kind as ActivityEntry['kind'],
    payload: r.payload ? safeParseJson(r.payload) : null,
    occurred_at: r.occurred_at,
    title: r.title ?? r.vn_id,
  }));
}

export function addManualActivity(vnId: string, text: string, occurredAt?: number): ActivityEntry {
  const ts = occurredAt ?? Date.now();
  const trimmed = text.trim().slice(0, 2000);
  const info = db.prepare(`
    INSERT INTO vn_activity (vn_id, kind, payload, occurred_at) VALUES (?, 'manual', ?, ?)
  `).run(vnId, JSON.stringify({ text: trimmed }), ts);
  return {
    id: Number(info.lastInsertRowid),
    vn_id: vnId,
    kind: 'manual',
    payload: { text: trimmed },
    occurred_at: ts,
  };
}

export function deleteActivity(id: number): void {
  db.prepare('DELETE FROM vn_activity WHERE id = ?').run(id);
}

/**
 * "Game log" entries — free-form timestamped notes attached to a VN.
 * Distinct from `vn_activity` (which records state changes); the game
 * log is what the user types during/after a session (impressions,
 * route choices, "Saber dies in chapter 4", etc.).
 *
 * `session_minutes` is optional — set by the Pomodoro integration so
 * the UI can show "logged 23m into a session".
 */
export interface GameLogEntry {
  id: number;
  vn_id: string;
  note: string;
  logged_at: number;
  session_minutes: number | null;
  created_at: number;
  updated_at: number;
}

const GAME_LOG_NOTE_MAX = 8000;

export function listGameLogForVn(vnId: string, limit = 200): GameLogEntry[] {
  return db
    .prepare(`
      SELECT id, vn_id, note, logged_at, session_minutes, created_at, updated_at
      FROM vn_game_log WHERE vn_id = ?
      ORDER BY logged_at DESC, id DESC
      LIMIT ?
    `)
    .all(vnId, limit) as GameLogEntry[];
}

export function addGameLogEntry(
  vnId: string,
  note: string,
  loggedAt?: number,
  sessionMinutes?: number | null,
): GameLogEntry {
  const trimmed = note.trim().slice(0, GAME_LOG_NOTE_MAX);
  if (trimmed.length === 0) throw new Error('empty note');
  const now = Date.now();
  const ts = loggedAt ?? now;
  const minutes = sessionMinutes != null && sessionMinutes > 0 ? Math.round(sessionMinutes) : null;
  const info = db
    .prepare(`
      INSERT INTO vn_game_log (vn_id, note, logged_at, session_minutes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(vnId, trimmed, ts, minutes, now, now);
  return {
    id: Number(info.lastInsertRowid),
    vn_id: vnId,
    note: trimmed,
    logged_at: ts,
    session_minutes: minutes,
    created_at: now,
    updated_at: now,
  };
}

export function updateGameLogEntry(
  id: number,
  patch: { note?: string; logged_at?: number; session_minutes?: number | null },
): GameLogEntry | null {
  const current = db
    .prepare('SELECT id, vn_id, note, logged_at, session_minutes, created_at, updated_at FROM vn_game_log WHERE id = ?')
    .get(id) as GameLogEntry | undefined;
  if (!current) return null;
  const next: GameLogEntry = {
    ...current,
    note: patch.note != null ? patch.note.trim().slice(0, GAME_LOG_NOTE_MAX) : current.note,
    logged_at: patch.logged_at ?? current.logged_at,
    session_minutes:
      patch.session_minutes === undefined
        ? current.session_minutes
        : patch.session_minutes != null && patch.session_minutes > 0
          ? Math.round(patch.session_minutes)
          : null,
    updated_at: Date.now(),
  };
  if (next.note.length === 0) throw new Error('empty note');
  db.prepare(
    'UPDATE vn_game_log SET note = ?, logged_at = ?, session_minutes = ?, updated_at = ? WHERE id = ?',
  ).run(next.note, next.logged_at, next.session_minutes, next.updated_at, id);
  return next;
}

export function deleteGameLogEntry(id: number): boolean {
  const info = db.prepare('DELETE FROM vn_game_log WHERE id = ?').run(id);
  return info.changes > 0;
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function removeFromCollection(vnId: string): void {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(vnId);
}

export function isInCollection(vnId: string): boolean {
  return !!db.prepare('SELECT 1 FROM collection WHERE vn_id = ?').get(vnId);
}

/**
 * Batched variant of `isInCollection` — pass a list of VN ids, get
 * back a Set of those that are in the collection. Callers (search
 * routes, advanced search, relations rendering) used to .map() over
 * single-row SELECTs, paying one round-trip per id. The SQLite
 * parameter cap is 999 in older builds and 32766 in modern ones;
 * we chunk to 500 to stay well below either limit.
 */
export function isInCollectionMany(vnIds: readonly string[]): Set<string> {
  if (vnIds.length === 0) return new Set();
  const out = new Set<string>();
  const CHUNK = 500;
  for (let i = 0; i < vnIds.length; i += CHUNK) {
    const chunk = vnIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT vn_id FROM collection WHERE vn_id IN (${placeholders})`)
      .all(...chunk) as { vn_id: string }[];
    for (const r of rows) out.add(r.vn_id);
  }
  return out;
}

/**
 * Bulk-update `collection.custom_order` so the supplied ids appear in order.
 * Index 0 gets order 1, index 1 gets order 2, etc. — 0 is reserved for "unset".
 * Ids not in the array are left alone (so reordering visible page A doesn't
 * wipe page B). Runs in a single transaction so a partial failure rolls back.
 */
export function setCollectionCustomOrder(ids: string[]): void {
  if (ids.length === 0) return;
  const update = db.prepare('UPDATE collection SET custom_order = ? WHERE vn_id = ?');
  const tx = db.transaction((list: string[]) => {
    list.forEach((id, idx) => update.run(idx + 1, id));
  });
  tx(ids);
}

/** Drop custom_order for every collection row (back to natural sort). */
export function resetCollectionCustomOrder(): void {
  db.prepare('UPDATE collection SET custom_order = 0').run();
}

export function listInCollectionVnIds(): string[] {
  const rows = db.prepare('SELECT vn_id FROM collection').all() as { vn_id: string }[];
  return rows.map((r) => r.vn_id);
}

interface DbRow {
  id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  image_thumb: string | null;
  image_sexual: number | null;
  image_violence: number | null;
  released: string | null;
  olang: string | null;
  languages: string;
  platforms: string;
  length_minutes: number | null;
  length: number | null;
  rating: number | null;
  votecount: number | null;
  description: string | null;
  developers: string;
  publishers: string | null;
  tags: string;
  screenshots: string | null;
  release_images: string | null;
  local_image: string | null;
  local_image_thumb: string | null;
  custom_cover: string | null;
  banner_image: string | null;
  banner_position: string | null;
  relations: string | null;
  aliases: string | null;
  extlinks: string | null;
  length_votes: number | null;
  average: number | null;
  has_anime: number | null;
  devstatus: number | null;
  titles: string | null;
  editions: string | null;
  staff: string | null;
  va: string | null;
  fetched_at: number;
  status?: string;
  user_rating?: number | null;
  playtime_minutes?: number;
  started_date?: string | null;
  finished_date?: string | null;
  notes?: string | null;
  favorite?: number;
  location?: string;
  edition_type?: string;
  edition_label?: string | null;
  physical_location?: string | null;
  box_type?: string;
  download_url?: string | null;
  dumped?: number;
  custom_description?: string | null;
  added_at?: number;
  updated_at?: number;
}

/**
 * JSON.parse wrapper that returns the fallback on parse failure
 * instead of throwing. A single corrupted JSON column used to blow
 * up the entire listCollection map because every row mapper called
 * JSON.parse unconditionally — one bad row took the whole library
 * down.
 */
function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function rowToItem(row: DbRow | undefined): CollectionItem | null {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    alttitle: row.alttitle,
    image_url: row.image_url,
    image_thumb: row.image_thumb,
    image_sexual: row.image_sexual,
    image_violence: row.image_violence,
    released: row.released,
    olang: row.olang,
    languages: safeJsonParse(row.languages, [] as string[]),
    platforms: safeJsonParse(row.platforms, [] as string[]),
    length_minutes: row.length_minutes,
    length: row.length,
    rating: row.rating,
    votecount: row.votecount,
    description: row.description,
    developers: safeJsonParse(row.developers, [] as { id: string; name: string }[]),
    publishers: safeJsonParse(row.publishers, [] as { id: string; name: string }[]),
    tags: safeJsonParse(row.tags, [] as CollectionItem['tags']),
    screenshots: safeJsonParse(row.screenshots, [] as CollectionItem['screenshots']),
    release_images: safeJsonParse(row.release_images, [] as CollectionItem['release_images']),
    local_image: row.local_image,
    local_image_thumb: row.local_image_thumb,
    custom_cover: row.custom_cover,
    banner_image: row.banner_image,
    banner_position: row.banner_position,
    relations: safeJsonParse(row.relations, [] as CollectionItem['relations']),
    aliases: safeJsonParse(row.aliases, [] as string[]),
    extlinks: safeJsonParse(row.extlinks, [] as CollectionItem['extlinks']),
    length_votes: row.length_votes ?? null,
    average: row.average ?? null,
    has_anime: row.has_anime == null ? null : !!row.has_anime,
    devstatus: row.devstatus == null ? null : (row.devstatus as 0 | 1 | 2),
    titles: safeJsonParse(row.titles, [] as CollectionItem['titles']),
    editions: safeJsonParse(row.editions, [] as CollectionItem['editions']),
    staff: safeJsonParse(row.staff, [] as CollectionItem['staff']),
    va: safeJsonParse(row.va, [] as CollectionItem['va']),
    fetched_at: row.fetched_at,
    status: row.status as Status | undefined,
    user_rating: row.user_rating ?? null,
    playtime_minutes: row.playtime_minutes ?? 0,
    started_date: row.started_date ?? null,
    finished_date: row.finished_date ?? null,
    notes: row.notes ?? null,
    favorite: !!row.favorite,
    location: (row.location as Location | undefined) ?? 'unknown',
    edition_type: (row.edition_type as EditionType | undefined) ?? 'none',
    edition_label: row.edition_label ?? null,
    physical_location: parsePlaces(row.physical_location),
    box_type: (row.box_type as BoxType | undefined) ?? 'none',
    download_url: row.download_url ?? null,
    dumped: !!row.dumped,
    custom_description: row.custom_description ?? null,
    added_at: row.added_at,
    updated_at: row.updated_at,
  };
}

export interface ListOptions {
  status?: Status | '';
  q?: string;
  producer?: string;
  publisher?: string;
  series?: number;
  tag?: string;
  place?: string;
  yearMin?: number;
  yearMax?: number;
  dumped?: boolean;
  sort?:
    | 'updated_at'
    | 'added_at'
    | 'title'
    | 'rating'
    | 'user_rating'
    | 'playtime'
    | 'length_minutes'
    | 'egs_playtime'
    | 'combined_playtime'
    | 'released'
    | 'producer'
    | 'publisher'
    | 'egs_rating'
    | 'combined_rating'
    | 'custom';
  order?: 'asc' | 'desc';
}

export function listCollection({
  status,
  q,
  producer,
  publisher,
  series,
  tag,
  place,
  yearMin,
  yearMax,
  dumped,
  sort = 'updated_at',
  order = 'desc',
}: ListOptions = {}): CollectionItem[] {
  const sortMap: Record<NonNullable<ListOptions['sort']>, string> = {
    updated_at: 'c.updated_at',
    added_at: 'c.added_at',
    title: 'v.title',
    rating: 'v.rating',
    user_rating: 'c.user_rating',
    // User's own recorded playtime, nothing else. The `length_minutes`
    // and `egs_playtime` sorts cover the community sides; `combined_playtime`
    // is the rollup. No fallback so a "My playtime" sort really means mine.
    playtime: 'NULLIF(c.playtime_minutes, 0)',
    // VNDB community length only.
    length_minutes: 'v.length_minutes',
    // EGS user-review median only.
    egs_playtime: 'e.playtime_median_minutes',
    // "All playtime": average of every populated source (VNDB length,
    // EGS user-review median, user's own recorded time). Divide by the
    // number of sources actually populated so a single-source value
    // ranks at its own magnitude rather than getting watered down by
    // missing data. NULL only when every source is empty/0 — those
    // entries sort last.
    //
    // Example: VNDB=95, EGS=90, Mine=93 → (95+90+93)/3 = 92.67
    //          VNDB=null, EGS=100         → 100/1 = 100
    //          VNDB=71, EGS=24, Mine=0    → (71+24)/2 = 47.5
    combined_playtime:
      '(COALESCE(v.length_minutes, 0) + COALESCE(e.playtime_median_minutes, 0) + COALESCE(NULLIF(c.playtime_minutes, 0), 0)) ' +
      ' / NULLIF(' +
      '   (CASE WHEN v.length_minutes IS NULL OR v.length_minutes = 0 THEN 0 ELSE 1 END) + ' +
      '   (CASE WHEN e.playtime_median_minutes IS NULL OR e.playtime_median_minutes = 0 THEN 0 ELSE 1 END) + ' +
      '   (CASE WHEN c.playtime_minutes IS NULL OR c.playtime_minutes = 0 THEN 0 ELSE 1 END)' +
      ' , 0)',
    released: 'v.released',
    // First-by-name across all entries: a VN's publisher array is
    // ordered by release-iteration order in setVnPublishers (which
    // is fetch-order, not stable). Picking the alphabetically-first
    // entry per row makes the sort deterministic.
    producer:
      "(SELECT MIN(json_extract(value, '$.name')) FROM json_each(COALESCE(v.developers, '[]')))",
    publisher:
      "(SELECT MIN(json_extract(value, '$.name')) FROM json_each(COALESCE(v.publishers, '[]')))",
    egs_rating: 'e.median',
    // Combined: VNDB rating (0-100) and EGS median (0-100), averaged.
    // When only one exists, fall back to it; nulls last regardless.
    combined_rating:
      'CASE WHEN v.rating IS NULL AND e.median IS NULL THEN NULL ' +
      'WHEN v.rating IS NULL THEN e.median ' +
      'WHEN e.median IS NULL THEN v.rating ' +
      'ELSE (v.rating + e.median) / 2.0 END',
    // Manual drag order. 0 = unset (the user never dragged this one); we push
    // those to the bottom regardless of asc/desc so dragged items always lead.
    custom: 'CASE WHEN c.custom_order = 0 THEN 1 ELSE 0 END, c.custom_order',
  };
  const needsEgsJoin =
    sort === 'egs_rating' ||
    sort === 'combined_rating' ||
    sort === 'egs_playtime' ||
    sort === 'combined_playtime';
  const sortCol = sortMap[sort] ?? 'c.updated_at';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) {
    where.push('c.status = ?');
    params.push(status);
  }
  if (q) {
    // Escape SQL LIKE wildcards so a literal underscore or percent
    // in the user query matches literally. Without this, typing
    // `egs_` (a common synthetic-id prefix) matched every 4-char
    // run after "egs" — the `_` was acting as a single-char
    // wildcard. The ESCAPE clause makes `\` a literal-escape char.
    const safe = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    where.push("(v.title LIKE ? ESCAPE '\\' OR v.alttitle LIKE ? ESCAPE '\\')");
    params.push(`%${safe}%`, `%${safe}%`);
  }
  if (producer) {
    where.push("EXISTS (SELECT 1 FROM json_each(v.developers) WHERE json_extract(value, '$.id') = ?)");
    params.push(producer);
  }
  if (publisher) {
    where.push("EXISTS (SELECT 1 FROM json_each(COALESCE(v.publishers, '[]')) WHERE json_extract(value, '$.id') = ?)");
    params.push(publisher);
  }
  if (tag) {
    where.push("EXISTS (SELECT 1 FROM json_each(v.tags) WHERE json_extract(value, '$.id') = ?)");
    params.push(tag);
  }
  if (place) {
    where.push(`(
      json_valid(c.physical_location)
      AND EXISTS (SELECT 1 FROM json_each(c.physical_location) WHERE value = ?)
    )`);
    params.push(place);
  }
  if (typeof yearMin === 'number') {
    where.push("substr(v.released, 1, 4) >= ?");
    params.push(String(yearMin));
  }
  if (typeof yearMax === 'number') {
    where.push("substr(v.released, 1, 4) <= ?");
    params.push(String(yearMax));
  }
  if (typeof dumped === 'boolean') {
    where.push('c.dumped = ?');
    params.push(dumped ? 1 : 0);
  }
  let join = '';
  if (series) {
    join = 'JOIN series_vn sv ON sv.vn_id = v.id ';
    where.push('sv.series_id = ?');
    params.push(series);
  }
  if (needsEgsJoin) {
    join += 'LEFT JOIN egs_game e ON e.vn_id = v.id ';
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`
      SELECT v.*, c.status, c.user_rating, c.playtime_minutes, c.started_date,
             c.finished_date, c.notes, c.favorite, c.location, c.edition_type,
             c.edition_label, c.physical_location, c.box_type, c.download_url,
             c.dumped, c.custom_description, c.added_at, c.updated_at
      FROM collection c JOIN vn v ON v.id = c.vn_id
      ${join}
      ${whereSql}
      ORDER BY ${sortCol} ${dir} NULLS LAST
    `)
    .all(...params) as DbRow[];
  const items = rows.map((r) => rowToItem(r)!).filter(Boolean);
  const egsMap = getEgsForVns(items.map((i) => i.id));
  for (const item of items) {
    item.series = listSeriesForVn(item.id);
    const egs = egsMap.get(item.id);
    item.egs = egs
      ? {
          egs_id: egs.egs_id,
          median: egs.median,
          average: egs.average,
          count: egs.count,
          playtime_median_minutes: egs.playtime_median_minutes,
          source: egs.source,
          okazu: egs.okazu == null ? null : !!egs.okazu,
          erogame: egs.erogame == null ? null : !!egs.erogame,
        }
      : null;
  }
  return items;
}

export function getCollectionItem(vnId: string): CollectionItem | null {
  const row = db
    .prepare(`
      SELECT v.*, c.status, c.user_rating, c.playtime_minutes, c.started_date,
             c.finished_date, c.notes, c.favorite, c.location, c.edition_type,
             c.edition_label, c.physical_location, c.box_type, c.download_url,
             c.dumped, c.custom_description, c.added_at, c.updated_at
      FROM vn v LEFT JOIN collection c ON c.vn_id = v.id
      WHERE v.id = ?
    `)
    .get(vnId) as DbRow | undefined;
  const item = rowToItem(row);
  if (item) {
    item.series = listSeriesForVn(item.id);
    const egs = getEgsForVn(item.id);
    item.egs = egs
      ? {
          egs_id: egs.egs_id,
          median: egs.median,
          average: egs.average,
          count: egs.count,
          playtime_median_minutes: egs.playtime_median_minutes,
          source: egs.source,
          okazu: egs.okazu == null ? null : !!egs.okazu,
          erogame: egs.erogame == null ? null : !!egs.erogame,
        }
      : null;
  }
  return item;
}

export function getStats(): Stats {
  const total = (db.prepare('SELECT COUNT(*) AS n FROM collection').get() as { n: number }).n;
  const byStatus = db
    .prepare('SELECT status, COUNT(*) AS n FROM collection GROUP BY status')
    .all() as { status: Status; n: number }[];
  const playtime_minutes = (db.prepare('SELECT COALESCE(SUM(playtime_minutes), 0) AS m FROM collection').get() as { m: number }).m;
  return { total, byStatus, playtime_minutes };
}

export interface AggregateStats {
  ratingDistribution: { bucket: number; count: number }[]; // 1..10
  finishedByMonth: { month: string; count: number; minutes: number }[];
  byLanguage: { lang: string; count: number }[];
  byPlatform: { platform: string; count: number }[];
  byLocation: { location: string; count: number }[];
  byEdition: { edition: string; count: number }[];
  topTags: { id: string; name: string; count: number }[];
  byYear: { year: string; count: number }[];
  egs: {
    matched: number;
    unmatched: number;
    avg_median: number | null;
    sum_playtime_minutes: number;
  };
}

export function getAggregateStats(): AggregateStats {
  const ratingsRaw = db
    .prepare('SELECT user_rating FROM collection WHERE user_rating IS NOT NULL')
    .all() as { user_rating: number }[];
  const ratingDistribution = Array.from({ length: 10 }, (_, i) => ({ bucket: i + 1, count: 0 }));
  for (const r of ratingsRaw) {
    const idx = Math.min(9, Math.max(0, Math.floor(r.user_rating / 10) - 1));
    ratingDistribution[idx].count++;
  }

  const finishedByMonth = db
    .prepare(`
      SELECT substr(finished_date, 1, 7) AS month,
             COUNT(*) AS count,
             COALESCE(SUM(playtime_minutes), 0) AS minutes
      FROM collection
      WHERE finished_date IS NOT NULL AND length(finished_date) >= 7
      GROUP BY month
      ORDER BY month ASC
    `)
    .all() as { month: string; count: number; minutes: number }[];

  const byLanguage = db
    .prepare(`
      SELECT lang AS lang, COUNT(*) AS count FROM (
        SELECT DISTINCT v.id AS vn_id, je.value AS lang
        FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.languages) je
      )
      GROUP BY lang ORDER BY count DESC LIMIT 12
    `)
    .all() as { lang: string; count: number }[];

  const byPlatform = db
    .prepare(`
      SELECT platform AS platform, COUNT(*) AS count FROM (
        SELECT DISTINCT v.id AS vn_id, je.value AS platform
        FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.platforms) je
      )
      GROUP BY platform ORDER BY count DESC LIMIT 12
    `)
    .all() as { platform: string; count: number }[];

  const byLocation = db
    .prepare(`SELECT location, COUNT(*) AS count FROM collection GROUP BY location ORDER BY count DESC`)
    .all() as { location: string; count: number }[];

  const byEdition = db
    .prepare(`SELECT edition_type AS edition, COUNT(*) AS count FROM collection GROUP BY edition_type ORDER BY count DESC`)
    .all() as { edition: string; count: number }[];

  const topTags = db
    .prepare(`
      SELECT
        json_extract(je.value, '$.id') AS tag_id,
        json_extract(je.value, '$.name') AS tag_name,
        COUNT(*) AS count
      FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.tags) je
      WHERE COALESCE(json_extract(je.value, '$.spoiler'), 0) = 0
      GROUP BY tag_id
      ORDER BY count DESC
      LIMIT 12
    `)
    .all() as { tag_id: string; tag_name: string; count: number }[];

  const byYear = db
    .prepare(`
      SELECT substr(v.released, 1, 4) AS year, COUNT(*) AS count
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE v.released IS NOT NULL AND length(v.released) >= 4
      GROUP BY year ORDER BY year ASC
    `)
    .all() as { year: string; count: number }[];

  const egsAgg = db
    .prepare(`
      SELECT
        COUNT(CASE WHEN e.egs_id IS NOT NULL THEN 1 END) AS matched,
        COUNT(CASE WHEN e.vn_id IS NULL OR e.egs_id IS NULL THEN 1 END) AS unmatched,
        AVG(CASE WHEN e.median IS NOT NULL THEN e.median END) AS avg_median,
        COALESCE(SUM(CASE WHEN e.playtime_median_minutes IS NOT NULL THEN e.playtime_median_minutes END), 0) AS sum_playtime
      FROM collection c
      LEFT JOIN egs_game e ON e.vn_id = c.vn_id
    `)
    .get() as { matched: number; unmatched: number; avg_median: number | null; sum_playtime: number };

  return {
    ratingDistribution,
    finishedByMonth,
    byLanguage,
    byPlatform,
    byLocation,
    byEdition,
    topTags: topTags.map((t) => ({ id: t.tag_id, name: t.tag_name, count: t.count })),
    byYear,
    egs: {
      matched: egsAgg.matched ?? 0,
      unmatched: egsAgg.unmatched ?? 0,
      avg_median: egsAgg.avg_median != null ? Math.round(egsAgg.avg_median * 10) / 10 : null,
      sum_playtime_minutes: egsAgg.sum_playtime ?? 0,
    },
  };
}

export function isValidStatus(v: unknown): v is Status {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

export function isValidLocation(v: unknown): v is Location {
  return typeof v === 'string' && (LOCATIONS as readonly string[]).includes(v);
}

export function isValidEditionType(v: unknown): v is EditionType {
  return typeof v === 'string' && (EDITION_TYPES as readonly string[]).includes(v);
}

export function isValidBoxType(v: unknown): v is BoxType {
  return typeof v === 'string' && (BOX_TYPES as readonly string[]).includes(v);
}

export interface CollectionTagAggregate {
  id: string;
  name: string;
  category: string | null;
  count: number;
}

export function listCollectionTags(): CollectionTagAggregate[] {
  return (db
    .prepare(`
      SELECT
        json_extract(je.value, '$.id') AS tag_id,
        json_extract(je.value, '$.name') AS tag_name,
        json_extract(je.value, '$.category') AS tag_category,
        COUNT(*) AS tag_count
      FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.tags) je
      WHERE COALESCE(json_extract(je.value, '$.spoiler'), 0) = 0
      GROUP BY tag_id
      ORDER BY tag_count DESC, tag_name COLLATE NOCASE ASC
    `)
    .all() as { tag_id: string; tag_name: string; tag_category: string | null; tag_count: number }[])
    .map((r) => ({ id: r.tag_id, name: r.tag_name, category: r.tag_category, count: r.tag_count }));
}

export interface CoOccurringTag {
  id: string;
  name: string;
  category: string | null;
  /** How many other VNs in the collection share this tag with the seed VN. */
  shared: number;
}

/**
 * For a given VN, surface the tags that frequently co-occur with this VN's
 * own (non-spoiler, non-ero-by-default) tags across the rest of the
 * collection. Bigger `shared` means the tag is part of a recurring cluster
 * in your library.
 *
 * The query walks two `json_each` planes — `seedTags` from the seed VN and
 * `coTags` from every other in-collection VN — then aggregates. The seed's
 * own tags are excluded from the result so you see *adjacent* tags only.
 */
export function getCoOccurringTags(vnId: string, limit = 24): CoOccurringTag[] {
  return (db
    .prepare(`
      WITH seedTags AS (
        SELECT json_extract(je.value, '$.id') AS tag_id
        FROM vn v, json_each(v.tags) je
        WHERE v.id = ?
          AND COALESCE(json_extract(je.value, '$.spoiler'), 0) = 0
      )
      SELECT
        json_extract(coj.value, '$.id') AS tag_id,
        json_extract(coj.value, '$.name') AS tag_name,
        json_extract(coj.value, '$.category') AS tag_category,
        COUNT(DISTINCT c.vn_id) AS shared_count
      FROM collection c
      JOIN vn v2 ON v2.id = c.vn_id
      JOIN json_each(v2.tags) coj
      WHERE c.vn_id <> ?
        AND COALESCE(json_extract(coj.value, '$.spoiler'), 0) = 0
        AND json_extract(coj.value, '$.id') NOT IN (SELECT tag_id FROM seedTags)
        AND EXISTS (
          SELECT 1 FROM json_each(v2.tags) inner_je
          WHERE json_extract(inner_je.value, '$.id') IN (SELECT tag_id FROM seedTags)
        )
      GROUP BY tag_id
      ORDER BY shared_count DESC, tag_name COLLATE NOCASE ASC
      LIMIT ?
    `)
    .all(vnId, vnId, limit) as { tag_id: string; tag_name: string; tag_category: string | null; shared_count: number }[])
    .map((r) => ({ id: r.tag_id, name: r.tag_name, category: r.tag_category, shared: r.shared_count }));
}

// Routes per VN

interface RouteDbRow {
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

function rowToRoute(r: RouteDbRow): RouteRow {
  return {
    id: r.id,
    vn_id: r.vn_id,
    name: r.name,
    completed: !!r.completed,
    completed_date: r.completed_date,
    order_index: r.order_index,
    notes: r.notes,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export function listRoutesForVn(vnId: string): RouteRow[] {
  const rows = db
    .prepare('SELECT * FROM vn_route WHERE vn_id = ? ORDER BY order_index ASC, created_at ASC')
    .all(vnId) as RouteDbRow[];
  return rows.map(rowToRoute);
}

export function getRoute(routeId: number): RouteRow | null {
  const row = db.prepare('SELECT * FROM vn_route WHERE id = ?').get(routeId) as RouteDbRow | undefined;
  return row ? rowToRoute(row) : null;
}

export function createRoute(vnId: string, name: string, orderIndex?: number): RouteRow {
  const now = Date.now();
  const ord =
    orderIndex ??
    (((db.prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM vn_route WHERE vn_id = ?').get(vnId) as { n: number }).n));
  const info = db
    .prepare(`
      INSERT INTO vn_route (vn_id, name, order_index, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(vnId, name, ord, now, now);
  return getRoute(Number(info.lastInsertRowid))!;
}

export interface RoutePatch {
  name?: string;
  completed?: boolean;
  completed_date?: string | null;
  order_index?: number;
  notes?: string | null;
}

export function updateRoute(routeId: number, fields: RoutePatch): RouteRow | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.name !== undefined) {
    sets.push('name = ?');
    params.push(fields.name);
  }
  if (fields.completed !== undefined) {
    sets.push('completed = ?');
    params.push(fields.completed ? 1 : 0);
    // Auto-stamp completed_date when toggled to true with no explicit date.
    if (fields.completed && fields.completed_date === undefined) {
      sets.push('completed_date = COALESCE(completed_date, ?)');
      params.push(new Date().toISOString().slice(0, 10));
    }
    if (!fields.completed && fields.completed_date === undefined) {
      sets.push('completed_date = NULL');
    }
  }
  if (fields.completed_date !== undefined) {
    sets.push('completed_date = ?');
    params.push(fields.completed_date);
  }
  if (fields.order_index !== undefined) {
    sets.push('order_index = ?');
    params.push(fields.order_index);
  }
  if (fields.notes !== undefined) {
    sets.push('notes = ?');
    params.push(fields.notes);
  }
  if (sets.length === 0) return getRoute(routeId);
  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(routeId);
  db.prepare(`UPDATE vn_route SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return getRoute(routeId);
}

export function deleteRoute(routeId: number): boolean {
  return db.prepare('DELETE FROM vn_route WHERE id = ?').run(routeId).changes > 0;
}

export function reorderRoutes(vnId: string, orderedIds: number[]): void {
  const now = Date.now();
  const stmt = db.prepare('UPDATE vn_route SET order_index = ?, updated_at = ? WHERE id = ? AND vn_id = ?');
  const trx = db.transaction(() => {
    orderedIds.forEach((id, index) => {
      stmt.run(index, now, id, vnId);
    });
  });
  trx();
}

// Owned releases

export interface OwnedReleaseRow {
  vn_id: string;
  release_id: string;
  notes: string | null;
  location: string;
  physical_location: string[];
  box_type: string;
  edition_label: string | null;
  condition: string | null;
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  dumped: boolean;
  added_at: number;
}

interface OwnedReleaseDbRow {
  vn_id: string;
  release_id: string;
  notes: string | null;
  location: string | null;
  physical_location: string | null;
  box_type: string | null;
  edition_label: string | null;
  condition: string | null;
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  dumped: number | null;
  added_at: number;
}

function mapOwnedReleaseRow(r: OwnedReleaseDbRow): OwnedReleaseRow {
  return {
    vn_id: r.vn_id,
    release_id: r.release_id,
    notes: r.notes,
    location: r.location ?? 'unknown',
    physical_location: parsePlaces(r.physical_location),
    box_type: r.box_type ?? 'none',
    edition_label: r.edition_label,
    condition: r.condition,
    price_paid: r.price_paid,
    currency: r.currency,
    acquired_date: r.acquired_date,
    dumped: !!r.dumped,
    added_at: r.added_at,
  };
}

export interface ShelfEntry extends OwnedReleaseRow {
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
}

/**
 * Every owned release in the collection joined with its VN's display data,
 * with a single physical location string per entry. Rows without a
 * `physical_location` entry fall into the "Unsorted" bucket so the
 * caller can render them in their own group.
 */
export function listAllOwnedReleases(): ShelfEntry[] {
  const rows = db
    .prepare(`
      SELECT o.*,
             v.title AS vn_title,
             v.image_thumb AS vn_image_thumb,
             v.image_url AS vn_image_url,
             v.local_image_thumb AS vn_local_image_thumb,
             v.image_sexual AS vn_image_sexual
      FROM owned_release o
      JOIN vn v ON v.id = o.vn_id
      ORDER BY v.title COLLATE NOCASE ASC
    `)
    .all() as Array<OwnedReleaseDbRow & {
      vn_title: string;
      vn_image_thumb: string | null;
      vn_image_url: string | null;
      vn_local_image_thumb: string | null;
      vn_image_sexual: number | null;
    }>;
  return rows.map((r) => ({
    ...mapOwnedReleaseRow(r),
    vn_title: r.vn_title,
    vn_image_thumb: r.vn_image_thumb,
    vn_image_url: r.vn_image_url,
    vn_local_image_thumb: r.vn_local_image_thumb,
    vn_image_sexual: r.vn_image_sexual,
  }));
}

export interface DumpStatusEntry {
  vn_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  /** Number of owned_release rows for this VN. */
  total_editions: number;
  /** Number of those that have dumped=1. */
  dumped_editions: number;
  /** True when collection.dumped is also flagged on the VN itself. */
  collection_dumped: boolean;
}

/**
 * Per-VN dump status across the user's collection. Aggregates the
 * owned_release.dumped flag on each release plus collection.dumped
 * on the VN itself, so the dump-management page can show a single
 * progress bar per game (X of Y editions dumped) even when a VN
 * carries multiple physical editions.
 *
 * Sorted: in-progress VNs first (have at least one dumped edition
 * but not all), then untouched (zero dumped), then fully done.
 * Within each group, alphabetical.
 */
export function listDumpStatus(): DumpStatusEntry[] {
  const rows = db
    .prepare(`
      SELECT
        v.id            AS vn_id,
        v.title         AS vn_title,
        v.image_thumb   AS vn_image_thumb,
        v.image_url     AS vn_image_url,
        v.local_image_thumb AS vn_local_image_thumb,
        v.image_sexual  AS vn_image_sexual,
        c.dumped        AS coll_dumped,
        (SELECT COUNT(*) FROM owned_release o WHERE o.vn_id = v.id) AS total_editions,
        (SELECT COUNT(*) FROM owned_release o WHERE o.vn_id = v.id AND o.dumped = 1) AS dumped_editions
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      ORDER BY v.title COLLATE NOCASE ASC
    `)
    .all() as Array<{
      vn_id: string;
      vn_title: string;
      vn_image_thumb: string | null;
      vn_image_url: string | null;
      vn_local_image_thumb: string | null;
      vn_image_sexual: number | null;
      coll_dumped: number;
      total_editions: number;
      dumped_editions: number;
    }>;
  const entries: DumpStatusEntry[] = rows.map((r) => ({
    vn_id: r.vn_id,
    vn_title: r.vn_title,
    vn_image_thumb: r.vn_image_thumb,
    vn_image_url: r.vn_image_url,
    vn_local_image_thumb: r.vn_local_image_thumb,
    vn_image_sexual: r.vn_image_sexual,
    total_editions: r.total_editions,
    dumped_editions: r.dumped_editions,
    collection_dumped: !!r.coll_dumped,
  }));
  // Sort: in-progress (1..N-1 of N dumped) first, untouched (0/N) next,
  // fully-done last. Alphabetical inside each bucket.
  return entries.sort((a, b) => {
    const aDone = a.total_editions > 0 && a.dumped_editions === a.total_editions;
    const bDone = b.total_editions > 0 && b.dumped_editions === b.total_editions;
    const aPartial = a.dumped_editions > 0 && !aDone;
    const bPartial = b.dumped_editions > 0 && !bDone;
    const aBucket = aPartial ? 0 : aDone ? 2 : 1;
    const bBucket = bPartial ? 0 : bDone ? 2 : 1;
    if (aBucket !== bBucket) return aBucket - bBucket;
    return a.vn_title.localeCompare(b.vn_title);
  });
}

export interface DumpSummary {
  /** Total VNs in the collection that have at least one owned release. */
  totalVns: number;
  /** Total owned_release rows. */
  totalEditions: number;
  /** owned_release rows with dumped=1. */
  dumpedEditions: number;
  /** VNs where every edition is dumped. */
  fullyDumpedVns: number;
  /** Percentage (0-100, rounded) of editions that are dumped. */
  editionPct: number;
}

export function getDumpSummary(): DumpSummary {
  const totals = db
    .prepare(`
      SELECT
        (SELECT COUNT(DISTINCT vn_id) FROM owned_release) AS total_vns,
        (SELECT COUNT(*)              FROM owned_release) AS total_editions,
        (SELECT COUNT(*)              FROM owned_release WHERE dumped = 1) AS dumped_editions
    `)
    .get() as { total_vns: number; total_editions: number; dumped_editions: number };
  const fullyDumpedVns = (db
    .prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT vn_id, SUM(CASE WHEN dumped = 1 THEN 0 ELSE 1 END) AS notdone
        FROM owned_release
        GROUP BY vn_id
        HAVING notdone = 0
      )
    `)
    .get() as { n: number }).n;
  const editionPct =
    totals.total_editions === 0
      ? 0
      : Math.round((totals.dumped_editions / totals.total_editions) * 100);
  return {
    totalVns: totals.total_vns,
    totalEditions: totals.total_editions,
    dumpedEditions: totals.dumped_editions,
    fullyDumpedVns,
    editionPct,
  };
}

/**
 * One row per user-defined physical shelf. `cols` × `rows` defines the
 * 2-D grid the layout editor renders; placed editions live in
 * `shelf_slot`. `order_index` controls the tab order on `/shelf`.
 */
export interface ShelfUnit {
  id: number;
  name: string;
  cols: number;
  rows: number;
  order_index: number;
  created_at: number;
  updated_at: number;
}

export interface ShelfUnitWithCount extends ShelfUnit {
  placed_count: number;
}

const SHELF_MIN = 1;
const SHELF_MAX = 30;

function clampShelfDim(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(SHELF_MIN, Math.min(SHELF_MAX, Math.floor(n)));
}

export function listShelves(): ShelfUnitWithCount[] {
  return db
    .prepare(`
      SELECT u.*,
             (SELECT COUNT(*) FROM shelf_slot s WHERE s.shelf_id = u.id) AS placed_count
      FROM shelf_unit u
      ORDER BY u.order_index ASC, u.id ASC
    `)
    .all() as ShelfUnitWithCount[];
}

export function getShelf(id: number): ShelfUnit | null {
  const row = db.prepare('SELECT * FROM shelf_unit WHERE id = ?').get(id) as ShelfUnit | undefined;
  return row ?? null;
}

export function createShelf(input: {
  name: string;
  cols?: number;
  rows?: number;
}): ShelfUnit {
  const name = input.name.trim();
  if (!name) throw new Error('shelf name required');
  const cols = clampShelfDim(input.cols ?? 8, 8);
  const rows = clampShelfDim(input.rows ?? 4, 4);
  const now = Date.now();
  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) AS o FROM shelf_unit').get() as { o: number };
  const info = db
    .prepare(
      `INSERT INTO shelf_unit (name, cols, rows, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(name, cols, rows, maxOrder.o + 1, now, now);
  return getShelf(Number(info.lastInsertRowid))!;
}

export function renameShelf(id: number, name: string): ShelfUnit | null {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('shelf name required');
  const info = db
    .prepare('UPDATE shelf_unit SET name = ?, updated_at = ? WHERE id = ?')
    .run(trimmed, Date.now(), id);
  return info.changes ? getShelf(id) : null;
}

export interface ShelfResizeResult {
  shelf: ShelfUnit;
  /** Slots that fell outside the new bounds and were sent back to the pool. */
  evicted: Array<{ vn_id: string; release_id: string; row: number; col: number }>;
}

/**
 * Resize a shelf. Slots that fall outside the new (cols × rows) bounds
 * are evicted back to the unplaced pool — we surface them in the
 * response so the UI can tell the user what moved. No silent data loss.
 */
export function resizeShelf(id: number, cols: number, rows: number): ShelfResizeResult | null {
  const shelf = getShelf(id);
  if (!shelf) return null;
  const nextCols = clampShelfDim(cols, shelf.cols);
  const nextRows = clampShelfDim(rows, shelf.rows);
  const evicted = db
    .prepare(
      'SELECT vn_id, release_id, row, col FROM shelf_slot WHERE shelf_id = ? AND (row >= ? OR col >= ?)',
    )
    .all(id, nextRows, nextCols) as Array<{ vn_id: string; release_id: string; row: number; col: number }>;
  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM shelf_slot WHERE shelf_id = ? AND (row >= ? OR col >= ?)',
    ).run(id, nextRows, nextCols);
    db.prepare(
      'UPDATE shelf_unit SET cols = ?, rows = ?, updated_at = ? WHERE id = ?',
    ).run(nextCols, nextRows, Date.now(), id);
  });
  tx();
  return { shelf: getShelf(id)!, evicted };
}

export function deleteShelf(id: number): boolean {
  const info = db.prepare('DELETE FROM shelf_unit WHERE id = ?').run(id);
  return info.changes > 0;
}

export function reorderShelves(orderedIds: number[]): void {
  const upd = db.prepare('UPDATE shelf_unit SET order_index = ?, updated_at = ? WHERE id = ?');
  const now = Date.now();
  const tx = db.transaction(() => {
    orderedIds.forEach((id, i) => upd.run(i, now, id));
  });
  tx();
}

export interface ShelfSlotEntry {
  shelf_id: number;
  row: number;
  col: number;
  vn_id: string;
  release_id: string;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  edition_label: string | null;
  box_type: string;
  condition: string | null;
  dumped: boolean;
}

export function listShelfSlots(shelfId: number): ShelfSlotEntry[] {
  const rows = db
    .prepare(`
      SELECT s.shelf_id, s.row, s.col, s.vn_id, s.release_id,
             v.title          AS vn_title,
             v.image_thumb    AS vn_image_thumb,
             v.image_url      AS vn_image_url,
             v.local_image_thumb AS vn_local_image_thumb,
             v.image_sexual   AS vn_image_sexual,
             o.edition_label  AS edition_label,
             o.box_type       AS box_type,
             o.condition      AS condition,
             o.dumped         AS dumped
      FROM shelf_slot s
      JOIN owned_release o ON o.vn_id = s.vn_id AND o.release_id = s.release_id
      JOIN vn v ON v.id = s.vn_id
      WHERE s.shelf_id = ?
    `)
    .all(shelfId) as Array<Omit<ShelfSlotEntry, 'dumped' | 'box_type'> & { dumped: number | null; box_type: string | null }>;
  return rows.map((r) => ({
    ...r,
    dumped: !!r.dumped,
    box_type: r.box_type ?? 'none',
  }));
}

/**
 * The pool of owned editions that aren't yet placed on any shelf.
 * Joined with VN display data so the layout editor can render rich
 * cards without a second round-trip.
 */
export function listUnplacedOwnedReleases(): ShelfEntry[] {
  const rows = db
    .prepare(`
      SELECT o.*,
             v.title             AS vn_title,
             v.image_thumb       AS vn_image_thumb,
             v.image_url         AS vn_image_url,
             v.local_image_thumb AS vn_local_image_thumb,
             v.image_sexual      AS vn_image_sexual
      FROM owned_release o
      JOIN vn v ON v.id = o.vn_id
      WHERE NOT EXISTS (
        SELECT 1 FROM shelf_slot s
        WHERE s.vn_id = o.vn_id AND s.release_id = o.release_id
      )
      ORDER BY v.title COLLATE NOCASE ASC
    `)
    .all() as Array<OwnedReleaseDbRow & {
      vn_title: string;
      vn_image_thumb: string | null;
      vn_image_url: string | null;
      vn_local_image_thumb: string | null;
      vn_image_sexual: number | null;
    }>;
  return rows.map((r) => ({
    ...mapOwnedReleaseRow(r),
    vn_title: r.vn_title,
    vn_image_thumb: r.vn_image_thumb,
    vn_image_url: r.vn_image_url,
    vn_local_image_thumb: r.vn_local_image_thumb,
    vn_image_sexual: r.vn_image_sexual,
  }));
}

export interface PlaceShelfItemInput {
  shelfId: number;
  row: number;
  col: number;
  vnId: string;
  releaseId: string;
}

export interface PlaceShelfItemResult {
  /** When the target slot was occupied AND the source had a prior slot, the previous tenant gets moved to the source slot — a swap. Otherwise this is null. */
  swapped: { vn_id: string; release_id: string; row: number; col: number } | null;
}

/**
 * Place an owned edition into a specific (row, col) slot on a shelf.
 *
 * - If the target slot is empty: removes any prior placement of the
 *   item and inserts at (row, col).
 * - If the target slot is occupied AND the moving item had a previous
 *   slot on the SAME shelf: swap the two items (atomic).
 * - If the target slot is occupied AND the moving item came from the
 *   pool (or a different shelf): the occupant is evicted to the pool.
 *
 * Every branch runs in one transaction so the UI never sees a torn
 * state. Throws if the slot is out of bounds for the shelf.
 */
export function placeShelfItem(input: PlaceShelfItemInput): PlaceShelfItemResult {
  const shelf = getShelf(input.shelfId);
  if (!shelf) throw new Error('shelf not found');
  if (input.row < 0 || input.row >= shelf.rows) throw new Error('row out of bounds');
  if (input.col < 0 || input.col >= shelf.cols) throw new Error('col out of bounds');

  const owned = db
    .prepare('SELECT 1 FROM owned_release WHERE vn_id = ? AND release_id = ?')
    .get(input.vnId, input.releaseId);
  if (!owned) throw new Error('owned edition not found');

  let swapped: PlaceShelfItemResult['swapped'] = null;
  const tx = db.transaction(() => {
    const prior = db
      .prepare(
        'SELECT shelf_id, row, col FROM shelf_slot WHERE vn_id = ? AND release_id = ?',
      )
      .get(input.vnId, input.releaseId) as
      | { shelf_id: number; row: number; col: number }
      | undefined;

    const occupant = db
      .prepare(
        'SELECT vn_id, release_id FROM shelf_slot WHERE shelf_id = ? AND row = ? AND col = ?',
      )
      .get(input.shelfId, input.row, input.col) as
      | { vn_id: string; release_id: string }
      | undefined;

    // Identical no-op (drag and drop onto the same slot).
    if (
      occupant &&
      occupant.vn_id === input.vnId &&
      occupant.release_id === input.releaseId
    ) {
      return;
    }

    // Always clear both ends first so the UNIQUE constraints don't
    // refuse the inserts.
    db.prepare(
      'DELETE FROM shelf_slot WHERE shelf_id = ? AND row = ? AND col = ?',
    ).run(input.shelfId, input.row, input.col);
    db.prepare(
      'DELETE FROM shelf_slot WHERE vn_id = ? AND release_id = ?',
    ).run(input.vnId, input.releaseId);

    db.prepare(
      `INSERT INTO shelf_slot (shelf_id, row, col, vn_id, release_id, placed_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      input.shelfId,
      input.row,
      input.col,
      input.vnId,
      input.releaseId,
      Date.now(),
    );

    // Swap-back: if the moving item used to live on a slot AND the
    // target had an occupant, drop the occupant into the now-empty
    // source slot so nothing is evicted to the pool.
    if (occupant && prior) {
      db.prepare(
        `INSERT INTO shelf_slot (shelf_id, row, col, vn_id, release_id, placed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        prior.shelf_id,
        prior.row,
        prior.col,
        occupant.vn_id,
        occupant.release_id,
        Date.now(),
      );
      swapped = {
        vn_id: occupant.vn_id,
        release_id: occupant.release_id,
        row: prior.row,
        col: prior.col,
      };
    }
  });
  tx();
  return { swapped };
}

/** Remove an edition's placement (returns it to the unplaced pool). */
export function removeShelfPlacement(vnId: string, releaseId: string): boolean {
  const info = db
    .prepare('DELETE FROM shelf_slot WHERE vn_id = ? AND release_id = ?')
    .run(vnId, releaseId);
  return info.changes > 0;
}

/** Where (if anywhere) a specific edition currently lives. */
export function getShelfPlacementForEdition(
  vnId: string,
  releaseId: string,
): { shelf_id: number; shelf_name: string; row: number; col: number } | null {
  const row = db
    .prepare(`
      SELECT s.shelf_id, u.name AS shelf_name, s.row, s.col
      FROM shelf_slot s
      JOIN shelf_unit u ON u.id = s.shelf_id
      WHERE s.vn_id = ? AND s.release_id = ?
    `)
    .get(vnId, releaseId) as
    | { shelf_id: number; shelf_name: string; row: number; col: number }
    | undefined;
  return row ?? null;
}

export function listOwnedReleasesForVn(vnId: string): OwnedReleaseRow[] {
  const rows = db
    .prepare('SELECT * FROM owned_release WHERE vn_id = ? ORDER BY added_at DESC')
    .all(vnId) as OwnedReleaseDbRow[];
  return rows.map(mapOwnedReleaseRow);
}

export function getOwnedRelease(vnId: string, releaseId: string): OwnedReleaseRow | null {
  const row = db
    .prepare('SELECT * FROM owned_release WHERE vn_id = ? AND release_id = ?')
    .get(vnId, releaseId) as OwnedReleaseDbRow | undefined;
  return row ? mapOwnedReleaseRow(row) : null;
}

export interface OwnedReleasePatch {
  notes?: string | null;
  location?: string;
  physical_location?: string[] | string | null;
  box_type?: string;
  edition_label?: string | null;
  condition?: string | null;
  price_paid?: number | null;
  currency?: string | null;
  acquired_date?: string | null;
  /** Free-form: shop name, URL, second-hand vendor, etc. */
  purchase_place?: string | null;
  dumped?: boolean;
}

export function markReleaseOwned(
  vnId: string,
  releaseId: string,
  patch: OwnedReleasePatch = {},
): void {
  const now = Date.now();
  const exists = db
    .prepare('SELECT 1 FROM owned_release WHERE vn_id = ? AND release_id = ?')
    .get(vnId, releaseId);
  if (exists) {
    updateOwnedRelease(vnId, releaseId, patch);
    return;
  }
  db.prepare(`
    INSERT INTO owned_release (
      vn_id, release_id, notes, location, physical_location, box_type,
      edition_label, condition, price_paid, currency, acquired_date,
      purchase_place, dumped, added_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vnId,
    releaseId,
    patch.notes ?? null,
    patch.location ?? 'unknown',
    serializePlaces(patch.physical_location ?? null),
    patch.box_type ?? 'none',
    patch.edition_label ?? null,
    patch.condition ?? null,
    patch.price_paid ?? null,
    patch.currency ?? null,
    patch.acquired_date ?? null,
    patch.purchase_place ?? null,
    patch.dumped ? 1 : 0,
    now,
  );
}

export function updateOwnedRelease(
  vnId: string,
  releaseId: string,
  patch: OwnedReleasePatch,
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, (v: unknown) => unknown> = {
    notes: (v) => v,
    location: (v) => v,
    physical_location: (v) => serializePlaces(v),
    box_type: (v) => v,
    edition_label: (v) => v,
    condition: (v) => v,
    price_paid: (v) => v,
    currency: (v) => v,
    acquired_date: (v) => v,
    purchase_place: (v) => v,
    dumped: (v) => (v ? 1 : 0),
  };
  for (const key of Object.keys(map) as (keyof typeof map)[]) {
    if (key in patch) {
      sets.push(`${key} = ?`);
      params.push(map[key]((patch as Record<string, unknown>)[key]));
    }
  }
  if (sets.length === 0) return;
  params.push(vnId, releaseId);
  db.prepare(`UPDATE owned_release SET ${sets.join(', ')} WHERE vn_id = ? AND release_id = ?`).run(...params);
}

export function unmarkReleaseOwned(vnId: string, releaseId: string): void {
  db.prepare('DELETE FROM owned_release WHERE vn_id = ? AND release_id = ?').run(vnId, releaseId);
}

export function listKnownPlaces(): string[] {
  const rows = db
    .prepare(`
      SELECT DISTINCT value AS place
      FROM collection c, json_each(c.physical_location)
      WHERE json_valid(c.physical_location)
      ORDER BY value COLLATE NOCASE ASC
    `)
    .all() as { place: string }[];
  return rows.map((r) => r.place);
}

// Producer

export interface ProducerPayload {
  id: string;
  name: string;
  original?: string | null;
  lang?: string | null;
  type?: string | null;
  description?: string | null;
  aliases?: string[];
  extlinks?: { url: string; label: string; name: string }[];
}

interface ProducerDbRow {
  id: string;
  name: string;
  original: string | null;
  lang: string | null;
  type: string | null;
  description: string | null;
  aliases: string | null;
  extlinks: string | null;
  logo_path: string | null;
  fetched_at: number;
}

function producerToRow(row: ProducerDbRow | undefined): ProducerRow | null {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    original: row.original,
    lang: row.lang,
    type: row.type,
    description: row.description,
    aliases: row.aliases ? JSON.parse(row.aliases) : [],
    extlinks: row.extlinks ? JSON.parse(row.extlinks) : [],
    logo_path: row.logo_path,
    fetched_at: row.fetched_at,
  };
}

export function upsertProducer(p: ProducerPayload): void {
  db.prepare(`
    INSERT INTO producer (id, name, original, lang, type, description, aliases, extlinks, fetched_at)
    VALUES (@id, @name, @original, @lang, @type, @description, @aliases, @extlinks, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, original=excluded.original, lang=excluded.lang,
      type=excluded.type, description=excluded.description,
      aliases=excluded.aliases, extlinks=excluded.extlinks,
      fetched_at=excluded.fetched_at
  `).run({
    id: p.id,
    name: p.name,
    original: p.original ?? null,
    lang: p.lang ?? null,
    type: p.type ?? null,
    description: p.description ?? null,
    aliases: JSON.stringify(p.aliases ?? []),
    extlinks: JSON.stringify(p.extlinks ?? []),
    fetched_at: Date.now(),
  });
}

export function getProducer(id: string): ProducerRow | null {
  const row = db.prepare('SELECT * FROM producer WHERE id = ?').get(id) as ProducerDbRow | undefined;
  return producerToRow(row);
}

export function setProducerLogo(id: string, logoPath: string | null): void {
  db.prepare('UPDATE producer SET logo_path = ? WHERE id = ?').run(logoPath, id);
}

export function listProducerStats(): ProducerStat[] {
  const rows = db
    .prepare(`
      WITH dev_pairs AS (
        SELECT v.id AS vn_id,
               json_extract(de.value, '$.id') AS pid,
               json_extract(de.value, '$.name') AS pname
        FROM collection c
        JOIN vn v ON v.id = c.vn_id
        JOIN json_each(v.developers) de
      )
      SELECT
        dp.pid AS id,
        COALESCE(p.name, dp.pname) AS name,
        p.original, p.lang, p.type, p.description, p.aliases, p.extlinks, p.logo_path,
        COALESCE(p.fetched_at, 0) AS fetched_at,
        COUNT(DISTINCT dp.vn_id) AS vn_count,
        AVG(c.user_rating) AS avg_user_rating,
        AVG(v.rating) AS avg_rating
      FROM dev_pairs dp
      JOIN collection c ON c.vn_id = dp.vn_id
      JOIN vn v ON v.id = dp.vn_id
      LEFT JOIN producer p ON p.id = dp.pid
      WHERE dp.pid IS NOT NULL
      GROUP BY dp.pid
      ORDER BY vn_count DESC, name ASC
    `)
    .all() as (ProducerDbRow & { vn_count: number; avg_user_rating: number | null; avg_rating: number | null })[];
  return rows.map((r) => ({
    ...(producerToRow(r) as ProducerRow),
    vn_count: r.vn_count,
    avg_user_rating: r.avg_user_rating,
    avg_rating: r.avg_rating,
  }));
}

/**
 * Symmetric to `listProducerStats` but indexed on `vn.publishers` (the
 * deduped publisher list set by `setVnPublishers` after walking each
 * release's `producers[]`). Publishers that never also developed the
 * VN are surfaced here even when they're absent from `vn.developers`,
 * so a publisher-only studio (Mangagamer, JAST, …) is rankable.
 */
export function listPublisherStats(): ProducerStat[] {
  const rows = db
    .prepare(`
      WITH pub_pairs AS (
        SELECT v.id AS vn_id,
               json_extract(pe.value, '$.id') AS pid,
               json_extract(pe.value, '$.name') AS pname
        FROM collection c
        JOIN vn v ON v.id = c.vn_id
        JOIN json_each(COALESCE(v.publishers, '[]')) pe
      )
      SELECT
        pp.pid AS id,
        COALESCE(p.name, pp.pname) AS name,
        p.original, p.lang, p.type, p.description, p.aliases, p.extlinks, p.logo_path,
        COALESCE(p.fetched_at, 0) AS fetched_at,
        COUNT(DISTINCT pp.vn_id) AS vn_count,
        AVG(c.user_rating) AS avg_user_rating,
        AVG(v.rating) AS avg_rating
      FROM pub_pairs pp
      JOIN collection c ON c.vn_id = pp.vn_id
      JOIN vn v ON v.id = pp.vn_id
      LEFT JOIN producer p ON p.id = pp.pid
      WHERE pp.pid IS NOT NULL
      GROUP BY pp.pid
      ORDER BY vn_count DESC, name ASC
    `)
    .all() as (ProducerDbRow & { vn_count: number; avg_user_rating: number | null; avg_rating: number | null })[];
  return rows.map((r) => ({
    ...(producerToRow(r) as ProducerRow),
    vn_count: r.vn_count,
    avg_user_rating: r.avg_user_rating,
    avg_rating: r.avg_rating,
  }));
}

// Series

export function listSeries(): SeriesRow[] {
  return db.prepare('SELECT * FROM series ORDER BY name ASC').all() as SeriesRow[];
}

export function listSeriesForVn(vnId: string): SeriesLite[] {
  return db
    .prepare(`
      SELECT s.id, s.name FROM series s
      JOIN series_vn sv ON sv.series_id = s.id
      WHERE sv.vn_id = ? ORDER BY s.name
    `)
    .all(vnId) as SeriesLite[];
}

export function getSeries(id: number): SeriesWithVns | null {
  const s = db.prepare('SELECT * FROM series WHERE id = ?').get(id) as SeriesRow | undefined;
  if (!s) return null;
  const vns = db
    .prepare(`
      SELECT v.id, v.title, v.image_thumb, v.local_image_thumb, c.status, sv.order_index
      FROM series_vn sv
      JOIN vn v ON v.id = sv.vn_id
      LEFT JOIN collection c ON c.vn_id = v.id
      WHERE sv.series_id = ?
      ORDER BY sv.order_index ASC, v.title ASC
    `)
    .all(id) as SeriesWithVns['vns'];
  return { ...s, vns };
}

export function createSeries(name: string, description: string | null = null): SeriesRow {
  const now = Date.now();
  const info = db
    .prepare('INSERT INTO series (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(name, description, now, now);
  return db.prepare('SELECT * FROM series WHERE id = ?').get(info.lastInsertRowid) as SeriesRow;
}

export function updateSeries(
  id: number,
  fields: { name?: string; description?: string | null; cover_path?: string | null; banner_path?: string | null },
): SeriesRow | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if ('name' in fields && fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
  if ('description' in fields) { sets.push('description = ?'); params.push(fields.description ?? null); }
  if ('cover_path' in fields) { sets.push('cover_path = ?'); params.push(fields.cover_path ?? null); }
  if ('banner_path' in fields) { sets.push('banner_path = ?'); params.push(fields.banner_path ?? null); }
  if (sets.length === 0) return db.prepare('SELECT * FROM series WHERE id = ?').get(id) as SeriesRow | null;
  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);
  db.prepare(`UPDATE series SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT * FROM series WHERE id = ?').get(id) as SeriesRow | null;
}

export function deleteSeries(id: number): void {
  db.prepare('DELETE FROM series WHERE id = ?').run(id);
}

export function addVnToSeries(seriesId: number, vnId: string, orderIndex = 0): void {
  db.prepare(`
    INSERT INTO series_vn (series_id, vn_id, order_index)
    VALUES (?, ?, ?)
    ON CONFLICT(series_id, vn_id) DO UPDATE SET order_index = excluded.order_index
  `).run(seriesId, vnId, orderIndex);
}

export function removeVnFromSeries(seriesId: number, vnId: string): void {
  db.prepare('DELETE FROM series_vn WHERE series_id = ? AND vn_id = ?').run(seriesId, vnId);
}

// Saved filters

export interface SavedFilter {
  id: number;
  name: string;
  params: string;
  position: number;
  created_at: number;
}

export function listSavedFilters(): SavedFilter[] {
  return db
    .prepare('SELECT * FROM saved_filter ORDER BY position ASC, id ASC')
    .all() as SavedFilter[];
}

export function createSavedFilter(name: string, params: string): SavedFilter {
  const now = Date.now();
  const nextPos = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM saved_filter').get() as { p: number }).p;
  const info = db
    .prepare('INSERT INTO saved_filter (name, params, position, created_at) VALUES (?, ?, ?, ?)')
    .run(name.trim().slice(0, 60), params.slice(0, 2000), nextPos, now);
  return db.prepare('SELECT * FROM saved_filter WHERE id = ?').get(info.lastInsertRowid) as SavedFilter;
}

export function deleteSavedFilter(id: number): boolean {
  return db.prepare('DELETE FROM saved_filter WHERE id = ?').run(id).changes > 0;
}

export function reorderSavedFilters(ids: number[]): void {
  const upd = db.prepare('UPDATE saved_filter SET position = ? WHERE id = ?');
  db.transaction(() => {
    ids.forEach((id, i) => upd.run(i + 1, id));
  })();
}

// Reading queue

export interface ReadingQueueEntry {
  vn_id: string;
  position: number;
  added_at: number;
}

export function listReadingQueue(): ReadingQueueEntry[] {
  return db
    .prepare('SELECT * FROM reading_queue ORDER BY position ASC, added_at ASC')
    .all() as ReadingQueueEntry[];
}

export function addToReadingQueue(vnId: string): ReadingQueueEntry {
  const next = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM reading_queue').get() as { p: number }).p;
  const now = Date.now();
  db.prepare(`
    INSERT INTO reading_queue (vn_id, position, added_at) VALUES (?, ?, ?)
    ON CONFLICT(vn_id) DO NOTHING
  `).run(vnId, next, now);
  return db.prepare('SELECT * FROM reading_queue WHERE vn_id = ?').get(vnId) as ReadingQueueEntry;
}

export function removeFromReadingQueue(vnId: string): boolean {
  return db.prepare('DELETE FROM reading_queue WHERE vn_id = ?').run(vnId).changes > 0;
}

export function reorderReadingQueue(ids: string[]): void {
  const upd = db.prepare('UPDATE reading_queue SET position = ? WHERE vn_id = ?');
  db.transaction(() => {
    ids.forEach((id, i) => upd.run(i + 1, id));
  })();
}

// Reading goal — one row per calendar year.

export interface ReadingGoal {
  year: number;
  target: number;
  updated_at: number;
}

export function getReadingGoal(year: number): ReadingGoal | null {
  return (db.prepare('SELECT * FROM reading_goal WHERE year = ?').get(year) as ReadingGoal | undefined) ?? null;
}

export function setReadingGoal(year: number, target: number): ReadingGoal {
  const safeTarget = Math.max(0, Math.min(1000, Math.floor(target)));
  const now = Date.now();
  db.prepare(`
    INSERT INTO reading_goal (year, target, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(year) DO UPDATE SET target = excluded.target, updated_at = excluded.updated_at
  `).run(year, safeTarget, now);
  return getReadingGoal(year)!;
}

// Steam links — manual + auto-detected mappings between Steam appid and
// local VN id. `source = 'auto'` rows can be overwritten by a manual
// re-link; manual rows are sticky and never get clobbered by a re-scan.

export interface SteamLink {
  vn_id: string;
  appid: number;
  steam_name: string;
  source: 'auto' | 'manual';
  last_synced_minutes: number | null;
  created_at: number;
  updated_at: number;
}

export function listSteamLinks(): SteamLink[] {
  return db
    .prepare(`SELECT * FROM steam_link ORDER BY updated_at DESC`)
    .all() as SteamLink[];
}

export function getSteamLinkForVn(vnId: string): SteamLink | null {
  return (db
    .prepare(`SELECT * FROM steam_link WHERE vn_id = ?`)
    .get(vnId) as SteamLink | undefined) ?? null;
}

export function getSteamLinkByAppid(appid: number): SteamLink | null {
  return (db
    .prepare(`SELECT * FROM steam_link WHERE appid = ?`)
    .get(appid) as SteamLink | undefined) ?? null;
}

export function setSteamLink(args: {
  vnId: string;
  appid: number;
  steamName: string;
  source: 'auto' | 'manual';
}): SteamLink {
  const now = Date.now();
  // Don't overwrite a manual link with an auto one — the user explicitly
  // chose the mapping. Allow manual to overwrite anything.
  const existing = getSteamLinkForVn(args.vnId);
  if (existing && existing.source === 'manual' && args.source === 'auto') {
    return existing;
  }
  db.prepare(`
    INSERT INTO steam_link (vn_id, appid, steam_name, source, last_synced_minutes, created_at, updated_at)
    VALUES (?, ?, ?, ?, NULL, ?, ?)
    ON CONFLICT(vn_id) DO UPDATE SET
      appid = excluded.appid,
      steam_name = excluded.steam_name,
      source = excluded.source,
      updated_at = excluded.updated_at
  `).run(args.vnId, args.appid, args.steamName.slice(0, 200), args.source, now, now);
  return getSteamLinkForVn(args.vnId)!;
}

export function deleteSteamLink(vnId: string): boolean {
  return db.prepare(`DELETE FROM steam_link WHERE vn_id = ?`).run(vnId).changes > 0;
}

export function markSteamSynced(vnId: string, minutes: number): void {
  db.prepare(`UPDATE steam_link SET last_synced_minutes = ?, updated_at = ? WHERE vn_id = ?`)
    .run(minutes, Date.now(), vnId);
}

export function countFinishedInYear(year: number): number {
  return (db
    .prepare(`SELECT COUNT(*) AS n FROM collection WHERE substr(finished_date, 1, 4) = ?`)
    .get(String(year)) as { n: number }).n;
}

// Activity heatmap — counts per day across a year.

export interface DailyCount {
  /** YYYY-MM-DD */
  day: string;
  count: number;
}

export function activityHeatmap(year: number): DailyCount[] {
  const start = new Date(`${year}-01-01T00:00:00Z`).getTime();
  const end = new Date(`${year + 1}-01-01T00:00:00Z`).getTime();
  return db
    .prepare(`
      SELECT strftime('%Y-%m-%d', occurred_at / 1000, 'unixepoch') AS day, COUNT(*) AS count
      FROM vn_activity
      WHERE occurred_at >= ? AND occurred_at < ?
      GROUP BY day
      ORDER BY day
    `)
    .all(start, end) as DailyCount[];
}

// Year-in-review aggregation.

export interface YearReview {
  year: number;
  completed: number;
  hours: number;
  topTags: { id: string; name: string; count: number }[];
  topGenres: { name: string; count: number }[];
  avgUserRating: number | null;
  best: { id: string; title: string; rating: number }[];
}

export function yearReview(year: number): YearReview {
  const ys = String(year);
  const completed = countFinishedInYear(year);
  const playtime = (db
    .prepare(`SELECT COALESCE(SUM(playtime_minutes), 0) AS m FROM collection WHERE substr(finished_date, 1, 4) = ?`)
    .get(ys) as { m: number }).m;
  const topTags = (db
    .prepare(`
      SELECT json_extract(je.value, '$.id') AS tag_id,
             json_extract(je.value, '$.name') AS tag_name,
             COUNT(*) AS tag_count
      FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.tags) je
      WHERE substr(c.finished_date, 1, 4) = ?
        AND COALESCE(json_extract(je.value, '$.spoiler'), 0) = 0
        AND COALESCE(json_extract(je.value, '$.category'), 'cont') <> 'ero'
      GROUP BY tag_id
      ORDER BY tag_count DESC, tag_name COLLATE NOCASE ASC
      LIMIT 8
    `)
    .all(ys) as { tag_id: string; tag_name: string; tag_count: number }[])
    .map((r) => ({ id: r.tag_id, name: r.tag_name, count: r.tag_count }));
  const ratingRow = db
    .prepare(`SELECT AVG(user_rating) AS avg FROM collection WHERE substr(finished_date, 1, 4) = ? AND user_rating IS NOT NULL`)
    .get(ys) as { avg: number | null };
  const best = db
    .prepare(`
      SELECT v.id, v.title, c.user_rating AS rating
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE substr(c.finished_date, 1, 4) = ? AND c.user_rating IS NOT NULL
      ORDER BY c.user_rating DESC, c.finished_date DESC
      LIMIT 5
    `)
    .all(ys) as { id: string; title: string; rating: number }[];
  return {
    year,
    completed,
    hours: Math.round(playtime / 60),
    topTags,
    topGenres: topTags.slice(0, 5).map((t) => ({ name: t.name, count: t.count })),
    avgUserRating: ratingRow.avg,
    best,
  };
}

// Tag completions per year — for the "genre evolution" stack on /stats.

export interface YearTag {
  year: number;
  tag: string;
  count: number;
}

export function tagsCompletedPerYear(limit = 6): YearTag[] {
  const rows = db
    .prepare(`
      WITH tagged AS (
        SELECT
          CAST(substr(c.finished_date, 1, 4) AS INTEGER) AS year,
          json_extract(je.value, '$.id') AS tag_id,
          json_extract(je.value, '$.name') AS tag_name
        FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.tags) je
        WHERE c.finished_date IS NOT NULL
          AND COALESCE(json_extract(je.value, '$.spoiler'), 0) = 0
          AND COALESCE(json_extract(je.value, '$.category'), 'cont') <> 'ero'
      ),
      counts AS (
        SELECT year, tag_id, tag_name, COUNT(*) AS count FROM tagged
        GROUP BY year, tag_id
      ),
      top_overall AS (
        SELECT tag_id FROM tagged GROUP BY tag_id
        ORDER BY COUNT(*) DESC LIMIT ?
      )
      SELECT counts.year AS year, counts.tag_name AS tag, counts.count AS count
      FROM counts
      WHERE counts.tag_id IN (SELECT tag_id FROM top_overall)
      ORDER BY year ASC, count DESC
    `)
    .all(limit) as YearTag[];
  return rows;
}

// "Best ROI" — completed VNs with the highest user_rating per hour played.

export interface RoiRow {
  id: string;
  title: string;
  user_rating: number;
  playtime_minutes: number;
  roi: number;
}

export function bestRoi(limit = 20): RoiRow[] {
  return db
    .prepare(`
      SELECT v.id, v.title, c.user_rating, c.playtime_minutes,
             (c.user_rating * 1.0 / NULLIF(c.playtime_minutes, 0)) AS roi
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.status = 'completed'
        AND c.user_rating IS NOT NULL
        AND c.playtime_minutes IS NOT NULL
        AND c.playtime_minutes > 0
      ORDER BY roi DESC
      LIMIT ?
    `)
    .all(limit) as RoiRow[];
}

// Score histogram vs VNDB community curve (10-point bins, 10-100).

export interface HistBucket {
  bucket: number; // 10..100, step of 10
  mine: number;
  vndb: number; // rounded community Bayesian
}

export function ratingHistogram(): HistBucket[] {
  const rows = db
    .prepare(`
      SELECT c.user_rating AS mine, v.rating AS vndb
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.user_rating IS NOT NULL
    `)
    .all() as { mine: number | null; vndb: number | null }[];
  const buckets: HistBucket[] = [];
  for (let b = 10; b <= 100; b += 10) buckets.push({ bucket: b, mine: 0, vndb: 0 });
  for (const r of rows) {
    if (r.mine != null) {
      const m = Math.min(100, Math.max(10, Math.round(r.mine / 10) * 10));
      const bucket = buckets.find((x) => x.bucket === m);
      if (bucket) bucket.mine += 1;
    }
    if (r.vndb != null) {
      const v = Math.min(100, Math.max(10, Math.round(r.vndb / 10) * 10));
      const bucket = buckets.find((x) => x.bucket === v);
      if (bucket) bucket.vndb += 1;
    }
  }
  return buckets;
}

// Duplicate detection — group rows with overlapping normalised title prefixes.

export interface DuplicateGroup {
  prefix: string;
  ids: string[];
}

function normalizeTitle(s: string): string {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findDuplicates(): DuplicateGroup[] {
  const rows = db.prepare(`SELECT id, title FROM vn`).all() as { id: string; title: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const norm = normalizeTitle(r.title);
    if (norm.length < 4) continue;
    const cur = map.get(norm) ?? [];
    cur.push(r.id);
    map.set(norm, cur);
  }
  return Array.from(map.entries())
    .filter(([, ids]) => ids.length > 1)
    .map(([prefix, ids]) => ({ prefix, ids }));
}

// Stale data — VNs whose VNDB fetch is older than thresholdMs (default 30d).

export interface StaleVn {
  id: string;
  title: string;
  fetched_at: number;
  has_cover: boolean;
  has_egs: boolean;
}

// Anniversary feed — VNs in the collection whose VNDB release date matches
// today's calendar day, regardless of year. Anchors to whatever the server's
// local date is; UI surfaces the year difference per row.

export interface AnniversaryVn {
  id: string;
  title: string;
  released: string;
  image_thumb: string | null;
  image_url: string | null;
  local_image_thumb: string | null;
  image_sexual: number | null;
  years: number;
}

export function todaysAnniversaries(today: Date = new Date()): AnniversaryVn[] {
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const yyyy = today.getFullYear();
  const monthDay = `-${mm}-${dd}`;
  return db
    .prepare(`
      SELECT v.id, v.title, v.released, v.image_thumb, v.image_url, v.image_sexual,
             v.local_image_thumb
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE v.released LIKE '%' || ?
      ORDER BY v.released DESC
    `)
    .all(monthDay)
    .map((r) => {
      const row = r as {
        id: string; title: string; released: string;
        image_thumb: string | null; image_url: string | null;
        image_sexual: number | null; local_image_thumb: string | null;
      };
      const releasedYear = Number(row.released.slice(0, 4));
      return {
        ...row,
        years: Number.isFinite(releasedYear) ? yyyy - releasedYear : 0,
      };
    })
    .filter((r) => r.years > 0);
}

export function findStaleVns(thresholdMs = 30 * 86400 * 1000): StaleVn[] {
  const cutoff = Date.now() - thresholdMs;
  return db
    .prepare(`
      SELECT v.id, v.title, v.fetched_at,
             CASE WHEN v.local_image IS NULL AND v.image_url IS NULL AND v.custom_cover IS NULL THEN 0 ELSE 1 END AS has_cover,
             CASE WHEN e.egs_id IS NULL THEN 0 ELSE 1 END AS has_egs
      FROM vn v
      LEFT JOIN egs_game e ON e.vn_id = v.id
      WHERE v.fetched_at < ? OR (v.local_image IS NULL AND v.image_url IS NULL AND v.custom_cover IS NULL)
      ORDER BY v.fetched_at ASC
      LIMIT 200
    `)
    .all(cutoff)
    .map((r) => {
      const row = r as { id: string; title: string; fetched_at: number; has_cover: number; has_egs: number };
      return {
        id: row.id,
        title: row.title,
        fetched_at: row.fetched_at,
        has_cover: !!row.has_cover,
        has_egs: !!row.has_egs,
      };
    });
}

// Full-text search across notes, custom_description and cached quotes.

export interface SearchHit {
  vn_id: string;
  title: string;
  source: 'notes' | 'custom_description' | 'quote';
  snippet: string;
}

export function searchTextual(query: string, limit = 50): SearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
  const out: SearchHit[] = [];

  const notes = db
    .prepare(`
      SELECT c.vn_id, v.title, c.notes AS text
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.notes IS NOT NULL AND c.notes LIKE ? ESCAPE '\\'
      LIMIT ?
    `)
    .all(like, limit) as { vn_id: string; title: string; text: string }[];
  for (const n of notes) {
    out.push({ vn_id: n.vn_id, title: n.title, source: 'notes', snippet: snippet(n.text, trimmed) });
  }

  const customs = db
    .prepare(`
      SELECT c.vn_id, v.title, c.custom_description AS text
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.custom_description IS NOT NULL AND c.custom_description LIKE ? ESCAPE '\\'
      LIMIT ?
    `)
    .all(like, limit) as { vn_id: string; title: string; text: string }[];
  for (const n of customs) {
    out.push({ vn_id: n.vn_id, title: n.title, source: 'custom_description', snippet: snippet(n.text, trimmed) });
  }

  const quotes = db
    .prepare(`
      SELECT q.vn_id, v.title, q.quote AS text
      FROM vn_quote q JOIN vn v ON v.id = q.vn_id
      WHERE q.quote LIKE ? ESCAPE '\\'
      LIMIT ?
    `)
    .all(like, limit) as { vn_id: string; title: string; text: string }[];
  for (const n of quotes) {
    out.push({ vn_id: n.vn_id, title: n.title, source: 'quote', snippet: snippet(n.text, trimmed) });
  }

  return out.slice(0, limit);
}

function snippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text.slice(0, 160);
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

// VNDB cache helpers (used by vndb-cache.ts)

export interface CacheRow {
  cache_key: string;
  body: string;
  etag: string | null;
  last_modified: string | null;
  fetched_at: number;
  expires_at: number;
}

export function getCacheRow(key: string): CacheRow | null {
  return (db.prepare('SELECT * FROM vndb_cache WHERE cache_key = ?').get(key) as CacheRow | undefined) ?? null;
}

export function putCacheRow(row: CacheRow): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (@cache_key, @body, @etag, @last_modified, @fetched_at, @expires_at)
    ON CONFLICT(cache_key) DO UPDATE SET
      body=excluded.body, etag=excluded.etag, last_modified=excluded.last_modified,
      fetched_at=excluded.fetched_at, expires_at=excluded.expires_at
  `).run(row);
}

export function touchCacheRow(key: string, fetchedAt: number, expiresAt: number): void {
  db.prepare('UPDATE vndb_cache SET fetched_at = ?, expires_at = ? WHERE cache_key = ?')
    .run(fetchedAt, expiresAt, key);
}

export function deleteCacheKey(key: string): void {
  db.prepare('DELETE FROM vndb_cache WHERE cache_key = ?').run(key);
}

export function pruneExpiredCache(): number {
  const info = db.prepare('DELETE FROM vndb_cache WHERE expires_at < ?').run(Date.now());
  return info.changes;
}

export function clearCache(): number {
  const info = db.prepare('DELETE FROM vndb_cache').run();
  return info.changes;
}

export function deleteCacheByPathPrefix(pathPrefix: string): number {
  const info = db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?').run(`${pathPrefix}|%`);
  return info.changes;
}

/**
 * Most-recent `fetched_at` across cache rows whose `cache_key` matches any
 * of the supplied LIKE patterns (e.g. `'anticipated:%'`, `'/release|%'`).
 * Returns null when no row matches — the page has never been cached at all.
 * Used by <RefreshPageButton/> to render "Refreshed Xh ago".
 */
export function getCacheFreshness(patterns: string[]): number | null {
  if (patterns.length === 0) return null;
  const clauses = patterns.map(() => 'cache_key LIKE ?').join(' OR ');
  const row = db
    .prepare(`SELECT MAX(fetched_at) AS newest FROM vndb_cache WHERE ${clauses}`)
    .get(...patterns) as { newest: number | null } | undefined;
  return row?.newest ?? null;
}

// Export / Import

export interface CollectionExportPayload {
  version: 2;
  exported_at: number;
  vns: Array<{
    id: string;
    title: string;
    raw: unknown;
    fetched_at: number;
  }>;
  collection: Array<{
    vn_id: string;
    status: string;
    user_rating: number | null;
    playtime_minutes: number;
    started_date: string | null;
    finished_date: string | null;
    notes: string | null;
    favorite: number;
    location: string;
    edition_type: string;
    edition_label: string | null;
    physical_location: string | null;
    added_at: number;
    updated_at: number;
  }>;
  series: SeriesRow[];
  series_vn: Array<{ series_id: number; vn_id: string; order_index: number }>;
}

export function exportData(): CollectionExportPayload {
  const vnRows = db
    .prepare(`SELECT id, title, raw, fetched_at FROM vn WHERE id IN (SELECT vn_id FROM collection)`)
    .all() as { id: string; title: string; raw: string | null; fetched_at: number }[];
  const collection = db
    .prepare(`SELECT vn_id, status, user_rating, playtime_minutes, started_date, finished_date, notes,
                     favorite, location, edition_type, edition_label, physical_location, added_at, updated_at
              FROM collection`)
    .all() as CollectionExportPayload['collection'];
  const series = listSeries();
  const seriesVn = db
    .prepare(`SELECT series_id, vn_id, order_index FROM series_vn`)
    .all() as CollectionExportPayload['series_vn'];

  return {
    version: 2,
    exported_at: Date.now(),
    vns: vnRows.map((v) => ({
      id: v.id,
      title: v.title,
      raw: v.raw ? JSON.parse(v.raw) : null,
      fetched_at: v.fetched_at,
    })),
    collection,
    series,
    series_vn: seriesVn,
  };
}

export interface ImportSummary {
  vns_upserted: number;
  collection_upserted: number;
  series_created: number;
  series_links: number;
  errors: string[];
}

export function importData(payload: CollectionExportPayload): ImportSummary {
  const summary: ImportSummary = {
    vns_upserted: 0,
    collection_upserted: 0,
    series_created: 0,
    series_links: 0,
    errors: [],
  };

  const trx = db.transaction(() => {
    for (const vn of payload.vns ?? []) {
      const raw = (vn.raw ?? {}) as RawVnPayload;
      try {
        upsertVn({ ...raw, id: vn.id, title: vn.title || raw.title || vn.id });
        summary.vns_upserted++;
      } catch (e) {
        summary.errors.push(`vn ${vn.id}: ${(e as Error).message}`);
      }
    }
    for (const c of payload.collection ?? []) {
      try {
        const exists = db.prepare('SELECT 1 FROM collection WHERE vn_id = ?').get(c.vn_id);
        if (exists) {
          db.prepare(`
            UPDATE collection SET
              status = ?, user_rating = ?, playtime_minutes = ?, started_date = ?, finished_date = ?,
              notes = ?, favorite = ?, location = ?, edition_type = ?, edition_label = ?, physical_location = ?,
              updated_at = ?
            WHERE vn_id = ?
          `).run(
            c.status, c.user_rating, c.playtime_minutes ?? 0, c.started_date, c.finished_date,
            c.notes, c.favorite ? 1 : 0, c.location ?? 'unknown', c.edition_type ?? 'none',
            c.edition_label, c.physical_location, c.updated_at ?? Date.now(), c.vn_id,
          );
        } else {
          db.prepare(`
            INSERT INTO collection (vn_id, status, user_rating, playtime_minutes, started_date, finished_date,
                                    notes, favorite, location, edition_type, edition_label, physical_location,
                                    added_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            c.vn_id, c.status, c.user_rating, c.playtime_minutes ?? 0, c.started_date, c.finished_date,
            c.notes, c.favorite ? 1 : 0, c.location ?? 'unknown', c.edition_type ?? 'none',
            c.edition_label, c.physical_location, c.added_at ?? Date.now(), c.updated_at ?? Date.now(),
          );
        }
        summary.collection_upserted++;
      } catch (e) {
        summary.errors.push(`collection ${c.vn_id}: ${(e as Error).message}`);
      }
    }
    // Series — by name (id mapping must be remapped, since destination ids may differ)
    const idMap = new Map<number, number>();
    for (const s of payload.series ?? []) {
      try {
        const existing = db.prepare('SELECT id FROM series WHERE name = ?').get(s.name) as { id: number } | undefined;
        if (existing) {
          idMap.set(s.id, existing.id);
        } else {
          const created = createSeries(s.name, s.description ?? null);
          idMap.set(s.id, created.id);
          summary.series_created++;
        }
      } catch (e) {
        summary.errors.push(`series ${s.name}: ${(e as Error).message}`);
      }
    }
    for (const link of payload.series_vn ?? []) {
      const newSid = idMap.get(link.series_id);
      if (newSid == null) continue;
      try {
        addVnToSeries(newSid, link.vn_id, link.order_index ?? 0);
        summary.series_links++;
      } catch (e) {
        summary.errors.push(`series_vn ${link.series_id}/${link.vn_id}: ${(e as Error).message}`);
      }
    }
  });
  trx();
  return summary;
}

/** Returns the absolute filesystem path of the SQLite DB. Used for backup. */
export function getDbPath(): string {
  return DB_PATH;
}

export interface SqliteRestoreSummary {
  tables: { name: string; rows_replaced: number }[];
  skipped: { name: string; reason: string }[];
}

/**
 * Replace the live DB with the contents of a SQLite file uploaded by the user.
 *
 * Strategy: write the upload to a temp file, `ATTACH` it as `src`, then for
 * every table in the live DB copy its rows over (intersected by column name
 * so older/newer backups still load). Done inside a single transaction so a
 * malformed source leaves the live DB untouched.
 */
export async function restoreFromSqliteFile(buffer: Buffer): Promise<SqliteRestoreSummary> {
  const { writeFile, unlink, mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const dir = await mkdtemp(join(tmpdir(), 'vndb-restore-'));
  const tmpPath = join(dir, 'restore.db');
  await writeFile(tmpPath, buffer);

  const probe = new Database(tmpPath, { readonly: true });
  try {
    probe.pragma('integrity_check');
  } catch (e) {
    probe.close();
    await unlink(tmpPath).catch(() => undefined);
    throw new Error(`uploaded file is not a valid SQLite DB: ${(e as Error).message}`);
  }
  const srcTables = (probe.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as { name: string }[]).map((r) => r.name);
  const srcColsByTable = new Map<string, string[]>();
  for (const t of srcTables) {
    const cols = (probe.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
    srcColsByTable.set(t, cols);
  }
  probe.close();

  const targetTables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as { name: string }[]).map((r) => r.name);

  const summary: SqliteRestoreSummary = { tables: [], skipped: [] };
  db.exec(`ATTACH DATABASE '${tmpPath.replace(/'/g, "''")}' AS src`);
  const previousForeignKeys = db.pragma('foreign_keys', { simple: true }) as 0 | 1;
  db.pragma('foreign_keys = OFF');
  try {
    db.exec('BEGIN');
    for (const table of targetTables) {
      if (!srcColsByTable.has(table)) {
        summary.skipped.push({ name: table, reason: 'missing in backup' });
        continue;
      }
      const targetCols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
      const shared = targetCols.filter((c) => srcColsByTable.get(table)!.includes(c));
      if (shared.length === 0) {
        summary.skipped.push({ name: table, reason: 'no shared columns' });
        continue;
      }
      db.exec(`DELETE FROM main.${table}`);
      const colList = shared.map((c) => `"${c}"`).join(', ');
      const rows = (db
        .prepare(`INSERT INTO main.${table} (${colList}) SELECT ${colList} FROM src.${table}`)
        .run()).changes;
      summary.tables.push({ name: table, rows_replaced: rows });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  } finally {
    db.exec('DETACH DATABASE src');
    db.pragma(`foreign_keys = ${previousForeignKeys ? 'ON' : 'OFF'}`);
    await unlink(tmpPath).catch(() => undefined);
  }
  return summary;
}

export interface CacheStat {
  total: number;
  fresh: number;
  stale: number;
  bytes: number;
  oldest: number | null;
  newest: number | null;
  by_path: { path: string; n: number }[];
}

export function cacheStats(): CacheStat {
  const now = Date.now();
  const row = db
    .prepare('SELECT COUNT(*) AS total, COALESCE(SUM(LENGTH(body)),0) AS bytes, MIN(fetched_at) AS oldest, MAX(fetched_at) AS newest FROM vndb_cache')
    .get() as { total: number; bytes: number; oldest: number | null; newest: number | null };
  const fresh = (db.prepare('SELECT COUNT(*) AS n FROM vndb_cache WHERE expires_at >= ?').get(now) as { n: number }).n;
  const byPath = db
    .prepare(`
      SELECT
        substr(cache_key, 1, instr(cache_key || '|', '|') - 1) AS path,
        COUNT(*) AS n
      FROM vndb_cache
      GROUP BY path
      ORDER BY n DESC
    `)
    .all() as { path: string; n: number }[];
  return {
    total: row.total,
    fresh,
    stale: row.total - fresh,
    bytes: row.bytes,
    oldest: row.oldest,
    newest: row.newest,
    by_path: byPath,
  };
}

// User Lists ────────────────────────────────────────────────────────
//
// Universal user-curated lists. A VN may be referenced before it lands
// in the `collection` table (e.g. an anticipated entry the user wants
// to track) so `user_list_vn.vn_id` deliberately has no FK to `vn(id)`.
// Removal is handled at the list level instead of cascading.

export interface UserList {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  pinned: number;
  created_at: number;
  updated_at: number;
}

export interface UserListWithCount extends UserList {
  vn_count: number;
}

export interface UserListItem {
  list_id: number;
  vn_id: string;
  order_index: number;
  added_at: number;
  note: string | null;
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

function uniqueSlug(base: string): string {
  const stmt = db.prepare('SELECT 1 FROM user_list WHERE slug = ?');
  let candidate = base;
  let n = 2;
  while (stmt.get(candidate)) candidate = `${base}-${n++}`;
  return candidate;
}

export function listUserLists(): UserListWithCount[] {
  return db
    .prepare(`
      SELECT l.id, l.name, l.slug, l.description, l.color, l.icon, l.pinned,
             l.created_at, l.updated_at,
             (SELECT COUNT(*) FROM user_list_vn lv WHERE lv.list_id = l.id) AS vn_count
      FROM user_list l
      ORDER BY l.pinned DESC, l.updated_at DESC, l.id DESC
    `)
    .all() as UserListWithCount[];
}

export function getUserList(id: number): UserList | null {
  return (db
    .prepare('SELECT id, name, slug, description, color, icon, pinned, created_at, updated_at FROM user_list WHERE id = ?')
    .get(id) as UserList | undefined) ?? null;
}

export function getUserListBySlug(slug: string): UserList | null {
  return (db
    .prepare('SELECT id, name, slug, description, color, icon, pinned, created_at, updated_at FROM user_list WHERE slug = ?')
    .get(slug) as UserList | undefined) ?? null;
}

export function createUserList(input: {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
}): UserList {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('name required');
  const slug = uniqueSlug(slugify(name));
  const now = Date.now();
  const info = db
    .prepare(`
      INSERT INTO user_list (name, slug, description, color, icon, pinned, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 0, ?, ?)
    `)
    .run(name, slug, input.description ?? null, input.color ?? null, input.icon ?? null, now, now);
  return {
    id: Number(info.lastInsertRowid),
    name,
    slug,
    description: input.description ?? null,
    color: input.color ?? null,
    icon: input.icon ?? null,
    pinned: 0,
    created_at: now,
    updated_at: now,
  };
}

export function updateUserList(
  id: number,
  patch: {
    name?: string;
    description?: string | null;
    color?: string | null;
    icon?: string | null;
    pinned?: boolean;
  },
): UserList | null {
  const current = getUserList(id);
  if (!current) return null;
  const next: UserList = { ...current };
  if (patch.name != null) {
    const name = patch.name.trim().slice(0, 120);
    if (!name) throw new Error('name required');
    if (name !== current.name) {
      next.name = name;
      const base = slugify(name);
      next.slug = base === current.slug ? current.slug : uniqueSlug(base);
    }
  }
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.color !== undefined) next.color = patch.color;
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.pinned !== undefined) next.pinned = patch.pinned ? 1 : 0;
  next.updated_at = Date.now();
  db.prepare(`
    UPDATE user_list
       SET name = ?, slug = ?, description = ?, color = ?, icon = ?, pinned = ?, updated_at = ?
     WHERE id = ?
  `).run(next.name, next.slug, next.description, next.color, next.icon, next.pinned, next.updated_at, id);
  return next;
}

export function deleteUserList(id: number): boolean {
  const info = db.prepare('DELETE FROM user_list WHERE id = ?').run(id);
  return info.changes > 0;
}

export function listUserListItems(listId: number): UserListItem[] {
  return db
    .prepare(`
      SELECT list_id, vn_id, order_index, added_at, note
      FROM user_list_vn
      WHERE list_id = ?
      ORDER BY order_index ASC, added_at DESC
    `)
    .all(listId) as UserListItem[];
}

export function listListsForVn(vnId: string): UserList[] {
  return db
    .prepare(`
      SELECT l.id, l.name, l.slug, l.description, l.color, l.icon, l.pinned, l.created_at, l.updated_at
      FROM user_list l
      JOIN user_list_vn lv ON lv.list_id = l.id
      WHERE lv.vn_id = ?
      ORDER BY l.pinned DESC, l.name COLLATE NOCASE
    `)
    .all(vnId) as UserList[];
}

export function listAllListMemberships(): Record<string, UserList[]> {
  const rows = db
    .prepare(`
      SELECT lv.vn_id, l.id, l.name, l.slug, l.description, l.color, l.icon, l.pinned, l.created_at, l.updated_at
      FROM user_list_vn lv
      JOIN user_list l ON l.id = lv.list_id
      ORDER BY l.pinned DESC, l.name COLLATE NOCASE
    `)
    .all() as Array<UserList & { vn_id: string }>;
  const out: Record<string, UserList[]> = {};
  for (const r of rows) {
    const { vn_id, ...list } = r;
    (out[vn_id] ??= []).push(list);
  }
  return out;
}

export function addVnToList(listId: number, vnId: string, note?: string | null): UserListItem | null {
  const list = getUserList(listId);
  if (!list) return null;
  const now = Date.now();
  const next = (db
    .prepare('SELECT COALESCE(MAX(order_index), -1) + 1 AS n FROM user_list_vn WHERE list_id = ?')
    .get(listId) as { n: number }).n;
  db.prepare(`
    INSERT INTO user_list_vn (list_id, vn_id, order_index, added_at, note)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(list_id, vn_id) DO UPDATE SET note = excluded.note
  `).run(listId, vnId, next, now, note ?? null);
  db.prepare('UPDATE user_list SET updated_at = ? WHERE id = ?').run(now, listId);
  return {
    list_id: listId,
    vn_id: vnId,
    order_index: next,
    added_at: now,
    note: note ?? null,
  };
}

export function removeVnFromList(listId: number, vnId: string): boolean {
  const info = db.prepare('DELETE FROM user_list_vn WHERE list_id = ? AND vn_id = ?').run(listId, vnId);
  if (info.changes > 0) {
    db.prepare('UPDATE user_list SET updated_at = ? WHERE id = ?').run(Date.now(), listId);
  }
  return info.changes > 0;
}

export function reorderListItems(listId: number, vnIds: string[]): void {
  const stmt = db.prepare('UPDATE user_list_vn SET order_index = ? WHERE list_id = ? AND vn_id = ?');
  const now = Date.now();
  db.transaction(() => {
    vnIds.forEach((vnId, idx) => stmt.run(idx, listId, vnId));
    db.prepare('UPDATE user_list SET updated_at = ? WHERE id = ?').run(now, listId);
  })();
}
