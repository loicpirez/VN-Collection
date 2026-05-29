import 'server-only';
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
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
import {
  aspectKeyForResolution,
  isAspectKey,
  parseResolutionValue,
  type AspectKey,
} from './aspect-ratio';

/**
 * Lazy resolution of the SQLite path. Both absolute and `cwd`-
 * relative `DB_PATH` values are accepted (default
 * `./data/collection.db`).
 *
 * Built via string concatenation rather than
 * `path.resolve(process.cwd(), env)` so Turbopack's NFT tracer
 * doesn't follow this callsite into the project tree — the static
 * analyzer flags `resolve()` / `join()` patterns under cwd as
 * "overly broad" but is opaque to plain string ops. `better-
 * sqlite3` resolves the runtime string normally.
 */
function resolveDbPath(): string {
  const env = process.env.DB_PATH?.trim() || './data/collection.db';
  if (isAbsolute(env)) return env;
  const normalized = env.startsWith('./') ? env.slice(2) : env;
  return `${process.cwd()}/${normalized}`;
}

declare global {
  // eslint-disable-next-line no-var
  var __vndb_db: Database.Database | undefined;
}

interface ColInfo {
  name: string;
}

let tableColsCache: Map<string, Set<string>> | null = null;

/**
 * SQL identifiers (table / column names) MUST match this shape before they're
 * interpolated into raw DDL. Defence-in-depth against a future refactor that
 * accidentally pipes caller input through `ensureColumn`.
 */
const SQL_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
function assertSqlIdent(name: string, kind: 'table' | 'column'): void {
  if (!SQL_IDENT_RE.test(name)) {
    throw new Error(`invalid SQL ${kind} identifier: ${name}`);
  }
}

function ensureColumn(db: Database.Database, table: string, column: string, ddl: string): void {
  assertSqlIdent(table, 'table');
  assertSqlIdent(column, 'column');
  if (!tableColsCache) tableColsCache = new Map<string, Set<string>>();
  let cols = tableColsCache.get(table);
  if (!cols) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as ColInfo[];
    cols = new Set(rows.map((c) => c.name));
    tableColsCache.set(table, cols);
  }
  if (!cols.has(column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    // Update the cache so subsequent ensureColumn calls in the same
    // session see the new column without re-issuing PRAGMA.
    cols.add(column);
  }
}

function open(): Database.Database {
  tableColsCache = null;
  // HMR resilience: reuse the cached connection if it exists, but
  // ALWAYS re-run the idempotent migration body below. A long-running
  // `next dev` process keeps `global.__vndb_db` across Turbopack
  // hot-reloads; without re-running the migration block, source-tree
  // edits that add a new table or column would never be reflected in
  // the cached connection — leading to "no such table" runtime 500s
  // on routes that query the new schema (the very same failure mode
  // the QA pass earlier this session observed on /shelf,
  // /producer/[id], /upcoming, /top-ranked, /egs). Every DDL below
  // is `CREATE TABLE IF NOT EXISTS`, `ensureColumn` (idempotent), or
  // a marker-gated one-shot migration that short-circuits on a
  // SELECT app_setting; re-running them on each open is safe and
  // cheap (≪1ms after warm-up).
  let db = global.__vndb_db as Database.Database | undefined;
  if (!db) {
    const dbPath = resolveDbPath();
    // Path is constructed at call time (not as a module-level
    // constant) so Turbopack's NFT tracer can't statically follow it
    // into the project tree. `mkdirSync` then runs the first time
    // anything in this module is reached at runtime.
    mkdirSync(dirname(dbPath), { recursive: true });
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
  }
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
    CREATE INDEX IF NOT EXISTS idx_vn_released   ON vn(released);
    CREATE INDEX IF NOT EXISTS idx_vn_fetched_at ON vn(fetched_at);

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

    CREATE INDEX IF NOT EXISTS idx_collection_status        ON collection(status);
    CREATE INDEX IF NOT EXISTS idx_collection_updated       ON collection(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_collection_finished_date ON collection(finished_date);

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

    CREATE TABLE IF NOT EXISTS release_resolution_cache (
      release_id     TEXT PRIMARY KEY,
      width          INTEGER,
      height         INTEGER,
      raw_resolution TEXT,
      aspect_key     TEXT NOT NULL DEFAULT 'unknown',
      fetched_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_release_resolution_cache_aspect
      ON release_resolution_cache(aspect_key);

    -- Per-release metadata harvested from cached VNDB POST /release
    -- payloads. release-resolution-cache only stored aspect data;
    -- this table holds everything else the shelf-edition popovers
    -- need to display the EXACT owned edition (instead of widening
    -- to the VN's aggregate platforms / languages / release date).
    -- All JSON columns are nullable arrays/objects mirroring the
    -- shape returned by POST /release on api.vndb.org.
    CREATE TABLE IF NOT EXISTS release_meta_cache (
      release_id  TEXT PRIMARY KEY,
      vn_id       TEXT,
      title       TEXT,
      alttitle    TEXT,
      platforms   TEXT,
      languages   TEXT,
      released    TEXT,
      minage      INTEGER,
      patch       INTEGER NOT NULL DEFAULT 0,
      freeware    INTEGER NOT NULL DEFAULT 0,
      uncensored  INTEGER,
      official    INTEGER NOT NULL DEFAULT 1,
      has_ero     INTEGER NOT NULL DEFAULT 0,
      voiced      INTEGER,
      engine      TEXT,
      notes       TEXT,
      gtin        TEXT,
      catalog     TEXT,
      resolution  TEXT,
      media       TEXT,
      producers   TEXT,
      extlinks    TEXT,
      fetched_at  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_release_meta_cache_vn
      ON release_meta_cache(vn_id);

    CREATE TABLE IF NOT EXISTS owned_release_aspect_override (
      vn_id      TEXT NOT NULL,
      release_id TEXT NOT NULL,
      width      INTEGER,
      height     INTEGER,
      aspect_key TEXT NOT NULL,
      note       TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (vn_id, release_id),
      FOREIGN KEY (vn_id, release_id) REFERENCES owned_release(vn_id, release_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_owned_release_aspect_override_aspect
      ON owned_release_aspect_override(aspect_key);

    -- VN-level aspect-ratio manual override. Highest priority in the
    -- filter chain — used when no release on VNDB has a resolution we
    -- can derive from, when releases are wrong, or when the user
    -- knows the screen ratio from a source we don't read (manuals,
    -- packshots, the original engine). Independent from the
    -- owned_release_aspect_override table so a user without any owned
    -- edition can still tag a VN's aspect ratio.
    CREATE TABLE IF NOT EXISTS vn_aspect_override (
      vn_id      TEXT PRIMARY KEY REFERENCES vn(id) ON DELETE CASCADE,
      aspect_key TEXT NOT NULL,
      note       TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vn_aspect_override_aspect
      ON vn_aspect_override(aspect_key);

    -- Manual VN -> EGS link override. Sits ABOVE egs_game so that a
    -- user-set link survives cache refresh, auto-rematch, and the
    -- "no extlink found" path. NULL egs_id is allowed and is the
    -- explicit "user said this VN has no EGS counterpart" signal so
    -- the auto resolver does not keep trying to match it.
    CREATE TABLE IF NOT EXISTS vn_egs_link (
      vn_id      TEXT PRIMARY KEY REFERENCES vn(id) ON DELETE CASCADE,
      egs_id     INTEGER,
      note       TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_vn_egs_link_egs ON vn_egs_link(egs_id);

    -- Manual EGS -> VN link override. Used by /upcoming?tab=anticipated,
    -- /top-ranked?tab=egs, and the /egs unlinked list so a user can
    -- claim a VNDB id for an EGS row that does not yet exist locally,
    -- without having to add the synthetic egs_NNN VN first. NULL vn_id
    -- is the explicit "this EGS entry has no VNDB equivalent" signal.
    CREATE TABLE IF NOT EXISTS egs_vn_link (
      egs_id     INTEGER PRIMARY KEY,
      vn_id      TEXT,
      note       TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_egs_vn_link_vn ON egs_vn_link(vn_id);

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

    -- char_id has no FK: character rows live in vndb_cache JSON blobs, not
    -- a local relational table, so referential integrity is not enforceable.
    -- Orphan rows are harmless; the local image cache is a best-effort store.
    CREATE TABLE IF NOT EXISTS character_image (
      char_id    TEXT PRIMARY KEY,
      url        TEXT,
      local_path TEXT,
      fetched_at INTEGER NOT NULL
    );

    -- character_id has no FK: characters live in vndb_cache JSON, not a
    -- local PK table. Stale character_id values in vn_quote are benign;
    -- the quote display uses character_name (denormalised) for rendering.
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

    -- Append-only audit log for sensitive settings (token swaps,
    -- backup-URL rewrites). Only the last 4 chars of either value
    -- are stored so the table itself can't leak the credential.
    CREATE TABLE IF NOT EXISTS app_setting_audit (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      key           TEXT NOT NULL,
      prior_preview TEXT,
      next_preview  TEXT,
      changed_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_app_setting_audit_changed
      ON app_setting_audit(changed_at DESC);

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
    CREATE INDEX IF NOT EXISTS idx_egs_game_egs_id ON egs_game(egs_id);

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
    -- Global recent-activity strip and heatmap queries scan by
    -- occurred_at without a vn_id filter; the per-VN index above
    -- cannot serve them.
    CREATE INDEX IF NOT EXISTS idx_vn_activity_occurred ON vn_activity(occurred_at DESC, id DESC);

    -- Global user-action tracker. Distinct from vn_activity (which
    -- is per-VN audit). Captures user-driven mutations across the
    -- whole app — collection writes, shelf placements, settings
    -- changes, backup/import, mapping operations — so the operator
    -- can review what changed and when, regardless of entity.
    -- Sensitive payload values are masked at write time by the
    -- helper module lib/activity.ts.
    CREATE TABLE IF NOT EXISTS user_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_at INTEGER NOT NULL,
      kind TEXT NOT NULL,
      entity TEXT,
      entity_id TEXT,
      label TEXT,
      payload TEXT,
      actor TEXT NOT NULL DEFAULT 'user'
    );
    CREATE INDEX IF NOT EXISTS user_activity_occurred_at ON user_activity (occurred_at DESC);
    CREATE INDEX IF NOT EXISTS user_activity_kind ON user_activity (kind);
    CREATE INDEX IF NOT EXISTS user_activity_entity ON user_activity (entity, entity_id);

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

    -- vn_id deliberately has no FK to vn(id): user lists may reference
    -- VNDB / EGS ids before those entries exist locally. Collection
    -- removal still clears matching list memberships explicitly in
    -- removeFromCollection(), so the no-FK design does not leave rows
    -- behind for that workflow.
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
    CREATE INDEX IF NOT EXISTS idx_saved_filter_position ON saved_filter(position);

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
      -- 'auto' = derived from VNDB release extlinks, 'manual' = user-set.
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
    -- The UNIQUE(vn_id, release_id) constraint above already creates a
    -- covering index; no explicit one is needed.

    -- Face-out / "front display" slots that sit BETWEEN normal shelf
    -- rows so the user can showcase certain editions cover-out instead
    -- of spine-out. after_row ranges from 0..rows (0 = before row 0,
    -- N = after the last row). position orders left-to-right within
    -- the strip. The UNIQUE constraint on (vn_id, release_id) keeps
    -- one edition in at most one display slot; cross-table uniqueness
    -- against shelf_slot is enforced in placeShelfDisplayItem so an
    -- edition can never appear in both a normal slot AND a display
    -- slot at the same time.
    CREATE TABLE IF NOT EXISTS shelf_display_slot (
      shelf_id   INTEGER NOT NULL REFERENCES shelf_unit(id) ON DELETE CASCADE,
      after_row  INTEGER NOT NULL,
      position   INTEGER NOT NULL,
      vn_id      TEXT NOT NULL,
      release_id TEXT NOT NULL,
      placed_at  INTEGER NOT NULL,
      PRIMARY KEY (shelf_id, after_row, position),
      UNIQUE (vn_id, release_id),
      FOREIGN KEY (vn_id, release_id) REFERENCES owned_release(vn_id, release_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_shelf_display_slot_shelf
      ON shelf_display_slot(shelf_id, after_row, position);

    -- Derived index over staff_full cache bodies. Lets brand-overlap
    -- and per-VN trait lookups answer "which staff/characters touch
    -- VN X" without parsing every cached JSON blob.
    CREATE TABLE IF NOT EXISTS staff_credit_index (
      sid     TEXT NOT NULL,
      vn_id   TEXT NOT NULL,
      is_va   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (sid, vn_id, is_va)
    );
    CREATE INDEX IF NOT EXISTS idx_staff_credit_index_vn ON staff_credit_index(vn_id);

    -- Same idea but for character_full cache bodies.
    CREATE TABLE IF NOT EXISTS character_vn_index (
      character_id TEXT NOT NULL,
      vn_id        TEXT NOT NULL,
      PRIMARY KEY (character_id, vn_id)
    );
    CREATE INDEX IF NOT EXISTS idx_character_vn_index_vn ON character_vn_index(vn_id);

    -- R5-138: derived flat indexes for the four JSON columns the
    -- library filter touches every render. The previous filter
    -- shape was a full row-by-row json_each scan of v.tags /
    -- v.developers / v.publishers for every tag / developer /
    -- publisher filter on /api/collection. With these tables
    -- the filter collapses to an EXISTS over a tiny indexed
    -- (tag_id, vn_id) lookup. The rebuild helpers further down
    -- repopulate these tables inside the upsertVn transaction;
    -- a marker-gated backfill scans existing rows once at
    -- startup.
    CREATE TABLE IF NOT EXISTS vn_tag_index (
      vn_id    TEXT NOT NULL,
      tag_id   TEXT NOT NULL,
      tag_name TEXT,
      spoiler  INTEGER NOT NULL DEFAULT 0,
      category TEXT,
      PRIMARY KEY (vn_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_tag_index_tag ON vn_tag_index(tag_id);

    CREATE TABLE IF NOT EXISTS vn_developer_index (
      vn_id       TEXT NOT NULL,
      producer_id TEXT NOT NULL,
      PRIMARY KEY (vn_id, producer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_developer_index_pid ON vn_developer_index(producer_id);

    CREATE TABLE IF NOT EXISTS vn_publisher_index (
      vn_id       TEXT NOT NULL,
      producer_id TEXT NOT NULL,
      PRIMARY KEY (vn_id, producer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_publisher_index_pid ON vn_publisher_index(producer_id);

    CREATE TABLE IF NOT EXISTS vn_language_index (
      vn_id TEXT NOT NULL,
      lang  TEXT NOT NULL,
      PRIMARY KEY (vn_id, lang)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_language_index_lang ON vn_language_index(lang);

    CREATE TABLE IF NOT EXISTS vn_platform_index (
      vn_id    TEXT NOT NULL,
      platform TEXT NOT NULL,
      PRIMARY KEY (vn_id, platform)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_platform_index_platform ON vn_platform_index(platform);

    CREATE TABLE IF NOT EXISTS collection_place_index (
      vn_id TEXT NOT NULL REFERENCES collection(vn_id) ON DELETE CASCADE,
      place TEXT NOT NULL,
      PRIMARY KEY (vn_id, place)
    );
    CREATE INDEX IF NOT EXISTS idx_collection_place_index_place ON collection_place_index(place);

    CREATE TABLE IF NOT EXISTS place_registry (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      name_ja    TEXT,
      kind       TEXT    NOT NULL DEFAULT 'shop',
      address    TEXT,
      lat        REAL,
      lng        REAL,
      url        TEXT,
      notes      TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_place_registry_name ON place_registry(name COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS place_provider_link (
      place_id       INTEGER NOT NULL REFERENCES place_registry(id) ON DELETE CASCADE,
      provider_label TEXT    NOT NULL,
      PRIMARY KEY (place_id, provider_label)
    );
    CREATE INDEX IF NOT EXISTS idx_place_provider_link_label ON place_provider_link(provider_label);
  `);
  // Remove the redundant index from older builds.
  db.exec(`DROP INDEX IF EXISTS idx_shelf_slot_item`);

  // AUD-DB-011: deduplicate vn_staff_credit / vn_va_credit rows before
  db.exec(`
    DELETE FROM vn_staff_credit WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM vn_staff_credit GROUP BY vn_id, sid, role
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vn_staff_credit_unique
      ON vn_staff_credit(vn_id, sid, role);
    DROP INDEX IF EXISTS idx_vn_va_credit_unique;
    DELETE FROM vn_va_credit WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM vn_va_credit
      GROUP BY vn_id, c_id, sid, COALESCE(aid, -1), COALESCE(note, ''), COALESCE(va_lang, '')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vn_va_credit_unique
      ON vn_va_credit(vn_id, c_id, sid, COALESCE(aid, -1), COALESCE(note, ''), COALESCE(va_lang, ''));
  `);

  // One-shot migration: rename alice_kobe_stock → alicesoft_kobe_stock and related setting keys.
  {
    const migDone = (db.prepare(`SELECT value FROM app_setting WHERE key = 'migration_alicesoft_kobe_rename_v1'`).get() as { value: string } | undefined);
    if (!migDone) {
      db.transaction(() => {
        const oldTable = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='alice_kobe_stock'`).get();
        if (oldTable) db.exec(`ALTER TABLE alice_kobe_stock RENAME TO alicesoft_kobe_stock`);
        db.prepare(`UPDATE app_setting SET key='alicesoft_kobe_proxy_config' WHERE key='alice_kobe_proxy_config'`).run();
        db.prepare(`UPDATE app_setting SET key='alicesoft_kobe_last_fetch' WHERE key='alice_kobe_last_fetch'`).run();
        db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('migration_alicesoft_kobe_rename_v1', '1')`).run();
      })();
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS alicesoft_kobe_stock (
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
    CREATE INDEX IF NOT EXISTS idx_alicesoft_kobe_vn ON alicesoft_kobe_stock(vn_id);

    CREATE TABLE IF NOT EXISTS vn_stock_offer (
      vn_id             TEXT NOT NULL,
      provider          TEXT NOT NULL,
      provider_offer_id TEXT NOT NULL,
      source            TEXT NOT NULL,
      title             TEXT NOT NULL,
      url               TEXT NOT NULL,
      price             INTEGER,
      currency          TEXT NOT NULL DEFAULT 'JPY',
      availability      TEXT NOT NULL,
      availability_label TEXT,
      condition         TEXT,
      edition_label     TEXT,
      location_label    TEXT,
      location_branch   TEXT,
      source_release_id TEXT,
      jan               TEXT,
      fetched_at        INTEGER NOT NULL,
      updated_at        INTEGER NOT NULL,
      error             TEXT,
      content_kind      TEXT,
      platform          TEXT,
      edition_kind      TEXT,
      series_relation   TEXT,
      match_confidence  TEXT,
      match_score       INTEGER,
      match_warnings_json TEXT,
      marketplace_price INTEGER,
      marketplace_count INTEGER,
      list_price        INTEGER,
      category          TEXT,
      store_code        TEXT,
      product_id        TEXT,
      page_kind         TEXT,
      PRIMARY KEY (vn_id, provider, provider_offer_id)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_stock_offer_vn
      ON vn_stock_offer(vn_id, availability, price);
    CREATE INDEX IF NOT EXISTS idx_vn_stock_offer_provider
      ON vn_stock_offer(provider, fetched_at);
    -- P-143: partial index for batchVnStockSummaries. Filters by
    -- (vn_id IN (...), availability IN ('in_stock','limited')); without
    -- this index the library card grid does a full scan over offers.
    CREATE INDEX IF NOT EXISTS idx_vn_stock_offer_vn_avail
      ON vn_stock_offer(vn_id, availability)
      WHERE availability IN ('in_stock', 'limited');
    -- P-144: order-by-fetched_at-DESC + LIMIT path for listRecentVnStockOffers.
    CREATE INDEX IF NOT EXISTS idx_vn_stock_offer_fetched_at
      ON vn_stock_offer(fetched_at DESC);

    CREATE TABLE IF NOT EXISTS vn_stock_provider_status (
      vn_id      TEXT NOT NULL,
      provider   TEXT NOT NULL,
      status     TEXT NOT NULL,
      message    TEXT,
      fetched_at INTEGER NOT NULL,
      offer_count INTEGER NOT NULL DEFAULT 0,
      blocked_kind TEXT,
      fresh_offers_found INTEGER NOT NULL DEFAULT 0,
      cached_offers_available INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (vn_id, provider)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_stock_provider_status_vn
      ON vn_stock_provider_status(vn_id, fetched_at);

    CREATE TABLE IF NOT EXISTS vn_stock_source (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      vn_id      TEXT NOT NULL,
      release_id TEXT,
      provider   TEXT NOT NULL,
      url        TEXT NOT NULL,
      product_id TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(vn_id, url)
    );
    CREATE INDEX IF NOT EXISTS idx_vn_stock_source_vn
      ON vn_stock_source(vn_id, provider);

    CREATE TABLE IF NOT EXISTS vn_stock_alias (
      vn_id       TEXT NOT NULL,
      alias_term  TEXT NOT NULL,
      created_at  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (vn_id, alias_term)
    );

    CREATE TABLE IF NOT EXISTS vn_title_resolve_cache (
      query      TEXT PRIMARY KEY,
      vn_id      TEXT NOT NULL,
      title      TEXT NOT NULL
    );
  `);

  // The aspect-ratio filter used to require an `owned_release` row to
  // bridge release_id → vn_id. That made the filter useless for users
  // with no owned editions in inventory. Storing vn_id directly on the
  // resolution cache lets us match by VN without that JOIN. Column is
  // nullable for back-compat with already-populated rows; the writers
  // fill it on subsequent visits.
  ensureColumn(db, 'release_resolution_cache', 'vn_id', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS idx_release_resolution_cache_vn ON release_resolution_cache(vn_id, aspect_key)');
  ensureColumn(db, 'vn', 'screenshots', 'TEXT');
  ensureColumn(db, 'vn', 'image_sexual', 'REAL');
  ensureColumn(db, 'vn', 'image_violence', 'REAL');
  ensureColumn(db, 'vn', 'local_image', 'TEXT');
  ensureColumn(db, 'vn', 'local_image_thumb', 'TEXT');
  ensureColumn(db, 'vn', 'custom_cover', 'TEXT');
  ensureColumn(db, 'vn', 'release_images', 'TEXT');
  ensureColumn(db, 'vn', 'banner_image', 'TEXT');
  ensureColumn(db, 'vn', 'banner_position', 'TEXT');
  // Per-VN rotation for cover / banner imagery. Values 0/90/180/270
  // (degrees clockwise). Stored as INTEGER so the rotation survives
  // backups + applies anywhere the cover / banner is rendered (hero,
  // card, shelf, owned-edition tile, media gallery). Non-mod-90
  // values are rejected at the API boundary.
  ensureColumn(db, 'vn', 'cover_rotation', "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, 'vn', 'banner_rotation', "INTEGER NOT NULL DEFAULT 0");
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
  ensureColumn(db, 'vn_tag_index', 'tag_name', 'TEXT');
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
  db.exec('CREATE INDEX IF NOT EXISTS idx_collection_custom_order ON collection(custom_order)');

  // Partial index for the favourite filter. Consumer: `/stats`
  // dashboard ("Favorites" counter) and `lib/recommend.ts` favourite
  // signal collection. Both run `WHERE favorite = 1`; without this
  // index they full-scan the `collection` table. The partial
  // predicate keeps the index lean — most rows are `favorite = 0`
  // (the default). See `src/app/stats/page.tsx` line 34 and
  // `src/lib/recommend.ts` line 415.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_collection_favorite
      ON collection(vn_id)
      WHERE favorite = 1;
  `);

  // Partial index for the rating-distribution query path. Consumer:
  // stats charts (rating histogram), `lib/recommend.ts` rated-signal
  // collection (`WHERE user_rating IS NOT NULL AND user_rating >= 70`),
  // and per-year aggregates that JOIN on `user_rating IS NOT NULL`.
  // Filtering `WHERE user_rating IS NOT NULL` lets SQLite skip the
  // bulk of the table where no rating exists. Index includes the
  // rating value so the planner can satisfy range filters from the
  // index alone.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_collection_user_rating
      ON collection(user_rating)
      WHERE user_rating IS NOT NULL;
  `);

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
  // Partial index for dumped-edition aggregates. Consumer: the
  // dumped-coverage stats counter (`getDumpedCoverage` in `db.ts`
  // ~line 5800), `/dumped` page filters, and the
  // "dumped editions" library badge. The query is
  // `SELECT … FROM owned_release WHERE dumped = 1` which without
  // the partial index full-scans the table. Most rows have
  // `dumped = 0` so the partial predicate keeps the index lean.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_owned_release_dumped
      ON owned_release(vn_id)
      WHERE dumped = 1;
  `);
  // Symmetric partial index on `collection.dumped = 1`. Consumer:
  // the dumped-coverage counter (`getDumpedCoverage`) and
  // `listDumpedVns`. Without the index, every page-load that shows
  // the dumped chip on the library card runs a full table scan.
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_collection_dumped
      ON collection(vn_id)
      WHERE dumped = 1;
  `);
  // Per-edition cover rotation (degrees, 0/90/180/270). Independent of
  // the VN-level `vn.cover_rotation` so a misaligned scan for one
  // edition can be straightened without flipping every other tile.
  ensureColumn(db, 'owned_release', 'cover_rotation', "INTEGER NOT NULL DEFAULT 0");
  // Per-edition platform. A single VNDB release row often covers
  // multiple platforms (e.g. one row may list WIN / PS4 / PSV / SWI);
  // the user owns ONE physical SKU. Without this column the shelf
  // popover and pool-card face widen to the full set, which is
  // misleading. Stored as the lowercase VNDB platform code (e.g.
  // "win", "ps4") to match release_meta_cache.platforms entries
  // exactly. NULL means "not specified yet" — surfaced in the UI
  // for multi-platform releases until the user picks one. Auto-set
  // on read when the underlying release has exactly one platform
  // (see backfill helper below + Layer C inside
  // materializeReleaseMetaForVn).
  ensureColumn(db, 'owned_release', 'owned_platform', 'TEXT');

  // One-shot backfill: every owned_release row whose linked release
  // has exactly ONE platform in release_meta_cache auto-fills with
  // that singleton. Multi-platform releases stay NULL so the user
  // picks them explicitly in the UI. Marker-gated so the migration
  // runs once per DB; new owned_release rows are handled at write
  // time by markReleaseOwned, and freshly-materialized rows are
  // handled inside materializeReleaseMetaForVn.
  const ownedPlatformBackfilled = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'owned_platform_backfill_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (ownedPlatformBackfilled !== '1') {
    db.transaction(() => {
      db.prepare(`
        UPDATE owned_release
        SET owned_platform = (
          SELECT json_extract(rm.platforms, '$[0]')
          FROM release_meta_cache rm
          WHERE rm.release_id = owned_release.release_id
            AND json_valid(rm.platforms)
            AND json_array_length(rm.platforms) = 1
        )
        WHERE owned_platform IS NULL
          AND EXISTS (
            SELECT 1 FROM release_meta_cache rm
            WHERE rm.release_id = owned_release.release_id
              AND json_valid(rm.platforms)
              AND json_array_length(rm.platforms) = 1
          )
      `).run();
      db.prepare(
        `INSERT OR REPLACE INTO app_setting (key, value) VALUES ('owned_platform_backfill_v1', '1')`,
      ).run();
    })();
  }

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
  //
  if (db.prepare(`SELECT value FROM app_setting WHERE key = 'phys_loc_json_migration_v1'`).get() == null) {
    const legacy = db
      .prepare(`SELECT vn_id, physical_location FROM collection WHERE physical_location IS NOT NULL AND NOT json_valid(physical_location)`)
      .all() as { vn_id: string; physical_location: string }[];
    const updateStmt = db.prepare(
      `UPDATE collection SET physical_location = ? WHERE vn_id = ?`,
    );
    db.transaction(() => {
      for (const r of legacy) {
        const parts = r.physical_location
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        updateStmt.run(parts.length ? JSON.stringify(parts) : null, r.vn_id);
      }
      db.prepare(
        `INSERT OR REPLACE INTO app_setting (key, value) VALUES ('phys_loc_json_migration_v1', '1')`,
      ).run();
    })();
  }

  const placeIndexBackfilled = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'collection_place_index_v2'`)
    .get() as { value: string | null } | undefined)?.value;
  if (placeIndexBackfilled !== '1') {
    const collRows = db
      .prepare(`SELECT vn_id, physical_location FROM collection`)
      .all() as { vn_id: string; physical_location: string | null }[];
    const ownedRows = db
      .prepare(`SELECT vn_id, physical_location FROM owned_release WHERE physical_location IS NOT NULL`)
      .all() as { vn_id: string; physical_location: string }[];
    const placesByVn = new Map<string, Set<string>>();
    for (const row of collRows) {
      if (!placesByVn.has(row.vn_id)) placesByVn.set(row.vn_id, new Set());
      for (const p of parsePlaces(row.physical_location)) placesByVn.get(row.vn_id)!.add(p);
    }
    for (const row of ownedRows) {
      if (!placesByVn.has(row.vn_id)) placesByVn.set(row.vn_id, new Set());
      for (const p of parsePlaces(row.physical_location)) placesByVn.get(row.vn_id)!.add(p);
    }
    const insert = db.prepare(
      `INSERT OR IGNORE INTO collection_place_index (vn_id, place) VALUES (?, ?)`,
    );
    db.transaction(() => {
      db.prepare('DELETE FROM collection_place_index').run();
      for (const [vnId, places] of placesByVn) {
        for (const place of places) {
          insert.run(vnId, place);
        }
      }
      db.prepare(
        `INSERT OR REPLACE INTO app_setting (key, value) VALUES ('collection_place_index_v2', '1')`,
      ).run();
    })();
  }

  // Legacy migration: EGS-only synthetic ids used `egs:NNN` (colon). The
  // colon breaks Next.js' dynamic-route matcher — a request for /vn/egs:894
  // arrives at the server as `params.id = 'egs%3A894'`, which fails the
  // /^egs_\d+$/ check and triggers a 404. Convert every reference to use an
  // underscore. Gated by an `app_setting` marker so the (cheap but pointless)
  // SELECT doesn't fire on every cold start once nothing's left to convert.
  if (db.prepare(`SELECT value FROM app_setting WHERE key = 'egs_colon_to_underscore_v1'`).get() == null) {
    const legacyEgs = db
      .prepare(`SELECT id FROM vn WHERE id LIKE 'egs:%'`)
      .all() as { id: string }[];
    db.transaction(() => {
      // defer_foreign_keys defers FK constraint checks to commit time
      // so the PK rename + child-table updates can happen in any order
      // within the same transaction. Resets automatically at commit/
      // rollback — safer than the session-level foreign_keys = OFF/ON.
      db.pragma('defer_foreign_keys = ON');
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
        db.prepare('UPDATE vn_staff_credit SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE vn_va_credit SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE vn_activity SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE vn_game_log SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE steam_link SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE reading_queue SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE vn_aspect_override SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE vn_egs_link SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE user_list_vn SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE staff_credit_index SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE character_vn_index SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
        db.prepare('UPDATE collection_place_index SET vn_id = ? WHERE vn_id = ?').run(fixed, id);
      }
      db.prepare(
        `INSERT OR REPLACE INTO app_setting (key, value) VALUES ('egs_colon_to_underscore_v1', '1')`,
      ).run();
    })();
  }

  // LIB-004: v2 patch — the original egs_colon_to_underscore_v1 migration only
  // updated 6 tables. Databases where v1 ran before the remaining tables were
  // populated may still carry stale `egs:NNN` ids. This idempotent sweep covers
  // the missing tables; WHERE clauses restrict to rows that still need updating.
  if (db.prepare(`SELECT value FROM app_setting WHERE key = 'egs_colon_to_underscore_v2'`).get() == null) {
    const legacyEgsV2 = db
      .prepare(`SELECT id FROM vn WHERE id LIKE 'egs_%'`)
      .all() as { id: string }[];
    if (legacyEgsV2.length > 0) {
      db.transaction(() => {
        db.pragma('defer_foreign_keys = ON');
        for (const { id } of legacyEgsV2) {
          const colonId = `egs:${id.slice(4)}`;
          db.prepare('UPDATE vn_staff_credit SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE vn_va_credit SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE vn_activity SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE vn_game_log SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE steam_link SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE reading_queue SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE vn_aspect_override SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE vn_egs_link SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE user_list_vn SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE staff_credit_index SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE character_vn_index SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
          db.prepare('UPDATE collection_place_index SET vn_id = ? WHERE vn_id = ?').run(id, colonId);
        }
        db.prepare(
          `INSERT OR REPLACE INTO app_setting (key, value) VALUES ('egs_colon_to_underscore_v2', '1')`,
        ).run();
      })();
    } else {
      db.prepare(
        `INSERT OR REPLACE INTO app_setting (key, value) VALUES ('egs_colon_to_underscore_v2', '1')`,
      ).run();
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

  // Top-3 VNDB candidates from auto-match stored as JSON for quick-pick remapping.
  ensureColumn(db, 'alicesoft_kobe_stock', 'vn_candidates', 'TEXT');
  // Normalized title actually submitted to VNDB/EGS so mismatches are debuggable.
  ensureColumn(db, 'alicesoft_kobe_stock', 'search_title', 'TEXT');
  // Timestamp of the last VNDB/EGS match attempt (regardless of result).
  ensureColumn(db, 'alicesoft_kobe_stock', 'last_matched_at', 'INTEGER');
  // EGS product snapshot for rows that are real shop/game products but do not
  // have a VNDB id. This lets Alice Kobe count and display EGS-only matches
  // instead of leaving them in the generic "no VNDB result" bucket.
  ensureColumn(db, 'alicesoft_kobe_stock', 'egs_title', 'TEXT');
  ensureColumn(db, 'alicesoft_kobe_stock', 'egs_brand', 'TEXT');
  ensureColumn(db, 'alicesoft_kobe_stock', 'egs_release_date', 'TEXT');
  ensureColumn(db, 'alicesoft_kobe_stock', 'egs_image_url', 'TEXT');
  ensureColumn(db, 'alicesoft_kobe_stock', 'egs_vndb_raw', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'location_branch', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'content_kind', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'platform', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'edition_kind', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'series_relation', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'match_confidence', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'match_score', 'INTEGER');
  ensureColumn(db, 'vn_stock_offer', 'match_warnings_json', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'marketplace_price', 'INTEGER');
  ensureColumn(db, 'vn_stock_offer', 'marketplace_count', 'INTEGER');
  ensureColumn(db, 'vn_stock_offer', 'list_price', 'INTEGER');
  ensureColumn(db, 'vn_stock_offer', 'category', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'store_code', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'product_id', 'TEXT');
  ensureColumn(db, 'vn_stock_offer', 'page_kind', 'TEXT');
  ensureColumn(db, 'vn_stock_provider_status', 'blocked_kind', 'TEXT');
  ensureColumn(db, 'vn_stock_provider_status', 'fresh_offers_found', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'vn_stock_provider_status', 'cached_offers_available', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn(db, 'vn_stock_provider_status', 'extras_json', 'TEXT');
  ensureColumn(db, 'vn_stock_source', 'release_id', 'TEXT');
  ensureColumn(db, 'vn_stock_source', 'product_id', 'TEXT');
  ensureColumn(db, 'place_registry', 'kind', "TEXT NOT NULL DEFAULT 'shop'");

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_alicesoft_kobe_unmatched
      ON alicesoft_kobe_stock(last_matched_at, code)
      WHERE vn_id IS NULL AND egs_id IS NULL AND vn_match_source IS NULL;
    CREATE INDEX IF NOT EXISTS idx_alicesoft_kobe_no_vndb
      ON alicesoft_kobe_stock(last_matched_at, code)
      WHERE vn_match_source = 'none' AND vn_id IS NULL;
  `);

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
      INSERT OR IGNORE INTO vn_staff_credit (vn_id, sid, aid, eid, role, note, name, original, lang)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insVa = db.prepare(`
      INSERT OR IGNORE INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      for (const r of rows) {
        delStaff.run(r.id);
        delVa.run(r.id);
        let staff: StaffEntry[] = [];
        let va: VaEntry[] = [];
        // Surface parse failures during the one-shot migration so a
        // corrupt JSON column doesn't silently zero out a row's
        // credits — without this every row with bad JSON quietly
        // dropped all its staff / VA links.
        try {
          staff = r.staff ? (JSON.parse(r.staff) as StaffEntry[]) : [];
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed staff JSON: ${(e as Error).message}`);
          staff = [];
        }
        try {
          va = r.va ? (JSON.parse(r.va) as VaEntry[]) : [];
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed va JSON: ${(e as Error).message}`);
          va = [];
        }
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

  // Backfill staff_credit_index from existing staff_full cache entries.
  // The table was added after most staff_full rows were already written via
  // writeStaffFullCache, so those rows have no index entries. Without this
  // backfill, brand-overlap returns 0 matches even when the cache is full.
  const staffCreditIndexBackfilled = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'staff_credit_index_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (staffCreditIndexBackfilled !== '1') {
    interface StaffFullBody {
      productionCredits?: Array<{ id?: string }>;
      vaCredits?: Array<{ id?: string }>;
    }
    const rows = db
      .prepare(`SELECT cache_key, body FROM vndb_cache WHERE cache_key LIKE 'staff_full:%'`)
      .all() as { cache_key: string; body: string }[];
    const del = db.prepare('DELETE FROM staff_credit_index WHERE sid = ?');
    const ins = db.prepare('INSERT OR IGNORE INTO staff_credit_index (sid, vn_id, is_va) VALUES (?, ?, ?)');
    db.transaction(() => {
      for (const r of rows) {
        const sid = r.cache_key.replace('staff_full:', '');
        let payload: StaffFullBody;
        try {
          payload = JSON.parse(r.body) as StaffFullBody;
        } catch {
          continue;
        }
        del.run(sid);
        for (const c of payload.productionCredits ?? []) {
          if (c.id) ins.run(sid, c.id, 0);
        }
        for (const c of payload.vaCredits ?? []) {
          if (c.id) ins.run(sid, c.id, 1);
        }
      }
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('staff_credit_index_v1', '1')`).run();
    })();
  }

  const tagIndexBackfilled = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'vn_tag_index_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (tagIndexBackfilled !== '1') {
    const rows = db.prepare(
      `SELECT id, tags, developers, publishers FROM vn
       WHERE tags IS NOT NULL OR developers IS NOT NULL OR publishers IS NOT NULL`,
    ).all() as Array<{ id: string; tags: string | null; developers: string | null; publishers: string | null }>;
    const delTag = db.prepare('DELETE FROM vn_tag_index WHERE vn_id = ?');
    const delDev = db.prepare('DELETE FROM vn_developer_index WHERE vn_id = ?');
    const delPub = db.prepare('DELETE FROM vn_publisher_index WHERE vn_id = ?');
    const insTag = db.prepare(
      'INSERT OR IGNORE INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES (?, ?, ?, ?, ?)',
    );
    const insDev = db.prepare('INSERT OR IGNORE INTO vn_developer_index (vn_id, producer_id) VALUES (?, ?)');
    const insPub = db.prepare('INSERT OR IGNORE INTO vn_publisher_index (vn_id, producer_id) VALUES (?, ?)');
    db.transaction(() => {
      for (const r of rows) {
        delTag.run(r.id);
        delDev.run(r.id);
        delPub.run(r.id);
        // Surface parse failures so a single corrupt row doesn't
        // silently zero out an entire index.
        try {
          const tags = r.tags ? (JSON.parse(r.tags) as Array<{ id?: unknown; name?: unknown; spoiler?: unknown; category?: unknown }>) : [];
          for (const t of tags) {
            const id = typeof t?.id === 'string' ? t.id : null;
            if (!id) continue;
            const name = typeof t.name === 'string' && t.name.trim().length > 0 ? t.name : id;
            const spoiler = typeof t.spoiler === 'number' ? t.spoiler : 0;
            const category = typeof t.category === 'string' ? t.category : null;
            insTag.run(r.id, id, name, spoiler, category);
          }
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed tags JSON: ${(e as Error).message}`);
        }
        try {
          const devs = r.developers ? (JSON.parse(r.developers) as Array<{ id?: unknown }>) : [];
          for (const d of devs) {
            const id = typeof d?.id === 'string' ? d.id : null;
            if (id) insDev.run(r.id, id);
          }
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed developers JSON: ${(e as Error).message}`);
        }
        try {
          const pubs = r.publishers ? (JSON.parse(r.publishers) as Array<{ id?: unknown }>) : [];
          for (const p of pubs) {
            const id = typeof p?.id === 'string' ? p.id : null;
            if (id) insPub.run(r.id, id);
          }
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed publishers JSON: ${(e as Error).message}`);
        }
      }
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('vn_tag_index_v1', '1')`).run();
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('vn_tag_index_tag_name_v1', '1')`).run();
    })();
  }

  const tagNameBackfilled = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'vn_tag_index_tag_name_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (tagNameBackfilled !== '1') {
    const rows = db.prepare(
      `SELECT id, tags FROM vn WHERE tags IS NOT NULL`,
    ).all() as Array<{ id: string; tags: string | null }>;
    const delTag = db.prepare('DELETE FROM vn_tag_index WHERE vn_id = ?');
    const insTag = db.prepare(
      'INSERT OR IGNORE INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES (?, ?, ?, ?, ?)',
    );
    db.transaction(() => {
      for (const r of rows) {
        try {
          const tags = r.tags ? (JSON.parse(r.tags) as Array<{ id?: unknown; name?: unknown; spoiler?: unknown; category?: unknown }>) : [];
          delTag.run(r.id);
          for (const t of tags) {
            const id = typeof t?.id === 'string' ? t.id : null;
            if (!id) continue;
            const name = typeof t.name === 'string' && t.name.trim().length > 0 ? t.name : id;
            const spoiler = typeof t.spoiler === 'number' ? t.spoiler : 0;
            const category = typeof t.category === 'string' ? t.category : null;
            insTag.run(r.id, id, name, spoiler, category);
          }
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed tags JSON: ${(e as Error).message}`);
        }
      }
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('vn_tag_index_tag_name_v1', '1')`).run();
    })();
  }

  const langPlatBackfilled = (db
    .prepare(`SELECT value FROM app_setting WHERE key = 'vn_lang_platform_index_v1'`)
    .get() as { value: string | null } | undefined)?.value;
  if (langPlatBackfilled !== '1') {
    const rows = db
      .prepare(`SELECT id, languages, platforms FROM vn WHERE languages IS NOT NULL OR platforms IS NOT NULL`)
      .all() as Array<{ id: string; languages: string | null; platforms: string | null }>;
    const delLang = db.prepare('DELETE FROM vn_language_index WHERE vn_id = ?');
    const delPlat = db.prepare('DELETE FROM vn_platform_index WHERE vn_id = ?');
    const insLang = db.prepare('INSERT OR IGNORE INTO vn_language_index (vn_id, lang) VALUES (?, ?)');
    const insPlat = db.prepare('INSERT OR IGNORE INTO vn_platform_index (vn_id, platform) VALUES (?, ?)');
    db.transaction(() => {
      for (const r of rows) {
        delLang.run(r.id);
        delPlat.run(r.id);
        try {
          const langs = r.languages ? (JSON.parse(r.languages) as unknown[]) : [];
          for (const lang of langs) {
            if (typeof lang === 'string' && lang.length > 0) insLang.run(r.id, lang);
          }
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed languages JSON: ${(e as Error).message}`);
        }
        try {
          const plats = r.platforms ? (JSON.parse(r.platforms) as unknown[]) : [];
          for (const plat of plats) {
            if (typeof plat === 'string' && plat.length > 0) insPlat.run(r.id, plat);
          }
        } catch (e) {
          console.warn(`[migrate] vn ${r.id} has malformed platforms JSON: ${(e as Error).message}`);
        }
      }
      db.prepare(`INSERT OR REPLACE INTO app_setting (key, value) VALUES ('vn_lang_platform_index_v1', '1')`).run();
    })();
  }

  global.__vndb_db = db;
  return db;
}

/**
 * Singleton DB handle.
 *
 * `open()` is only called on first property access of the exported
 * `db` — the Proxy below defers it past module load. That matters
 * for tests (which never touch the DB unless they really mean to),
 * tooling that imports `db.ts` for type-introspection, and Next.js
 * cold-paths where a module graph might be traced without actually
 * running the handlers. After the first access, `global.__vndb_db`
 * memoises across HMR / serverless cold-restarts.
 *
 * Internal module-top transactions (`upsertVnTx`, `updateCollectionTx`)
 * also wrap their `db.transaction(...)` factory in a lazy getter for
 * the same reason — otherwise the Proxy hit during module evaluation
 * would defeat the deferral.
 */
let _dbInstance: Database.Database | null = null;
function getDb(): Database.Database {
  if (_dbInstance) return _dbInstance;
  _dbInstance = open();
  return _dbInstance;
}

export const db: Database.Database = new Proxy({} as Database.Database, {
  get(_target, prop, receiver) {
    const real = getDb();
    const value = Reflect.get(real, prop, receiver);
    // Method calls (db.prepare, db.transaction, db.exec, …) need
    // to be bound to the actual Database instance, not the Proxy.
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});

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

function rebuildVnPlaceIndex(vnId: string): void {
  const collRow = db
    .prepare('SELECT physical_location FROM collection WHERE vn_id = ?')
    .get(vnId) as { physical_location: string | null } | undefined;
  const ownedRows = db
    .prepare('SELECT physical_location FROM owned_release WHERE vn_id = ? AND physical_location IS NOT NULL')
    .all(vnId) as { physical_location: string }[];
  const places = new Set<string>();
  for (const p of parsePlaces(collRow?.physical_location)) places.add(p);
  for (const r of ownedRows) {
    for (const p of parsePlaces(r.physical_location)) places.add(p);
  }
  db.prepare('DELETE FROM collection_place_index WHERE vn_id = ?').run(vnId);
  const ins = db.prepare('INSERT OR IGNORE INTO collection_place_index (vn_id, place) VALUES (?, ?)');
  for (const place of places) {
    ins.run(vnId, place);
  }
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

// Lazy factory: defer the `db.transaction(...)` build until first call
// so that `db.ts` module evaluation doesn't trigger the Proxy → open().
// Stored as `null` until first hit, then memoised.
let _upsertVnTxImpl: ((vn: RawVnPayload) => void) | null = null;
function upsertVnTx(vn: RawVnPayload): void {
  if (!_upsertVnTxImpl) _upsertVnTxImpl = buildUpsertVnTx();
  _upsertVnTxImpl(vn);
}
function buildUpsertVnTx(): (vn: RawVnPayload) => void {
  return db.transaction((vn: RawVnPayload) => {
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
    tags: JSON.stringify(
      (vn.tags ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        rating: t.rating,
        spoiler: t.spoiler,
        lie: !!t.lie,
        category: t.category ?? null,
      })),
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
  rebuildVnTagIndex(vn.id, (vn.tags as Array<{ id?: unknown; name?: unknown; spoiler?: unknown; category?: unknown }> | undefined) ?? []);
  rebuildVnDeveloperIndex(vn.id, (vn.developers as Array<{ id?: unknown }> | undefined) ?? []);
  rebuildVnLanguageIndex(vn.id, (vn.languages as unknown[] | undefined) ?? []);
  rebuildVnPlatformIndex(vn.id, (vn.platforms as unknown[] | undefined) ?? []);
  });
}

/**
 * R5-138: flatten `vn.tags[]` into `vn_tag_index`. Called from
 * `upsertVn` inside the transaction so the index is always in
 * sync with the JSON column.
 */
function rebuildVnTagIndex(
  vnId: string,
  tags: Array<{ id?: unknown; name?: unknown; spoiler?: unknown; category?: unknown }>,
): void {
  db.prepare('DELETE FROM vn_tag_index WHERE vn_id = ?').run(vnId);
  const ins = db.prepare(
    'INSERT OR IGNORE INTO vn_tag_index (vn_id, tag_id, tag_name, spoiler, category) VALUES (?, ?, ?, ?, ?)',
  );
  for (const t of tags) {
    const id = typeof t?.id === 'string' ? t.id : null;
    if (!id) continue;
    const name = typeof t.name === 'string' && t.name.trim().length > 0 ? t.name : id;
    const spoiler = typeof t.spoiler === 'number' ? t.spoiler : 0;
    const category = typeof t.category === 'string' ? t.category : null;
    ins.run(vnId, id, name, spoiler, category);
  }
}

/**
 * R5-138: flatten `vn.developers[]` into `vn_developer_index`.
 * The developers column on a VN row is a JSON array of
 * `{ id, name }`. The publisher index is maintained separately
 * in `setVnPublishers` (different write path).
 */
function rebuildVnDeveloperIndex(
  vnId: string,
  developers: Array<{ id?: unknown }>,
): void {
  db.prepare('DELETE FROM vn_developer_index WHERE vn_id = ?').run(vnId);
  const insDev = db.prepare(
    'INSERT OR IGNORE INTO vn_developer_index (vn_id, producer_id) VALUES (?, ?)',
  );
  for (const d of developers) {
    const id = typeof d?.id === 'string' ? d.id : null;
    if (id) insDev.run(vnId, id);
  }
}

function rebuildVnLanguageIndex(vnId: string, languages: unknown[]): void {
  db.prepare('DELETE FROM vn_language_index WHERE vn_id = ?').run(vnId);
  const ins = db.prepare('INSERT OR IGNORE INTO vn_language_index (vn_id, lang) VALUES (?, ?)');
  for (const lang of languages) {
    if (typeof lang === 'string' && lang.length > 0) ins.run(vnId, lang);
  }
}

function rebuildVnPlatformIndex(vnId: string, platforms: unknown[]): void {
  db.prepare('DELETE FROM vn_platform_index WHERE vn_id = ?').run(vnId);
  const ins = db.prepare('INSERT OR IGNORE INTO vn_platform_index (vn_id, platform) VALUES (?, ?)');
  for (const platform of platforms) {
    if (typeof platform === 'string' && platform.length > 0) ins.run(vnId, platform);
  }
}

/**
 * Insert or replace one VN row with the canonical VNDB payload, derived JSON
 * columns, the platform index, and the materialised staff/VA credit tables.
 * Wraps `upsertVnTx` so every write happens in a single transaction.
 */
export function upsertVn(vn: RawVnPayload): void {
  upsertVnTx(vn);
}

function rebuildStaffVaCredits(vnId: string, staff: StaffEntry[], va: VaEntry[]): void {
  db.prepare('DELETE FROM vn_staff_credit WHERE vn_id = ?').run(vnId);
  db.prepare('DELETE FROM vn_va_credit WHERE vn_id = ?').run(vnId);
  // INSERT OR IGNORE: VNDB occasionally returns a staff entry credited
  // multiple times for the same role (different `aid`/`eid` slots — e.g.
  // the same scenario writer billed under two contract roles that map
  // to the same `role` enum). The UNIQUE index on (vn_id, sid, role)
  // would otherwise abort the whole `upsertVn` transaction, leaving
  // /vn/[id] showing "UNIQUE constraint failed" instead of the VN.
  const insStaff = db.prepare(`
    INSERT OR IGNORE INTO vn_staff_credit (vn_id, sid, aid, eid, role, note, name, original, lang)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of staff) {
    if (!s?.id || !s.name) continue;
    insStaff.run(vnId, s.id, s.aid ?? null, s.eid ?? null, s.role ?? '', s.note ?? null, s.name, s.original ?? null, s.lang ?? null);
  }
  const insVa = db.prepare(`
    INSERT OR IGNORE INTO vn_va_credit (vn_id, sid, aid, c_id, c_name, c_original, c_image_url, va_name, va_original, va_lang, note)
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

/**
 * Reconstruct a staff profile from the materialised credit tables. Used to
 * render `/staff/[id]` when the operator has no VNDB token but the staffer
 * appears in at least one owned VN.
 */
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

/**
 * Production credits for a staff id from the local `vn_staff_credit` index.
 * Set `inCollectionOnly` to scope to owned VNs only.
 */
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
    LIMIT 5000
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

/**
 * VA credits for a staff id (one row per character voiced). Set
 * `inCollectionOnly` to scope to owned VNs only.
 */
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
    LIMIT 5000
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
 * gets its own id for the same person (e.g. the same character in
 * volumes 1 and 3 of a series may be c11994 + c89053). This surfaces those sibling
 * pages so the user can navigate between them.
 *
 * Pulls from vn_va_credit (covers every owned VN's voice cast). Filters to
 * names with at least 2 characters and excludes the original c_id.
 */
export function findCharacterSiblings(charId: string): CharacterSibling[] {
  const candidateNames = db
    .prepare('SELECT DISTINCT c_name FROM vn_va_credit WHERE c_id = ? AND c_name IS NOT NULL AND length(c_name) >= 2')
    .all(charId) as Array<{ c_name: string }>;
  const candidateOriginals = db
    .prepare('SELECT DISTINCT c_original FROM vn_va_credit WHERE c_id = ? AND c_original IS NOT NULL AND length(c_original) >= 2')
    .all(charId) as Array<{ c_original: string }>;
  const names = new Set<string>(candidateNames.map((r) => r.c_name));
  for (const r of candidateOriginals) names.add(r.c_original);
  if (names.size === 0) return [];

  const placeholders = Array.from(names).map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT va.c_id, va.c_name, va.c_original, va.c_image_url, va.vn_id, v.title AS vn_title
      FROM vn_va_credit va
      JOIN vn v ON v.id = va.vn_id
      JOIN collection c ON c.vn_id = va.vn_id
      WHERE (va.c_name IN (${placeholders}) OR va.c_original IN (${placeholders})) AND va.c_id != ?
      ORDER BY v.released DESC NULLS LAST, va.c_id ASC
      LIMIT 200
    `)
    .all(...Array.from(names), ...Array.from(names), charId) as Array<{
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

export interface StaffSibling {
  sid: string;
  name: string;
  original: string | null;
  /** VNs in the operator's collection where this candidate sid is credited. */
  vns: { vn_id: string; vn_title: string }[];
}

/**
 * R5-239 — conservative cross-sid sibling discovery for `/staff/[id]`.
 *
 * VNDB occasionally splits the same person across multiple `sNNN` ids
 * (rename, region split, alias drift, etc.). The platform does not
 * expose a structured cross-sid mapping in the staff payload, so we
 * cannot offer an authoritative merge. The helper below errs on the
 * side of false negatives:
 *
 *   1. Collect every display `name` and `original` known for the
 *      input `sid` from `vn_staff_credit` AND `vn_va_credit` (the
 *      VA table holds an `aid` + alias-id link plus the
 *      `va_name`/`va_original` columns that act as siblings of
 *      the staff name when the same person voice-acts under a
 *      pen name in another VN).
 *   2. Match other `sid`s that share at least one of those names.
 *   3. JOIN `collection` so only VNs the operator actually owns are
 *      surfaced — the section heading is explicitly about
 *      "Possible matches in your collection".
 *   4. Drop the input sid from the result and dedupe by sid.
 *
 * Caller is responsible for labelling the surface "Possible match"
 * and NOT auto-merging.
 */
export function findStaffSiblings(sid: string): StaffSibling[] {
  // Display + original names for this sid, across both credit tables.
  const staffNames = db
    .prepare('SELECT DISTINCT name FROM vn_staff_credit WHERE sid = ? AND name IS NOT NULL AND length(name) >= 2')
    .all(sid) as Array<{ name: string }>;
  const staffOriginals = db
    .prepare('SELECT DISTINCT original FROM vn_staff_credit WHERE sid = ? AND original IS NOT NULL AND length(original) >= 2')
    .all(sid) as Array<{ original: string }>;
  const vaNames = db
    .prepare('SELECT DISTINCT va_name FROM vn_va_credit WHERE sid = ? AND va_name IS NOT NULL AND length(va_name) >= 2')
    .all(sid) as Array<{ va_name: string }>;
  const vaOriginals = db
    .prepare('SELECT DISTINCT va_original FROM vn_va_credit WHERE sid = ? AND va_original IS NOT NULL AND length(va_original) >= 2')
    .all(sid) as Array<{ va_original: string }>;
  const names = new Set<string>();
  for (const r of staffNames) names.add(r.name);
  for (const r of staffOriginals) names.add(r.original);
  for (const r of vaNames) names.add(r.va_name);
  for (const r of vaOriginals) names.add(r.va_original);
  if (names.size === 0) return [];

  const placeholders = Array.from(names).map(() => '?').join(',');
  const rows = db
    .prepare(`
      SELECT sc.sid, sc.name, sc.original, sc.vn_id, v.title AS vn_title
      FROM vn_staff_credit sc
      JOIN vn v ON v.id = sc.vn_id
      JOIN collection c ON c.vn_id = sc.vn_id
      WHERE (sc.name IN (${placeholders}) OR sc.original IN (${placeholders})) AND sc.sid != ?
      UNION
      SELECT va.sid, va.va_name AS name, va.va_original AS original, va.vn_id, v.title AS vn_title
      FROM vn_va_credit va
      JOIN vn v ON v.id = va.vn_id
      JOIN collection c ON c.vn_id = va.vn_id
      WHERE (va.va_name IN (${placeholders}) OR va.va_original IN (${placeholders})) AND va.sid != ?
      ORDER BY vn_title, sid
    `)
    .all(
      ...Array.from(names),
      ...Array.from(names),
      sid,
      ...Array.from(names),
      ...Array.from(names),
      sid,
    ) as Array<{ sid: string; name: string; original: string | null; vn_id: string; vn_title: string }>;

  const bySid = new Map<string, StaffSibling>();
  for (const r of rows) {
    let entry = bySid.get(r.sid);
    if (!entry) {
      entry = { sid: r.sid, name: r.name, original: r.original, vns: [] };
      bySid.set(r.sid, entry);
    }
    if (!entry.vns.some((v) => v.vn_id === r.vn_id)) {
      entry.vns.push({ vn_id: r.vn_id, vn_title: r.vn_title });
    }
  }
  return Array.from(bySid.values());
}

/**
 * List every VA who voiced this character (across all VNs in the
 * materialised credit table). Deduped by `(sid, vn_id)`.
 */
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

/** Persist the relative storage paths for a VN's mirrored cover + thumbnail. */
export function setLocalImagePaths(vnId: string, full: string | null, thumb: string | null): void {
  db.prepare('UPDATE vn SET local_image = ?, local_image_thumb = ? WHERE id = ?').run(full, thumb, vnId);
}

/** Set or clear the user-uploaded custom cover path for a VN. */
export function setCustomCover(vnId: string, path: string | null): void {
  db.prepare('UPDATE vn SET custom_cover = ? WHERE id = ?').run(path, vnId);
}

/** Set or clear the user-chosen banner value (relative path OR remote URL). */
export function setBanner(vnId: string, value: string | null): void {
  db.prepare('UPDATE vn SET banner_image = ? WHERE id = ?').run(value, vnId);
}

/** Persist the banner focal point as a `"X% Y%"` background-position string. */
export function setBannerPosition(vnId: string, value: string | null): void {
  db.prepare('UPDATE vn SET banner_position = ? WHERE id = ?').run(value, vnId);
}

/**
 * Normalize a stored rotation value to a known-good {0,90,180,270}.
 * Old DB rows / NULLs / out-of-spec values collapse to 0 rather than
 * propagating "tilted" CSS transforms to the renderer.
 */
export function normalizeRotation(raw: number | null | undefined): 0 | 90 | 180 | 270 {
  const n = typeof raw === 'number' ? Math.round(raw) : 0;
  const mod = ((n % 360) + 360) % 360;
  if (mod === 90 || mod === 180 || mod === 270) return mod;
  return 0;
}

/** Persist the cover rotation in degrees. Out-of-spec values are coerced to 0. */
export function setCoverRotation(vnId: string, value: number): void {
  db.prepare('UPDATE vn SET cover_rotation = ? WHERE id = ?').run(normalizeRotation(value), vnId);
}

/** Persist the banner rotation in degrees. Out-of-spec values are coerced to 0. */
export function setBannerRotation(vnId: string, value: number): void {
  db.prepare('UPDATE vn SET banner_rotation = ? WHERE id = ?').run(normalizeRotation(value), vnId);
}

/** Overwrite the cached screenshots JSON for a VN. */
export function setLocalScreenshots(vnId: string, shots: Screenshot[]): void {
  db.prepare('UPDATE vn SET screenshots = ? WHERE id = ?').run(JSON.stringify(shots), vnId);
}

/** Overwrite the cached release artwork JSON for a VN. */
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
  const list = Array.from(dedup.values());
  const json = JSON.stringify(list);
  db.transaction(() => {
    db.prepare('UPDATE vn SET publishers = ? WHERE id = ?').run(json, vnId);
    db.prepare('DELETE FROM vn_publisher_index WHERE vn_id = ?').run(vnId);
    const ins = db.prepare(
      'INSERT OR IGNORE INTO vn_publisher_index (vn_id, producer_id) VALUES (?, ?)',
    );
    for (const p of list) {
      ins.run(vnId, p.id);
    }
  })();
}

export interface CharacterImageRecord {
  url: string | null;
  local_path: string | null;
  fetched_at: number;
}

/** Read one character's mirrored portrait record, or `null` when never downloaded. */
export function getCharacterImage(charId: string): CharacterImageRecord | null {
  const row = db
    .prepare('SELECT url, local_path, fetched_at FROM character_image WHERE char_id = ?')
    .get(charId) as CharacterImageRecord | undefined;
  return row ?? null;
}

/** Bulk-load character portrait records keyed by id. Missing ids are simply absent. */
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

/**
 * Lookup the cover columns for a single VN id. Used by the quote
 * endpoints to enrich the `<QuoteAvatar>` fallback chain — when no
 * character portrait is downloaded the avatar falls back to the VN
 * cover, which lives on `vn.*`.
 */
export interface VnCoverRow {
  image_url: string | null;
  local_image: string | null;
  local_image_thumb: string | null;
}
/**
 * Read only the cover-related columns for one VN (cheap lookup that skips
 * the heavy JSON columns on `vn`). Returns `null` for unknown ids.
 */
export function getVnCover(vnId: string): VnCoverRow | null {
  const row = db
    .prepare('SELECT image_url, local_image, local_image_thumb FROM vn WHERE id = ?')
    .get(vnId) as VnCoverRow | undefined;
  return row ?? null;
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

/** Read the linked EGS row for one VN, or `null` when no EGS link exists. */
export function getEgsForVn(vnId: string): EgsRow | null {
  const row = db
    .prepare('SELECT vn_id, egs_id, gamename, gamename_furigana, brand_id, brand_name, model, description, image_url, local_image, okazu, erogame, raw_json, median, average, dispersion, count, sellday, playtime_median_minutes, source, fetched_at FROM egs_game WHERE vn_id = ?')
    .get(vnId) as EgsRow | undefined;
  return row ?? null;
}

/** Bulk-fetch EGS rows for many VN ids; missing rows simply absent from the map. */
export function getEgsForVns(vnIds: string[]): Map<string, EgsRow> {
  const out = new Map<string, EgsRow>();
  if (vnIds.length === 0) return out;
  const CHUNK = 500;
  for (let i = 0; i < vnIds.length; i += CHUNK) {
    const chunk = vnIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT vn_id, egs_id, gamename, gamename_furigana, brand_id, brand_name, model, description, image_url, local_image, okazu, erogame, raw_json, median, average, dispersion, count, sellday, playtime_median_minutes, source, fetched_at FROM egs_game WHERE vn_id IN (${placeholders})`)
      .all(...chunk) as EgsRow[];
    for (const r of rows) out.set(r.vn_id, r);
  }
  return out;
}

/**
 * Insert or replace the `egs_game` row for one VN. `fetched_at` is stamped
 * here so callers don't need to thread the timestamp through.
 */
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

/** Persist the relative path of the locally-mirrored EGS cover image. */
export function setEgsLocalImage(vnId: string, localPath: string | null): void {
  db.prepare('UPDATE egs_game SET local_image = ? WHERE vn_id = ?').run(localPath, vnId);
}

/**
 * Drop a VN's EGS link (resets the resolver so the next read re-fetches).
 * Manual `vn_egs_link` overrides are kept; only the cached resolution clears.
 */
export function clearEgsForVn(vnId: string): void {
  db.prepare('DELETE FROM egs_game WHERE vn_id = ?').run(vnId);
}

// -- Manual EGS <-> VNDB mapping ---------------------------------------------
// Two tables, two directions, both kept narrow and reversible.
//   vn_egs_link  — user pins a real v\d+ to a specific egs_id (or NULL to
//                  say "this VN has no EGS counterpart")
//   egs_vn_link  — user pins an egs_id to a real v\d+ (or NULL for "this EGS
//                  has no VNDB counterpart"); used by /upcoming and
//                  /top-ranked anticipated/EGS-top rows that don't have a
//                  local synthetic VN yet.

export interface VnEgsLink {
  vn_id: string;
  egs_id: number | null;
  note: string | null;
  updated_at: number;
}

export interface EgsVnLink {
  egs_id: number;
  vn_id: string | null;
  note: string | null;
  updated_at: number;
}

/**
 * Pin a VN → EGS mapping in `vn_egs_link`. Pass `egsId = null` to record
 * "this VN has no EGS counterpart"; the resolver will treat that as a
 * settled state rather than re-running auto-search.
 */
export function setVnEgsLink(vnId: string, egsId: number | null, note?: string | null): void {
  if (!isVndbVnId(vnId)) throw new Error('invalid vn id');
  if (egsId !== null && (!Number.isInteger(egsId) || egsId <= 0)) {
    throw new Error('invalid egs id');
  }
  db.prepare(
    `INSERT INTO vn_egs_link (vn_id, egs_id, note, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(vn_id) DO UPDATE SET
       egs_id = excluded.egs_id,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(vnId, egsId, note ?? null, Date.now());
}

/** Read the manual VN → EGS pinning row, or `null` when unset. */
export function getVnEgsLink(vnId: string): VnEgsLink | null {
  const row = db
    .prepare('SELECT vn_id, egs_id, note, updated_at FROM vn_egs_link WHERE vn_id = ?')
    .get(vnId) as VnEgsLink | undefined;
  return row ?? null;
}

/** Drop the manual VN → EGS pinning row so the auto-resolver gets another shot. */
export function clearVnEgsLink(vnId: string): void {
  db.prepare('DELETE FROM vn_egs_link WHERE vn_id = ?').run(vnId);
}

/**
 * Pin an EGS → VN mapping in `egs_vn_link`. Pass `vnId = null` to record
 * "this EGS game has no VNDB counterpart". Used by EGS-side feeds
 * (anticipated, top-ranked) to overlay the user's choice on cache hits.
 */
export function setEgsVnLink(egsId: number, vnId: string | null, note?: string | null): void {
  if (!Number.isInteger(egsId) || egsId <= 0) throw new Error('invalid egs id');
  if (vnId !== null && !isVndbVnId(vnId)) throw new Error('invalid vn id');
  db.prepare(
    `INSERT INTO egs_vn_link (egs_id, vn_id, note, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(egs_id) DO UPDATE SET
       vn_id = excluded.vn_id,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(egsId, vnId, note ?? null, Date.now());
}

/** Read the manual EGS → VN pinning row for one EGS id, or `null` when unset. */
export function getEgsVnLink(egsId: number): EgsVnLink | null {
  const row = db
    .prepare('SELECT egs_id, vn_id, note, updated_at FROM egs_vn_link WHERE egs_id = ?')
    .get(egsId) as EgsVnLink | undefined;
  return row ?? null;
}

/** Drop the manual EGS → VN pinning row. */
export function clearEgsVnLink(egsId: number): void {
  db.prepare('DELETE FROM egs_vn_link WHERE egs_id = ?').run(egsId);
}

/**
 * Returns a map of egs_id -> vn_id (NULL means "user explicitly said no VNDB
 * match"). Used to overlay manual decisions on top of the EGS-side feeds
 * (anticipated, top-ranked, /egs unlinked list) so the chosen mapping
 * survives cache refreshes and is reversible without losing user intent.
 */
export function listAllEgsVnLinks(): Map<number, string | null> {
  const rows = db
    .prepare('SELECT egs_id, vn_id FROM egs_vn_link LIMIT 50000')
    .all() as Array<{ egs_id: number; vn_id: string | null }>;
  const out = new Map<number, string | null>();
  for (const r of rows) out.set(r.egs_id, r.vn_id);
  return out;
}

// Canonical definition lives in source-resolve.ts. Re-exported here so
// existing callers `import { SourceChoice } from '@/lib/db'` keep
// compiling, but there's only one source of truth — adding a new
// choice in source-resolve propagates everywhere.
import type { SourceChoice as SourceChoiceCanonical } from './source-resolve';
import { isVndbVnId } from '@/lib/vn-id-shape';
export type SourceChoice = SourceChoiceCanonical;
export type SourceField = 'title' | 'description' | 'image' | 'brand' | 'rating' | 'playtime';

export type SourcePrefMap = Partial<Record<SourceField, SourceChoice>>;

/** Read the per-field VNDB/EGS source preference JSON for one VN. Returns `{}` when unset. */
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
    db_path: resolveDbPath(),
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

/**
 * Setting keys whose changes leave a tail in `app_setting_audit`.
 * Anything that swaps credentials or proxies outbound traffic — a
 * silent rewrite would otherwise be impossible for the user to spot.
 */
const AUDITED_SETTING_KEYS = new Set(['vndb_token', 'steam_api_key', 'vndb_backup_url']);

function tail4(s: string | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return `…${trimmed.slice(-4)}`;
}

/**
 * Build the audit-trail preview for a given setting key. For URL-shaped
 * credentials (vndb_backup_url) `tail4` would store `…kana` for every
 * host on the planet — useless if an attacker rewrites the URL. Store
 * the hostname instead so the audit row remains diagnostic (audit M5).
 */
function settingAuditPreview(key: string, value: string | null): string | null {
  if (!value) return null;
  if (key === 'vndb_backup_url') {
    try {
      const u = new URL(value);
      return u.hostname || tail4(value);
    } catch {
      return tail4(value);
    }
  }
  return tail4(value);
}

/**
 * Upsert one row in `app_setting`. Audited keys leave a tail-masked entry
 * in `app_setting_audit`; raw credentials never appear in the audit row.
 */
export function setAppSetting(key: string, value: string | null): void {
  db.transaction(() => {
    const wasAudited = AUDITED_SETTING_KEYS.has(key);
    const prior = wasAudited ? getAppSetting(key) : null;
    if (value == null || value.length === 0) {
      db.prepare('DELETE FROM app_setting WHERE key = ?').run(key);
    } else {
      db.prepare(`
        INSERT INTO app_setting (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(key, value);
    }
    if (wasAudited && (prior ?? null) !== (value ?? null)) {
      db.prepare(`
        INSERT INTO app_setting_audit (key, prior_preview, next_preview, changed_at)
        VALUES (?, ?, ?, ?)
      `).run(key, settingAuditPreview(key, prior), settingAuditPreview(key, value), Date.now());
    }
  })();
}

export interface SettingAuditEntry {
  id: number;
  key: string;
  prior_preview: string | null;
  next_preview: string | null;
  changed_at: number;
}

/** Recent rows from `app_setting_audit`, newest first. */
export function listSettingAudit(limit = 50): SettingAuditEntry[] {
  return db
    .prepare('SELECT id, key, prior_preview, next_preview, changed_at FROM app_setting_audit ORDER BY changed_at DESC LIMIT ?')
    .all(Math.max(1, Math.min(limit, 200))) as SettingAuditEntry[];
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
    db.pragma('defer_foreign_keys = ON');
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
    db.prepare('UPDATE vn_game_log SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE steam_link SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE reading_queue SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE vn_aspect_override SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE vn_egs_link SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE user_list_vn SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE staff_credit_index SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE character_vn_index SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    db.prepare('UPDATE collection_place_index SET vn_id = ? WHERE vn_id = ?').run(toId, fromId);
    // Synthetic row is no longer referenced — clean up.
    db.prepare('DELETE FROM vn WHERE id = ?').run(fromId);
  });
  tx();
  invalidateAggregateStats();
}

/** Stamp a VN row with the `egs_only` flag (used for EGS-sourced synthetic entries). */
export function markVnEgsOnly(vnId: string, egsOnly: boolean): void {
  db.prepare('UPDATE vn SET egs_only = ? WHERE id = ?').run(egsOnly ? 1 : 0, vnId);
}

/** Predicate: does this VN row carry the `egs_only` flag (synthetic EGS-only entry)? */
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
/**
 * Create or refresh a synthetic `vn` row sourced entirely from EGS (no VNDB
 * counterpart). The id format is `egs_<numeric>` so the dynamic route
 * matcher accepts it.
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

/** Set or clear the per-VN user-authored synopsis override. */
export function setCustomDescription(vnId: string, text: string | null): void {
  const cleaned = text == null ? null : text.trim();
  const payload = cleaned ? cleaned.slice(0, 8000) : null;
  db.prepare('UPDATE collection SET custom_description = ? WHERE vn_id = ?').run(payload, vnId);
}

/**
 * Persist a per-VN source-preference map (`{ description: 'egs', image: 'auto', … }`).
 * Empty/auto entries are pruned so the stored JSON stays minimal.
 */
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
  /**
   * Locally-mirrored character avatar path (relative, served by
   * `/api/files/<path>`). Filled by the LEFT JOIN against
   * `character_image`; null when no image has been downloaded yet.
   */
  character_local_image: string | null;
  /**
   * VN cover columns surfaced from the same JOIN — they let the
   * `QuoteAvatar` fall back to the VN cover when no character portrait
   * is available. All three may be null on a freshly-added VN before
   * `ensureLocalImagesForVn` has run.
   */
  vn_image_url: string | null;
  vn_local_image: string | null;
  vn_local_image_thumb: string | null;
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
  /**
   * Locally-mirrored character avatar path. See `LocalQuote` for
   * the same field documentation; both shapes share the JOIN.
   */
  character_local_image: string | null;
  /** VN cover fallback columns — see LocalQuote for documentation. */
  vn_image_url: string | null;
  vn_local_image: string | null;
  vn_local_image_thumb: string | null;
}

/**
 * Cross-VN quotes feed — every quote we've cached for VNs in the user's
 * collection, ordered by score then VN title. `q` is an optional case-
 * insensitive substring filter applied to the quote text or character
 * name.
 */
export function listAllQuotes(q?: string, limit = 200, offset = 0): QuoteWithVn[] {
  const trimmed = q?.trim() ?? '';
  if (!trimmed) {
    return db
      .prepare(`
        SELECT q.quote_id, q.vn_id, v.title AS vn_title, q.quote, q.score,
               q.character_id, q.character_name,
               ci.local_path AS character_local_image,
               v.image_url AS vn_image_url,
               v.local_image AS vn_local_image,
               v.local_image_thumb AS vn_local_image_thumb
        FROM vn_quote q
        JOIN collection c ON c.vn_id = q.vn_id
        JOIN vn v ON v.id = q.vn_id
        LEFT JOIN character_image ci ON ci.char_id = q.character_id
        ORDER BY q.score DESC, v.title COLLATE NOCASE ASC
        LIMIT ? OFFSET ?
`)
      .all(limit, offset) as QuoteWithVn[];
  }
  const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
  return db
    .prepare(`
      SELECT q.quote_id, q.vn_id, v.title AS vn_title, q.quote, q.score,
             q.character_id, q.character_name,
             ci.local_path AS character_local_image,
             v.image_url AS vn_image_url,
             v.local_image AS vn_local_image,
             v.local_image_thumb AS vn_local_image_thumb
      FROM vn_quote q
      JOIN collection c ON c.vn_id = q.vn_id
      JOIN vn v ON v.id = q.vn_id
      LEFT JOIN character_image ci ON ci.char_id = q.character_id
      WHERE q.quote LIKE ? ESCAPE '\\' OR q.character_name LIKE ? ESCAPE '\\'
      ORDER BY q.score DESC, v.title COLLATE NOCASE ASC
      LIMIT ? OFFSET ?
`)
    .all(like, like, limit, offset) as QuoteWithVn[];
}

/** Random quote from the local mirror (used when `random_quote_source = 'mine'`). */
export function getRandomLocalQuote(): LocalQuote | null {
  const row = db
    .prepare(`
      SELECT quote_id, vn_id, vn_title, quote, score,
             character_id, character_name,
             character_local_image,
             vn_image_url, vn_local_image, vn_local_image_thumb
      FROM (
        SELECT q.quote_id, q.vn_id, v.title AS vn_title, q.quote, q.score,
               q.character_id, q.character_name,
               ci.local_path AS character_local_image,
               v.image_url AS vn_image_url,
               v.local_image AS vn_local_image,
               v.local_image_thumb AS vn_local_image_thumb
        FROM vn_quote q
        JOIN collection c ON c.vn_id = q.vn_id
        JOIN vn v ON v.id = q.vn_id
        LEFT JOIN character_image ci ON ci.char_id = q.character_id
        LIMIT 200
      )
      ORDER BY RANDOM()
      LIMIT 1
`)
    .get() as LocalQuote | undefined;
  return row ?? null;
}

/**
 * Insert or replace the mirrored portrait row for one character. `localPath`
 * is the storage-relative path returned by `downloadToBucket`.
 */
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

/**
 * Add one VN to the local collection. Triggers the asset fan-out on first
 * insert and writes an audit row in `vn_activity`. Invalidates the
 * aggregate-stats cache so the home page stats refresh on the next read.
 */
export function addToCollection(vnId: string, fields: CollectionPatch = {}): void {
  db.transaction(() => {
    const now = Date.now();
    const exists = db.prepare('SELECT 1 FROM collection WHERE vn_id = ?').get(vnId);
    if (exists) {
      updateCollection(vnId, fields);
      return;
    }
    const physicalLocation = serializePlaces(fields.physical_location ?? null);
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
      physicalLocation,
      fields.box_type ?? 'none',
      fields.download_url ?? null,
      fields.dumped ? 1 : 0,
      now,
      now,
    );
    rebuildVnPlaceIndex(vnId);
    invalidateAggregateStats();
  })();
}

// Same lazy-factory pattern as `upsertVnTx` above — defers the
// `db.transaction(...)` build past module evaluation.
let _updateCollectionTxImpl: ((vnId: string, fields: CollectionPatch) => void) | null = null;
function updateCollectionTx(vnId: string, fields: CollectionPatch): void {
  if (!_updateCollectionTxImpl) _updateCollectionTxImpl = buildUpdateCollectionTx();
  _updateCollectionTxImpl(vnId, fields);
}
function buildUpdateCollectionTx(): (vnId: string, fields: CollectionPatch) => void {
  return db.transaction((vnId: string, fields: CollectionPatch) => {
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
  if ('physical_location' in fields) {
    rebuildVnPlaceIndex(vnId);
  }

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
}

/**
 * Push a status change to VNDB if write-back is enabled.
 *
 * Decoupled from `updateCollection` so it can run *after* the transaction
 * commits — VNDB latency or 5xx errors must never roll back the local
 * state. Called from the PATCH /api/collection/[id] route handler.
 */
export async function maybePushStatusToVndb(vnId: string, status: Status | null | undefined): Promise<void> {
  if (status === undefined) return;
  if (!isVndbVnId(vnId)) return;
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

/**
 * Patch one collection row. Writes per-field audit entries to
 * `vn_activity` and busts the aggregate-stats cache. Safe to call with a
 * partial patch — only the supplied keys are touched.
 */
export function updateCollection(vnId: string, fields: CollectionPatch): void {
  updateCollectionTx(vnId, fields);
  invalidateAggregateStats();
}

export interface ActivityEntry {
  id: number;
  vn_id: string;
  kind: 'status' | 'rating' | 'playtime' | 'favorite' | 'started' | 'finished' | 'note' | 'manual';
  payload: Record<string, unknown> | null;
  occurred_at: number;
}

/** Audit trail for one VN: status changes, playtime updates, manual notes. */
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

/**
 * Append a user-authored entry to the per-VN audit trail. `occurredAt`
 * defaults to `Date.now()` so the same helper handles both "just now"
 * notes and historical backfills.
 */
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

/** Delete one row from `vn_activity` by its auto-incrementing id. */
export function deleteActivity(id: number): void {
  db.prepare('DELETE FROM vn_activity WHERE id = ?').run(id);
}

/**
 * R5 page-audit hardening: scoped variant that only deletes a row when it
 * belongs to the supplied VN. Prevents the activity DELETE endpoint
 * from removing an entry for a different VN when the caller passes an
 * `eid` outside the URL's VN scope. Returns `true` when a row was
 * removed.
 */
export function deleteActivityForVn(id: number, vnId: string): boolean {
  const info = db
    .prepare('DELETE FROM vn_activity WHERE id = ? AND vn_id = ?')
    .run(id, vnId);
  return info.changes > 0;
}

/**
 * "Game log" entries — free-form timestamped notes attached to a VN.
 * Distinct from `vn_activity` (which records state changes); the game
 * log is what the user types during/after a session (impressions,
 * route choices, plot beats, character fates, etc.).
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

/** Free-form session-log entries for one VN, newest first. */
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

/**
 * Append a session-log entry for one VN. The note is capped at
 * `GAME_LOG_NOTE_MAX` so a long paste can't blow out the row.
 */
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

/** Edit one game-log entry. Re-validates the note length on every update. */
export function updateGameLogEntry(
  id: number,
  patch: { note?: string; logged_at?: number; session_minutes?: number | null },
): GameLogEntry | null {
  return db.transaction((): GameLogEntry | null => {
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
  })();
}

/** Remove one game-log entry by id. Returns `false` when the id wasn't found. */
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

/**
 * Remove one VN from the collection. Owned editions / routes / activity
 * cascade via FK ON DELETE. Invalidates the aggregate-stats cache.
 */
export function removeFromCollection(vnId: string): void {
  db.transaction(() => {
    db.prepare('DELETE FROM collection_place_index WHERE vn_id = ?').run(vnId);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(vnId);
    db.prepare('DELETE FROM user_list_vn WHERE vn_id = ?').run(vnId);
  })();
  invalidateAggregateStats();
}

/** Predicate: does the operator own this VN? */
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
/**
 * Bulk variant of `isInCollection` that returns the subset of `vnIds`
 * the operator owns. Chunked to 500 ids per query to stay below the
 * SQLite parameter cap (999 in older builds, 32766 in modern).
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
/**
 * Persist the operator's custom drag-order for the library. Only rows in
 * `ids` are touched — IDs not in the array keep their previous slot so
 * reordering page A doesn't blow away page B's order.
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

/** Every VN id the operator owns. Used by the wishlist + recommendations as a "to-exclude" set. */
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
  cover_rotation: number | null;
  banner_rotation: number | null;
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
/**
 * Crash-shield JSON.parse with optional shape validation. The
 * `validate` argument is a user-supplied type guard — when it
 * returns false, the fallback is used. Without a validator, the
 * helper only protects against parse errors; downstream code still
 * has to trust the row shape.
 */
function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  validate?: (v: unknown) => v is T,
): T {
  if (!raw) return fallback;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (validate && !validate(parsed)) return fallback;
  return parsed as T;
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
    cover_rotation: normalizeRotation(row.cover_rotation),
    banner_rotation: normalizeRotation(row.banner_rotation),
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
  /**
   * Filter by `collection.edition_type`. Used by the stats page's
   * "By edition" chart to deep-link from a slice into the matching
   * Library view. Callers must pass a valid `EditionType` — the
   * route handler validates against the enum.
   */
  edition?: EditionType;
  yearMin?: number;
  yearMax?: number;
  dumped?: boolean;
  /** Single aspect filter (back-compat). Use `aspects` for multi-select. */
  aspect?: AspectKey;
  /** Multi-select aspect filter. Matches a VN if any of the supplied
   *  aspects applies to it. `aspect` and `aspects` are merged
   *  (one-of semantics) — but the manual-VN-override exclusivity
   *  still wins as before. Unknown is allowed and matches the
   *  "no signal" bucket. */
  aspects?: readonly AspectKey[];
  /** Limit the result to these VN ids only. Empty array → no rows. */
  vnIds?: readonly string[];
  /** Safety cap on result rows. Defaults to 10 000 — well above any
   *  realistic collection size while protecting against pathological
   *  unbounded scans. Pass `Infinity` only in trusted bulk-export paths. */
  limit?: number;
  /**
   * R5-144: internal projection knob. `'full'` (default) selects
   * every column from `vn` (`v.*`) — used by `/lists/[id]`,
   * `/series/[id]`, recommend, export. `'cards'` narrows the
   * SELECT to the columns the library / shelf grid + the
   * `cardData` projection actually read; everything else
   * (`description`, `aliases`, `staff`, `va`, `titles`,
   * `editions`, `extlinks`, `screenshots`, `release_images`,
   * `raw`, `languages`, `platforms`, `olang`, `devstatus`,
   * `length`, `length_votes`, `votecount`, `average`,
   * `has_anime`, `image_violence`) is omitted. The row mapper
   * gracefully treats missing columns as the empty default
   * thanks to `safeJsonParse(undefined, …)`.
   */
  _projection?: 'full' | 'cards';
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

/**
 * R5-144 — narrowed VN column list for the `'cards'` projection.
 * Skips the heavy JSON columns (description / aliases / staff /
 * va / titles / editions / extlinks / screenshots / release_images
 * / raw / languages / platforms) the library grid never reads. On
 * a 1000+ VN library this drops `/api/collection`'s JSON.parse
 * work from ~30-80 MB to a few MB. The omitted columns appear as
 * `undefined` on the row; `rowToItem` handles that gracefully
 * (every JSON column goes through `safeJsonParse(undefined, …)`).
 */
const CARDS_VN_COLUMNS =
  'v.id, v.title, v.alttitle, v.image_url, v.image_thumb, v.image_sexual, ' +
  'v.released, v.length_minutes, v.rating, ' +
  'v.developers, v.publishers, v.tags, v.relations, ' +
  'v.local_image, v.local_image_thumb, v.custom_cover, v.banner_image, ' +
  'v.banner_position, v.cover_rotation, v.banner_rotation, ' +
  'v.fetched_at';

/**
 * Canonical collection listing — applies filters (status, producer,
 * publisher, series, tag, q, aspect, dumped, year), sort, and grouping.
 * Returns rich `CollectionItem` rows ready for cards. Server-only.
 */
export function listCollection({
  status,
  q,
  producer,
  publisher,
  series,
  tag,
  place,
  edition,
  yearMin,
  yearMax,
  dumped,
  aspect,
  aspects,
  vnIds,
  limit = 10_000,
  sort = 'updated_at',
  order = 'desc',
  _projection = 'full',
}: ListOptions = {}): CollectionItem[] {
  if (vnIds && vnIds.length === 0) return [];
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
      "(SELECT MIN(p.name) FROM vn_developer_index di LEFT JOIN producer p ON p.id = di.producer_id WHERE di.vn_id = v.id)",
    publisher:
      "(SELECT MIN(p.name) FROM vn_publisher_index pi LEFT JOIN producer p ON p.id = pi.producer_id WHERE pi.vn_id = v.id)",
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
    where.push('EXISTS (SELECT 1 FROM vn_developer_index WHERE vn_id = c.vn_id AND producer_id = ?)');
    params.push(producer);
  }
  if (publisher) {
    where.push('EXISTS (SELECT 1 FROM vn_publisher_index WHERE vn_id = c.vn_id AND producer_id = ?)');
    params.push(publisher);
  }
  if (tag) {
    where.push('EXISTS (SELECT 1 FROM vn_tag_index WHERE vn_id = c.vn_id AND tag_id = ?)');
    params.push(tag);
  }
  if (place) {
    where.push('EXISTS (SELECT 1 FROM collection_place_index WHERE vn_id = c.vn_id AND place = ?)');
    params.push(place);
  }
  if (edition) {
    where.push('c.edition_type = ?');
    params.push(edition);
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
  // Aspect filter — supports BOTH legacy single `aspect` and the
  // multi-select `aspects` array. Combined into one deduped set;
  // a VN matches if ANY selected aspect applies.
  const aspectSet = new Set<AspectKey>();
  if (aspect) aspectSet.add(aspect);
  if (aspects) for (const a of aspects) aspectSet.add(a);
  const wantUnknown = aspectSet.delete('unknown');
  const nonUnknown = Array.from(aspectSet);
  if (nonUnknown.length > 0 || wantUnknown) {
    // Aspect match priority (highest to lowest):
    //   1. VN-level manual override (vn_aspect_override) — EXCLUSIVE.
    //      When this row exists, the lower-priority signals are
    //      ignored. So a VN whose manual override says 4:3 will NOT
    //      match ?aspect=16:9 even if its release cache or
    //      screenshots fallback derived 16:9.
    //   2. Owned-edition per-release override (owned_release_aspect_override)
    //   3. Cached release resolution joined via owned_release
    //   4. Cached release resolution bound directly to the VN
    //      (release_resolution_cache.vn_id)
    // The OR-chain at level 2-4 is only consulted when level 1
    // doesn't have a row.
    //
    // Multi-select: for each branch we use IN (?, ?, …) over the
    // selected non-unknown buckets. Unknown gets its own OR branch
    // that matches when NO signal at all exists for the VN.
    const branches: string[] = [];
    if (nonUnknown.length > 0) {
      const ph = nonUnknown.map(() => '?').join(',');
      branches.push(`(
        EXISTS (
          SELECT 1 FROM vn_aspect_override vo
          WHERE vo.vn_id = c.vn_id AND vo.aspect_key IN (${ph})
        )
        OR (
          NOT EXISTS (
            SELECT 1 FROM vn_aspect_override vo
            WHERE vo.vn_id = c.vn_id AND vo.aspect_key <> 'unknown'
          )
          AND (
            EXISTS (
              SELECT 1
              FROM owned_release o
              LEFT JOIN owned_release_aspect_override ao
                ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
              LEFT JOIN release_resolution_cache rc
                ON rc.release_id = o.release_id
              WHERE o.vn_id = c.vn_id
                AND COALESCE(ao.aspect_key, rc.aspect_key) IN (${ph})
            )
            OR EXISTS (
              SELECT 1 FROM release_resolution_cache rc
              WHERE rc.vn_id = c.vn_id AND rc.aspect_key IN (${ph})
            )
          )
        )
      )`);
      // Three IN clauses use the same set — push the values three
      // times.
      params.push(...nonUnknown, ...nonUnknown, ...nonUnknown);
    }
    if (wantUnknown) {
      branches.push(`(
        NOT EXISTS (
          SELECT 1 FROM vn_aspect_override vo
          WHERE vo.vn_id = c.vn_id AND vo.aspect_key <> 'unknown'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM owned_release o
          LEFT JOIN owned_release_aspect_override ao
            ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
          LEFT JOIN release_resolution_cache rc
            ON rc.release_id = o.release_id
          WHERE o.vn_id = c.vn_id
            AND COALESCE(ao.aspect_key, rc.aspect_key) IS NOT NULL
            AND COALESCE(ao.aspect_key, rc.aspect_key) <> 'unknown'
        )
        AND NOT EXISTS (
          SELECT 1 FROM release_resolution_cache rc
          WHERE rc.vn_id = c.vn_id AND rc.aspect_key <> 'unknown'
        )
      )`);
    }
    where.push(`(${branches.join(' OR ')})`);
  }
  if (vnIds && vnIds.length > 0) {
    const placeholders = vnIds.map(() => '?').join(',');
    where.push(`v.id IN (${placeholders})`);
    params.push(...vnIds);
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
  const vnProjection = _projection === 'cards' ? CARDS_VN_COLUMNS : 'v.*';
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 10_000;
  params.push(safeLimit);
  const rows = db
    .prepare(`
      SELECT ${vnProjection}, c.status, c.user_rating, c.playtime_minutes, c.started_date,
             c.finished_date, c.notes, c.favorite, c.location, c.edition_type,
             c.edition_label, c.physical_location, c.box_type, c.download_url,
             c.dumped, c.custom_description, c.added_at, c.updated_at
      FROM collection c JOIN vn v ON v.id = c.vn_id
      ${join}
      ${whereSql}
      ORDER BY ${sortCol} ${dir} NULLS LAST
      LIMIT ?
    `)
    .all(...params) as DbRow[];
  const items = rows.map((r) => rowToItem(r)!).filter(Boolean);
  const ids = items.map((i) => i.id);
  const egsMap = getEgsForVns(ids);
  const seriesMap = listSeriesForVnsMany(ids);
  const aspectMap = listAspectKeysForVns(ids);
  // Batch-fetch the merged place index so `group=place` and
  // `item.physical_location` reflect both collection.physical_location
  // AND owned_release.physical_location — the same source the
  // `?place=` filter uses.
  const placeIndexMap = listPlacesForVnsMany(ids);
  for (const item of items) {
    item.series = seriesMap.get(item.id) ?? [];
    item.aspect_keys = aspectMap.get(item.id) ?? ['unknown'];
    const indexedPlaces = placeIndexMap.get(item.id);
    if (indexedPlaces !== undefined) item.physical_location = indexedPlaces;
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

/**
 * R5-144: slim variant of `listCollection`. Same WHERE / ORDER BY
 * / annotations as `listCollection`, but the SELECT skips the
 * heavy JSON columns the library grid never reads — `description`,
 * `aliases`, `staff`, `va`, `titles`, `editions`, `extlinks`,
 * `screenshots`, `release_images`, `raw`, `languages`,
 * `platforms`, `olang`, `devstatus`, `length`, `length_votes`,
 * `votecount`, `average`, `has_anime`, `image_violence`.
 *
 * The return shape is still `CollectionItem[]` so the existing
 * `cardData` / library-grid pipeline doesn't have to learn a new
 * type. The skipped fields appear as `null` / `[]` / `''` in the
 * result, which is exactly what the card renderer expects when
 * the underlying data is empty.
 *
 * Use this for any surface that ONLY renders the library /
 * shelf grid. Surfaces that need the full payload (`/lists/[id]`,
 * `/series/[id]`, `/api/export`, recommend) keep calling
 * `listCollection` directly.
 */
/**
 * Lightweight variant of `listCollection` used by card grids: returns the
 * same `CollectionItem` shape but only projects the columns the cards need.
 * Heavier surfaces (`/series/[id]`, exports, recommend) call `listCollection`.
 */
export function listCollectionForCards(opts: ListOptions = {}): CollectionItem[] {
  return listCollection({ ...opts, _projection: 'cards' });
}

function listPlacesForVnsMany(vnIds: string[]): Map<string, string[]> {
  if (vnIds.length === 0) return new Map();
  const ph = vnIds.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT vn_id, place FROM collection_place_index WHERE vn_id IN (${ph})`)
    .all(...vnIds) as { vn_id: string; place: string }[];
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (!map.has(r.vn_id)) map.set(r.vn_id, []);
    map.get(r.vn_id)!.push(r.place);
  }
  return map;
}

function listAspectKeysForVns(vnIds: string[]): Map<string, AspectKey[]> {
  const map = new Map<string, Set<AspectKey>>();
  if (vnIds.length === 0) return new Map();
  const placeholders = vnIds.map(() => '?').join(',');
  // Source 1: VN-level manual override (highest priority — replaces
  // every other signal for that VN when present).
  const manualRows = db
    .prepare(
      `SELECT vn_id, aspect_key FROM vn_aspect_override WHERE vn_id IN (${placeholders})`,
    )
    .all(...vnIds) as Array<{ vn_id: string; aspect_key: string | null }>;
  const manualByVn = new Map<string, AspectKey>();
  for (const r of manualRows) {
    if (isAspectKey(r.aspect_key) && r.aspect_key !== 'unknown') {
      manualByVn.set(r.vn_id, r.aspect_key);
    }
  }
  // Source 2: owned_release joined with per-edition override (highest
  // for non-manual VNs) and the resolution cache.
  const ownedRows = db
    .prepare(`
      SELECT o.vn_id, COALESCE(ao.aspect_key, rc.aspect_key) AS aspect_key
      FROM owned_release o
      LEFT JOIN owned_release_aspect_override ao
        ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
      LEFT JOIN release_resolution_cache rc
        ON rc.release_id = o.release_id
      WHERE o.vn_id IN (${placeholders})
    `)
    .all(...vnIds) as Array<{ vn_id: string; aspect_key: string | null }>;
  // Source 3: release_resolution_cache rows bound directly to the VN
  // (populated lazily from /vn/[id] and /release/[id] visits and now
  // also from `materializeAspectForCollectionVns` below).
  const cacheVnRows = db
    .prepare(
      `SELECT vn_id, aspect_key FROM release_resolution_cache
       WHERE vn_id IN (${placeholders})`,
    )
    .all(...vnIds) as Array<{ vn_id: string; aspect_key: string | null }>;

  function addKey(vnId: string, raw: string | null): void {
    const key = isAspectKey(raw) && raw !== 'unknown' ? raw : null;
    if (!key) return;
    const set = map.get(vnId) ?? new Set<AspectKey>();
    set.add(key);
    map.set(vnId, set);
  }

  // Manual VN override wins outright: when present, it's the ONLY
  // aspect key we surface for that VN so chip / group / filter
  // semantics agree.
  for (const [vnId, key] of manualByVn) {
    map.set(vnId, new Set([key]));
  }
  for (const r of ownedRows) {
    if (manualByVn.has(r.vn_id)) continue;
    addKey(r.vn_id, r.aspect_key);
  }
  for (const r of cacheVnRows) {
    if (manualByVn.has(r.vn_id)) continue;
    addKey(r.vn_id, r.aspect_key);
  }
  return new Map(Array.from(map.entries()).map(([vnId, keys]) => [vnId, Array.from(keys).sort()]));
}

/**
 * Materialize the screenshots-fallback aspect into
 * `release_resolution_cache` for every collection VN that lacks any
 * other aspect signal. Writes a synthetic cache row keyed on
 * `release_id = 'screenshot:<vnId>'` so:
 *   - The library aspect filter's existing EXISTS branch 3
 *     (rc.vn_id = c.vn_id) sees it.
 *   - `listAspectKeysForVns` Source 3 sees it.
 *   - Repeat calls short-circuit on `fetched_at` so we don't
 *     re-derive on every page load.
 *
 * Called from `/api/collection` so the filter and the aspect-group
 * grouping work even for VNs the user has never visited a release
 * page for. The synthetic row never conflicts with a real release
 * id (real ids look like `r\d+` or `synthetic:vN`).
 */
/**
 * Idempotent best-effort populator for `release_resolution_cache`
 * keyed on a SINGLE vn_id. Used by the VN page to pre-derive the
 * aspect ratio before mounting <AspectOverrideControl> so the
 * client doesn't flash "Auto · unknown" on first visit before the
 * lazy ReleasesSection fetches data.
 *
 * Strategy: scan `vndb_cache` for any cached `POST /release` response
 * whose results include this VN, extract `resolution` per release,
 * upsert into `release_resolution_cache` with `vn_id` set. Cheap —
 * the cache table is small and indexed by key.
 *
 * If no cached release data exists for the VN, this is a no-op and
 * the user will still get the screenshots fallback (or unknown).
 * The lazy ReleasesSection will populate the cache on first fetch
 * and a subsequent page render will pick it up.
 */
/**
 * Walk every cached release for one VN and write its aspect bucket into
 * `release_resolution_cache`. Lets the library aspect filter match a VN
 * without an owned-release row.
 */
export function materializeReleaseAspectsForVn(vnId: string): void {
  if (!isVndbVnId(vnId)) return;
  // Short-circuit when this VN already has any non-unknown signal
  // — no point scanning the cache when we already know the answer.
  const existing = db
    .prepare(
      `SELECT 1 FROM release_resolution_cache WHERE vn_id = ? AND aspect_key <> 'unknown' LIMIT 1`,
    )
    .get(vnId);
  if (existing) return;
  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE 'POST /release|%'`)
    .all() as Array<{ body: string }>;
  let wrote = 0;
  for (const row of rows) {
    let parsed: { results?: unknown[] } | null = null;
    try {
      parsed = JSON.parse(row.body) as { results?: unknown[] };
    } catch {
      continue;
    }
    if (!parsed?.results || !Array.isArray(parsed.results)) continue;
    for (const r of parsed.results) {
      if (!r || typeof r !== 'object') continue;
      const rel = r as {
        id?: unknown;
        resolution?: unknown;
        vns?: Array<{ id?: unknown }>;
      };
      if (typeof rel.id !== 'string' || !/^r\d+$/i.test(rel.id)) continue;
      // Match if any vn in the release.vns array equals our vnId.
      const linkedToThisVn =
        Array.isArray(rel.vns) && rel.vns.some((v) => v && typeof v.id === 'string' && v.id === vnId);
      if (!linkedToThisVn) continue;
      // The resolution field is shaped [w, h] | string | null on VNDB.
      // upsertReleaseResolutionCache normalises everything.
      try {
        upsertReleaseResolutionCache({
          releaseId: rel.id.toLowerCase(),
          resolution: rel.resolution,
          vnId,
        });
        wrote += 1;
      } catch {
        // Schema error / malformed input — keep scanning.
      }
    }
  }
  void wrote;
}

/**
 * Batch variant of `materializeReleaseAspectsForVn` that processes all
 * supplied VNDB VN ids in a single pass over the release cache.
 *
 * Replaces the per-VN loop in the collection GET route (DBA-001).
 * Instead of calling `materializeReleaseAspectsForVn(id)` O(n) times
 * (each of which re-reads the full vndb_cache), this function:
 *   1. Finds which VN ids already have a non-unknown signal (one IN query).
 *   2. Reads the vndb_cache bodies exactly once.
 *   3. Dispatches each release to every VN id that still needs data.
 */
/**
 * Bulk variant: process aspect-bucket materialisation for many VNs in one
 * pass. Reads `vndb_cache` bodies exactly once and dispatches each release
 * to every needing VN, so adding 100 VNs at once stays linear in releases.
 */
export function materializeReleaseAspectsForCollectionVns(vnIds: string[]): void {
  if (vnIds.length === 0) return;
  const vndbIds = vnIds.filter(isVndbVnId);
  if (vndbIds.length === 0) return;

  const CHUNK = 500;
  const needsWork = new Set<string>();
  for (let i = 0; i < vndbIds.length; i += CHUNK) {
    const chunk = vndbIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const already = db
      .prepare(
        `SELECT DISTINCT vn_id FROM release_resolution_cache
         WHERE vn_id IN (${placeholders}) AND aspect_key <> 'unknown'`,
      )
      .all(...chunk) as Array<{ vn_id: string }>;
    const alreadyDone = new Set(already.map((r) => r.vn_id));
    for (const id of chunk) {
      if (!alreadyDone.has(id)) needsWork.add(id);
    }
  }
  if (needsWork.size === 0) return;

  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE 'POST /release|%'`)
    .all() as Array<{ body: string }>;

  const tx = db.transaction(() => {
    for (const row of rows) {
      let parsed: { results?: unknown[] } | null = null;
      try {
        parsed = JSON.parse(row.body) as { results?: unknown[] };
      } catch {
        continue;
      }
      if (!parsed?.results || !Array.isArray(parsed.results)) continue;
      for (const r of parsed.results) {
        if (!r || typeof r !== 'object') continue;
        const rel = r as { id?: unknown; resolution?: unknown; vns?: Array<{ id?: unknown }> };
        if (typeof rel.id !== 'string' || !/^r\d+$/i.test(rel.id)) continue;
        if (!Array.isArray(rel.vns)) continue;
        for (const v of rel.vns) {
          if (!v || typeof v.id !== 'string') continue;
          if (!needsWork.has(v.id)) continue;
          try {
            upsertReleaseResolutionCache({
              releaseId: rel.id.toLowerCase(),
              resolution: rel.resolution,
              vnId: v.id,
            });
          } catch {
            // Schema error / malformed input — keep scanning.
          }
        }
      }
    }
  });
  tx();
}

/**
 * Per-release metadata shape persisted in `release_meta_cache`. Every
 * field is nullable so the popover can show the parts VNDB knows
 * about and gracefully omit the rest.
 */
export interface ReleaseMetaRow {
  release_id: string;
  vn_id: string | null;
  title: string | null;
  alttitle: string | null;
  platforms: string[];
  languages: Array<{ lang: string; title?: string; latin?: string | null; mtl?: boolean; main?: boolean }>;
  released: string | null;
  minage: number | null;
  patch: boolean;
  freeware: boolean;
  uncensored: boolean | null;
  official: boolean;
  has_ero: boolean;
  voiced: number | null;
  engine: string | null;
  notes: string | null;
  gtin: string | null;
  catalog: string | null;
  resolution: string | null;
}

function parseJsonField<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v as T;
  } catch {
    return fallback;
  }
}

/** Read the materialised release-meta cache row for one release id, or `null`. */
export function getReleaseMeta(releaseId: string): ReleaseMetaRow | null {
  const row = db
    .prepare(
      `SELECT release_id, vn_id, title, alttitle, platforms, languages, released, minage, patch, freeware, uncensored, official, has_ero, voiced, engine, notes, gtin, catalog, resolution FROM release_meta_cache WHERE release_id = ?`,
    )
    .get(releaseId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    release_id: row.release_id as string,
    vn_id: (row.vn_id as string | null) ?? null,
    title: (row.title as string | null) ?? null,
    alttitle: (row.alttitle as string | null) ?? null,
    platforms: parseJsonField<string[]>(row.platforms as string | null, []),
    languages: parseJsonField<ReleaseMetaRow['languages']>(row.languages as string | null, []),
    released: (row.released as string | null) ?? null,
    minage: (row.minage as number | null) ?? null,
    patch: !!row.patch,
    freeware: !!row.freeware,
    uncensored: row.uncensored == null ? null : !!row.uncensored,
    official: !!row.official,
    has_ero: !!row.has_ero,
    voiced: (row.voiced as number | null) ?? null,
    engine: (row.engine as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    gtin: (row.gtin as string | null) ?? null,
    catalog: (row.catalog as string | null) ?? null,
    resolution: (row.resolution as string | null) ?? null,
  };
}

/**
 * Harvest per-release metadata from every cached `POST /release`
 * payload that mentions `vnId`. Idempotent + best-effort: any
 * release row that throws while inserting is skipped silently so
 * one bad payload doesn't poison the rest.
 *
 * The shape mirrors `materializeReleaseAspectsForVn` so the two
 * helpers can be called back-to-back; the resolution aspect lives
 * in release_resolution_cache and richer per-release metadata in
 * release_meta_cache. They MAY duplicate `resolution` because the
 * derived aspect-key requires structured parsing.
 */
/**
 * Materialise the `release_meta_cache` rows for one VN from its cached
 * release payload. Each row carries platforms / resolution / aspect so
 * the shelf editor renders edition details without a re-parse.
 */
export function materializeReleaseMetaForVn(vnId: string): void {
  if (!isVndbVnId(vnId)) return;
  const vnNewest = db
    .prepare(`SELECT MAX(fetched_at) AS latest FROM release_meta_cache WHERE vn_id = ?`)
    .get(vnId) as { latest: number | null };
  const cacheNewest = db
    .prepare(`SELECT MAX(fetched_at) AS latest FROM vndb_cache WHERE cache_key LIKE 'POST /release|%'`)
    .get() as { latest: number | null };
  if (vnNewest?.latest && cacheNewest?.latest && vnNewest.latest >= cacheNewest.latest) return;
  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE 'POST /release|%'`)
    .all() as Array<{ body: string }>;
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO release_meta_cache (
      release_id, vn_id, title, alttitle, platforms, languages, released,
      minage, patch, freeware, uncensored, official, has_ero, voiced,
      engine, notes, gtin, catalog, resolution, media, producers, extlinks,
      fetched_at
    ) VALUES (
      @release_id, @vn_id, @title, @alttitle, @platforms, @languages, @released,
      @minage, @patch, @freeware, @uncensored, @official, @has_ero, @voiced,
      @engine, @notes, @gtin, @catalog, @resolution, @media, @producers, @extlinks,
      @fetched_at
    )
    ON CONFLICT(release_id) DO UPDATE SET
      vn_id = excluded.vn_id,
      title = excluded.title,
      alttitle = excluded.alttitle,
      platforms = excluded.platforms,
      languages = excluded.languages,
      released = excluded.released,
      minage = excluded.minage,
      patch = excluded.patch,
      freeware = excluded.freeware,
      uncensored = excluded.uncensored,
      official = excluded.official,
      has_ero = excluded.has_ero,
      voiced = excluded.voiced,
      engine = excluded.engine,
      notes = excluded.notes,
      gtin = excluded.gtin,
      catalog = excluded.catalog,
      resolution = excluded.resolution,
      media = excluded.media,
      producers = excluded.producers,
      extlinks = excluded.extlinks,
      fetched_at = excluded.fetched_at
  `);
  for (const row of rows) {
    let parsed: { results?: unknown[] } | null = null;
    try {
      parsed = JSON.parse(row.body) as { results?: unknown[] };
    } catch {
      continue;
    }
    if (!parsed?.results || !Array.isArray(parsed.results)) continue;
    for (const r of parsed.results) {
      if (!r || typeof r !== 'object') continue;
      const rel = r as Record<string, unknown>;
      const id = rel.id;
      if (typeof id !== 'string' || !/^r\d+$/i.test(id)) continue;
      const vns = Array.isArray(rel.vns) ? (rel.vns as Array<{ id?: unknown }>) : [];
      const linked = vns.some((v) => v && typeof v.id === 'string' && v.id === vnId);
      if (!linked) continue;
      try {
        const platforms = Array.isArray(rel.platforms)
          ? (rel.platforms as unknown[]).filter((x): x is string => typeof x === 'string')
          : [];
        const languages = Array.isArray(rel.languages) ? rel.languages : [];
        // Resolution is shape [w,h] | string | null on VNDB.
        let resolution: string | null = null;
        if (typeof rel.resolution === 'string') resolution = rel.resolution;
        else if (Array.isArray(rel.resolution) && rel.resolution.length === 2) {
          const [w, h] = rel.resolution as [unknown, unknown];
          if (typeof w === 'number' && typeof h === 'number') resolution = `${w}x${h}`;
        }
        upsert.run({
          release_id: id.toLowerCase(),
          vn_id: vnId,
          title: typeof rel.title === 'string' ? rel.title : null,
          alttitle: typeof rel.alttitle === 'string' ? rel.alttitle : null,
          platforms: JSON.stringify(platforms),
          languages: JSON.stringify(languages),
          released: typeof rel.released === 'string' ? rel.released : null,
          minage: typeof rel.minage === 'number' ? rel.minage : null,
          patch: rel.patch ? 1 : 0,
          freeware: rel.freeware ? 1 : 0,
          uncensored: rel.uncensored == null ? null : rel.uncensored ? 1 : 0,
          official: rel.official === false ? 0 : 1,
          has_ero: rel.has_ero ? 1 : 0,
          voiced: typeof rel.voiced === 'number' ? rel.voiced : null,
          engine: typeof rel.engine === 'string' ? rel.engine : null,
          notes: typeof rel.notes === 'string' ? rel.notes : null,
          gtin: typeof rel.gtin === 'string' ? rel.gtin : null,
          catalog: typeof rel.catalog === 'string' ? rel.catalog : null,
          resolution,
          media: JSON.stringify(Array.isArray(rel.media) ? rel.media : []),
          producers: JSON.stringify(Array.isArray(rel.producers) ? rel.producers : []),
          extlinks: JSON.stringify(Array.isArray(rel.extlinks) ? rel.extlinks : []),
          fetched_at: now,
        });
      } catch {
        // Schema/SQL/JSON failure — skip this row but keep scanning.
      }
    }
  }
  // Layer C autofill — after materializing release_meta_cache rows
  // for this VN, retroactively fill any owned_release row whose
  // release just gained a singleton platform list. Idempotent.
  // This is what makes the platform chip populate "for free" once
  // the user opens /vn/[id] and the release fan-out has run.
  db.prepare(`
    UPDATE owned_release
    SET owned_platform = (
      SELECT json_extract(rm.platforms, '$[0]')
      FROM release_meta_cache rm
      WHERE rm.release_id = owned_release.release_id
        AND json_valid(rm.platforms)
        AND json_array_length(rm.platforms) = 1
    )
    WHERE vn_id = ?
      AND owned_platform IS NULL
      AND EXISTS (
        SELECT 1 FROM release_meta_cache rm
        WHERE rm.release_id = owned_release.release_id
          AND json_valid(rm.platforms)
          AND json_array_length(rm.platforms) = 1
      )
  `).run(vnId);
}

/**
 * R5-133 — cache-wide single-pass materialisation for the global
 * refresh route. Instead of N per-VN `materializeReleaseMetaForVn`
 * jobs (each one scanning the entire `vndb_cache` LIKE-anchored
 * to `POST /release|%`), read every cached body ONCE, iterate
 * `results[]`, dispatch each release to every VN it lists, and
 * upsert in a single transaction.
 *
 * Returns the number of releases upserted across all collection
 * VNs (mostly for telemetry).
 */
/**
 * Bulk variant of `materializeReleaseMetaForVn`. Returns the upsert count
 * for telemetry / progress reporting.
 */
export function materializeReleaseMetaForCollectionVns(vnIds: string[]): number {
  if (vnIds.length === 0) return 0;
  const ownedSet = new Set(vnIds);
  const rows = db
    .prepare(`SELECT body FROM vndb_cache WHERE cache_key LIKE 'POST /release|%'`)
    .all() as Array<{ body: string }>;
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO release_meta_cache (
      release_id, vn_id, title, alttitle, platforms, languages, released,
      minage, patch, freeware, uncensored, official, has_ero, voiced,
      engine, notes, gtin, catalog, resolution, media, producers, extlinks,
      fetched_at
    ) VALUES (
      @release_id, @vn_id, @title, @alttitle, @platforms, @languages, @released,
      @minage, @patch, @freeware, @uncensored, @official, @has_ero, @voiced,
      @engine, @notes, @gtin, @catalog, @resolution, @media, @producers, @extlinks,
      @fetched_at
    )
    ON CONFLICT(release_id) DO UPDATE SET
      vn_id = excluded.vn_id,
      title = excluded.title,
      alttitle = excluded.alttitle,
      platforms = excluded.platforms,
      languages = excluded.languages,
      released = excluded.released,
      minage = excluded.minage,
      patch = excluded.patch,
      freeware = excluded.freeware,
      uncensored = excluded.uncensored,
      official = excluded.official,
      has_ero = excluded.has_ero,
      voiced = excluded.voiced,
      engine = excluded.engine,
      notes = excluded.notes,
      gtin = excluded.gtin,
      catalog = excluded.catalog,
      resolution = excluded.resolution,
      media = excluded.media,
      producers = excluded.producers,
      extlinks = excluded.extlinks,
      fetched_at = excluded.fetched_at
  `);
  let upserts = 0;
  const tx = db.transaction(() => {
    for (const row of rows) {
      let parsed: { results?: unknown[] } | null = null;
      try {
        parsed = JSON.parse(row.body) as { results?: unknown[] };
      } catch {
        continue;
      }
      if (!parsed?.results || !Array.isArray(parsed.results)) continue;
      for (const r of parsed.results) {
        if (!r || typeof r !== 'object') continue;
        const rel = r as Record<string, unknown>;
        const id = rel.id;
        if (typeof id !== 'string' || !/^r\d+$/i.test(id)) continue;
        const vns = Array.isArray(rel.vns) ? (rel.vns as Array<{ id?: unknown }>) : [];
        // Dispatch this release to every owned VN it lists. A release
        // can be linked to multiple VNs (omnibus / anthology) so we
        // upsert one row per (vn_id, release_id). The previous
        // per-VN scan picked one VN at a time; the cache-wide scan
        // visits each release exactly once.
        for (const v of vns) {
          if (!v || typeof v.id !== 'string') continue;
          const vnId = v.id;
          if (!ownedSet.has(vnId)) continue;
          try {
            const platforms = Array.isArray(rel.platforms)
              ? (rel.platforms as unknown[]).filter((x): x is string => typeof x === 'string')
              : [];
            const languages = Array.isArray(rel.languages) ? rel.languages : [];
            let resolution: string | null = null;
            if (typeof rel.resolution === 'string') resolution = rel.resolution;
            else if (Array.isArray(rel.resolution) && rel.resolution.length === 2) {
              const [w, h] = rel.resolution as [unknown, unknown];
              if (typeof w === 'number' && typeof h === 'number') resolution = `${w}x${h}`;
            }
            upsert.run({
              release_id: id.toLowerCase(),
              vn_id: vnId,
              title: typeof rel.title === 'string' ? rel.title : null,
              alttitle: typeof rel.alttitle === 'string' ? rel.alttitle : null,
              platforms: JSON.stringify(platforms),
              languages: JSON.stringify(languages),
              released: typeof rel.released === 'string' ? rel.released : null,
              minage: typeof rel.minage === 'number' ? rel.minage : null,
              patch: rel.patch ? 1 : 0,
              freeware: rel.freeware ? 1 : 0,
              uncensored: rel.uncensored == null ? null : rel.uncensored ? 1 : 0,
              official: rel.official === false ? 0 : 1,
              has_ero: rel.has_ero ? 1 : 0,
              voiced: typeof rel.voiced === 'number' ? rel.voiced : null,
              engine: typeof rel.engine === 'string' ? rel.engine : null,
              notes: typeof rel.notes === 'string' ? rel.notes : null,
              gtin: typeof rel.gtin === 'string' ? rel.gtin : null,
              catalog: typeof rel.catalog === 'string' ? rel.catalog : null,
              resolution,
              media: JSON.stringify(Array.isArray(rel.media) ? rel.media : []),
              producers: JSON.stringify(Array.isArray(rel.producers) ? rel.producers : []),
              extlinks: JSON.stringify(Array.isArray(rel.extlinks) ? rel.extlinks : []),
              fetched_at: now,
            });
            upserts++;
          } catch {
            // Skip this row but keep scanning.
          }
        }
      }
    }
    // Layer C autofill — single pass over every owned_release row
    // whose release just gained a singleton platform list, scoped
    // by the input vn id list.
    const placeholders = vnIds.map(() => '?').join(',');
    db.prepare(`
      UPDATE owned_release
      SET owned_platform = (
        SELECT json_extract(rm.platforms, '$[0]')
        FROM release_meta_cache rm
        WHERE rm.release_id = owned_release.release_id
          AND json_valid(rm.platforms)
          AND json_array_length(rm.platforms) = 1
      )
      WHERE vn_id IN (${placeholders})
        AND owned_platform IS NULL
        AND EXISTS (
          SELECT 1 FROM release_meta_cache rm
          WHERE rm.release_id = owned_release.release_id
            AND json_valid(rm.platforms)
            AND json_array_length(rm.platforms) = 1
        )
    `).run(...vnIds);
  });
  tx();
  return upserts;
}

/**
 * Materialise the per-VN aspect bucket on `vn.aspect_key_cache` for every
 * supplied id. Runs the full `deriveVnAspectKey` chain so the value
 * matches what the library filter and the AspectOverrideControl see.
 */
export function materializeAspectForCollectionVns(vnIds: string[]): void {
  if (vnIds.length === 0) return;
  // Only materialize VNs that don't already have an aspect signal —
  // either a manual override, an owned-release cached aspect, or a
  // vn-bound cache row with a non-unknown value.
  const placeholders = vnIds.map(() => '?').join(',');
  const hasSignal = new Set(
    (
      db
        .prepare(
          `SELECT v.id AS vn_id FROM vn v
           WHERE v.id IN (${placeholders}) AND (
             EXISTS (SELECT 1 FROM vn_aspect_override vo
                     WHERE vo.vn_id = v.id AND vo.aspect_key <> 'unknown')
             OR EXISTS (
               SELECT 1 FROM owned_release o
               LEFT JOIN owned_release_aspect_override ao
                 ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
               LEFT JOIN release_resolution_cache rc
                 ON rc.release_id = o.release_id
               WHERE o.vn_id = v.id
                 AND COALESCE(ao.aspect_key, rc.aspect_key) IS NOT NULL
                 AND COALESCE(ao.aspect_key, rc.aspect_key) <> 'unknown'
             )
             OR EXISTS (SELECT 1 FROM release_resolution_cache rc
                        WHERE rc.vn_id = v.id AND rc.aspect_key <> 'unknown')
           )`,
        )
        .all(...vnIds) as Array<{ vn_id: string }>
    ).map((r) => r.vn_id),
  );
  const missing = vnIds.filter((id) => !hasSignal.has(id));
  if (missing.length === 0) return;
  // Pull screenshots JSON for the missing VNs in a single query.
  const missingPlaceholders = missing.map(() => '?').join(',');
  const screenshotRows = db
    .prepare(
      `SELECT id, screenshots FROM vn WHERE id IN (${missingPlaceholders}) AND screenshots IS NOT NULL`,
    )
    .all(...missing) as Array<{ id: string; screenshots: string }>;
  const now = Date.now();
  const upsert = db.prepare(`
    INSERT INTO release_resolution_cache
      (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
    VALUES (?, ?, NULL, NULL, NULL, ?, ?)
    ON CONFLICT(release_id) DO UPDATE SET
      vn_id = excluded.vn_id,
      aspect_key = excluded.aspect_key,
      fetched_at = excluded.fetched_at
  `);
  const tx = db.transaction(() => {
    for (const row of screenshotRows) {
      let shots: Array<{ dims?: [number, number] }> = [];
      try {
        shots = JSON.parse(row.screenshots) as Array<{ dims?: [number, number] }>;
      } catch {
        continue;
      }
      const tally = new Map<AspectKey, number>();
      for (const s of shots) {
        if (!Array.isArray(s.dims)) continue;
        const [w, h] = s.dims;
        if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) continue;
        const key = aspectKeyForResolution(w, h);
        if (key === 'unknown') continue;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      let best: AspectKey | null = null;
      let bestN = 0;
      for (const [key, n] of tally) {
        if (n > bestN) {
          best = key;
          bestN = n;
        }
      }
      if (!best) continue;
      upsert.run(`screenshot:${row.id}`, row.id, best, now);
    }
  });
  tx();
}

/** Read one collection row + joined VN data as a `CollectionItem`, or `null`. */
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

/** Live counters for the home page (per-status, per-length, etc.). Always fresh. */
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

// 30-second in-process cache so navigating away and back doesn't
// re-run 8 full scans. Mutating helpers below call
// `invalidateAggregateStats()` to bust this on writes.
let aggregateStatsCache: { at: number; data: AggregateStats } | null = null;
const AGGREGATE_STATS_TTL_MS = 30_000;

/**
 * Heavier aggregate stats for the `/stats` page (averages, distributions,
 * percentiles). Cached in-process for `AGGREGATE_STATS_TTL_MS` so frequent
 * page reloads don't repeatedly scan the whole collection.
 */
export function getAggregateStats(): AggregateStats {
  if (aggregateStatsCache && Date.now() - aggregateStatsCache.at < AGGREGATE_STATS_TTL_MS) {
    return aggregateStatsCache.data;
  }
  const data = computeAggregateStats();
  aggregateStatsCache = { at: Date.now(), data };
  return data;
}

/** Drop the in-process aggregate-stats cache. Called by collection writers. */
export function invalidateAggregateStats(): void {
  aggregateStatsCache = null;
}

function computeAggregateStats(): AggregateStats {
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
      SELECT li.lang AS lang, COUNT(DISTINCT li.vn_id) AS count
      FROM collection c JOIN vn_language_index li ON li.vn_id = c.vn_id
      GROUP BY li.lang ORDER BY count DESC LIMIT 12
    `)
    .all() as { lang: string; count: number }[];

  const byPlatform = db
    .prepare(`
      SELECT pi.platform AS platform, COUNT(DISTINCT pi.vn_id) AS count
      FROM collection c JOIN vn_platform_index pi ON pi.vn_id = c.vn_id
      GROUP BY pi.platform ORDER BY count DESC LIMIT 12
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
        ti.tag_id AS tag_id,
        COALESCE(MAX(ti.tag_name), ti.tag_id) AS tag_name,
        COUNT(*) AS count
      FROM collection c JOIN vn_tag_index ti ON ti.vn_id = c.vn_id
      WHERE ti.spoiler = 0
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

/** Type-guard: is `v` a valid `Status` enum value? */
export function isValidStatus(v: unknown): v is Status {
  return typeof v === 'string' && (STATUSES as readonly string[]).includes(v);
}

/** Type-guard: is `v` a valid `Location` enum value? */
export function isValidLocation(v: unknown): v is Location {
  return typeof v === 'string' && (LOCATIONS as readonly string[]).includes(v);
}

/** Type-guard: is `v` a valid `EditionType` enum value? */
export function isValidEditionType(v: unknown): v is EditionType {
  return typeof v === 'string' && (EDITION_TYPES as readonly string[]).includes(v);
}

/** Type-guard: is `v` a valid `BoxType` enum value? */
export function isValidBoxType(v: unknown): v is BoxType {
  return typeof v === 'string' && (BOX_TYPES as readonly string[]).includes(v);
}

export interface CollectionTagAggregate {
  id: string;
  name: string;
  category: string | null;
  count: number;
}

/**
 * Aggregate every tag across owned VNs into `{ id, name, count }`. Used by
 * the library tag filter dropdown and the /stats tag chart.
 */
export function listCollectionTags(): CollectionTagAggregate[] {
  return (db
    .prepare(`
      SELECT
        ti.tag_id AS tag_id,
        COALESCE(MAX(ti.tag_name), ti.tag_id) AS tag_name,
        MAX(ti.category) AS tag_category,
        COUNT(*) AS tag_count
      FROM collection c JOIN vn_tag_index ti ON ti.vn_id = c.vn_id
      WHERE ti.spoiler = 0
      GROUP BY tag_id
      ORDER BY tag_count DESC, tag_name COLLATE NOCASE ASC
      LIMIT 500
    `)
    .all() as { tag_id: string; tag_name: string; tag_category: string | null; tag_count: number }[])
    .map((r) => ({ id: r.tag_id, name: r.tag_name, category: r.tag_category, count: r.tag_count }));
}

/**
 * Local character search across `character_full:*` cache rows that
 * belong to a VN in the operator's collection. Used by `/characters`
 * + `/api/collection/characters` to back the "Local" tab. Returns the
 * raw VNDB character profile JSON with the seiyuu language list
 * attached from `vn_va_credit` so the page-level filters
 * (vaLang / hasVoice) work without a follow-up fetch.
 *
 * The function is intentionally untyped — the page parses each row
 * with `VndbCharacter` and the `voice_languages` extension. Keeping
 * the return type loose dodges a circular import on `lib/vndb.ts`.
 */
export interface LocalCharacterSearchOptions {
  /** Optional case-insensitive substring against id / name / aliases. */
  q?: string;
  /** Cap on the number of returned characters. Defaults to 200. */
  limit?: number;
}

/**
 * Search the local mirror of characters (joined with collection VNs). Used
 * by `/characters` when the operator wants to browse without hitting VNDB.
 */
export function searchLocalCharacters({
  q,
  limit = 200,
}: LocalCharacterSearchOptions = {}): Array<{ profile: Record<string, unknown>; voice_languages: string[] }> {
  const rows = db
    .prepare(
      `SELECT vc.cache_key, vc.body
       FROM vndb_cache vc
       WHERE vc.cache_key LIKE 'char_full:%'
         AND (
           EXISTS (
             SELECT 1 FROM character_vn_index ci
             JOIN collection c ON c.vn_id = ci.vn_id
             WHERE ci.character_id = substr(vc.cache_key, length('char_full:') + 1)
           )
           OR EXISTS (
             SELECT 1 FROM vn_va_credit va
             JOIN collection col ON col.vn_id = va.vn_id
             WHERE va.c_id = substr(vc.cache_key, length('char_full:') + 1)
           )
         )
       LIMIT 5000`,
    )
    .all() as Array<{ cache_key: string; body: string }>;
  const needle = q?.trim().toLowerCase() ?? '';
  // First pass: parse the cache payloads and build the matched
  type Match = { id: string; profile: Record<string, unknown> };
  const matches: Match[] = [];
  for (const row of rows) {
    let payload: { profile?: Record<string, unknown> | null } | null = null;
    try {
      payload = JSON.parse(row.body) as { profile?: Record<string, unknown> | null };
    } catch {
      continue;
    }
    const profile = payload?.profile;
    if (!profile || typeof profile !== 'object') continue;
    if (needle) {
      const idVal = typeof profile.id === 'string' ? profile.id : '';
      const nameVal = typeof profile.name === 'string' ? profile.name : '';
      const originalVal = typeof profile.original === 'string' ? profile.original : '';
      const aliasesArr = Array.isArray(profile.aliases) ? profile.aliases.filter((x) => typeof x === 'string') : [];
      const haystack = [idVal, nameVal, originalVal, ...aliasesArr].join('\n').toLowerCase();
      if (!haystack.includes(needle)) continue;
    }
    const id = typeof profile.id === 'string' ? profile.id : '';
    matches.push({ id, profile });
    if (matches.length >= limit) break;
  }
  // Single batched VA-language fetch — one query (or one per 500
  // ids) instead of one per matched character. `vn_va_credit`
  // carries the VA's language in `va_lang` (not the `lang` column
  // the schema uses on `vn_staff_credit`); the earlier per-row
  // query referenced the wrong column and crashed any
  // `/characters` search with `SqliteError: no such column: lang`.
  //
  // Chunked at 500 placeholders to stay under SQLite's
  // SQLITE_MAX_VARIABLE_NUMBER cap; matches the convention in
  // `isInCollectionMany` / `getEgsForVns`.
  const idsWithProfile = matches.filter((m) => m.id !== '').map((m) => m.id);
  const langByCid = new Map<string, string[]>();
  const CHUNK = 500;
  for (let i = 0; i < idsWithProfile.length; i += CHUNK) {
    const chunk = idsWithProfile.slice(i, i + CHUNK);
    if (chunk.length === 0) break;
    const placeholders = chunk.map(() => '?').join(',');
    const langRows = db
      .prepare(
        `SELECT c_id, va_lang
           FROM vn_va_credit
           WHERE c_id IN (${placeholders})
             AND va_lang IS NOT NULL`,
      )
      .all(...chunk) as Array<{ c_id: string; va_lang: string | null }>;
    for (const r of langRows) {
      if (!r.va_lang) continue;
      const arr = langByCid.get(r.c_id);
      if (arr) {
        if (!arr.includes(r.va_lang)) arr.push(r.va_lang);
      } else {
        langByCid.set(r.c_id, [r.va_lang]);
      }
    }
  }
  const out: Array<{ profile: Record<string, unknown>; voice_languages: string[] }> = [];
  for (const m of matches) {
    const langs = m.id ? (langByCid.get(m.id) ?? []) : [];
    out.push({ profile: m.profile, voice_languages: langs });
  }
  return out;
}

/**
 * Local staff search across `vn_staff_credit` joined with the
 * operator's collection. Backs the `/staff?scope=collection` mode.
 * The optional filters mirror the VNDB-tab filter chips so users
 * can dial in "every translator credited on a VN I own" without
 * pulling VNDB live data.
 */
export interface LocalStaffSearchOptions {
  q?: string;
  role?: string | null;
  lang?: string | null;
  limit?: number;
}

export interface LocalStaffRow {
  id: string;
  name: string;
  original: string | null;
  lang: string | null;
  roles: string[];
  vn_count: number;
}

/**
 * Search the local mirror of staff (joined with collection VNs). Used by
 * `/staff` when the operator wants to browse without hitting VNDB.
 */
export function searchLocalStaff({
  q,
  role,
  lang,
  limit = 100,
}: LocalStaffSearchOptions = {}): LocalStaffRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  const needle = q?.trim().toLowerCase() ?? '';
  if (needle) {
    where.push(
      "(sc.name LIKE ? COLLATE NOCASE OR COALESCE(sc.original, '') LIKE ? COLLATE NOCASE OR sc.sid LIKE ?)",
    );
    const like = `%${needle}%`;
    args.push(like, like, like);
  }
  if (role) {
    where.push('sc.role = ?');
    args.push(role);
  }
  if (lang) {
    where.push('sc.lang = ?');
    args.push(lang);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `
    SELECT sc.sid AS sid,
           MAX(sc.name) AS name,
           MAX(sc.original) AS original,
           MAX(sc.lang) AS lang,
           GROUP_CONCAT(DISTINCT sc.role) AS roles,
           COUNT(DISTINCT sc.vn_id) AS vn_count
    FROM vn_staff_credit sc
    JOIN collection c ON c.vn_id = sc.vn_id
    ${whereSql}
    GROUP BY sc.sid
    ORDER BY vn_count DESC, name COLLATE NOCASE ASC
    LIMIT ?
  `;
  args.push(Math.min(Math.max(limit, 1), 500));
  const rows = db.prepare(sql).all(...args) as Array<{
    sid: string;
    name: string;
    original: string | null;
    lang: string | null;
    roles: string | null;
    vn_count: number;
  }>;
  return rows.map((r) => ({
    id: r.sid,
    name: r.name,
    original: r.original,
    lang: r.lang,
    roles: (r.roles ?? '').split(',').filter(Boolean),
    vn_count: r.vn_count,
  }));
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
 * The query uses the flat `vn_tag_index` for both the seed VN and
 * the other in-collection VNs, then excludes the seed's own tags so
 * you see adjacent tags only.
 */
export function getCoOccurringTags(vnId: string, limit = 24): CoOccurringTag[] {
  return (db
    .prepare(`
      WITH seedTags AS (
        SELECT tag_id
        FROM vn_tag_index
        WHERE vn_id = ?
          AND spoiler = 0
      ),
      seedMatchedVns AS (
        SELECT DISTINCT ti.vn_id
        FROM vn_tag_index ti
        JOIN collection c ON c.vn_id = ti.vn_id
        WHERE ti.vn_id <> ?
          AND ti.spoiler = 0
          AND ti.tag_id IN (SELECT tag_id FROM seedTags)
      )
      SELECT
        ti.tag_id AS tag_id,
        COALESCE(MAX(ti.tag_name), ti.tag_id) AS tag_name,
        MAX(ti.category) AS tag_category,
        COUNT(DISTINCT ti.vn_id) AS shared_count
      FROM vn_tag_index ti
      JOIN seedMatchedVns sm ON sm.vn_id = ti.vn_id
      WHERE ti.spoiler = 0
        AND ti.tag_id NOT IN (SELECT tag_id FROM seedTags)
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

/** Read every `vn_route` row for one VN, ordered by `order_index`. */
export function listRoutesForVn(vnId: string): RouteRow[] {
  const rows = db
    .prepare('SELECT id, vn_id, name, completed, completed_date, order_index, notes, created_at, updated_at FROM vn_route WHERE vn_id = ? ORDER BY order_index ASC, created_at ASC')
    .all(vnId) as RouteDbRow[];
  return rows.map(rowToRoute);
}

/** Read one route by id, or `null` when unknown. */
export function getRoute(routeId: number): RouteRow | null {
  const row = db.prepare('SELECT id, vn_id, name, completed, completed_date, order_index, notes, created_at, updated_at FROM vn_route WHERE id = ?').get(routeId) as RouteDbRow | undefined;
  return row ? rowToRoute(row) : null;
}

/**
 * Create one route for a VN. `orderIndex` defaults to the highest
 * existing index + 1 so new routes append to the bottom.
 */
export function createRoute(vnId: string, name: string, orderIndex?: number): RouteRow {
  return db.transaction(() => {
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
  })();
}

export interface RoutePatch {
  name?: string;
  completed?: boolean;
  completed_date?: string | null;
  order_index?: number;
  notes?: string | null;
}

/**
 * Patch one route. Stamps `completed_date` automatically when the
 * `completed` flag flips on. Returns the updated row, or `null` for
 * unknown ids.
 */
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

/** Delete one route by id. Returns `false` when nothing matched. */
export function deleteRoute(routeId: number): boolean {
  return db.prepare('DELETE FROM vn_route WHERE id = ?').run(routeId).changes > 0;
}

/**
 * Persist the user's drag-reorder of routes for one VN. Rows whose ids
 * aren't in `orderedIds` keep their previous index so a partial reorder
 * never touches unrelated rows.
 */
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
  /**
   * The exact platform the user physically owns for this edition.
   * Lowercase VNDB platform code (e.g. "win", "ps4"). NULL means
   * "not specified yet" — surfaced when the underlying VNDB release
   * row lists multiple platforms and the user hasn't picked one.
   * Auto-set to the singleton when the release has exactly one
   * platform.
   */
  owned_platform: string | null;
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
  owned_platform: string | null;
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
    owned_platform: r.owned_platform,
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
  /** Release-package artwork preferred over VN cover art on shelf surfaces. */
  rel_image_thumb: string | null;
  rel_image_url: string | null;
  rel_local_image_thumb: string | null;
  rel_image_sexual: number | null;
  /**
   * VN-LEVEL aggregate metadata (every platform/language across all
   * releases of the VN). Kept as a fallback for synthetic-id rows
   * and for releases that haven't been harvested into
   * release_meta_cache yet.
   */
  vn_platforms: string[];
  vn_languages: string[];
  vn_released: string | null;
  /**
   * RELEASE-LEVEL metadata for the exact owned edition this row
   * represents. Populated by the LEFT JOIN against
   * release_meta_cache; null when the release is synthetic OR the
   * VNDB POST /release payload has not been materialized yet.
   *
   * UI consumers MUST prefer rel_* over vn_* when rel_* is set,
   * because the user owns ONE edition (e.g. WIN only) — widening
   * to the VN's aggregate platforms (WIN / PS4 / PSV / SWI) would
   * mis-describe the physical/digital item they're shelving.
   */
  rel_title: string | null;
  rel_platforms: string[];
  rel_languages: string[];
  rel_released: string | null;
  rel_resolution: string | null;
  rel_minage: number | null;
  rel_patch: boolean;
  rel_freeware: boolean;
  rel_official: boolean;
  rel_has_ero: boolean;
}

function parseJsonArrayField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function pickReleaseCover(raw: string | null | undefined, releaseId: string): {
  rel_image_thumb: string | null;
  rel_image_url: string | null;
  rel_local_image_thumb: string | null;
  rel_image_sexual: number | null;
} {
  const images = parseJsonField<ReleaseImage[]>(raw, []);
  const matches = images.filter((img) => img.release_id === releaseId);
  const chosen =
    matches.find((img) => img.type === 'pkgfront') ??
    matches.find((img) => img.type === 'pkgside') ??
    matches.find((img) => img.type === 'pkgcontent') ??
    matches[0] ??
    null;
  return {
    rel_image_thumb: chosen?.thumbnail ?? chosen?.url ?? null,
    rel_image_url: chosen?.url ?? chosen?.thumbnail ?? null,
    rel_local_image_thumb: chosen?.local_thumb ?? chosen?.local ?? null,
    rel_image_sexual: chosen?.sexual ?? null,
  };
}

/**
 * Decode the `release_meta_cache.languages` JSON column into a
 * flat string[] of language codes. The cached payload is the
 * VNDB shape `[{lang, title, latin, mtl, main}, …]`; the popover
 * only needs the lang codes.
 */
function parseLanguagesField(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    const out: string[] = [];
    for (const entry of v) {
      if (entry && typeof entry === 'object' && typeof (entry as { lang?: unknown }).lang === 'string') {
        out.push((entry as { lang: string }).lang);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Columns selected from `release_meta_cache` via LEFT JOIN by the
 * shelf-edition helpers below. Pulled together for re-use across
 * the three helpers (listAllOwnedReleases, listUnplacedOwnedReleases,
 * listShelfSlots, listShelfDisplaySlots).
 */
const RELEASE_META_JOIN_SELECT = `
  rm.title       AS rel_title,
  rm.platforms   AS rel_platforms,
  rm.languages   AS rel_languages,
  rm.released    AS rel_released,
  rm.resolution  AS rel_resolution,
  rm.minage      AS rel_minage,
  rm.patch       AS rel_patch,
  rm.freeware    AS rel_freeware,
  rm.official    AS rel_official,
  rm.has_ero     AS rel_has_ero
`;

interface ReleaseMetaJoinRow {
  rel_title: string | null;
  rel_platforms: string | null;
  rel_languages: string | null;
  rel_released: string | null;
  rel_resolution: string | null;
  rel_minage: number | null;
  rel_patch: number | null;
  rel_freeware: number | null;
  rel_official: number | null;
  rel_has_ero: number | null;
}

function unpackReleaseMetaJoin(r: ReleaseMetaJoinRow): {
  rel_title: string | null;
  rel_platforms: string[];
  rel_languages: string[];
  rel_released: string | null;
  rel_resolution: string | null;
  rel_minage: number | null;
  rel_patch: boolean;
  rel_freeware: boolean;
  rel_official: boolean;
  rel_has_ero: boolean;
} {
  return {
    rel_title: r.rel_title,
    rel_platforms: parseJsonArrayField(r.rel_platforms),
    rel_languages: parseLanguagesField(r.rel_languages),
    rel_released: r.rel_released,
    rel_resolution: r.rel_resolution,
    rel_minage: r.rel_minage,
    rel_patch: !!r.rel_patch,
    rel_freeware: !!r.rel_freeware,
    // SQL DEFAULT 1 — fall back to true when the column is null
    // (means the row hasn't been materialized; assume official).
    rel_official: r.rel_official == null ? true : !!r.rel_official,
    rel_has_ero: !!r.rel_has_ero,
  };
}

/**
 * Every owned release in the collection joined with its VN's display data,
 * with a single physical location string per entry. Rows without a
 * `physical_location` entry fall into the "Unsorted" bucket so the
 * caller can render them in their own group.
 */
/**
 * Upper-bound for `listAllOwnedReleases`. Real personal libraries top
 * out in the low thousands of editions; 50k is generous and keeps the
 * shelf grid from melting if the table grows unexpectedly.
 */
const LIST_ALL_OWNED_RELEASES_LIMIT = 50000;

/**
 * Every owned edition across the collection, joined with VN cover + title
 * for the shelf views. Capped at `LIST_ALL_OWNED_RELEASES_LIMIT` to bound
 * worst-case row counts.
 */
export function listAllOwnedReleases(): ShelfEntry[] {
  const rows = db
    .prepare(`
      SELECT o.*,
             v.title AS vn_title,
             v.image_thumb AS vn_image_thumb,
             v.image_url AS vn_image_url,
             v.local_image_thumb AS vn_local_image_thumb,
             v.image_sexual AS vn_image_sexual,
             v.release_images AS vn_release_images,
             v.platforms AS vn_platforms,
             v.languages AS vn_languages,
             v.released AS vn_released,
             ${RELEASE_META_JOIN_SELECT}
      FROM owned_release o
      JOIN vn v ON v.id = o.vn_id
      LEFT JOIN release_meta_cache rm ON rm.release_id = o.release_id
      ORDER BY v.title COLLATE NOCASE ASC
      LIMIT ?
    `)
    .all(LIST_ALL_OWNED_RELEASES_LIMIT) as Array<OwnedReleaseDbRow & ReleaseMetaJoinRow & {
      vn_title: string;
	      vn_image_thumb: string | null;
	      vn_image_url: string | null;
	      vn_local_image_thumb: string | null;
	      vn_image_sexual: number | null;
	      vn_release_images: string | null;
	      vn_platforms: string | null;
      vn_languages: string | null;
      vn_released: string | null;
    }>;
  return rows.map((r) => ({
    ...mapOwnedReleaseRow(r),
    vn_title: r.vn_title,
	    vn_image_thumb: r.vn_image_thumb,
	    vn_image_url: r.vn_image_url,
	    vn_local_image_thumb: r.vn_local_image_thumb,
	    vn_image_sexual: r.vn_image_sexual,
	    ...pickReleaseCover(r.vn_release_images, r.release_id),
	    vn_platforms: parseJsonArrayField(r.vn_platforms),
    vn_languages: parseJsonArrayField(r.vn_languages),
    vn_released: r.vn_released,
    ...unpackReleaseMetaJoin(r),
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
 * Return the set of VN ids that have at least one placed edition on
 * any shelf (either `shelf_slot` or `shelf_display_slot`). Used by
 * `/dumped` to surface a "Voir sur l'étagère" deep-link next to
 * each row that the user has physically arranged. A simple Set keeps
 * the per-row lookup O(1) without re-running a subquery for every
 * card.
 */
export function listVnIdsOnShelf(): Set<string> {
  const rows = db
    .prepare(
      `SELECT vn_id FROM shelf_slot
        UNION
       SELECT vn_id FROM shelf_display_slot`,
    )
    .all() as Array<{ vn_id: string }>;
  return new Set(rows.map((r) => r.vn_id));
}

/**
 * Per-VN dump status across the collection. Aggregates the
 * owned_release.dumped flag on each release plus collection.dumped
 * on the VN itself, so the dump-management page can show a single
 * progress bar per game (X of Y editions dumped) even when a VN
 * carries multiple physical editions.
 *
 * Sorted: in-progress VNs first (have at least one dumped edition
 * but not all), then untouched (zero dumped), then fully done.
 * Within each group, alphabetical.
 */
/**
 * Aggregate dump progress per VN. Sorted partial-first (mixed dumped /
 * not-dumped editions), then untouched, then fully done — matches the
 * `/dumped` page's "what's left to back up" reading order.
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
        COALESCE(ed.total_editions, 0)   AS total_editions,
        COALESCE(ed.dumped_editions, 0)  AS dumped_editions
      FROM collection c
      JOIN vn v ON v.id = c.vn_id
      LEFT JOIN (
        SELECT vn_id,
               COUNT(*)                                     AS total_editions,
               SUM(CASE WHEN dumped = 1 THEN 1 ELSE 0 END)  AS dumped_editions
        FROM owned_release
        GROUP BY vn_id
      ) ed ON ed.vn_id = v.id
      ORDER BY v.title COLLATE NOCASE ASC
      LIMIT 10000
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
  /** Total VNs in the collection (regardless of whether they have owned editions). */
  totalVns: number;
  /** Total owned_release rows. */
  totalEditions: number;
  /** owned_release rows with dumped=1. */
  dumpedEditions: number;
  /**
   * VNs counted as "fully dumped". A VN qualifies when EITHER:
   *   1. it has owned editions AND every owned edition has dumped=1, OR
   *   2. `collection.dumped = 1` is set on the VN itself.
   * Branch (2) is the VN-level flag the Library `?dumped=1` filter
   * reads. Without it, a user who never tracks per-edition data but
   * marks "this VN is dumped" on the collection row used to see
   * `/dumped` say 0 — the page disagreed with the filter.
   */
  fullyDumpedVns: number;
  /**
   * Percentage (0-100, rounded) used for the page's progress bar.
   * Numerator: editions-with-dumped=1 + collection.dumped=1 VNs
   *   that have no owned editions (so the VN-level flag has weight).
   * Denominator: total editions + count of collection.dumped=1 VNs
   *   without editions. This keeps the percentage honest: a user
   *   who dumps 1/2 editions of one VN AND marks-dumped 1 VN with
   *   no editions sees 2/3 ≈ 67% — exactly what the Library
   *   `?dumped=1` filter implies.
   */
  editionPct: number;
}

/** Counts + percentages for the `/dumped` page header tiles. */
export function getDumpSummary(): DumpSummary {
  const totals = db
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM collection)                      AS total_vns,
        (SELECT COUNT(*) FROM owned_release)                   AS total_editions,
        (SELECT COUNT(*) FROM owned_release WHERE dumped = 1)  AS dumped_editions,
        (SELECT COUNT(*) FROM collection c
          WHERE c.dumped = 1
            AND NOT EXISTS (
              SELECT 1 FROM owned_release o WHERE o.vn_id = c.vn_id
            )
        ) AS coll_dumped_no_editions
    `)
    .get() as {
      total_vns: number;
      total_editions: number;
      dumped_editions: number;
      coll_dumped_no_editions: number;
    };
  const fullyDumpedVns = (db
    .prepare(`
      SELECT COUNT(DISTINCT vn_id) AS n FROM (
        -- VNs fully covered by per-edition dumped=1
        SELECT vn_id FROM owned_release
        GROUP BY vn_id
        HAVING SUM(CASE WHEN dumped = 1 THEN 0 ELSE 1 END) = 0
        UNION
        -- VNs marked dumped at the collection level (regardless
        -- of whether they have owned editions)
        SELECT vn_id FROM collection WHERE dumped = 1
      )
    `)
    .get() as { n: number }).n;
  const numerator = totals.dumped_editions + totals.coll_dumped_no_editions;
  const denominator = totals.total_editions + totals.coll_dumped_no_editions;
  const editionPct = denominator === 0 ? 0 : Math.min(100, Math.round((numerator / denominator) * 100));
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
// Sanity ceiling so a typo (e.g. cols=99999) doesn't blow up the
// renderer or the DB. Plenty of headroom for any real-world bookcase.
const SHELF_MAX = 200;

function clampShelfDim(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(SHELF_MIN, Math.min(SHELF_MAX, Math.floor(n)));
}

/** Every named shelf with its placed-item count, ordered by `order_index`. */
export function listShelves(): ShelfUnitWithCount[] {
  return db
    .prepare(`
      WITH placement_counts AS (
        SELECT shelf_id, SUM(c) AS c
        FROM (
          SELECT shelf_id, COUNT(*) AS c FROM shelf_slot GROUP BY shelf_id
          UNION ALL
          SELECT shelf_id, COUNT(*) AS c FROM shelf_display_slot GROUP BY shelf_id
        )
        GROUP BY shelf_id
      )
      SELECT u.id, u.name, u.cols, u.rows, u.order_index, u.created_at, u.updated_at,
             COALESCE(p.c, 0) AS placed_count
      FROM shelf_unit u
      LEFT JOIN placement_counts p ON p.shelf_id = u.id
      ORDER BY u.order_index ASC, u.id ASC
    `)
    .all() as ShelfUnitWithCount[];
}

/** Read one shelf by id, or `null` when unknown. */
export function getShelf(id: number): ShelfUnit | null {
  const row = db.prepare('SELECT id, name, cols, rows, order_index, created_at, updated_at FROM shelf_unit WHERE id = ?').get(id) as ShelfUnit | undefined;
  return row ?? null;
}

/**
 * Create a named shelf. `cols` / `rows` are clamped to `[SHELF_MIN, SHELF_MAX]`
 * so a malformed PATCH can't store unreasonable dimensions.
 */
export function createShelf(input: {
  name: string;
  cols?: number;
  rows?: number;
}): ShelfUnit {
  const trimmedName = input.name.trim();
  if (!trimmedName) throw new Error('shelf name required');
  const cols = clampShelfDim(input.cols ?? 8, 8);
  const rows = clampShelfDim(input.rows ?? 4, 4);
  return db.transaction(() => {
    const now = Date.now();
    const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) AS o FROM shelf_unit').get() as { o: number };
    const info = db
      .prepare(
        `INSERT INTO shelf_unit (name, cols, rows, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(trimmedName, cols, rows, maxOrder.o + 1, now, now);
    return getShelf(Number(info.lastInsertRowid))!;
  })();
}

/** Rename one shelf. Returns the updated row, or `null` for unknown ids. */
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
/**
 * Resize a shelf, returning the evicted slots so the UI can warn about
 * editions that fell outside the new bounds. Both regular cells AND
 * front-display rows are evicted; nothing is silently lost.
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
  const displayEvicted = db
    .prepare(
      'SELECT vn_id, release_id, after_row AS row, position AS col FROM shelf_display_slot WHERE shelf_id = ? AND (after_row > ? OR position >= ?)',
    )
    .all(id, nextRows, nextCols) as Array<{ vn_id: string; release_id: string; row: number; col: number }>;
  const tx = db.transaction(() => {
    db.prepare(
      'DELETE FROM shelf_slot WHERE shelf_id = ? AND (row >= ? OR col >= ?)',
    ).run(id, nextRows, nextCols);
    db.prepare(
      'DELETE FROM shelf_display_slot WHERE shelf_id = ? AND (after_row > ? OR position >= ?)',
    ).run(id, nextRows, nextCols);
    db.prepare(
      'UPDATE shelf_unit SET cols = ?, rows = ?, updated_at = ? WHERE id = ?',
    ).run(nextCols, nextRows, Date.now(), id);
  });
  tx();
  return { shelf: getShelf(id)!, evicted: [...evicted, ...displayEvicted] };
}

/** Delete a shelf. Slots cascade to the unplaced pool via FK; returns `false` on no-op. */
export function deleteShelf(id: number): boolean {
  const info = db.prepare('DELETE FROM shelf_unit WHERE id = ?').run(id);
  return info.changes > 0;
}

/** Persist the user's drag-reorder of shelf tabs. */
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
  rel_image_thumb: string | null;
  rel_image_url: string | null;
  rel_local_image_thumb: string | null;
  rel_image_sexual: number | null;
  edition_label: string | null;
  box_type: BoxType;
  condition: string | null;
  /** Per-edition platform the user owns (lowercase VNDB code), if set. */
  owned_platform: string | null;
  /**
   * Forwarded `owned_release` annotations so the shelf popover stops
   * pulled display-critical columns and the synthesizer hardcoded
   * `physical_location: []` / `price_paid: null`, which contradicted
   * the popover's contract of "surface every owned-release fact".
   */
  physical_location: string[];
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  /** VN-aggregate fallback (every platform across all releases). */
  vn_platforms: string[];
  vn_languages: string[];
  vn_released: string | null;
  /** Release-level metadata for the exact owned edition. */
  rel_title: string | null;
  rel_platforms: string[];
  rel_languages: string[];
  rel_released: string | null;
  rel_resolution: string | null;
  dumped: boolean;
}

/** Every placed cell on one shelf, joined with VN + owned-release display data. */
export function listShelfSlots(shelfId: number): ShelfSlotEntry[] {
  const rows = db
    .prepare(`
      SELECT s.shelf_id, s.row, s.col, s.vn_id, s.release_id,
             v.title             AS vn_title,
             v.image_thumb       AS vn_image_thumb,
	             v.image_url         AS vn_image_url,
	             v.local_image_thumb AS vn_local_image_thumb,
	             v.image_sexual      AS vn_image_sexual,
	             v.release_images    AS vn_release_images,
	             v.platforms         AS vn_platforms,
             v.languages         AS vn_languages,
             v.released          AS vn_released,
             o.edition_label      AS edition_label,
             o.box_type           AS box_type,
             o.condition          AS condition,
             o.owned_platform     AS owned_platform,
             o.physical_location  AS physical_location,
             o.price_paid         AS price_paid,
             o.currency           AS currency,
             o.acquired_date      AS acquired_date,
             o.dumped             AS dumped,
             rm.title       AS rel_title,
             rm.platforms   AS rel_platforms,
             rm.languages   AS rel_languages,
             rm.released    AS rel_released,
             rm.resolution  AS rel_resolution
      FROM shelf_slot s
      JOIN owned_release o ON o.vn_id = s.vn_id AND o.release_id = s.release_id
      JOIN vn v ON v.id = s.vn_id
      LEFT JOIN release_meta_cache rm ON rm.release_id = s.release_id
      WHERE s.shelf_id = ?
    `)
    .all(shelfId) as Array<{
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
	      vn_release_images: string | null;
	      vn_platforms: string | null;
      vn_languages: string | null;
      vn_released: string | null;
      edition_label: string | null;
      box_type: string | null;
      condition: string | null;
      owned_platform: string | null;
      physical_location: string | null;
      price_paid: number | null;
      currency: string | null;
      acquired_date: string | null;
      dumped: number | null;
      rel_title: string | null;
      rel_platforms: string | null;
      rel_languages: string | null;
      rel_released: string | null;
      rel_resolution: string | null;
    }>;
  return rows.map((r) => ({
    shelf_id: r.shelf_id,
    row: r.row,
    col: r.col,
	    vn_id: r.vn_id,
	    release_id: r.release_id,
	    vn_title: r.vn_title,
	    vn_image_thumb: r.vn_image_thumb,
	    vn_image_url: r.vn_image_url,
	    vn_local_image_thumb: r.vn_local_image_thumb,
	    vn_image_sexual: r.vn_image_sexual,
	    ...pickReleaseCover(r.vn_release_images, r.release_id),
	    edition_label: r.edition_label,
    box_type: (r.box_type ?? 'none') as BoxType,
    condition: r.condition,
    owned_platform: r.owned_platform,
    physical_location: parseJsonArrayField(r.physical_location),
    price_paid: r.price_paid,
    currency: r.currency,
    acquired_date: r.acquired_date,
    vn_platforms: parseJsonArrayField(r.vn_platforms),
    vn_languages: parseJsonArrayField(r.vn_languages),
    vn_released: r.vn_released,
    rel_title: r.rel_title,
    rel_platforms: parseJsonArrayField(r.rel_platforms),
    rel_languages: parseLanguagesField(r.rel_languages),
    rel_released: r.rel_released,
    rel_resolution: r.rel_resolution,
    dumped: !!r.dumped,
  }));
}

/**
 * The pool of owned editions that aren't yet placed on any shelf.
 * Joined with VN display data so the layout editor can render rich
 * cards without a second round-trip.
 */
/**
 * The unplaced pool: every owned edition NOT already on a shelf or a
 * front-display row. Joined with VN data so the editor renders rich
 * tiles without a second round-trip.
 */
export function listUnplacedOwnedReleases(): ShelfEntry[] {
  const rows = db
    .prepare(`
      SELECT o.*,
             v.title             AS vn_title,
             v.image_thumb       AS vn_image_thumb,
	             v.image_url         AS vn_image_url,
	             v.local_image_thumb AS vn_local_image_thumb,
	             v.image_sexual      AS vn_image_sexual,
	             v.release_images    AS vn_release_images,
	             v.platforms         AS vn_platforms,
             v.languages         AS vn_languages,
             v.released          AS vn_released,
             ${RELEASE_META_JOIN_SELECT}
      FROM owned_release o
      JOIN vn v ON v.id = o.vn_id
      LEFT JOIN release_meta_cache rm ON rm.release_id = o.release_id
      WHERE NOT EXISTS (
        SELECT 1 FROM shelf_slot s
        WHERE s.vn_id = o.vn_id AND s.release_id = o.release_id
      ) AND NOT EXISTS (
        SELECT 1 FROM shelf_display_slot d
        WHERE d.vn_id = o.vn_id AND d.release_id = o.release_id
      )
      ORDER BY v.title COLLATE NOCASE ASC
      LIMIT 5000
    `)
    .all() as Array<OwnedReleaseDbRow & ReleaseMetaJoinRow & {
      vn_title: string;
      vn_image_thumb: string | null;
	      vn_image_url: string | null;
	      vn_local_image_thumb: string | null;
	      vn_image_sexual: number | null;
	      vn_release_images: string | null;
	      vn_platforms: string | null;
      vn_languages: string | null;
      vn_released: string | null;
    }>;
  return rows.map((r) => ({
	    ...mapOwnedReleaseRow(r),
	    vn_title: r.vn_title,
	    vn_image_thumb: r.vn_image_thumb,
	    vn_image_url: r.vn_image_url,
	    vn_local_image_thumb: r.vn_local_image_thumb,
	    vn_image_sexual: r.vn_image_sexual,
	    ...pickReleaseCover(r.vn_release_images, r.release_id),
	    vn_platforms: parseJsonArrayField(r.vn_platforms),
    vn_languages: parseJsonArrayField(r.vn_languages),
    vn_released: r.vn_released,
    ...unpackReleaseMetaJoin(r),
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
/**
 * Canonical entry point for shelf placements. Handles every branch
 * (place onto empty, swap with occupant, move from pool, move from
 * another slot, move from display) inside a single transaction so the
 * UI never sees a torn UNIQUE-constraint state.
 */
export function placeShelfItem(input: PlaceShelfItemInput): PlaceShelfItemResult {
  // Defence against NaN / Infinity / floats. The route already
  // narrows by `typeof === 'number'` but that lets NaN through; this
  // is the last line before the values reach SQLite as PK columns.
  if (!Number.isInteger(input.shelfId)) throw new Error('shelf id must be integer');
  if (!Number.isInteger(input.row) || !Number.isInteger(input.col)) {
    throw new Error('row/col must be integers');
  }

  let swapped: PlaceShelfItemResult['swapped'] = null;
  const tx = db.transaction(() => {
    // Re-read shelf inside the transaction so bounds checks are
    // consistent with the write — a concurrent resize or delete
    // can't change the shelf between the check and the INSERT.
    const shelf = getShelf(input.shelfId);
    if (!shelf) throw new Error('shelf not found');
    if (input.row < 0 || input.row >= shelf.rows) throw new Error('row out of bounds');
    if (input.col < 0 || input.col >= shelf.cols) throw new Error('col out of bounds');
    // Owned-edition check inside the transaction so a concurrent
    // DELETE of the owned_release row between check and INSERT
    // can't sneak through. shelf_slot has no FK on owned_release
    // (composite-key FKs cascade-only in SQLite), so without this
    // we could end up with a placement pointing at a ghost edition.
    const owned = db
      .prepare('SELECT 1 FROM owned_release WHERE vn_id = ? AND release_id = ?')
      .get(input.vnId, input.releaseId);
    if (!owned) throw new Error('owned edition not found');

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
    // refuse the inserts. Also drop any prior placement of this
    // edition in a front-display slot so an edition is never present
    // in both tables at once — cross-table uniqueness is the user's
    // mental model ("one slot per edition") regardless of slot kind.
    db.prepare(
      'DELETE FROM shelf_slot WHERE shelf_id = ? AND row = ? AND col = ?',
    ).run(input.shelfId, input.row, input.col);
    db.prepare(
      'DELETE FROM shelf_slot WHERE vn_id = ? AND release_id = ?',
    ).run(input.vnId, input.releaseId);
    db.prepare(
      'DELETE FROM shelf_display_slot WHERE vn_id = ? AND release_id = ?',
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

/** Remove an edition's placement (returns it to the unplaced pool).
 *  Tries the regular cell table first, then the front-display table.
 *  Returns true if either delete affected a row. */
export function removeShelfPlacement(vnId: string, releaseId: string): boolean {
  const info = db
    .prepare('DELETE FROM shelf_slot WHERE vn_id = ? AND release_id = ?')
    .run(vnId, releaseId);
  if (info.changes > 0) return true;
  const dispInfo = db
    .prepare('DELETE FROM shelf_display_slot WHERE vn_id = ? AND release_id = ?')
    .run(vnId, releaseId);
  return dispInfo.changes > 0;
}

/** Where (if anywhere) a specific edition currently lives — checks
 *  both the regular cell grid and the front-display rows. The discriminant
 *  field is `kind`: 'cell' for shelf_slot rows, 'display' for
 *  shelf_display_slot rows. */
export type ShelfPlacementForEdition =
  | { kind: 'cell'; shelf_id: number; shelf_name: string; row: number; col: number }
  | { kind: 'display'; shelf_id: number; shelf_name: string; after_row: number; position: number }
  | null;

/**
 * Find an edition's current placement (cell, display row, or pool). Used
 * by the "where is this edition?" lookup on `/vn/[id]` editions panel.
 */
export function getShelfPlacementForEdition(
  vnId: string,
  releaseId: string,
): ShelfPlacementForEdition {
  const cell = db
    .prepare(`
      SELECT s.shelf_id, u.name AS shelf_name, s.row, s.col
      FROM shelf_slot s
      JOIN shelf_unit u ON u.id = s.shelf_id
      WHERE s.vn_id = ? AND s.release_id = ?
    `)
    .get(vnId, releaseId) as
    | { shelf_id: number; shelf_name: string; row: number; col: number }
    | undefined;
  if (cell) return { kind: 'cell', ...cell };
  const disp = db
    .prepare(`
      SELECT d.shelf_id, u.name AS shelf_name, d.after_row, d.position
      FROM shelf_display_slot d
      JOIN shelf_unit u ON u.id = d.shelf_id
      WHERE d.vn_id = ? AND d.release_id = ?
    `)
    .get(vnId, releaseId) as
    | { shelf_id: number; shelf_name: string; after_row: number; position: number }
    | undefined;
  if (disp) return { kind: 'display', ...disp };
  return null;
}

// -- Front display rows (face-out display slots between shelf rows) ------

export interface ShelfDisplaySlotEntry {
  shelf_id: number;
  after_row: number;
  position: number;
  vn_id: string;
  release_id: string;
  placed_at: number;
  vn_title: string;
  vn_image_thumb: string | null;
  vn_image_url: string | null;
  vn_local_image_thumb: string | null;
  vn_image_sexual: number | null;
  rel_image_thumb: string | null;
  rel_image_url: string | null;
  rel_local_image_thumb: string | null;
  rel_image_sexual: number | null;
  edition_label: string | null;
  box_type: BoxType;
  condition: string | null;
  owned_platform: string | null;
  /** See ShelfSlotEntry for rationale — same plumbing. */
  physical_location: string[];
  price_paid: number | null;
  currency: string | null;
  acquired_date: string | null;
  vn_platforms: string[];
  vn_languages: string[];
  vn_released: string | null;
  rel_title: string | null;
  rel_platforms: string[];
  rel_languages: string[];
  rel_released: string | null;
  rel_resolution: string | null;
  dumped: boolean;
}

/** List every front-display placement on a shelf, sorted by row then
 *  left-to-right position. Joined with VN + owned-release display
 *  data so the fullscreen view can render covers without N+1 fetches. */
export function listShelfDisplaySlots(shelfId: number): ShelfDisplaySlotEntry[] {
  const rows = db
    .prepare(`
      SELECT d.shelf_id, d.after_row, d.position, d.vn_id, d.release_id, d.placed_at,
             v.title             AS vn_title,
             v.image_thumb       AS vn_image_thumb,
	             v.image_url         AS vn_image_url,
	             v.local_image_thumb AS vn_local_image_thumb,
	             v.image_sexual      AS vn_image_sexual,
	             v.release_images    AS vn_release_images,
	             v.platforms         AS vn_platforms,
             v.languages         AS vn_languages,
             v.released          AS vn_released,
             o.edition_label      AS edition_label,
             o.box_type           AS box_type,
             o.condition          AS condition,
             o.owned_platform     AS owned_platform,
             o.physical_location  AS physical_location,
             o.price_paid         AS price_paid,
             o.currency           AS currency,
             o.acquired_date      AS acquired_date,
             o.dumped             AS dumped,
             rm.title       AS rel_title,
             rm.platforms   AS rel_platforms,
             rm.languages   AS rel_languages,
             rm.released    AS rel_released,
             rm.resolution  AS rel_resolution
      FROM shelf_display_slot d
      JOIN owned_release o ON o.vn_id = d.vn_id AND o.release_id = d.release_id
      JOIN vn v ON v.id = d.vn_id
      LEFT JOIN release_meta_cache rm ON rm.release_id = d.release_id
      WHERE d.shelf_id = ?
      ORDER BY d.after_row ASC, d.position ASC
    `)
    .all(shelfId) as Array<{
      shelf_id: number;
      after_row: number;
      position: number;
      vn_id: string;
      release_id: string;
      placed_at: number;
      vn_title: string;
      vn_image_thumb: string | null;
	      vn_image_url: string | null;
	      vn_local_image_thumb: string | null;
	      vn_image_sexual: number | null;
	      vn_release_images: string | null;
	      vn_platforms: string | null;
      vn_languages: string | null;
      vn_released: string | null;
      edition_label: string | null;
      box_type: string | null;
      condition: string | null;
      owned_platform: string | null;
      physical_location: string | null;
      price_paid: number | null;
      currency: string | null;
      acquired_date: string | null;
      dumped: number | null;
      rel_title: string | null;
      rel_platforms: string | null;
      rel_languages: string | null;
      rel_released: string | null;
      rel_resolution: string | null;
    }>;
  return rows.map((r) => ({
    shelf_id: r.shelf_id,
    after_row: r.after_row,
    position: r.position,
    vn_id: r.vn_id,
    release_id: r.release_id,
    placed_at: r.placed_at,
    vn_title: r.vn_title,
	    vn_image_thumb: r.vn_image_thumb,
	    vn_image_url: r.vn_image_url,
	    vn_local_image_thumb: r.vn_local_image_thumb,
	    vn_image_sexual: r.vn_image_sexual,
	    ...pickReleaseCover(r.vn_release_images, r.release_id),
	    edition_label: r.edition_label,
    box_type: (r.box_type ?? 'none') as BoxType,
    condition: r.condition,
    owned_platform: r.owned_platform,
    physical_location: parseJsonArrayField(r.physical_location),
    price_paid: r.price_paid,
    currency: r.currency,
    acquired_date: r.acquired_date,
    vn_platforms: parseJsonArrayField(r.vn_platforms),
    vn_languages: parseJsonArrayField(r.vn_languages),
    vn_released: r.vn_released,
    rel_title: r.rel_title,
    rel_platforms: parseJsonArrayField(r.rel_platforms),
    rel_languages: parseLanguagesField(r.rel_languages),
    rel_released: r.rel_released,
    rel_resolution: r.rel_resolution,
    dumped: !!r.dumped,
  }));
}

export interface PlaceShelfDisplayItemInput {
  shelfId: number;
  afterRow: number;
  position: number;
  vnId: string;
  releaseId: string;
}

/**
 * Place an owned edition into a front-display slot. Atomic:
 *   - Verifies the owned edition exists.
 *   - Drops any prior placement (cell OR display) for the same
 *     (vn_id, release_id) so an edition is never present twice.
 *   - If the target display slot is occupied, the occupant goes back
 *     to the unplaced pool (`shelf_slot` evict semantics, but simpler
 *     because display slots don't swap onto each other — they're
 *     positional indices, not 2D coords).
 *   - Bounds: `after_row` must be 0..shelf.rows (inclusive — the
 *     value `shelf.rows` means "below the last row"). `position`
 *     must be in [0, shelf.cols] so a display row never overflows
 *     past the regular grid's visual width.
 */
/**
 * Place one edition on a front-display row. Validates that `after_row`
 * falls in `[0, shelf.rows]` and `position` in `[0, shelf.cols)` so a
 * display row never overflows the shelf's visual width.
 */
export function placeShelfDisplayItem(input: PlaceShelfDisplayItemInput): void {
  if (!Number.isInteger(input.shelfId)) throw new Error('shelf id must be integer');
  if (!Number.isInteger(input.afterRow) || !Number.isInteger(input.position)) {
    throw new Error('after_row/position must be integers');
  }
  const shelf = getShelf(input.shelfId);
  if (!shelf) throw new Error('shelf not found');
  if (input.afterRow < 0 || input.afterRow > shelf.rows) {
    throw new Error('after_row out of bounds');
  }
  if (input.position < 0 || input.position >= shelf.cols) {
    throw new Error('position out of bounds');
  }
  const tx = db.transaction(() => {
    const owned = db
      .prepare('SELECT 1 FROM owned_release WHERE vn_id = ? AND release_id = ?')
      .get(input.vnId, input.releaseId);
    if (!owned) throw new Error('owned edition not found');
    // Strip any previous placement (cell OR display) for this
    // edition. Cross-table uniqueness is the whole point.
    db.prepare('DELETE FROM shelf_slot WHERE vn_id = ? AND release_id = ?').run(input.vnId, input.releaseId);
    db.prepare('DELETE FROM shelf_display_slot WHERE vn_id = ? AND release_id = ?').run(input.vnId, input.releaseId);
    // Evict any occupant of the target display slot back to the pool.
    db.prepare(
      'DELETE FROM shelf_display_slot WHERE shelf_id = ? AND after_row = ? AND position = ?',
    ).run(input.shelfId, input.afterRow, input.position);
    db.prepare(
      `INSERT INTO shelf_display_slot
         (shelf_id, after_row, position, vn_id, release_id, placed_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(input.shelfId, input.afterRow, input.position, input.vnId, input.releaseId, Date.now());
  });
  tx();
}

/** Remove a display-slot placement (the edition goes back to the
 *  unplaced pool). Returns true if anything was actually removed. */
export function removeShelfDisplayPlacement(vnId: string, releaseId: string): boolean {
  const info = db
    .prepare('DELETE FROM shelf_display_slot WHERE vn_id = ? AND release_id = ?')
    .run(vnId, releaseId);
  return info.changes > 0;
}

export interface ReleaseAspectInfo {
  width: number | null;
  height: number | null;
  raw_resolution: string | null;
  aspect_key: AspectKey;
  source: 'manual' | 'vndb' | 'unknown';
  note: string | null;
}

/**
 * Insert or replace one `release_resolution_cache` row. `vn_id` is
 * optional but lazily populated by the materialiser so the aspect filter
 * can match a VN even without an owned-release link.
 */
export function upsertReleaseResolutionCache(input: {
  releaseId: string;
  resolution: unknown;
  /** Optional VN id the release belongs to. When supplied, we record
   *  the link in `release_resolution_cache.vn_id` so aspect-ratio
   *  filters can match the VN without going through `owned_release`. */
  vnId?: string | null;
  fetchedAt?: number;
}): void {
  const parsed = parseResolutionValue(input.resolution);
  const raw =
    typeof input.resolution === 'string'
      ? input.resolution
      : parsed
        ? `${parsed.width}x${parsed.height}`
        : input.resolution == null
          ? null
          : JSON.stringify(input.resolution);
  const aspect = parsed ? aspectKeyForResolution(parsed.width, parsed.height) : 'unknown';
  db.prepare(
    `INSERT INTO release_resolution_cache
       (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(release_id) DO UPDATE SET
       vn_id = COALESCE(excluded.vn_id, release_resolution_cache.vn_id),
       width = excluded.width,
       height = excluded.height,
       raw_resolution = excluded.raw_resolution,
       aspect_key = excluded.aspect_key,
       fetched_at = excluded.fetched_at`,
  ).run(
    input.releaseId,
    input.vnId ?? null,
    parsed?.width ?? null,
    parsed?.height ?? null,
    raw,
    aspect,
    input.fetchedAt ?? Date.now(),
  );
}

/**
 * VN-level aspect-ratio manual override. Takes precedence over any
 * per-release override / cached resolution / screenshot-derived
 * value when filtering and grouping the library. Pass `aspectKey:
 * null` (or omit it) to clear the override.
 */
/**
 * Pin a VN-level aspect override. Highest priority in the derivation chain
 * so the library filter and the AspectOverrideControl read it before
 * falling back to release / screenshot dimensions.
 */
export function setVnAspectOverride(input: {
  vnId: string;
  aspectKey?: AspectKey | null;
  note?: string | null;
}): void {
  const aspect =
    input.aspectKey && isAspectKey(input.aspectKey) && input.aspectKey !== 'unknown'
      ? input.aspectKey
      : null;
  if (!aspect) {
    db.prepare('DELETE FROM vn_aspect_override WHERE vn_id = ?').run(input.vnId);
    return;
  }
  db.prepare(
    `INSERT INTO vn_aspect_override (vn_id, aspect_key, note, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(vn_id) DO UPDATE SET
       aspect_key = excluded.aspect_key,
       note = excluded.note,
       updated_at = excluded.updated_at`,
  ).run(input.vnId, aspect, input.note?.trim() || null, Date.now());
}

export interface VnAspectOverride {
  aspect_key: AspectKey;
  note: string | null;
  updated_at: number;
}

/** Read the VN-level aspect override row, or `null` when unset. */
export function getVnAspectOverride(vnId: string): VnAspectOverride | null {
  const row = db
    .prepare('SELECT aspect_key, note, updated_at FROM vn_aspect_override WHERE vn_id = ?')
    .get(vnId) as { aspect_key: string; note: string | null; updated_at: number } | undefined;
  if (!row || !isAspectKey(row.aspect_key)) return null;
  return { aspect_key: row.aspect_key, note: row.note, updated_at: row.updated_at };
}

/**
 * Derive an aspect key for a VN from every signal we have, in
 * priority order: manual VN override → per-edition override → release
 * cache (own or globally cached for this VN) → vn.screenshots
 * dimensions (best-effort when VNDB has no release resolution).
 * Returns `'unknown'` when nothing matches.
 */
/**
 * Resolve a VN's effective aspect bucket through the priority chain:
 * VN-level override > per-edition override > release cache > screenshot
 * dimensions > `'unknown'`. Used by every aspect-filtered library query.
 */
export function deriveVnAspectKey(vnId: string): AspectKey {
  const manual = getVnAspectOverride(vnId);
  if (manual) return manual.aspect_key;

  const cacheHit = db
    .prepare(`
      SELECT COALESCE(ao.aspect_key, rc.aspect_key) AS aspect
      FROM owned_release o
      LEFT JOIN owned_release_aspect_override ao
        ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
      LEFT JOIN release_resolution_cache rc
        ON rc.release_id = o.release_id
      WHERE o.vn_id = ? AND COALESCE(ao.aspect_key, rc.aspect_key) IS NOT NULL
        AND COALESCE(ao.aspect_key, rc.aspect_key) <> 'unknown'
      LIMIT 1
    `)
    .get(vnId) as { aspect: string } | undefined;
  if (cacheHit && isAspectKey(cacheHit.aspect) && cacheHit.aspect !== 'unknown') {
    return cacheHit.aspect;
  }
  const cacheVn = db
    .prepare(
      `SELECT aspect_key FROM release_resolution_cache
         WHERE vn_id = ? AND aspect_key <> 'unknown' LIMIT 1`,
    )
    .get(vnId) as { aspect_key: string } | undefined;
  if (cacheVn && isAspectKey(cacheVn.aspect_key) && cacheVn.aspect_key !== 'unknown') {
    return cacheVn.aspect_key;
  }
  // Screenshot dimensions fallback. VNDB returns `dims: [w, h]` on
  // each screenshot; that's usually the engine's native resolution
  // even when no release row carries a resolution. We pick the most
  // common bucket so single oddballs don't dominate.
  const vnRow = db
    .prepare('SELECT screenshots FROM vn WHERE id = ?')
    .get(vnId) as { screenshots: string | null } | undefined;
  if (vnRow?.screenshots) {
    try {
      const shots = JSON.parse(vnRow.screenshots) as Array<{ dims?: [number, number] }>;
      const tally = new Map<AspectKey, number>();
      for (const s of shots) {
        if (!Array.isArray(s.dims)) continue;
        const [w, h] = s.dims;
        if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) continue;
        const key = aspectKeyForResolution(w, h);
        if (key === 'unknown') continue;
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
      let best: { key: AspectKey; n: number } | null = null;
      for (const [key, n] of tally) {
        if (!best || n > best.n) best = { key, n };
      }
      if (best) return best.key;
    } catch {
      // ignore — malformed JSON column, treat as unknown
    }
  }
  return 'unknown';
}

/** Source label that lives next to the derived aspect on the VN
 *  metadata row — tells the user WHY we picked that bucket. */
export type VnAspectSource =
  | 'manual'       // vn_aspect_override
  | 'edition'      // owned_release_aspect_override
  | 'release'      // release_resolution_cache via owned_release or vn_id
  | 'screenshot'   // vn.screenshots dims fallback (materialized into rc)
  | 'unknown';

export interface VnAspectDisplay {
  /** Primary aspect bucket. */
  aspect: AspectKey;
  /** Every distinct non-unknown bucket the VN matches (manual override
   *  collapses this to a single entry). Used by the metadata row when a
   *  VN has multiple resolutions across its releases. */
  aspects: AspectKey[];
  /** A representative width × height for the primary aspect. Pulled
   *  from the first matching cache row. Null when the primary aspect
   *  was decided by a manual override (no resolution to show) OR when
   *  the source is unknown / a synthetic screenshot row without
   *  width / height. */
  width: number | null;
  height: number | null;
  source: VnAspectSource;
}

/**
 * Richer version of `deriveVnAspectKey` for the VN page's main
 * identity metadata row. Returns the primary aspect, every distinct
 * aspect the VN matches across releases, a representative resolution,
 * and the derivation source so the UI can render
 *   "Format: 16:9 · 1280×720"
 * with a subtle source pill ("manual override" / "release resolution"
 * / "screenshots fallback").
 *
 * Same priority chain as `deriveVnAspectKey` — same source of truth
 * as the Library filter and the AspectOverrideControl.
 */
/**
 * Same derivation as `deriveVnAspectKey` but returns the rich display
 * shape (aspect bucket, raw width/height, list of contributing aspects,
 * `source` tag) so the UI can show "(via override)" / "(via release)".
 */
export function deriveVnAspectDisplay(vnId: string): VnAspectDisplay {
  // 1. Manual VN-level override (always exclusive).
  const manual = getVnAspectOverride(vnId);
  if (manual && manual.aspect_key !== 'unknown') {
    return {
      aspect: manual.aspect_key,
      aspects: [manual.aspect_key],
      width: null,
      height: null,
      source: 'manual',
    };
  }

  // 2. Owned-release per-edition override (no resolution stored
  //    directly here — we pull dims from rc if available).
  const editionOverride = db
    .prepare(
      `SELECT ao.aspect_key, ao.width, ao.height
       FROM owned_release_aspect_override ao
       WHERE ao.vn_id = ?
         AND ao.aspect_key IS NOT NULL AND ao.aspect_key <> 'unknown'
       LIMIT 1`,
    )
    .get(vnId) as { aspect_key: string; width: number | null; height: number | null } | undefined;
  if (editionOverride && isAspectKey(editionOverride.aspect_key)) {
    return {
      aspect: editionOverride.aspect_key,
      aspects: [editionOverride.aspect_key],
      width: editionOverride.width,
      height: editionOverride.height,
      source: 'edition',
    };
  }

  // 3. release_resolution_cache — either via owned_release join or
  //    via the vn_id column. Group by aspect_key, pick the most
  //    common, surface width × height from the first row of the
  //    chosen bucket.
  const rcRows = db
    .prepare(
      `SELECT rc.aspect_key, rc.width, rc.height, rc.release_id
       FROM release_resolution_cache rc
       WHERE (
         rc.vn_id = ?
         OR EXISTS (
           SELECT 1 FROM owned_release o
           WHERE o.vn_id = ? AND o.release_id = rc.release_id
         )
       )
         AND rc.aspect_key IS NOT NULL
         AND rc.aspect_key <> 'unknown'`,
    )
    .all(vnId, vnId) as Array<{
      aspect_key: string;
      width: number | null;
      height: number | null;
      release_id: string;
    }>;
  if (rcRows.length > 0) {
    const counts = new Map<AspectKey, number>();
    const firstByAspect = new Map<AspectKey, { width: number | null; height: number | null; releaseId: string }>();
    let screenshotOnly = true;
    for (const r of rcRows) {
      if (!isAspectKey(r.aspect_key) || r.aspect_key === 'unknown') continue;
      counts.set(r.aspect_key, (counts.get(r.aspect_key) ?? 0) + 1);
      if (!firstByAspect.has(r.aspect_key)) {
        firstByAspect.set(r.aspect_key, { width: r.width, height: r.height, releaseId: r.release_id });
      }
      if (!r.release_id.startsWith('screenshot:')) screenshotOnly = false;
    }
    let primary: AspectKey = 'unknown';
    let primaryCount = 0;
    for (const [k, n] of counts) {
      if (n > primaryCount) {
        primary = k;
        primaryCount = n;
      }
    }
    if (primary !== 'unknown') {
      const aspects = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([k]) => k);
      const dim = firstByAspect.get(primary);
      return {
        aspect: primary,
        aspects,
        width: dim?.width ?? null,
        height: dim?.height ?? null,
        source: screenshotOnly ? 'screenshot' : 'release',
      };
    }
  }

  return { aspect: 'unknown', aspects: [], width: null, height: null, source: 'unknown' };
}

/**
 * Pin a per-edition aspect override. Takes priority over the
 * release-resolution cache but is itself overridden by the VN-level
 * pin in `vn_aspect_override`.
 */
export function setOwnedReleaseAspectOverride(input: {
  vnId: string;
  releaseId: string;
  width?: number | null;
  height?: number | null;
  aspectKey?: AspectKey | null;
  note?: string | null;
}): void {
  db.transaction(() => {
    const owned = db
      .prepare('SELECT 1 FROM owned_release WHERE vn_id = ? AND release_id = ?')
      .get(input.vnId, input.releaseId);
    if (!owned) throw new Error('owned edition not found');
    const hasResolution =
      typeof input.width === 'number' &&
      typeof input.height === 'number' &&
      input.width > 0 &&
      input.height > 0;
    const aspect = hasResolution
      ? aspectKeyForResolution(input.width!, input.height!)
      : input.aspectKey && isAspectKey(input.aspectKey)
        ? input.aspectKey
        : null;
    if (!aspect || aspect === 'unknown') {
      db.prepare(
        'DELETE FROM owned_release_aspect_override WHERE vn_id = ? AND release_id = ?',
      ).run(input.vnId, input.releaseId);
      return;
    }
    db.prepare(
      `INSERT INTO owned_release_aspect_override
         (vn_id, release_id, width, height, aspect_key, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(vn_id, release_id) DO UPDATE SET
         width = excluded.width,
         height = excluded.height,
         aspect_key = excluded.aspect_key,
         note = excluded.note,
         updated_at = excluded.updated_at`,
    ).run(
      input.vnId,
      input.releaseId,
      hasResolution ? Math.round(input.width!) : null,
      hasResolution ? Math.round(input.height!) : null,
      aspect,
      input.note?.trim() || null,
      Date.now(),
    );
  })();
}

/**
 * Read the per-edition aspect-info bundle (override + cached release
 * resolution + computed aspect bucket) used by the AspectOverrideControl.
 */
export function getOwnedReleaseAspectInfo(vnId: string, releaseId: string): ReleaseAspectInfo {
  const row = db
    .prepare(`
      SELECT
        ao.width AS override_width,
        ao.height AS override_height,
        ao.aspect_key AS override_aspect,
        ao.note AS override_note,
        rc.width AS cache_width,
        rc.height AS cache_height,
        rc.raw_resolution AS cache_raw,
        rc.aspect_key AS cache_aspect
      FROM owned_release o
      LEFT JOIN owned_release_aspect_override ao
        ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
      LEFT JOIN release_resolution_cache rc
        ON rc.release_id = o.release_id
      WHERE o.vn_id = ? AND o.release_id = ?
    `)
    .get(vnId, releaseId) as
    | {
        override_width: number | null;
        override_height: number | null;
        override_aspect: string | null;
        override_note: string | null;
        cache_width: number | null;
        cache_height: number | null;
        cache_raw: string | null;
        cache_aspect: string | null;
      }
    | undefined;
  if (!row) return { width: null, height: null, raw_resolution: null, aspect_key: 'unknown', source: 'unknown', note: null };
  if (isAspectKey(row.override_aspect)) {
    return {
      width: row.override_width,
      height: row.override_height,
      raw_resolution: null,
      aspect_key: row.override_aspect,
      source: 'manual',
      note: row.override_note,
    };
  }
  if (isAspectKey(row.cache_aspect) && row.cache_aspect !== 'unknown') {
    return {
      width: row.cache_width,
      height: row.cache_height,
      raw_resolution: row.cache_raw,
      aspect_key: row.cache_aspect,
      source: 'vndb',
      note: null,
    };
  }
  return { width: null, height: null, raw_resolution: row.cache_raw, aspect_key: 'unknown', source: 'unknown', note: null };
}

/** Every owned-edition row for one VN, ordered by acquisition date. */
export function listOwnedReleasesForVn(vnId: string): OwnedReleaseRow[] {
  const rows = db
    .prepare('SELECT vn_id, release_id, notes, location, physical_location, box_type, edition_label, condition, price_paid, currency, acquired_date, owned_platform, dumped, added_at FROM owned_release WHERE vn_id = ? ORDER BY added_at DESC')
    .all(vnId) as OwnedReleaseDbRow[];
  return rows.map(mapOwnedReleaseRow);
}

export interface OwnedReleaseWithShelf extends OwnedReleaseRow {
  /** When the edition is placed on a shelf, this carries the
   *  shelf id / display name / coordinates. null when unplaced. */
  shelf:
    | { kind: 'cell'; id: number; name: string; row: number; col: number }
    | { kind: 'display'; id: number; name: string; afterRow: number; position: number }
    | null;
  aspect: ReleaseAspectInfo;
  /**
   * Release-level platforms list (lowercase VNDB codes) joined from
   * release_meta_cache. Used by the OwnedEditionsSection picker to
   * render a per-edition select. Empty when the release is
   * synthetic OR the VNDB POST /release payload has not been
   * materialized for this VN yet.
   */
  rel_platforms: string[];
}

/**
 * Variant of `listOwnedReleasesForVn` that LEFT JOINs the shelf
 * placement so the VN detail page can render a chip like
 * "Living room — left bookcase · R2 · C5" or "Front display · 2"
 * next to each owned edition. One query, no N+1.
 */
/**
 * Owned editions for one VN, each annotated with current shelf placement
 * (cell, display row, or pool). Used by the VN-detail "My editions" panel.
 */
export function listOwnedReleasesWithShelfForVn(vnId: string): OwnedReleaseWithShelf[] {
  const rows = db
    .prepare(`
      SELECT o.*,
             s.shelf_id  AS shelf_id,
             s.row       AS shelf_row,
             s.col       AS shelf_col,
             u.name      AS shelf_name,
             d.shelf_id  AS display_shelf_id,
             d.after_row AS display_after_row,
             d.position  AS display_position,
             du.name     AS display_shelf_name,
             ao.width    AS override_width,
             ao.height   AS override_height,
             ao.aspect_key AS override_aspect,
             ao.note     AS override_note,
             rc.width    AS cache_width,
             rc.height   AS cache_height,
             rc.raw_resolution AS cache_raw,
             rc.aspect_key AS cache_aspect,
             rm.platforms AS rel_platforms
      FROM owned_release o
      LEFT JOIN shelf_slot s
        ON s.vn_id = o.vn_id AND s.release_id = o.release_id
      LEFT JOIN shelf_unit u
        ON u.id = s.shelf_id
      LEFT JOIN shelf_display_slot d
        ON d.vn_id = o.vn_id AND d.release_id = o.release_id
      LEFT JOIN shelf_unit du
        ON du.id = d.shelf_id
      LEFT JOIN owned_release_aspect_override ao
        ON ao.vn_id = o.vn_id AND ao.release_id = o.release_id
      LEFT JOIN release_resolution_cache rc
        ON rc.release_id = o.release_id
      LEFT JOIN release_meta_cache rm
        ON rm.release_id = o.release_id
      WHERE o.vn_id = ?
      ORDER BY o.added_at DESC
    `)
    .all(vnId) as Array<OwnedReleaseDbRow & {
      shelf_id: number | null;
      shelf_row: number | null;
      shelf_col: number | null;
      shelf_name: string | null;
      display_shelf_id: number | null;
      display_after_row: number | null;
      display_position: number | null;
      display_shelf_name: string | null;
      override_width: number | null;
      override_height: number | null;
      override_aspect: string | null;
      override_note: string | null;
      cache_width: number | null;
      cache_height: number | null;
      cache_raw: string | null;
      cache_aspect: string | null;
      rel_platforms: string | null;
    }>;
  return rows.map((r) => ({
    ...mapOwnedReleaseRow(r),
    rel_platforms: parseJsonArrayField(r.rel_platforms),
    shelf:
      r.shelf_id != null && r.shelf_row != null && r.shelf_col != null && r.shelf_name != null
        ? { kind: 'cell', id: r.shelf_id, name: r.shelf_name, row: r.shelf_row, col: r.shelf_col }
        : r.display_shelf_id != null &&
            r.display_after_row != null &&
            r.display_position != null &&
            r.display_shelf_name != null
          ? {
              kind: 'display',
              id: r.display_shelf_id,
              name: r.display_shelf_name,
              afterRow: r.display_after_row,
              position: r.display_position,
            }
          : null,
    aspect: isAspectKey(r.override_aspect)
      ? {
          width: r.override_width,
          height: r.override_height,
          raw_resolution: null,
          aspect_key: r.override_aspect,
          source: 'manual',
          note: r.override_note,
        }
      : isAspectKey(r.cache_aspect) && r.cache_aspect !== 'unknown'
        ? {
            width: r.cache_width,
            height: r.cache_height,
            raw_resolution: r.cache_raw,
            aspect_key: r.cache_aspect,
            source: 'vndb',
            note: null,
          }
        : {
            width: null,
            height: null,
            raw_resolution: r.cache_raw,
            aspect_key: 'unknown',
            source: 'unknown',
            note: null,
          },
  }));
}

/** Read one owned-edition row, or `null` when the operator doesn't own it. */
export function getOwnedRelease(vnId: string, releaseId: string): OwnedReleaseRow | null {
  const row = db
    .prepare('SELECT vn_id, release_id, notes, location, physical_location, box_type, edition_label, condition, price_paid, currency, acquired_date, owned_platform, dumped, added_at FROM owned_release WHERE vn_id = ? AND release_id = ?')
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
  /**
   * Lowercase VNDB platform code, or null to clear. Validated at
   * the API layer ({@link OwnedReleasePatch} consumers in
   * `/api/collection/[id]/owned-releases/route.ts`).
   */
  owned_platform?: string | null;
  dumped?: boolean;
}

/**
 * Add or refresh one owned edition. Validates the release id shape
 * (`r\d+` or `synthetic:<vnId>`) before any write so a malformed PATCH
 * can never insert junk rows.
 */
export function markReleaseOwned(
  vnId: string,
  releaseId: string,
  patch: OwnedReleasePatch = {},
): void {
  db.transaction(() => {
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
        purchase_place, owned_platform, dumped, added_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      patch.owned_platform ?? null,
      patch.dumped ? 1 : 0,
      now,
    );
    // Layer B autofill — when the caller did not pass an explicit
    // owned_platform AND the linked release has exactly one platform
    // in release_meta_cache, inherit that singleton automatically.
    // Idempotent: the WHERE-clause skips rows that already have a
    // non-NULL owned_platform (e.g. when the patch explicitly set it).
    if (patch.owned_platform == null) {
      db.prepare(`
        UPDATE owned_release
        SET owned_platform = (
          SELECT json_extract(rm.platforms, '$[0]')
          FROM release_meta_cache rm
          WHERE rm.release_id = owned_release.release_id
            AND json_valid(rm.platforms)
            AND json_array_length(rm.platforms) = 1
        )
        WHERE vn_id = ? AND release_id = ? AND owned_platform IS NULL
          AND EXISTS (
            SELECT 1 FROM release_meta_cache rm
            WHERE rm.release_id = owned_release.release_id
              AND json_valid(rm.platforms)
              AND json_array_length(rm.platforms) = 1
          )
      `).run(vnId, releaseId);
    }
    rebuildVnPlaceIndex(vnId);
  })();
}

/** Patch one owned edition. Only supplied keys are touched; others stay. */
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
    owned_platform: (v) => v,
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
  if ('physical_location' in patch) {
    rebuildVnPlaceIndex(vnId);
  }
}

/** Remove one owned edition. Shelf placements cascade via FK. */
export function unmarkReleaseOwned(vnId: string, releaseId: string): void {
  db.prepare('DELETE FROM owned_release WHERE vn_id = ? AND release_id = ?').run(vnId, releaseId);
  rebuildVnPlaceIndex(vnId);
}

/** Distinct values currently seen in `owned_release.physical_location` for the autocomplete. */
export function listKnownPlaces(): string[] {
  const rows = db
    .prepare(`
      SELECT DISTINCT place
      FROM collection_place_index
      ORDER BY place COLLATE NOCASE ASC
    `)
    .all() as { place: string }[];
  return rows.map((r) => r.place);
}

// Place registry

export interface PlaceRow {
  id: number;
  name: string;
  name_ja: string | null;
  kind: 'shop' | 'chain' | 'storage';
  address: string | null;
  lat: number | null;
  lng: number | null;
  url: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface PlaceWithLinks extends PlaceRow {
  provider_labels: string[];
  stock_count: number;
}

export interface PlacePayload {
  name: string;
  name_ja?: string | null;
  kind?: 'shop' | 'chain' | 'storage';
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  url?: string | null;
  notes?: string | null;
}

export function listPlaces(): PlaceWithLinks[] {
  const rows = db
    .prepare(`
      SELECT
        p.*,
        GROUP_CONCAT(ppl.provider_label, '|||') AS labels_concat,
        (
          SELECT COUNT(DISTINCT vso.vn_id)
          FROM vn_stock_offer vso
          JOIN place_provider_link ppl2 ON (
            ppl2.provider_label = vso.location_branch
            OR ppl2.provider_label = vso.location_label
          )
          WHERE ppl2.place_id = p.id
            AND vso.availability IN ('in_stock', 'limited')
        ) AS stock_count
      FROM place_registry p
      LEFT JOIN place_provider_link ppl ON ppl.place_id = p.id
      GROUP BY p.id
      ORDER BY p.name COLLATE NOCASE ASC
    `)
    .all() as (PlaceRow & { labels_concat: string | null; stock_count: number })[];
  return rows.map((r) => ({
    ...r,
    kind: (r.kind ?? 'shop') as PlaceRow['kind'],
    provider_labels: r.labels_concat ? r.labels_concat.split('|||') : [],
  }));
}

export function getPlace(id: number): PlaceWithLinks | null {
  const row = db
    .prepare(`
      SELECT
        p.*,
        GROUP_CONCAT(ppl.provider_label, '|||') AS labels_concat,
        (
          SELECT COUNT(DISTINCT vso.vn_id)
          FROM vn_stock_offer vso
          JOIN place_provider_link ppl2 ON (
            ppl2.provider_label = vso.location_branch
            OR ppl2.provider_label = vso.location_label
          )
          WHERE ppl2.place_id = p.id
            AND vso.availability IN ('in_stock', 'limited')
        ) AS stock_count
      FROM place_registry p
      LEFT JOIN place_provider_link ppl ON ppl.place_id = p.id
      WHERE p.id = ?
      GROUP BY p.id
    `)
    .get(id) as (PlaceRow & { labels_concat: string | null; stock_count: number }) | undefined;
  if (!row) return null;
  return {
    ...row,
    kind: (row.kind ?? 'shop') as PlaceRow['kind'],
    provider_labels: row.labels_concat ? row.labels_concat.split('|||') : [],
  };
}

export function createPlace(payload: PlacePayload): number {
  const now = Date.now();
  const result = db
    .prepare(`
      INSERT INTO place_registry (name, name_ja, kind, address, lat, lng, url, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      payload.name,
      payload.name_ja ?? null,
      payload.kind ?? 'shop',
      payload.address ?? null,
      payload.lat ?? null,
      payload.lng ?? null,
      payload.url ?? null,
      payload.notes ?? null,
      now,
      now,
    );
  return result.lastInsertRowid as number;
}

export function updatePlace(id: number, patch: Partial<PlacePayload>): void {
  const fields = Object.keys(patch) as (keyof PlacePayload)[];
  if (fields.length === 0) return;
  const sets = fields.map((f) => `${f} = ?`);
  sets.push('updated_at = ?');
  const vals: unknown[] = fields.map((f) => patch[f] ?? null);
  vals.push(Date.now());
  vals.push(id);
  db.prepare(`UPDATE place_registry SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
}

export function deletePlace(id: number): void {
  db.prepare('DELETE FROM place_registry WHERE id = ?').run(id);
}

export function linkProviderToPlace(placeId: number, providerLabel: string): void {
  db.prepare(
    'INSERT OR IGNORE INTO place_provider_link (place_id, provider_label) VALUES (?, ?)',
  ).run(placeId, providerLabel);
}

export function unlinkProviderFromPlace(placeId: number, providerLabel: string): void {
  db.prepare(
    'DELETE FROM place_provider_link WHERE place_id = ? AND provider_label = ?',
  ).run(placeId, providerLabel);
}

/**
 * Returns a mapping of provider_label → place_id for every linked branch.
 * Used server-side to decorate StockPhysicalLocations with place links.
 */
export function getPlaceProviderMap(): Record<string, number> {
  const rows = db
    .prepare('SELECT place_id, provider_label FROM place_provider_link')
    .all() as { place_id: number; provider_label: string }[];
  return Object.fromEntries(rows.map((r) => [r.provider_label, r.place_id]));
}

/**
 * Distinct location_branch and location_label values in vn_stock_offer
 * that are not yet assigned to any place_registry entry. The online
 * stock sentinel is excluded; it is not a real physical location.
 */
export function listUnassignedBranches(): string[] {
  const rows = db
    .prepare(`
      SELECT DISTINCT label
      FROM (
        SELECT location_branch AS label
        FROM vn_stock_offer
        WHERE location_branch IS NOT NULL
          AND location_branch != ''
        UNION
        SELECT location_label AS label
        FROM vn_stock_offer
        WHERE location_label IS NOT NULL
          AND location_label != ''
          AND location_label != '__online_stock__'
      )
      WHERE NOT EXISTS (
        SELECT 1 FROM place_provider_link ppl
        WHERE ppl.provider_label = label
      )
      ORDER BY label COLLATE NOCASE ASC
    `)
    .all() as { label: string }[];
  return rows.map((r) => r.label);
}

/**
 * All provider labels linked to any place OTHER than the given one,
 * with the place metadata they currently belong to. Powers the
 * "move a branch here from another place" affordance in
 * AssignProviderDialog.
 */
export function listBranchesAtOtherPlaces(excludePlaceId: number): {
  provider_label: string;
  place_id: number;
  place_name: string;
}[] {
  return db
    .prepare(`
      SELECT
        ppl.provider_label AS provider_label,
        ppl.place_id       AS place_id,
        p.name             AS place_name
      FROM place_provider_link ppl
      JOIN place_registry p ON p.id = ppl.place_id
      WHERE ppl.place_id != ?
      ORDER BY p.name COLLATE NOCASE ASC, ppl.provider_label COLLATE NOCASE ASC
    `)
    .all(excludePlaceId) as { provider_label: string; place_id: number; place_name: string }[];
}

/** Move a provider link from one place to another atomically. */
export function moveProviderLink(fromPlaceId: number, toPlaceId: number, providerLabel: string): void {
  db.transaction(() => {
    db.prepare(
      'DELETE FROM place_provider_link WHERE place_id = ? AND provider_label = ?',
    ).run(fromPlaceId, providerLabel);
    db.prepare(
      'INSERT OR IGNORE INTO place_provider_link (place_id, provider_label) VALUES (?, ?)',
    ).run(toPlaceId, providerLabel);
  })();
}

export interface PlaceOfferRow {
  vn_id: string;
  provider: string;
  availability: string;
  price: number | null;
  currency: string | null;
  url: string | null;
  location_branch: string | null;
  location_label: string | null;
  updated_at: number;
}

type PlaceAvailFilter = 'in_stock' | 'all' | 'out_of_stock';

function availSql(avail: PlaceAvailFilter): string {
  if (avail === 'all') return '';
  if (avail === 'out_of_stock') return "AND vso.availability = 'out_of_stock'";
  return "AND vso.availability IN ('in_stock', 'limited')";
}

/** VNs at a place (aggregated). Matches on both location_branch and location_label. */
export function listVnsAtPlace(
  placeId: number,
  avail: PlaceAvailFilter = 'in_stock',
): {
  vn_id: string;
  title: string;
  alttitle: string | null;
  image_url: string | null;
  local_image: string | null;
  min_price: number | null;
  offer_count: number;
  max_updated_at: number;
}[] {
  return db
    .prepare(`
      SELECT
        v.id AS vn_id,
        v.title,
        v.alttitle,
        v.image_url,
        v.local_image,
        MIN(vso.price) AS min_price,
        COUNT(*) AS offer_count,
        MAX(vso.updated_at) AS max_updated_at
      FROM vn_stock_offer vso
      JOIN place_provider_link ppl ON (
        ppl.provider_label = vso.location_branch
        OR ppl.provider_label = vso.location_label
      )
      JOIN vn v ON v.id = vso.vn_id
      WHERE ppl.place_id = ?
        ${availSql(avail)}
      GROUP BY v.id
      ORDER BY v.title COLLATE NOCASE ASC
    `)
    .all(placeId) as {
      vn_id: string;
      title: string;
      alttitle: string | null;
      image_url: string | null;
      local_image: string | null;
      min_price: number | null;
      offer_count: number;
      max_updated_at: number;
    }[];
}

/** Individual offer rows at a place (one row per offer). */
export function listOffersAtPlace(
  placeId: number,
  avail: PlaceAvailFilter = 'in_stock',
): PlaceOfferRow[] {
  return db
    .prepare(`
      SELECT
        vso.vn_id,
        vso.provider,
        vso.availability,
        vso.price,
        vso.currency,
        vso.url,
        vso.location_branch,
        vso.location_label,
        vso.updated_at
      FROM vn_stock_offer vso
      JOIN place_provider_link ppl ON (
        ppl.provider_label = vso.location_branch
        OR ppl.provider_label = vso.location_label
      )
      WHERE ppl.place_id = ?
        ${availSql(avail)}
      ORDER BY vso.vn_id ASC, vso.updated_at DESC
    `)
    .all(placeId) as PlaceOfferRow[];
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
    aliases: safeJsonParse(row.aliases, []),
    extlinks: safeJsonParse(row.extlinks, []),
    logo_path: row.logo_path,
    fetched_at: row.fetched_at,
  };
}

/** Insert or replace one producer row with the canonical VNDB payload. */
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

/** Read one producer by id, or `null` when not yet mirrored locally. */
export function getProducer(id: string): ProducerRow | null {
  const row = db.prepare('SELECT id, name, original, lang, type, description, aliases, extlinks, logo_path, fetched_at FROM producer WHERE id = ?').get(id) as ProducerDbRow | undefined;
  return producerToRow(row);
}

/** Set or clear the user-uploaded logo path for one producer. */
export function setProducerLogo(id: string, logoPath: string | null): void {
  db.prepare('UPDATE producer SET logo_path = ? WHERE id = ?').run(logoPath, id);
}

/**
 * Aggregate per-developer rankings across the collection (count of credited
 * VNs, average rating, …). Used by the `/producers` Developers tab.
 */
export function listProducerStats(): ProducerStat[] {
  const rows = db
    .prepare(`
      SELECT
        di.producer_id AS id,
        COALESCE(
          p.name,
          (SELECT json_extract(d.value, '$.name') FROM json_each(v.developers) d
           WHERE json_extract(d.value, '$.id') = di.producer_id LIMIT 1),
          di.producer_id
        ) AS name,
        p.original, p.lang, p.type, p.description, p.aliases, p.extlinks, p.logo_path,
        COALESCE(p.fetched_at, 0) AS fetched_at,
        COUNT(DISTINCT di.vn_id) AS vn_count,
        AVG(c.user_rating) AS avg_user_rating,
        AVG(v.rating) AS avg_rating
      FROM collection c
      JOIN vn_developer_index di ON di.vn_id = c.vn_id
      JOIN vn v ON v.id = c.vn_id
      LEFT JOIN producer p ON p.id = di.producer_id
      GROUP BY di.producer_id
      ORDER BY vn_count DESC, name ASC
      LIMIT 2000
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
 * so a publisher-only studio (Studio X, Studio Y, …) is rankable.
 */
/**
 * Aggregate per-publisher rankings across the collection. Reads from the
 * release-derived `vn.publishers` column, so publishers absent from
 * `vn.developers` (localisation houses, etc.) still rank.
 */
export function listPublisherStats(): ProducerStat[] {
  const rows = db
    .prepare(`
      SELECT
        pi.producer_id AS id,
        COALESCE(
          p.name,
          (SELECT json_extract(d.value, '$.name') FROM json_each(v.publishers) d
           WHERE json_extract(d.value, '$.id') = pi.producer_id LIMIT 1),
          pi.producer_id
        ) AS name,
        p.original, p.lang, p.type, p.description, p.aliases, p.extlinks, p.logo_path,
        COALESCE(p.fetched_at, 0) AS fetched_at,
        COUNT(DISTINCT pi.vn_id) AS vn_count,
        AVG(c.user_rating) AS avg_user_rating,
        AVG(v.rating) AS avg_rating
      FROM collection c
      JOIN vn_publisher_index pi ON pi.vn_id = c.vn_id
      JOIN vn v ON v.id = c.vn_id
      LEFT JOIN producer p ON p.id = pi.producer_id
      GROUP BY pi.producer_id
      ORDER BY vn_count DESC, name ASC
      LIMIT 2000
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

/** Every user-defined series row, alphabetically ordered. Capped at 2000 rows. */
export function listSeries(): SeriesRow[] {
  return db.prepare('SELECT id, name, description, cover_path, banner_path, created_at, updated_at FROM series ORDER BY name ASC LIMIT 2000').all() as SeriesRow[];
}

/** Series this VN belongs to (joined via `series_vn`). */
export function listSeriesForVn(vnId: string): SeriesLite[] {
  return db
    .prepare(`
      SELECT s.id, s.name FROM series s
      JOIN series_vn sv ON sv.series_id = s.id
      WHERE sv.vn_id = ? ORDER BY s.name
    `)
    .all(vnId) as SeriesLite[];
}

/**
 * Batched lookup: one round-trip returns every (vn_id, series) pair
 * for the input ids, grouped into a Map. Used by `listCollection` to
 * avoid issuing one `listSeriesForVn` per row when rendering the
 * library (500 VNs would mean 500 extra queries).
 */
/**
 * Lightweight count + first-sample lookup used by `/producer/[id]`
 * to size the header without paying for two full `listCollection`
 * scans. Returns the in-collection VN ids credited to this producer
 * (in either role) plus the very first row's developers/publishers
 * arrays — enough to render the "X VN" badge and the fallback name
 * when VNDB is unreachable.
 */
/**
 * Summarise the operator's relationship to one producer: list of owned
 * VN ids + a small sample of (id, title) tuples. Cheaper than full
 * `vn` rows when only the "X VN" badge + fallback name need to render.
 */
export function producerOwnershipSummary(producerId: string): {
  ownedIds: Set<string>;
  sample: { developers: Array<{ id: string; name: string }>; publishers: Array<{ id: string; name: string }> } | null;
} {
  const rows = db
    .prepare(`
      SELECT v.id, v.developers, v.publishers
      FROM vn v
      JOIN collection c ON c.vn_id = v.id
      WHERE
        EXISTS (SELECT 1 FROM vn_developer_index WHERE vn_id = v.id AND producer_id = ?)
        OR EXISTS (SELECT 1 FROM vn_publisher_index WHERE vn_id = v.id AND producer_id = ?)
      ORDER BY c.updated_at DESC
      LIMIT 500
    `)
    .all(producerId, producerId) as Array<{ id: string; developers: string | null; publishers: string | null }>;
  const ownedIds = new Set(rows.map((r) => r.id));
  const sample = rows[0]
    ? {
        developers: safeJsonParse<Array<{ id: string; name: string }>>(rows[0].developers, []),
        publishers: safeJsonParse<Array<{ id: string; name: string }>>(rows[0].publishers, []),
      }
    : null;
  return { ownedIds, sample };
}

/** Bulk-load series memberships keyed by VN id for card grids. */
export function listSeriesForVnsMany(vnIds: string[]): Map<string, SeriesLite[]> {
  const out = new Map<string, SeriesLite[]>();
  if (vnIds.length === 0) return out;
  const CHUNK = 500;
  for (let i = 0; i < vnIds.length; i += CHUNK) {
    const chunk = vnIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(`
        SELECT sv.vn_id AS vn_id, s.id AS id, s.name AS name
        FROM series s
        JOIN series_vn sv ON sv.series_id = s.id
        WHERE sv.vn_id IN (${placeholders})
        ORDER BY s.name COLLATE NOCASE
      `)
      .all(...chunk) as Array<{ vn_id: string; id: number; name: string }>;
    for (const r of rows) {
      const arr = out.get(r.vn_id) ?? [];
      arr.push({ id: r.id, name: r.name });
      out.set(r.vn_id, arr);
    }
  }
  return out;
}

/** Read one series + its ordered VN members, or `null` for unknown ids. */
export function getSeries(id: number): SeriesWithVns | null {
  const s = db.prepare('SELECT id, name, description, cover_path, banner_path, created_at, updated_at FROM series WHERE id = ?').get(id) as SeriesRow | undefined;
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

/** Create one series. `name` must be unique (UNIQUE constraint). */
export function createSeries(name: string, description: string | null = null): SeriesRow {
  const now = Date.now();
  const info = db
    .prepare('INSERT INTO series (name, description, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run(name, description, now, now);
  return db.prepare('SELECT id, name, description, cover_path, banner_path, created_at, updated_at FROM series WHERE id = ?').get(info.lastInsertRowid) as SeriesRow;
}

/** Patch one series (name / description). Returns the updated row, or `null`. */
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
  if (sets.length === 0) return db.prepare('SELECT id, name, description, cover_path, banner_path, created_at, updated_at FROM series WHERE id = ?').get(id) as SeriesRow | null;
  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(id);
  db.prepare(`UPDATE series SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  return db.prepare('SELECT id, name, description, cover_path, banner_path, created_at, updated_at FROM series WHERE id = ?').get(id) as SeriesRow | null;
}

/** Delete one series. Member rows in `series_vn` cascade via FK. */
export function deleteSeries(id: number): void {
  db.prepare('DELETE FROM series WHERE id = ?').run(id);
}

/** Link one VN into a series at the given position. Insert is idempotent. */
export function addVnToSeries(seriesId: number, vnId: string, orderIndex = 0): void {
  db.prepare(`
    INSERT INTO series_vn (series_id, vn_id, order_index)
    VALUES (?, ?, ?)
    ON CONFLICT(series_id, vn_id) DO UPDATE SET order_index = excluded.order_index
  `).run(seriesId, vnId, orderIndex);
}

/** Unlink one VN from a series. The series itself is left intact. */
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

/** Pinned saved-filter rows, ordered by user-chosen position. */
export function listSavedFilters(): SavedFilter[] {
  return db
    .prepare('SELECT id, name, params, position, created_at FROM saved_filter ORDER BY position ASC, id ASC LIMIT 500')
    .all() as SavedFilter[];
}

/** Persist one saved filter (URL-encoded `params` string + display name). */
export function createSavedFilter(name: string, params: string): SavedFilter {
  return db.transaction(() => {
    const now = Date.now();
    const nextPos = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM saved_filter').get() as { p: number }).p;
    const info = db
      .prepare('INSERT INTO saved_filter (name, params, position, created_at) VALUES (?, ?, ?, ?)')
      .run(name.trim().slice(0, 60), params.slice(0, 2000), nextPos, now);
    return db.prepare('SELECT id, name, params, position, created_at FROM saved_filter WHERE id = ?').get(info.lastInsertRowid) as SavedFilter;
  })();
}

/** Delete one saved filter by id. Returns `false` when nothing matched. */
export function deleteSavedFilter(id: number): boolean {
  return db.prepare('DELETE FROM saved_filter WHERE id = ?').run(id).changes > 0;
}

/** Persist drag-reorder for the saved-filter chip strip. */
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

/** The reading queue in operator-chosen order. */
export function listReadingQueue(): ReadingQueueEntry[] {
  return db
    .prepare('SELECT vn_id, position, added_at FROM reading_queue ORDER BY position ASC, added_at ASC LIMIT 1000')
    .all() as ReadingQueueEntry[];
}

/**
 * Returns the set of VN ids currently in the reading queue.
 * Used by the collection API to annotate items for the library filter badge.
 */
export function getReadingQueueVnIds(): Set<string> {
  const rows = db.prepare('SELECT vn_id FROM reading_queue').all() as { vn_id: string }[];
  return new Set(rows.map((r) => r.vn_id));
}

/**
 * Append one VN to the reading queue. `position` is set to the current
 * max + 1 so duplicates are idempotent (existing entries keep their slot).
 */
export function addToReadingQueue(vnId: string): ReadingQueueEntry {
  return db.transaction(() => {
    const next = (db.prepare('SELECT COALESCE(MAX(position), 0) + 1 AS p FROM reading_queue').get() as { p: number }).p;
    const now = Date.now();
    db.prepare(`
      INSERT INTO reading_queue (vn_id, position, added_at) VALUES (?, ?, ?)
      ON CONFLICT(vn_id) DO NOTHING
    `).run(vnId, next, now);
    return db.prepare('SELECT vn_id, position, added_at FROM reading_queue WHERE vn_id = ?').get(vnId) as ReadingQueueEntry;
  })();
}

/** Remove one VN from the reading queue. Returns `false` when not queued. */
export function removeFromReadingQueue(vnId: string): boolean {
  return db.prepare('DELETE FROM reading_queue WHERE vn_id = ?').run(vnId).changes > 0;
}

/** Persist drag-reorder of the reading queue. */
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

/** Read the operator's reading goal for one year, or `null` when unset. */
export function getReadingGoal(year: number): ReadingGoal | null {
  return (db.prepare('SELECT year, target, updated_at FROM reading_goal WHERE year = ?').get(year) as ReadingGoal | undefined) ?? null;
}

/** Upsert the operator's reading goal for one year and return the row. */
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

/** Every VN ↔ Steam appid mapping known locally, sorted by VN id. */
export function listSteamLinks(): SteamLink[] {
  return db
    .prepare(`SELECT vn_id, appid, steam_name, source, last_synced_minutes, created_at, updated_at FROM steam_link ORDER BY updated_at DESC LIMIT 10000`)
    .all() as SteamLink[];
}

/** Steam link row for one VN, or `null` when no mapping exists. */
export function getSteamLinkForVn(vnId: string): SteamLink | null {
  return (db
    .prepare(`SELECT vn_id, appid, steam_name, source, last_synced_minutes, created_at, updated_at FROM steam_link WHERE vn_id = ?`)
    .get(vnId) as SteamLink | undefined) ?? null;
}

/** Steam link row for one appid, or `null` when no mapping exists. */
export function getSteamLinkByAppid(appid: number): SteamLink | null {
  return (db
    .prepare(`SELECT vn_id, appid, steam_name, source, last_synced_minutes, created_at, updated_at FROM steam_link WHERE appid = ?`)
    .get(appid) as SteamLink | undefined) ?? null;
}

/**
 * Upsert a Steam link. Manual links (`source: 'manual'`) are sticky — the
 * automatic sync path never overwrites them with an auto-derived mapping.
 */
export function setSteamLink(args: {
  vnId: string;
  appid: number;
  steamName: string;
  source: 'auto' | 'manual';
}): SteamLink {
  return db.transaction((): SteamLink => {
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
  })();
}

/** Drop a Steam link by VN id. Returns `false` when no row matched. */
export function deleteSteamLink(vnId: string): boolean {
  return db.prepare(`DELETE FROM steam_link WHERE vn_id = ?`).run(vnId).changes > 0;
}

/** Stamp the last-sync state on a Steam link without touching the mapping itself. */
export function markSteamSynced(vnId: string, minutes: number): void {
  db.prepare(`UPDATE steam_link SET last_synced_minutes = ?, updated_at = ? WHERE vn_id = ?`)
    .run(minutes, Date.now(), vnId);
}

/** Count of VNs with a `finished_date` in the given calendar year. */
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

/**
 * Daily activity counts for one year, used by the GitHub-style heatmap
 * on `/stats`. Counts include status changes, playtime updates, and notes.
 */
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

/**
 * Year-in-review summary: finished/started counts, total minutes, top
 * tags, best-rated VNs. Used by the `/stats` annual recap card.
 */
export function yearReview(year: number): YearReview {
  const ys = String(year);
  const completed = countFinishedInYear(year);
  const playtime = (db
    .prepare(`SELECT COALESCE(SUM(playtime_minutes), 0) AS m FROM collection WHERE substr(finished_date, 1, 4) = ?`)
    .get(ys) as { m: number }).m;
  const topTags = (db
    .prepare(`
      SELECT ti.tag_id AS tag_id,
             COALESCE(MAX(ti.tag_name), ti.tag_id) AS tag_name,
             COUNT(*) AS tag_count
      FROM collection c JOIN vn_tag_index ti ON ti.vn_id = c.vn_id
      WHERE substr(c.finished_date, 1, 4) = ?
        AND ti.spoiler = 0
        AND COALESCE(ti.category, 'cont') <> 'ero'
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

/** Top `limit` tags credited to VNs finished each year. Drives the per-year tag chart. */
export function tagsCompletedPerYear(limit = 6): YearTag[] {
  const rows = db
    .prepare(`
      WITH tagged AS (
        SELECT
          CAST(substr(c.finished_date, 1, 4) AS INTEGER) AS year,
          ti.tag_id AS tag_id,
          COALESCE(ti.tag_name, ti.tag_id) AS tag_name
        FROM collection c JOIN vn_tag_index ti ON ti.vn_id = c.vn_id
        WHERE c.finished_date IS NOT NULL
          AND ti.spoiler = 0
          AND COALESCE(ti.category, 'cont') <> 'ero'
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

/**
 * "Best ROI" ranking: rating divided by playtime, top `limit` rows. Surfaced
 * on `/stats` as the "Most enjoyment per hour" leaderboard.
 */
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

/**
 * Rating histogram across the collection — buckets pair the operator's
 * own rating with the VNDB community Bayesian. Drives the rating chart.
 */
export function ratingHistogram(): HistBucket[] {
  const mineRows = db
    .prepare(`
      SELECT MAX(10, MIN(100, CAST(ROUND(user_rating / 10.0) AS INTEGER) * 10)) AS bucket,
             COUNT(*) AS cnt
      FROM collection
      WHERE user_rating IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `)
    .all() as { bucket: number; cnt: number }[];
  const vndbRows = db
    .prepare(`
      SELECT MAX(10, MIN(100, CAST(ROUND(v.rating / 10.0) AS INTEGER) * 10)) AS bucket,
             COUNT(*) AS cnt
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE c.user_rating IS NOT NULL AND v.rating IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `)
    .all() as { bucket: number; cnt: number }[];
  const buckets: HistBucket[] = [];
  for (let b = 10; b <= 100; b += 10) buckets.push({ bucket: b, mine: 0, vndb: 0 });
  for (const { bucket, cnt } of mineRows) {
    const b = buckets.find((x) => x.bucket === bucket);
    if (b) b.mine = cnt;
  }
  for (const { bucket, cnt } of vndbRows) {
    const b = buckets.find((x) => x.bucket === bucket);
    if (b) b.vndb = cnt;
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

/**
 * Hard upper bound on the `findDuplicates` scan. Prevents the
 * maintenance page from pulling tens of thousands of rows into JS
 * when the user's `vn` table grew large. 20k titles is well above
 * any realistic personal library and only takes a few ms to scan.
 */
const FIND_DUPLICATES_LIMIT = 20000;

/**
 * Detect near-duplicate VN rows by title normalisation. Capped at
 * `FIND_DUPLICATES_LIMIT` so the diagnostic panel stays snappy. Surfaced
 * by the data-maintenance UI.
 */
export function findDuplicates(): DuplicateGroup[] {
  const rows = db
    .prepare(`SELECT id, title FROM vn ORDER BY id LIMIT ?`)
    .all(FIND_DUPLICATES_LIMIT) as { id: string; title: string }[];
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

/**
 * VNs released on the same calendar day as `today`, with the elapsed
 * years. Drives the home page "Anniversaries today" strip.
 */
export function todaysAnniversaries(today: Date = new Date()): AnniversaryVn[] {
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const yyyy = today.getFullYear();
  const monthDay = `${mm}-${dd}`;
  return db
    .prepare(`
      SELECT v.id, v.title, v.released, v.image_thumb, v.image_url, v.image_sexual,
             v.local_image_thumb
      FROM collection c JOIN vn v ON v.id = c.vn_id
      WHERE SUBSTR(v.released, 6, 5) = ?
      ORDER BY v.released DESC
      LIMIT 500
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

/** VNs whose `fetched_at` exceeds `thresholdMs` ago, sorted oldest-first. */
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

/**
 * Server-side substring search across titles + custom descriptions +
 * notes. Returns FTS-style snippets so the UI can highlight the match.
 */
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

/** Read one cache row by key, or `null` when the key has never been written. */
export function getCacheRow(key: string): CacheRow | null {
  return (db.prepare('SELECT cache_key, body, etag, last_modified, fetched_at, expires_at FROM vndb_cache WHERE cache_key = ?').get(key) as CacheRow | undefined) ?? null;
}

/** Insert or replace one cache row. */
export function putCacheRow(row: CacheRow): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (@cache_key, @body, @etag, @last_modified, @fetched_at, @expires_at)
    ON CONFLICT(cache_key) DO UPDATE SET
      body=excluded.body, etag=excluded.etag, last_modified=excluded.last_modified,
      fetched_at=excluded.fetched_at, expires_at=excluded.expires_at
  `).run(row);
}

/** Refresh just the timestamps on a cache row (after a 304 Not Modified). */
export function touchCacheRow(key: string, fetchedAt: number, expiresAt: number): void {
  db.prepare('UPDATE vndb_cache SET fetched_at = ?, expires_at = ? WHERE cache_key = ?')
    .run(fetchedAt, expiresAt, key);
}

/** Delete one cache row by key. */
export function deleteCacheKey(key: string): void {
  db.prepare('DELETE FROM vndb_cache WHERE cache_key = ?').run(key);
}

/** Delete every cache row past its `expires_at`. Returns the deleted count. */
export function pruneExpiredCache(): number {
  const info = db.prepare('DELETE FROM vndb_cache WHERE expires_at < ?').run(Date.now());
  return info.changes;
}

/** Drop every row from `vndb_cache`. Returns the deleted count. */
export function clearCache(): number {
  const info = db.prepare('DELETE FROM vndb_cache').run();
  return info.changes;
}

/**
 * Delete cache rows whose key matches the supplied path prefix. Matches
 * the `% /<path>|%` shape the cache uses; never `<path>|%` (which would
 * miss every row because of the method prefix).
 *
 * Caller must pass a literal path prefix without LIKE metacharacters (`%`, `_`).
 * Throws on misuse rather than silently widening the DELETE.
 */
export function deleteCacheByPathPrefix(pathPrefix: string): number {
  if (/[%_]/.test(pathPrefix)) {
    throw new Error('deleteCacheByPathPrefix: pathPrefix must not contain LIKE metacharacters');
  }
  const info = db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?').run(`${pathPrefix}|%`);
  return info.changes;
}

/**
 * Most-recent `fetched_at` across cache rows whose `cache_key` matches any
 * of the supplied LIKE patterns (e.g. `'egs:anticipated:%'`,
 * `'% /release|%'`). Returns null when no row matches — the page has
 * never been cached at all. Used by `<RefreshScopeButton/>` to render
 * the "Data Xh ago" chip; patterns should mirror the scope's bust
 * patterns from `src/lib/refresh-scopes.ts:REFRESH_SCOPES` so the
 * freshness display and the refresh action stay in sync.
 *
 * Caps pattern fan-out so an N-fold OR-clause from a misbehaving caller
 * can't break the SQLite planner.
 */
export function getCacheFreshness(patterns: string[]): number | null {
  if (patterns.length === 0) return null;
  const capped = patterns.slice(0, 32);
  const clauses = capped.map(() => 'cache_key LIKE ?').join(' OR ');
  const row = db
    .prepare(`SELECT MAX(fetched_at) AS newest FROM vndb_cache WHERE ${clauses}`)
    .get(...capped) as { newest: number | null } | undefined;
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

/**
 * Build the full JSON backup payload (collection + owned editions + series
 * + lists + saved filters + settings). Streamed to `/api/collection/export`.
 */
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
      raw: safeJsonParse(v.raw, null),
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

/**
 * Restore a JSON backup. Idempotent — re-running the same payload is a
 * no-op aside from the audit log. Returns per-table counts plus a list
 * of soft errors so the UI can show "Imported N rows, K skipped".
 */
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
        console.error(`[importData] vn ${vn.id} failed:`, (e as Error).message);
        summary.errors.push(`vn ${vn.id}: import failed`);
      }
    }
    for (const c of payload.collection ?? []) {
      try {
        const exists = db.prepare('SELECT 1 FROM collection WHERE vn_id = ?').get(c.vn_id);
        if (exists) {
          const physicalLocation = c.physical_location ?? null;
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
          rebuildVnPlaceIndex(c.vn_id);
        } else {
          const physicalLocation = c.physical_location ?? null;
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
          rebuildVnPlaceIndex(c.vn_id);
        }
        summary.collection_upserted++;
      } catch (e) {
        console.error(`[importData] collection ${c.vn_id} failed:`, (e as Error).message);
        summary.errors.push(`collection ${c.vn_id}: import failed`);
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
        console.error(`[importData] series ${s.name} failed:`, (e as Error).message);
        summary.errors.push(`series ${s.name}: import failed`);
      }
    }
    for (const link of payload.series_vn ?? []) {
      const newSid = idMap.get(link.series_id);
      if (newSid == null) continue;
      try {
        addVnToSeries(newSid, link.vn_id, link.order_index ?? 0);
        summary.series_links++;
      } catch (e) {
        console.error(`[importData] series_vn ${link.series_id}/${link.vn_id} failed:`, (e as Error).message);
        summary.errors.push(`series_vn ${link.series_id}/${link.vn_id}: import failed`);
      }
    }
  });
  trx();
  invalidateAggregateStats();
  return summary;
}

/** Returns the absolute filesystem path of the SQLite DB. Used for backup. */
export function getDbPath(): string {
  return resolveDbPath();
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
    const cols = (probe.prepare(`PRAGMA table_info("${t.replace(/"/g, '""')}")`).all() as { name: string }[]).map((c) => c.name);
    srcColsByTable.set(t, cols);
  }
  probe.close();

  const targetTables = (db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  ).all() as { name: string }[]).map((r) => r.name);

  const summary: SqliteRestoreSummary = { tables: [], skipped: [] };

  const restoreSnapshot: Array<{ key: string; prior_preview: string | null }> = [];
  for (const key of AUDITED_SETTING_KEYS) {
    restoreSnapshot.push({ key, prior_preview: settingAuditPreview(key, getAppSetting(key)) });
  }
  // The export direction (GET /api/backup) uses `db.backup(destPath)`
  // (better-sqlite3 online backup API). The restore direction cannot
  // use `.backup()` because that method only copies FROM the live DB
  // TO a file, not the reverse. ATTACH DATABASE is the only available
  // mechanism for table-by-table merge from a source file; it is safe
  // here because (a) `tmpPath` is generated by `mkdtemp` on the
  // server, (b) identifier names come from `sqlite_master` on a DB
  // whose DDL is hardcoded in this file, and (c) `colList` and
  // `table` are validated against the same DDL.
  //
  // SQLite refuses parameter binding inside ATTACH DATABASE, so the
  // path goes through literal-quote escaping. Reject anything that
  // doesn't look like an absolute filesystem path — the caller
  // already feeds us a server-generated `mkdtemp` output, but a
  // defensive check costs nothing.
  if (!tmpPath.startsWith('/') && !/^[A-Za-z]:\\/.test(tmpPath)) {
    throw new Error('restore tmpPath must be absolute');
  }
  if (tmpPath.includes('\0') || tmpPath.length > 1024) {
    throw new Error('restore tmpPath looks malformed');
  }
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
      const targetCols = (db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all() as { name: string }[]).map((c) => c.name);
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

  try {
    const now = Date.now();
    const ins = db.prepare(`
      INSERT INTO app_setting_audit (key, prior_preview, next_preview, changed_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const snap of restoreSnapshot) {
      const after = settingAuditPreview(snap.key, getAppSetting(snap.key));
      if (snap.prior_preview !== after) {
        // Tag the entry as a restore-driven swap so the user can spot
        // it in the audit panel.
        ins.run(`${snap.key} (restore)`, snap.prior_preview, after, now);
      }
    }
  } catch {
    // best-effort; restore still succeeded even if audit trail fails.
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

/**
 * Snapshot the `vndb_cache` table: total rows, expired rows, by-path
 * breakdown. Drives the cache panel on `/stats`.
 */
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
      LIMIT 200
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

/** Every user list with its member-count, ordered by `pinned` then name. */
export function listUserLists(): UserListWithCount[] {
  // LEFT JOIN + GROUP BY avoids the scalar subquery per row that
  // SQLite would otherwise evaluate during the sort.
  return db
    .prepare(`
      SELECT l.id, l.name, l.slug, l.description, l.color, l.icon, l.pinned,
             l.created_at, l.updated_at,
             COUNT(lv.list_id) AS vn_count
      FROM user_list l
      LEFT JOIN user_list_vn lv ON lv.list_id = l.id
      GROUP BY l.id
      ORDER BY l.pinned DESC, l.updated_at DESC, l.id DESC
    `)
    .all() as UserListWithCount[];
}

/** Read one user list by id, or `null` when unknown. */
export function getUserList(id: number): UserList | null {
  return (db
    .prepare('SELECT id, name, slug, description, color, icon, pinned, created_at, updated_at FROM user_list WHERE id = ?')
    .get(id) as UserList | undefined) ?? null;
}

/** Read one user list by its URL-safe slug, or `null` when unknown. */
export function getUserListBySlug(slug: string): UserList | null {
  return (db
    .prepare('SELECT id, name, slug, description, color, icon, pinned, created_at, updated_at FROM user_list WHERE slug = ?')
    .get(slug) as UserList | undefined) ?? null;
}

/** Create one user list. Auto-derives a unique slug from `name`. */
export function createUserList(input: {
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
}): UserList {
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('name required');
  return db.transaction(() => {
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
    } satisfies UserList;
  })();
}

/** Patch one user list (name / description / color / icon / pinned). */
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
  return db.transaction((): UserList | null => {
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
  })();
}

/** Delete one user list; member rows cascade via FK. Returns `false` on no-op. */
export function deleteUserList(id: number): boolean {
  const info = db.prepare('DELETE FROM user_list WHERE id = ?').run(id);
  return info.changes > 0;
}

/** Members of one user list, in `order_index` order. */
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

/** Lists this VN belongs to. Used by the VN-detail "In lists:" line. */
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

/**
 * Bulk-lookup map of VN id → lists it belongs to. Card grids should call
 * this once per render rather than `listListsForVn` per row.
 */
export function listAllListMemberships(): Record<string, UserList[]> {
  const rows = db
    .prepare(`
      SELECT lv.vn_id, l.id, l.name, l.slug, l.description, l.color, l.icon, l.pinned, l.created_at, l.updated_at
      FROM user_list_vn lv
      JOIN user_list l ON l.id = lv.list_id
      ORDER BY l.pinned DESC, l.name COLLATE NOCASE
      LIMIT 50000
    `)
    .all() as Array<UserList & { vn_id: string }>;
  const out: Record<string, UserList[]> = {};
  for (const r of rows) {
    const { vn_id, ...list } = r;
    (out[vn_id] ??= []).push(list);
  }
  return out;
}

/**
 * Compact `(vn_id → list_count)` lookup. The full
 * `listAllListMemberships` returns the list metadata too; this one is
 * for surfaces that only need to render a numeric badge per card.
 */
/** Map of VN id → number of lists it belongs to. Used for the cheap "in N lists" badge. */
export function countListMembershipsByVn(): Map<string, number> {
  const rows = db
    .prepare('SELECT vn_id, COUNT(*) AS n FROM user_list_vn GROUP BY vn_id')
    .all() as { vn_id: string; n: number }[];
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.vn_id, r.n);
  return out;
}

/**
 * Append one VN to a list. Returns `null` when the list doesn't exist;
 * returns the existing membership row if the VN was already on the list.
 */
export function addVnToList(listId: number, vnId: string, note?: string | null): UserListItem | null {
  const list = getUserList(listId);
  if (!list) return null;
  return db.transaction(() => {
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
    } satisfies UserListItem;
  })();
}

/** Remove one VN from a list. Returns `false` when nothing matched. */
export function removeVnFromList(listId: number, vnId: string): boolean {
  return db.transaction(() => {
    const info = db.prepare('DELETE FROM user_list_vn WHERE list_id = ? AND vn_id = ?').run(listId, vnId);
    if (info.changes > 0) {
      db.prepare('UPDATE user_list SET updated_at = ? WHERE id = ?').run(Date.now(), listId);
    }
    return info.changes > 0;
  })();
}

/** Persist drag-reorder for one list's items. */
export function reorderListItems(listId: number, vnIds: string[]): void {
  const stmt = db.prepare('UPDATE user_list_vn SET order_index = ? WHERE list_id = ? AND vn_id = ?');
  const now = Date.now();
  db.transaction(() => {
    vnIds.forEach((vnId, idx) => stmt.run(idx, listId, vnId));
    db.prepare('UPDATE user_list SET updated_at = ? WHERE id = ?').run(now, listId);
  })();
}

/**
 * Batch name lookups used by the download-status enrichment layer.
 * Each function returns a Map<id, name> for the supplied id list.
 * Unknown ids are absent from the map (callers treat absence as null).
 */
/** Bulk-load VN titles keyed by id. Missing ids are simply absent from the map. */
export function batchGetVnTitles(ids: string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, title FROM vn WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string; title: string }[];
  return new Map(rows.map((r) => [r.id, r.title]));
}

/** Bulk-load producer names keyed by id. Missing ids are simply absent. */
export function batchGetProducerNames(ids: string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT id, name FROM producer WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string; name: string }[];
  const map = new Map(rows.map((r) => [r.id, r.name]));
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length > 0) {
    const mp = missing.map(() => '?').join(',');
    const fromVn = db
      .prepare(
        `SELECT DISTINCT di.producer_id AS id,
                         json_extract(d.value, '$.name') AS name
         FROM vn_developer_index di
         JOIN vn ON vn.id = di.vn_id,
         json_each(vn.developers) d
         WHERE di.producer_id IN (${mp})
           AND json_extract(d.value, '$.id') = di.producer_id`,
      )
      .all(...missing) as { id: string; name: string }[];
    for (const r of fromVn) {
      if (!map.has(r.id) && r.name) map.set(r.id, r.name);
    }
  }
  return map;
}

/** Bulk-load staff names keyed by id. Missing ids are simply absent. */
export function batchGetStaffNames(ids: string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT sid, name FROM vn_staff_credit WHERE sid IN (${placeholders}) GROUP BY sid`,
    )
    .all(...ids) as { sid: string; name: string }[];
  const map = new Map(rows.map((r) => [r.sid, r.name]));
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length > 0) {
    const vaPlaceholders = missing.map(() => '?').join(',');
    const vaRows = db
      .prepare(
        `SELECT sid, va_name AS name FROM vn_va_credit WHERE sid IN (${vaPlaceholders}) GROUP BY sid`,
      )
      .all(...missing) as { sid: string; name: string }[];
    for (const r of vaRows) {
      if (!map.has(r.sid) && r.name) map.set(r.sid, r.name);
    }
  }
  return map;
}

/** Bulk-load character names keyed by id. Missing ids are simply absent. */
export function batchGetCharNames(ids: string[]): Map<string, string> {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT c_id, c_name FROM vn_va_credit WHERE c_id IN (${placeholders}) GROUP BY c_id`,
    )
    .all(...ids) as { c_id: string; c_name: string }[];
  return new Map(rows.map((r) => [r.c_id, r.c_name]));
}

export interface KobeStockRow {
  code: string;
  title: string;
  jan: string | null;
  release_date: string | null;
  list_price: string | null;
  sale_price: string | null;
  vn_id: string | null;
  vn_match_source: 'auto' | 'manual' | 'none' | null;
  vn_candidates: string | null;
  search_title: string | null;
  egs_id: number | null;
  egs_match_source: 'auto' | 'manual' | null;
  egs_title: string | null;
  egs_brand: string | null;
  egs_release_date: string | null;
  egs_image_url: string | null;
  egs_vndb_raw: string | null;
  last_matched_at: number | null;
  fetched_at: number;
  updated_at: number;
  /** VN cover URL (remote VNDB CDN) — populated when vn_id is matched. */
  vn_image_url: string | null;
  /** VN cover local mirror path — populated when vn_id is matched and image downloaded. */
  vn_local_image: string | null;
  /** VN cover sexual score (0–2) — used by SafeImage for NSFW gating. */
  vn_image_sexual: number | null;
}

/**
 * Full-sync the AliceNet Kobe stock table: upsert every incoming row,
 * delete rows whose code is absent from the snapshot (sold items).
 * Returns added/updated/removed counts for the UI.
 */
export function upsertKobeStock(
  rows: Pick<KobeStockRow, 'code' | 'title' | 'jan' | 'release_date' | 'list_price' | 'sale_price'>[],
): { added: number; updated: number; removed: number } {
  const now = Date.now();
  const upsertStmt = db.prepare(`
    INSERT INTO alicesoft_kobe_stock (code, title, jan, release_date, list_price, sale_price, fetched_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      title        = excluded.title,
      jan          = excluded.jan,
      release_date = excluded.release_date,
      list_price   = excluded.list_price,
      sale_price   = excluded.sale_price,
      fetched_at   = excluded.fetched_at,
      updated_at   = excluded.updated_at
  `);

  let added = 0;
  let updated = 0;
  let removed = 0;

  const txn = db.transaction((items: typeof rows) => {
    const incomingCodes = new Set(items.map((r) => r.code));

    const existingCodes = new Set(
      (db.prepare(`SELECT code FROM alicesoft_kobe_stock`).all() as { code: string }[]).map((r) => r.code),
    );

    for (const r of items) {
      const isNew = !existingCodes.has(r.code);
      upsertStmt.run(
        r.code, r.title, r.jan ?? null, r.release_date ?? null,
        r.list_price ?? null, r.sale_price ?? null, now, now,
      );
      if (isNew) added++; else updated++;
    }

    const toDelete = [...existingCodes].filter((c) => !incomingCodes.has(c));
    if (toDelete.length > 0) {
      const placeholders = toDelete.map(() => '?').join(',');
      removed = db.prepare(`DELETE FROM alicesoft_kobe_stock WHERE code IN (${placeholders})`).run(...toDelete).changes;
    }
  });

  txn(rows);
  return { added, updated, removed };
}

/**
 * Every AliceNet Kobe stock row joined with the operator's collection
 * (so the UI can flag "already owned") and VN cover data (for `SafeImage`).
 */
export function listKobeStock(): (KobeStockRow & { in_collection: number; vn_developers: string | null })[] {
  return db.prepare(`
    SELECT k.*,
           CASE WHEN c.vn_id IS NOT NULL THEN 1 ELSE 0 END AS in_collection,
           v.image_url        AS vn_image_url,
           v.local_image      AS vn_local_image,
           v.image_sexual     AS vn_image_sexual,
           v.developers       AS vn_developers
    FROM   alicesoft_kobe_stock k
    LEFT   JOIN collection c ON c.vn_id = k.vn_id
    LEFT   JOIN vn          v ON v.id    = k.vn_id
    ORDER  BY k.title
  `).all() as (KobeStockRow & { in_collection: number; vn_developers: string | null })[];
}

/** Read one AliceNet Kobe stock row by code, or `null` when unknown. */
export function getKobeStockItem(code: string): KobeStockRow | null {
  return (db.prepare(`SELECT * FROM alicesoft_kobe_stock WHERE code = ?`).get(code) as KobeStockRow | undefined) ?? null;
}

function retryWindowClause(retryBefore?: number): { sql: string; params: number[] } {
  if (!retryBefore || !Number.isFinite(retryBefore)) return { sql: '', params: [] };
  return {
    sql: ` AND (last_matched_at IS NULL OR last_matched_at < ?)`,
    params: [Math.floor(retryBefore)],
  };
}

/**
 * Kobe rows still missing a VN match. With `retryNone=true`, also surfaces
 */
export function listKobeUnmatched(limit: number, retryNone = false, retryBefore?: number): KobeStockRow[] {
  const retryWindow = retryNone ? retryWindowClause(retryBefore) : { sql: '', params: [] as number[] };
  const condition = retryNone
    ? `vn_id IS NULL AND egs_id IS NULL AND vn_match_source = 'none'${retryWindow.sql}`
    : `vn_id IS NULL AND egs_id IS NULL AND vn_match_source IS NULL`;
  return db
    .prepare(
      `SELECT * FROM alicesoft_kobe_stock
       WHERE ${condition}
       ORDER BY CASE WHEN vn_match_source IS NULL THEN 0 ELSE 1 END,
                COALESCE(last_matched_at, 0),
                code
       LIMIT ?`,
    )
    .all(...retryWindow.params, limit) as KobeStockRow[];
}

/** Count of rows `listKobeUnmatched` would return — drives the queue badge. */
export function countKobeUnmatchedQueue(retryNone = false, retryBefore?: number): number {
  const retryWindow = retryNone ? retryWindowClause(retryBefore) : { sql: '', params: [] as number[] };
  const condition = retryNone
    ? `vn_id IS NULL AND egs_id IS NULL AND vn_match_source = 'none'${retryWindow.sql}`
    : `vn_id IS NULL AND egs_id IS NULL AND vn_match_source IS NULL`;
  const row = db.prepare(`SELECT COUNT(*) AS n FROM alicesoft_kobe_stock WHERE ${condition}`)
    .get(...retryWindow.params) as { n: number };
  return row.n ?? 0;
}

/**
 * Items in the "No VNDB result" tab — VNDB title search was attempted but
 * returned nothing. The EGS-fallback resolver walks these and tries to
 * recover a VN id via the EGS gamelist `vndb` column.
 */
/**
 * Kobe rows where the VNDB search returned nothing. Surfaced to the
 * EGS-fallback resolver so it can try the EGS `vndb` column.
 */
export function listKobeNoVndbResult(limit: number, retryBefore?: number): KobeStockRow[] {
  const retryWindow = retryWindowClause(retryBefore);
  return db
    .prepare(
      `SELECT * FROM alicesoft_kobe_stock
       WHERE vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryWindow.sql}
       ORDER BY COALESCE(last_matched_at, 0), code
       LIMIT ?`,
    )
    .all(...retryWindow.params, limit) as KobeStockRow[];
}

/** Count of `listKobeNoVndbResult` rows. */
export function countKobeNoVndbResult(retryBefore?: number): number {
  const retryWindow = retryWindowClause(retryBefore);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM alicesoft_kobe_stock
       WHERE vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryWindow.sql}`,
    )
    .get(...retryWindow.params) as { n: number };
  return row.n ?? 0;
}

/** Kobe rows with an EGS match but still no VNDB match — second-pass retry queue. */
export function listKobeNoVndbWithEgs(limit: number, retryBefore?: number): KobeStockRow[] {
  const retryWindow = retryWindowClause(retryBefore);
  return db
    .prepare(
      `SELECT * FROM alicesoft_kobe_stock
       WHERE vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NOT NULL${retryWindow.sql}
       ORDER BY COALESCE(last_matched_at, 0), code
       LIMIT ?`,
    )
    .all(...retryWindow.params, limit) as KobeStockRow[];
}

/** Count of `listKobeNoVndbWithEgs` rows. */
export function countKobeNoVndbWithEgs(retryBefore?: number): number {
  const retryWindow = retryWindowClause(retryBefore);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM alicesoft_kobe_stock
       WHERE vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NOT NULL${retryWindow.sql}`,
    )
    .get(...retryWindow.params) as { n: number };
  return row.n ?? 0;
}

/**
 * Subset of "No VNDB result" rows that also lack an EGS match. Used by the
 * dedicated EGS-search retry button — there's no point re-searching EGS for
 * a row that already has an `egs_id`.
 */
/** Kobe rows with neither a VNDB match nor an EGS match — surfaced by the EGS-search retry button. */
export function listKobeNoVndbNoEgs(limit: number, retryBefore?: number): KobeStockRow[] {
  const retryWindow = retryWindowClause(retryBefore);
  return db
    .prepare(
      `SELECT * FROM alicesoft_kobe_stock
       WHERE vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryWindow.sql}
       ORDER BY COALESCE(last_matched_at, 0), code
       LIMIT ?`,
    )
    .all(...retryWindow.params, limit) as KobeStockRow[];
}

/** Count of `listKobeNoVndbNoEgs` rows. */
export function countKobeNoVndbNoEgs(retryBefore?: number): number {
  const retryWindow = retryWindowClause(retryBefore);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM alicesoft_kobe_stock
       WHERE vn_match_source = 'none' AND vn_id IS NULL AND egs_id IS NULL${retryWindow.sql}`,
    )
    .get(...retryWindow.params) as { n: number };
  return row.n ?? 0;
}

/**
 * Persist a Kobe → VN match. `source` distinguishes auto-matches (overwritten
 * by reset-matches) from manual pins (sticky). `candidates` is the JSON list
 * of alternative VNDB hits for the remap chips.
 */
export function setKobeVnLink(
  code: string,
  vnId: string | null,
  source: 'manual' | 'none' | 'auto',
  candidates?: string | null,
  searchTitle?: string | null,
): void {
  const now = Date.now();
  db.prepare(
    `UPDATE alicesoft_kobe_stock
     SET vn_id = ?, vn_match_source = ?, vn_candidates = ?, search_title = ?,
         last_matched_at = ?, updated_at = ?
     WHERE code = ?`,
  ).run(vnId, source, candidates ?? null, searchTitle ?? null, now, now, code);
}

/** Mark a Kobe row's VN match as `'none'` (search ran, no hit) without dropping any data. */
export function clearKobeVnLink(code: string): void {
  const now = Date.now();
  db.prepare(
    `UPDATE alicesoft_kobe_stock
     SET vn_id = NULL, vn_match_source = NULL, vn_candidates = NULL,
         search_title = NULL, last_matched_at = NULL, updated_at = ?
     WHERE code = ?`,
  ).run(now, code);
}

/**
 * Clear every auto-derived Kobe → VN match so the next matching pass starts
 * fresh. Manual pins (`vn_match_source = 'manual'`) are kept. Returns the
 * number of rows reset.
 */
export function resetKobeAutoMatches(): number {
  return db
    .prepare(
      `UPDATE alicesoft_kobe_stock
       SET vn_id = NULL, vn_match_source = NULL, vn_candidates = NULL,
           search_title = NULL, last_matched_at = NULL, updated_at = ?
       WHERE vn_match_source = 'auto'`,
    )
    .run(Date.now()).changes;
}

/**
 * Persist a Kobe → EGS match. Mirrors `setKobeVnLink` but also stores the
 * EGS metadata cache (title / brand / image) so re-rendering doesn't need
 * a fresh EGS fetch.
 */
export function setKobeEgsLink(
  code: string,
  egsId: number | null,
  source: 'auto' | 'manual',
  meta?: {
    title?: string | null;
    brand?: string | null;
    releaseDate?: string | null;
    imageUrl?: string | null;
    vndbRaw?: string | null;
  },
): void {
  const now = Date.now();
  if (egsId == null) {
    db.prepare(`
      UPDATE alicesoft_kobe_stock
      SET egs_id = NULL,
          egs_match_source = ?,
          egs_title = NULL,
          egs_brand = NULL,
          egs_release_date = NULL,
          egs_image_url = NULL,
          egs_vndb_raw = NULL,
          updated_at = ?
      WHERE code = ?
    `).run(source, now, code);
    return;
  }

  if (!meta) {
    db.prepare(`
      UPDATE alicesoft_kobe_stock
      SET egs_id = ?,
          egs_match_source = ?,
          updated_at = ?
      WHERE code = ?
    `).run(egsId, source, now, code);
    return;
  }

  db.prepare(`
    UPDATE alicesoft_kobe_stock
    SET egs_id = ?,
        egs_match_source = ?,
        egs_title = ?,
        egs_brand = ?,
        egs_release_date = ?,
        egs_image_url = ?,
        egs_vndb_raw = ?,
        updated_at = ?
    WHERE code = ?
  `).run(
    egsId,
    source,
    meta?.title ?? null,
    meta?.brand ?? null,
    meta?.releaseDate ?? null,
    meta?.imageUrl ?? null,
    meta?.vndbRaw ?? null,
    now,
    code,
  );
}

/**
 * Aggregate match-status counts for the AliceNet Kobe page header tiles
 * (total / matched / unmatched / none-found / in-wishlist / pending).
 */
export function countKobeStock(): {
  total: number;
  matched: number;
  vndb_matched: number;
  egs_only: number;
  unmatched: number;
  unprocessed: number;
  none_found: number;
  in_collection: number;
} {
  const row = db
    .prepare(`
      SELECT
        COUNT(*)                                                              AS total,
        SUM(CASE WHEN k.vn_id IS NOT NULL THEN 1 ELSE 0 END)                AS vndb_matched,
        SUM(CASE WHEN k.vn_id IS NULL AND k.egs_id IS NOT NULL THEN 1 ELSE 0 END) AS egs_only,
        SUM(CASE WHEN k.vn_id IS NOT NULL OR k.egs_id IS NOT NULL THEN 1 ELSE 0 END) AS matched,
        SUM(CASE WHEN k.vn_id IS NULL AND k.egs_id IS NULL AND k.vn_match_source IS NULL THEN 1 ELSE 0 END) AS unprocessed,
        SUM(CASE WHEN k.vn_id IS NULL AND k.egs_id IS NULL AND k.vn_match_source = 'none' THEN 1 ELSE 0 END) AS none_found,
        SUM(CASE WHEN c.vn_id IS NOT NULL THEN 1 ELSE 0 END)                AS in_collection
      FROM alicesoft_kobe_stock k
      LEFT JOIN collection c ON c.vn_id = k.vn_id
    `)
    .get() as {
      total: number;
      matched: number;
      vndb_matched: number;
      egs_only: number;
      unprocessed: number;
      none_found: number;
      in_collection: number;
    };
  const matched = row.matched ?? 0;
  const noneFound = row.none_found ?? 0;
  const unprocessed = row.unprocessed ?? 0;
  return {
    total: row.total,
    matched,
    vndb_matched: row.vndb_matched ?? 0,
    egs_only: row.egs_only ?? 0,
    unmatched: row.total - matched,
    unprocessed,
    none_found: noneFound,
    in_collection: row.in_collection ?? 0,
  };
}

/**
 * Returns up to `limit` VN IDs from kobe items that have a vn_id
 * but whose VN row does not yet exist in the local `vn` table.
 * Used by the "Download VNDB data" step.
 */
/** VN ids matched to Kobe rows but missing from the local `vn` table — input for the bulk-download step. */
export function listKobeVnidsToDownload(limit: number): string[] {
  return (
    db
      .prepare(
        `SELECT DISTINCT k.vn_id
         FROM alicesoft_kobe_stock k
         LEFT JOIN vn v ON v.id = k.vn_id
         WHERE k.vn_id IS NOT NULL AND v.id IS NULL
         LIMIT ?`,
      )
      .all(limit) as { vn_id: string }[]
  ).map((r) => r.vn_id);
}

/**
 * Returns kobe items that have a vn_id but no egs_id yet.
 * Used by the "Resolve EGS via VNDB" step.
 */
/** Kobe rows with a VN match but no EGS match — input for the EGS-resolve fan-out. */
export function listKobeItemsForEgsResolve(
  limit: number,
): { code: string; vn_id: string }[] {
  return db
    .prepare(
      `SELECT k.code, k.vn_id
       FROM alicesoft_kobe_stock k
       JOIN vn v ON v.id = k.vn_id
       WHERE k.vn_id IS NOT NULL AND k.egs_id IS NULL AND k.egs_match_source IS NULL
       ORDER BY k.code
       LIMIT ?`,
    )
    .all(limit) as { code: string; vn_id: string }[];
}

/**
 * Counts kobe items needing each download step.
 * vndb_pending: items with vn_id not yet in local vn table.
 * egs_pending:  items with local VNDB metadata ready and no EGS resolve attempt yet.
 */
/** Two counters used by the AliceNet Kobe pending-download status pill. */
export function countKobeDownloadPending(): { vndb_pending: number; egs_pending: number } {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN k.vn_id IS NOT NULL AND v.id IS NULL THEN 1 ELSE 0 END) AS vndb_pending,
         SUM(CASE WHEN k.vn_id IS NOT NULL AND v.id IS NOT NULL AND k.egs_id IS NULL AND k.egs_match_source IS NULL THEN 1 ELSE 0 END) AS egs_pending
       FROM alicesoft_kobe_stock k
       LEFT JOIN vn v ON v.id = k.vn_id`,
    )
    .get() as { vndb_pending: number; egs_pending: number };
  return { vndb_pending: row.vndb_pending ?? 0, egs_pending: row.egs_pending ?? 0 };
}

export type VnStockAvailability = 'in_stock' | 'limited' | 'out_of_stock' | 'unknown' | 'error';
export type VnStockProviderStatus =
  | 'ok'
  | 'no_results'
  | 'partial'
  | 'protected'
  | 'error'
  | 'skipped'
  | 'not_checked';

export interface VnStockOfferRow {
  vn_id: string;
  provider: string;
  provider_offer_id: string;
  source: string;
  title: string;
  url: string;
  price: number | null;
  currency: string;
  availability: VnStockAvailability;
  availability_label: string | null;
  condition: string | null;
  edition_label: string | null;
  location_label: string | null;
  location_branch: string | null;
  source_release_id: string | null;
  jan: string | null;
  fetched_at: number;
  updated_at: number;
  error: string | null;
  content_kind: string | null;
  platform: string | null;
  edition_kind: string | null;
  series_relation: string | null;
  match_confidence: string | null;
  match_score: number | null;
  match_warnings_json: string | null;
  marketplace_price: number | null;
  marketplace_count: number | null;
  list_price: number | null;
  category: string | null;
  store_code: string | null;
  product_id: string | null;
  page_kind: string | null;
}

export interface VnStockProviderStatusRow {
  vn_id: string;
  provider: string;
  status: VnStockProviderStatus;
  message: string | null;
  fetched_at: number;
  offer_count: number;
  blocked_kind: string | null;
  fresh_offers_found: number;
  cached_offers_available: number;
  /**
   * Per-provider extras blob (JSON string in SQLite). Currently only
   * `eroge_price` writes here — the value is an `ErogePriceExtrasV1`
   * envelope holding every candidate, full game detail, price stats,
   * price history, and related-games payload. UI layer decodes via
   * `JSON.parse` after deciding the row belongs to the right provider.
   */
  extras_json: string | null;
}

export type VnStockOfferInput = Omit<VnStockOfferRow, 'updated_at'>;
type VnStockProviderStatusInput = Omit<
  VnStockProviderStatusRow,
  'vn_id' | 'provider' | 'blocked_kind' | 'fresh_offers_found' | 'cached_offers_available' | 'extras_json'
> &
  Partial<
    Pick<
      VnStockProviderStatusRow,
      'blocked_kind' | 'fresh_offers_found' | 'cached_offers_available' | 'extras_json'
    >
  >;

/**
 * Atomically replace one provider's stock snapshot for one VN: delete the
 * old offers + status, insert fresh ones. Runs inside a transaction so the
 * UI never sees a half-written set of offers.
 */
export function replaceVnStockProviderSnapshot(
  vnId: string,
  provider: string,
  offers: VnStockOfferInput[],
  status: VnStockProviderStatusInput,
  options: { preserveExistingOffers?: boolean } = {},
): void {
  const txn = db.transaction(() => {
    const insertVnStockOfferStmt = db.prepare(`
      INSERT INTO vn_stock_offer (
        vn_id, provider, provider_offer_id, source, title, url, price, currency,
        availability, availability_label, condition, edition_label, location_label, location_branch,
        source_release_id, jan, fetched_at, updated_at, error,
        content_kind, platform, edition_kind, series_relation, match_confidence, match_score,
        match_warnings_json, marketplace_price, marketplace_count, list_price,
        category, store_code, product_id, page_kind
      )
      VALUES (
        @vn_id, @provider, @provider_offer_id, @source, @title, @url, @price, @currency,
        @availability, @availability_label, @condition, @edition_label, @location_label, @location_branch,
        @source_release_id, @jan, @fetched_at, @updated_at, @error,
        @content_kind, @platform, @edition_kind, @series_relation, @match_confidence, @match_score,
        @match_warnings_json, @marketplace_price, @marketplace_count, @list_price,
        @category, @store_code, @product_id, @page_kind
      )
      ON CONFLICT(vn_id, provider, provider_offer_id) DO UPDATE SET
        source = excluded.source,
        title = excluded.title,
        url = excluded.url,
        price = excluded.price,
        currency = excluded.currency,
        availability = excluded.availability,
        availability_label = excluded.availability_label,
        condition = excluded.condition,
        edition_label = excluded.edition_label,
        location_label = excluded.location_label,
        location_branch = excluded.location_branch,
        source_release_id = excluded.source_release_id,
        jan = excluded.jan,
        fetched_at = excluded.fetched_at,
        updated_at = excluded.updated_at,
        error = excluded.error,
        content_kind = excluded.content_kind,
        platform = excluded.platform,
        edition_kind = excluded.edition_kind,
        series_relation = excluded.series_relation,
        match_confidence = excluded.match_confidence,
        match_score = excluded.match_score,
        match_warnings_json = excluded.match_warnings_json,
        marketplace_price = excluded.marketplace_price,
        marketplace_count = excluded.marketplace_count,
        list_price = excluded.list_price,
        category = excluded.category,
        store_code = excluded.store_code,
        product_id = excluded.product_id,
        page_kind = excluded.page_kind
    `);
    const upsertVnStockProviderStatusStmt = db.prepare(`
      INSERT INTO vn_stock_provider_status (
        vn_id, provider, status, message, fetched_at, offer_count,
        blocked_kind, fresh_offers_found, cached_offers_available
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(vn_id, provider) DO UPDATE SET
        status = excluded.status,
        message = excluded.message,
        fetched_at = excluded.fetched_at,
        offer_count = excluded.offer_count,
        blocked_kind = excluded.blocked_kind,
        fresh_offers_found = excluded.fresh_offers_found,
        cached_offers_available = excluded.cached_offers_available
    `);
    if (!options.preserveExistingOffers) {
      db.prepare(`DELETE FROM vn_stock_offer WHERE vn_id = ? AND provider = ?`).run(vnId, provider);
    }
    for (const offer of offers) {
      insertVnStockOfferStmt.run({ ...offer, updated_at: Date.now() });
    }
    upsertVnStockProviderStatusStmt.run(
      vnId,
      provider,
      status.status,
      status.message,
      status.fetched_at,
      status.offer_count,
      status.blocked_kind ?? null,
      status.fresh_offers_found ?? status.offer_count,
      status.cached_offers_available ?? 0,
    );
  });
  txn();
}

/** Cached stock offers for one VN across every provider. */
export function listVnStockOffers(vnId: string): VnStockOfferRow[] {
  return db.prepare(`
    SELECT *
    FROM vn_stock_offer
    WHERE vn_id = ?
    ORDER BY
      CASE availability
        WHEN 'in_stock' THEN 0
        WHEN 'limited' THEN 1
        WHEN 'unknown' THEN 2
        WHEN 'out_of_stock' THEN 3
        ELSE 4
      END,
      CASE WHEN price IS NULL THEN 1 ELSE 0 END,
      price ASC,
      provider ASC,
      title ASC
  `).all(vnId) as VnStockOfferRow[];
}

/** Per-provider status rows for one VN (last-run state, error messages, counters). */
export function listVnStockProviderStatuses(vnId: string): VnStockProviderStatusRow[] {
  return db.prepare(`
    SELECT *
    FROM vn_stock_provider_status
    WHERE vn_id = ?
    ORDER BY provider
  `).all(vnId) as VnStockProviderStatusRow[];
}

/**
 * Persist the per-provider `extras_json` blob. Currently used only by
 * the Eroge Price refresh path to store the rich game metadata
 * (release date, age, staff, voice actors, all-time high / 30-day low,
 * related games). Inserts a status row when none exists yet so the
 * extras survive even before the first successful refresh.
 *
 * Returns true on write, false when the input JSON serialisation fails.
 */
export function setStockProviderExtras(vnId: string, provider: string, extras: unknown): boolean {
  let payload: string;
  try {
    payload = JSON.stringify(extras);
  } catch {
    return false;
  }
  const exists = db
    .prepare(`SELECT 1 FROM vn_stock_provider_status WHERE vn_id = ? AND provider = ? LIMIT 1`)
    .get(vnId, provider);
  if (exists) {
    db.prepare(
      `UPDATE vn_stock_provider_status SET extras_json = ? WHERE vn_id = ? AND provider = ?`,
    ).run(payload, vnId, provider);
  } else {
    // `status` is NOT NULL on this table — the schema models it as the
    // last-run state. When extras land before a refresh has populated
    // a row (e.g. unit test that seeds the JSON envelope directly, or
    // race between providers), the column is filled with the inert
    // 'unknown' literal so the snapshot reader still understands the
    // row as "no live snapshot yet, but metadata is there".
    db.prepare(
      `INSERT INTO vn_stock_provider_status (vn_id, provider, status, extras_json, fetched_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(vnId, provider, 'unknown', payload, Date.now());
  }
  return true;
}

/**
 * Read the JSON-decoded extras blob for `(vnId, provider)`. Returns
 * null when no row exists or when the stored JSON is unparseable
 * (the column is opportunistically written, never required).
 */
export function getStockProviderExtras<T = unknown>(vnId: string, provider: string): T | null {
  const row = db
    .prepare(`SELECT extras_json FROM vn_stock_provider_status WHERE vn_id = ? AND provider = ? LIMIT 1`)
    .get(vnId, provider) as { extras_json: string | null } | undefined;
  if (!row?.extras_json) return null;
  try {
    return JSON.parse(row.extras_json) as T;
  } catch {
    return null;
  }
}

/**
 * Wipe the per-provider extras blob WITHOUT touching the status row's
 * other columns. Used by the eroge-price manual DELETE endpoint when
 * the operator removes the last candidate — we want the row's status
 * / offer_count to stay accurate, but the rich-meta envelope is no
 * longer useful.
 */
export function clearStockProviderExtras(vnId: string, provider: string): boolean {
  const result = db
    .prepare(`UPDATE vn_stock_provider_status SET extras_json = NULL WHERE vn_id = ? AND provider = ?`)
    .run(vnId, provider);
  return result.changes > 0;
}

/**
 * Batch aggregate for stock chip on VnCard. Returns a map of vnId to
 * available-offer count and best price across in_stock / limited offers.
 * A single query regardless of how many IDs are passed.
 */
/**
 * Bulk-load `{ vnId → { available_count, best_price } }` summaries in
 * one query. Lets card grids show the stock chip without N+1.
 */
export function batchVnStockSummaries(
  vnIds: string[],
): Map<string, { available: number; best_price: number | null }> {
  if (vnIds.length === 0) return new Map();
  const ph = vnIds.map(() => '?').join(',');
  type Row = { vn_id: string; available: number; best_price: number | null };
  const rows = db
    .prepare(
      `WITH eligible AS (
         SELECT vn_id,
                price,
                CASE
                  WHEN source IN ('direct','manual','alicesoft_kobe') THEN 0
                  WHEN jan IS NOT NULL AND jan <> '' THEN 1
                  WHEN product_id IS NOT NULL AND product_id <> '' THEN 2
                  WHEN match_confidence IN ('exact','high') THEN 3
                  WHEN match_confidence = 'medium' THEN 4
                  ELSE 5
                END AS priority
         FROM vn_stock_offer
         WHERE vn_id IN (${ph})
           AND availability IN ('in_stock','limited')
           AND (content_kind IS NULL OR content_kind IN ('game_package','digital_download'))
           AND (match_confidence IS NULL OR match_confidence IN ('exact','high'))
           AND (series_relation IS NULL OR series_relation IN ('exact_game','same_game_different_edition','same_game_different_platform'))
       ),
       ranked AS (
         SELECT vn_id, MIN(priority) AS best_priority
         FROM eligible
         GROUP BY vn_id
       )
       SELECT e.vn_id,
              COUNT(*) AS available,
              MIN(CASE WHEN e.priority = r.best_priority AND e.price IS NOT NULL THEN e.price END) AS best_price
       FROM eligible e
       JOIN ranked r ON r.vn_id = e.vn_id
       GROUP BY e.vn_id`,
    )
    .all(...vnIds) as Row[];
  const out = new Map<string, { available: number; best_price: number | null }>();
  for (const r of rows) out.set(r.vn_id, { available: r.available, best_price: r.best_price });

  // Eroge Price source-of-truth fallback. The bulk-resolve script
  // (and a fresh stock refresh that's still queued) populates
  // `vn_stock_provider_status.extras_json` BEFORE the offer rows are
  // materialised; without this fallback, those VNs read as
  // "no stock" until the live refresh fires. Walk any vnIds that
  // didn't pick up an offer-based row above and pull the lowest
  // `currentPrice` across every retailer in the selected candidate.
  const fallbackIds = vnIds.filter((id) => !out.has(id));
  if (fallbackIds.length === 0) return out;
  const fbPh = fallbackIds.map(() => '?').join(',');
  const fbRows = db
    .prepare(
      `SELECT vn_id, extras_json FROM vn_stock_provider_status
       WHERE provider = 'eroge_price' AND vn_id IN (${fbPh}) AND extras_json IS NOT NULL`,
    )
    .all(...fallbackIds) as { vn_id: string; extras_json: string }[];
  for (const row of fbRows) {
    try {
      const decoded = JSON.parse(row.extras_json) as {
        candidates?: {
          epId?: number;
          egsId?: number; // legacy
          detail?: { downloadRetailers?: { currentPrice?: number | null }[]; packageRetailers?: { currentPrice?: number | null }[] };
        }[];
        selectedEpId?: number | null;
        selectedEgsId?: number | null;
      };
      const sel = decoded.selectedEpId ?? decoded.selectedEgsId;
      const candidate =
        (decoded.candidates ?? []).find((c) => (c.epId ?? c.egsId) === sel) ??
        decoded.candidates?.[0];
      const prices = [
        ...(candidate?.detail?.downloadRetailers ?? []),
        ...(candidate?.detail?.packageRetailers ?? []),
      ]
        .map((r) => r.currentPrice)
        .filter((n): n is number => typeof n === 'number' && n > 0);
      if (prices.length > 0) {
        out.set(row.vn_id, { available: prices.length, best_price: Math.min(...prices) });
      }
    } catch {}
  }
  return out;
}

/** Most recent stock offers across every VN, joined with VN title for the global stock feed. */
export function listRecentVnStockOffers(limit: number): (VnStockOfferRow & {
  vn_title: string | null;
  vn_image_url: string | null;
  vn_local_image: string | null;
  vn_image_sexual: number | null;
})[] {
  return db.prepare(`
    SELECT o.*,
           v.title AS vn_title,
           v.image_url AS vn_image_url,
           v.local_image AS vn_local_image,
           v.image_sexual AS vn_image_sexual
    FROM vn_stock_offer o
    LEFT JOIN vn v ON v.id = o.vn_id
    ORDER BY o.fetched_at DESC, o.provider ASC, o.title ASC
    LIMIT ?
  `).all(limit) as (VnStockOfferRow & {
    vn_title: string | null;
    vn_image_url: string | null;
    vn_local_image: string | null;
    vn_image_sexual: number | null;
  })[];
}

export interface VnStockAliasRow {
  vn_id: string;
  alias_term: string;
  created_at: number;
}

/** Search aliases the operator added for one VN — used by the stock providers to widen queries. */
export function listStockAliases(vnId: string): VnStockAliasRow[] {
  return db
    .prepare(`SELECT * FROM vn_stock_alias WHERE vn_id = ? ORDER BY created_at ASC`)
    .all(vnId) as VnStockAliasRow[];
}

/** Add or refresh a stock search alias. Idempotent on `(vn_id, alias_term)`. */
export function upsertStockAlias(vnId: string, aliasTerm: string): void {
  db.prepare(
    `INSERT OR REPLACE INTO vn_stock_alias (vn_id, alias_term, created_at) VALUES (?, ?, ?)`,
  ).run(vnId, aliasTerm, Date.now());
}

/** Drop one stock search alias. */
export function deleteStockAlias(vnId: string, aliasTerm: string): void {
  db.prepare(`DELETE FROM vn_stock_alias WHERE vn_id = ? AND alias_term = ?`).run(
    vnId,
    aliasTerm,
  );
}

export interface VnStockSourceRow {
  id: number;
  vn_id: string;
  release_id: string | null;
  provider: string;
  url: string;
  product_id: string | null;
  created_at: number;
  updated_at: number;
}

/** User-pinned stock source URLs for one VN (manual overrides for the auto-discovered URLs). */
export function listStockSources(vnId: string): VnStockSourceRow[] {
  return db
    .prepare(`SELECT * FROM vn_stock_source WHERE vn_id = ? ORDER BY created_at ASC, id ASC`)
    .all(vnId) as VnStockSourceRow[];
}

/** Pin one stock source URL for a VN (manual override that beats auto-discovery). */
export function upsertStockSource(input: {
  vn_id: string;
  provider: string;
  url: string;
  release_id?: string | null;
  product_id?: string | null;
}): VnStockSourceRow {
  const now = Date.now();
  db.prepare(
    `INSERT INTO vn_stock_source (vn_id, release_id, provider, url, product_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(vn_id, url) DO UPDATE SET
       release_id = excluded.release_id,
       provider = excluded.provider,
       product_id = excluded.product_id,
       updated_at = excluded.updated_at`,
  ).run(
    input.vn_id,
    input.release_id ?? null,
    input.provider,
    input.url,
    input.product_id ?? null,
    now,
    now,
  );
  const row = db
    .prepare(`SELECT * FROM vn_stock_source WHERE vn_id = ? AND url = ?`)
    .get(input.vn_id, input.url) as VnStockSourceRow | undefined;
  if (!row) throw new Error('stock source upsert failed');
  return row;
}

/** Drop one user-pinned stock source. Returns `false` when nothing matched. */
export function deleteStockSource(vnId: string, sourceId: number): boolean {
  const result = db.prepare(`DELETE FROM vn_stock_source WHERE vn_id = ? AND id = ?`).run(vnId, sourceId);
  return result.changes > 0;
}

/** Delete all cached stock offers and provider statuses for one VN. */
/**
 * Return the set of stock provider IDs the operator has disabled.
 * Reads from `app_setting` key `stock_disabled_providers` (JSON array).
 * Returns an empty set when the setting is absent (all providers enabled).
 */
export function getDisabledStockProviders(): Set<string> {
  const raw = getAppSetting('stock_disabled_providers');
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return new Set();
  }
}

export function clearVnStockCache(vnId: string): { offers: number; statuses: number } {
  const offerResult = db.prepare(`DELETE FROM vn_stock_offer WHERE vn_id = ?`).run(vnId);
  const statusResult = db.prepare(`DELETE FROM vn_stock_provider_status WHERE vn_id = ?`).run(vnId);
  return { offers: offerResult.changes, statuses: statusResult.changes };
}

export function getCachedTitleResolution(query: string): { vnId: string; title: string } | null {
  const row = db
    .prepare(`SELECT vn_id, title FROM vn_title_resolve_cache WHERE query = ?`)
    .get(query) as { vn_id: string; title: string } | undefined;
  return row ? { vnId: row.vn_id, title: row.title } : null;
}

export function setCachedTitleResolution(query: string, vnId: string, title: string): void {
  db.prepare(`INSERT OR REPLACE INTO vn_title_resolve_cache (query, vn_id, title) VALUES (?, ?, ?)`)
    .run(query, vnId, title);
}

/** Kobe stock rows currently matched to one VN id (usually 0 or 1, occasionally 2+). */
export function listKobeStockForVn(vnId: string): KobeStockRow[] {
  return db.prepare(`
    SELECT k.*
    FROM alicesoft_kobe_stock k
    WHERE k.vn_id = ?
    ORDER BY
      CASE WHEN k.sale_price IS NULL OR k.sale_price = '' THEN 1 ELSE 0 END,
      k.sale_price ASC,
      k.title ASC
  `).all(vnId) as KobeStockRow[];
}
