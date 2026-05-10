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
  ensureColumn(db, 'collection', 'location', "TEXT NOT NULL DEFAULT 'unknown'");
  ensureColumn(db, 'collection', 'edition_type', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'collection', 'edition_label', 'TEXT');
  ensureColumn(db, 'collection', 'physical_location', 'TEXT');
  ensureColumn(db, 'collection', 'box_type', "TEXT NOT NULL DEFAULT 'none'");
  ensureColumn(db, 'collection', 'download_url', 'TEXT');

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
  released?: string | null;
  olang?: string | null;
  languages?: string[];
  platforms?: string[];
  length_minutes?: number | null;
  length?: number | null;
  rating?: number | null;
  votecount?: number | null;
  description?: string | null;
  image?: { url?: string; thumbnail?: string; sexual?: number; violence?: number; dims?: [number, number] } | null;
  developers?: { id: string; name: string }[];
  tags?: { id: string; name: string; rating: number; spoiler: number }[];
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

export function upsertVn(vn: RawVnPayload): void {
  db.prepare(`
    INSERT INTO vn (id, title, alttitle, image_url, image_thumb, image_sexual, image_violence,
                    released, olang, languages, platforms, length_minutes, length, rating, votecount,
                    description, developers, tags, screenshots, relations, raw, fetched_at)
    VALUES (@id, @title, @alttitle, @image_url, @image_thumb, @image_sexual, @image_violence,
            @released, @olang, @languages, @platforms, @length_minutes, @length, @rating, @votecount,
            @description, @developers, @tags, @screenshots, @relations, @raw, @fetched_at)
    ON CONFLICT(id) DO UPDATE SET
      title=excluded.title, alttitle=excluded.alttitle, image_url=excluded.image_url,
      image_thumb=excluded.image_thumb, image_sexual=excluded.image_sexual, image_violence=excluded.image_violence,
      released=excluded.released, olang=excluded.olang,
      languages=excluded.languages, platforms=excluded.platforms,
      length_minutes=excluded.length_minutes, length=excluded.length,
      rating=excluded.rating, votecount=excluded.votecount,
      description=excluded.description, developers=excluded.developers,
      tags=excluded.tags, screenshots=excluded.screenshots, relations=excluded.relations,
      raw=excluded.raw, fetched_at=excluded.fetched_at
  `).run({
    id: vn.id,
    title: vn.title,
    alttitle: vn.alttitle ?? null,
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
    rating: vn.rating ?? null,
    votecount: vn.votecount ?? null,
    description: vn.description ?? null,
    developers: JSON.stringify((vn.developers ?? []).map((d) => ({ id: d.id, name: d.name }))),
    tags: JSON.stringify(
      (vn.tags ?? [])
        .slice(0, 25)
        .map((t) => ({ id: t.id, name: t.name, rating: t.rating, spoiler: t.spoiler })),
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
                            box_type, download_url, added_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    now,
    now,
  );
}

export function updateCollection(vnId: string, fields: CollectionPatch): void {
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
  };
  for (const key of Object.keys(map) as (keyof typeof map)[]) {
    if (key in fields) {
      sets.push(`${key} = ?`);
      params.push(map[key]((fields as Record<string, unknown>)[key]));
    }
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  params.push(Date.now());
  params.push(vnId);
  db.prepare(`UPDATE collection SET ${sets.join(', ')} WHERE vn_id = ?`).run(...params);
}

export function removeFromCollection(vnId: string): void {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(vnId);
}

export function isInCollection(vnId: string): boolean {
  return !!db.prepare('SELECT 1 FROM collection WHERE vn_id = ?').get(vnId);
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
  sort?:
    | 'updated_at'
    | 'added_at'
    | 'title'
    | 'rating'
    | 'user_rating'
    | 'playtime'
    | 'released'
    | 'producer';
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
  };
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
  let join = '';
  if (series) {
    join = 'JOIN series_vn sv ON sv.vn_id = v.id ';
    where.push('sv.series_id = ?');
    params.push(series);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db
    .prepare(`
      SELECT v.*, c.status, c.user_rating, c.playtime_minutes, c.started_date,
             c.finished_date, c.notes, c.favorite, c.location, c.edition_type,
             c.edition_label, c.physical_location, c.box_type, c.download_url,
             c.added_at, c.updated_at
      FROM collection c JOIN vn v ON v.id = c.vn_id
      ${join}
      ${whereSql}
      ORDER BY ${sortCol} ${dir} NULLS LAST
    `)
    .all(...params) as DbRow[];
  const items = rows.map((r) => rowToItem(r)!).filter(Boolean);
  for (const item of items) {
    item.series = listSeriesForVn(item.id);
  }
  return items;
}

export function getCollectionItem(vnId: string): CollectionItem | null {
  const row = db
    .prepare(`
      SELECT v.*, c.status, c.user_rating, c.playtime_minutes, c.started_date,
             c.finished_date, c.notes, c.favorite, c.location, c.edition_type,
             c.edition_label, c.physical_location, c.box_type, c.download_url,
             c.added_at, c.updated_at
      FROM vn v LEFT JOIN collection c ON c.vn_id = v.id
      WHERE v.id = ?
    `)
    .get(vnId) as DbRow | undefined;
  const item = rowToItem(row);
  if (item) item.series = listSeriesForVn(item.id);
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

  return {
    ratingDistribution,
    finishedByMonth,
    byLanguage,
    byPlatform,
    byLocation,
    byEdition,
    topTags: topTags.map((t) => ({ id: t.tag_id, name: t.tag_name, count: t.count })),
    byYear,
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
  added_at: number;
}

export function listOwnedReleasesForVn(vnId: string): OwnedReleaseRow[] {
  return db
    .prepare('SELECT * FROM owned_release WHERE vn_id = ? ORDER BY added_at DESC')
    .all(vnId) as OwnedReleaseRow[];
}

export function getOwnedRelease(vnId: string, releaseId: string): OwnedReleaseRow | null {
  return (db
    .prepare('SELECT * FROM owned_release WHERE vn_id = ? AND release_id = ?')
    .get(vnId, releaseId) as OwnedReleaseRow | undefined) ?? null;
}

export function markReleaseOwned(vnId: string, releaseId: string, notes: string | null = null): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO owned_release (vn_id, release_id, notes, added_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(vn_id, release_id) DO UPDATE SET notes = excluded.notes
  `).run(vnId, releaseId, notes, now);
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
