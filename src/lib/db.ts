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
  ensureColumn(db, 'vn', 'aliases', 'TEXT'); // JSON array of strings
  ensureColumn(db, 'vn', 'extlinks', 'TEXT'); // JSON [{url,label,name}]
  ensureColumn(db, 'vn', 'length_votes', 'INTEGER');
  ensureColumn(db, 'vn', 'average', 'REAL'); // raw vote average (vs Bayesian `rating`)
  ensureColumn(db, 'vn', 'has_anime', 'INTEGER'); // boolean 0/1/NULL
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
  released?: string | null;
  olang?: string | null;
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
  tags?: { id: string; name: string; rating: number; spoiler: number; category?: 'cont' | 'ero' | 'tech' | null }[];
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
                    released, olang, languages, platforms, length_minutes, length, length_votes, rating, votecount, average,
                    description, developers, tags, screenshots, relations, aliases, extlinks,
                    has_anime, editions, staff, va, raw, fetched_at)
    VALUES (@id, @title, @alttitle, @image_url, @image_thumb, @image_sexual, @image_violence,
            @released, @olang, @languages, @platforms, @length_minutes, @length, @length_votes, @rating, @votecount, @average,
            @description, @developers, @tags, @screenshots, @relations, @aliases, @extlinks,
            @has_anime, @editions, @staff, @va, @raw, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, alttitle=excluded.alttitle, image_url=excluded.image_url,
      image_thumb=excluded.image_thumb, image_sexual=excluded.image_sexual, image_violence=excluded.image_violence,
      released=excluded.released, olang=excluded.olang,
      languages=excluded.languages, platforms=excluded.platforms,
      length_minutes=excluded.length_minutes, length=excluded.length, length_votes=excluded.length_votes,
      rating=excluded.rating, votecount=excluded.votecount, average=excluded.average,
      description=excluded.description, developers=excluded.developers,
      tags=excluded.tags, screenshots=excluded.screenshots, relations=excluded.relations,
      aliases=excluded.aliases, extlinks=excluded.extlinks,
      has_anime=excluded.has_anime, editions=excluded.editions, staff=excluded.staff, va=excluded.va,
      raw=excluded.raw, fetched_at=excluded.fetched_at
  `).run({
    id: vn.id,
    title: vn.title,
    alttitle: vn.alttitle ?? null,
    aliases: JSON.stringify(vn.aliases ?? []),
    extlinks: JSON.stringify(vn.extlinks ?? []),
    has_anime: vn.has_anime == null ? null : vn.has_anime ? 1 : 0,
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
    tags: JSON.stringify(
      (vn.tags ?? [])
        .slice(0, 25)
        .map((t) => ({ id: t.id, name: t.name, rating: t.rating, spoiler: t.spoiler, category: t.category ?? null })),
    ),
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
  characters: { id: string; name: string; original: string | null; image_url: string | null; credited_as: string; note: string | null }[];
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
      va.c_id, va.c_name, va.c_original, va.c_image_url, va.va_name AS credited_as, va.note,
      CASE WHEN c.vn_id IS NULL THEN 0 ELSE 1 END AS in_collection
    FROM vn_va_credit va
    JOIN vn v ON v.id = va.vn_id
    LEFT JOIN collection c ON c.vn_id = va.vn_id
    WHERE va.sid = ? ${where}
    ORDER BY v.released DESC NULLS LAST, v.title, va.c_name
  `).all(sid) as Array<{
    id: string; title: string; alttitle: string | null;
    image_url: string | null; image_thumb: string | null; image_sexual: number | null;
    local_image: string | null; local_image_thumb: string | null;
    released: string | null; rating: number | null;
    c_id: string; c_name: string; c_original: string | null; c_image_url: string | null;
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
      id: r.c_id, name: r.c_name, original: r.c_original, image_url: r.c_image_url,
      credited_as: r.credited_as, note: r.note,
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

export type SourceChoice = 'auto' | 'vndb' | 'egs';
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
    languages: JSON.parse(row.languages || '[]'),
    platforms: JSON.parse(row.platforms || '[]'),
    length_minutes: row.length_minutes,
    length: row.length,
    rating: row.rating,
    votecount: row.votecount,
    description: row.description,
    developers: JSON.parse(row.developers || '[]'),
    tags: JSON.parse(row.tags || '[]'),
    screenshots: row.screenshots ? JSON.parse(row.screenshots) : [],
    release_images: row.release_images ? JSON.parse(row.release_images) : [],
    local_image: row.local_image,
    local_image_thumb: row.local_image_thumb,
    custom_cover: row.custom_cover,
    banner_image: row.banner_image,
    banner_position: row.banner_position,
    relations: row.relations ? JSON.parse(row.relations) : [],
    aliases: row.aliases ? JSON.parse(row.aliases) : [],
    extlinks: row.extlinks ? JSON.parse(row.extlinks) : [],
    length_votes: row.length_votes ?? null,
    average: row.average ?? null,
    has_anime: row.has_anime == null ? null : !!row.has_anime,
    editions: row.editions ? JSON.parse(row.editions) : [],
    staff: row.staff ? JSON.parse(row.staff) : [],
    va: row.va ? JSON.parse(row.va) : [],
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
    | 'released'
    | 'producer'
    | 'egs_rating'
    | 'combined_rating'
    | 'custom';
  order?: 'asc' | 'desc';
}

export function listCollection({
  status,
  q,
  producer,
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
    // Effective playtime: user value if > 0, else fall back to VNDB length.
    playtime: 'COALESCE(NULLIF(c.playtime_minutes, 0), v.length_minutes)',
    released: 'v.released',
    producer: "json_extract(v.developers, '$[0].name')",
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
  const needsEgsJoin = sort === 'egs_rating' || sort === 'combined_rating';
  const sortCol = sortMap[sort] ?? 'c.updated_at';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const where: string[] = [];
  const params: unknown[] = [];
  if (status) {
    where.push('c.status = ?');
    params.push(status);
  }
  if (q) {
    where.push('(v.title LIKE ? OR v.alttitle LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }
  if (producer) {
    where.push("EXISTS (SELECT 1 FROM json_each(v.developers) WHERE json_extract(value, '$.id') = ?)");
    params.push(producer);
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
  return db
    .prepare(`
      SELECT
        json_extract(je.value, '$.id') AS id,
        json_extract(je.value, '$.name') AS name,
        json_extract(je.value, '$.category') AS category,
        COUNT(*) AS count
      FROM collection c JOIN vn v ON v.id = c.vn_id, json_each(v.tags) je
      WHERE COALESCE(json_extract(je.value, '$.spoiler'), 0) = 0
      GROUP BY id
      ORDER BY count DESC, name COLLATE NOCASE ASC
    `)
    .all() as CollectionTagAggregate[];
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
  return db
    .prepare(`
      WITH seedTags AS (
        SELECT json_extract(je.value, '$.id') AS tag_id
        FROM vn v, json_each(v.tags) je
        WHERE v.id = ?
          AND COALESCE(json_extract(je.value, '$.spoiler'), 0) = 0
      )
      SELECT
        json_extract(coj.value, '$.id') AS id,
        json_extract(coj.value, '$.name') AS name,
        json_extract(coj.value, '$.category') AS category,
        COUNT(DISTINCT c.vn_id) AS shared
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
      GROUP BY id
      ORDER BY shared DESC, name COLLATE NOCASE ASC
      LIMIT ?
    `)
    .all(vnId, vnId, limit) as CoOccurringTag[];
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

export function deleteRoute(routeId: number): void {
  db.prepare('DELETE FROM vn_route WHERE id = ?').run(routeId);
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
      edition_label, condition, price_paid, currency, acquired_date, dumped, added_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

export function updateSeries(id: number, fields: { name?: string; description?: string | null; cover_path?: string | null }): SeriesRow | null {
  const sets: string[] = [];
  const params: unknown[] = [];
  if ('name' in fields && fields.name !== undefined) { sets.push('name = ?'); params.push(fields.name); }
  if ('description' in fields) { sets.push('description = ?'); params.push(fields.description ?? null); }
  if ('cover_path' in fields) { sets.push('cover_path = ?'); params.push(fields.cover_path ?? null); }
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
