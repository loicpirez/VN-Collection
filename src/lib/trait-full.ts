import 'server-only';
import { db, getAppSetting } from './db';
import { getTrait, type VndbTrait } from './vndb';
import { finishJob, jobLabel, recordError, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonRecord } from './json-shape';
import { decodeCharacterFullPayload } from './character-full';
import { decodeVndbTrait } from './vndb-profile-row-shape';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'trait_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
}

function key(iid: string): string {
  return `${KEY_PREFIX}${iid.toLowerCase()}`;
}

export interface TraitFullPayload {
  trait: VndbTrait;
  fetched_at: number;
}

/**
 * Read the cached full-trait payload, or `null` on miss / parse error.
 * Lets trait tooltips and the /trait page render from cache before any
 * live VNDB fetch.
 */
export function readTraitFullCache(iid: string): TraitFullPayload | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(key(iid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  const parsed = parseJsonRecord(row.body);
  const trait = decodeVndbTrait(parsed?.trait);
  return trait ? { trait, fetched_at: row.fetched_at } : null;
}

function writeTraitFullCache(iid: string, payload: TraitFullPayload): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key(iid), JSON.stringify(payload), now, now + TTL_MS);
}

/**
 * Fetch one trait with the full `VndbTrait` payload and persist it in
 * the cache. Returns `null` when VNDB doesn't recognise the id.
 */
export async function downloadFullTraitInfo(iid: string): Promise<TraitFullPayload | null> {
  const trait = await getTrait(iid);
  if (!trait) return null;
  const payload: TraitFullPayload = { trait, fetched_at: Date.now() };
  writeTraitFullCache(iid, payload);
  return payload;
}

/**
 * For every trait used by characters of the given VN, cache the full trait
 * record (description, aliases, char_count, sexual, group, etc.).
 */
export async function downloadFullTraitsForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  // Narrow via the index (vn_id → character_id) instead of scanning every
  // cached character_full body.
  const cidRows = db
    .prepare('SELECT character_id FROM character_vn_index WHERE vn_id = ?')
    .all(vnId) as { character_id: string }[];
  const ids = new Set<string>();
  if (cidRows.length > 0) {
    const keys = cidRows.map((r) => `char_full:${r.character_id.toLowerCase()}`);
    // Chunk to stay under SQLite's SQLITE_MAX_VARIABLE_NUMBER (default
    // 999) — a VN that credits hundreds of characters would otherwise
    // crash the prepared statement at runtime. Matches the convention
    // in lib/db.ts (`isInCollectionMany`, `getEgsForVns`).
    const CHUNK = 500;
    for (let i = 0; i < keys.length; i += CHUNK) {
      const chunk = keys.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT body FROM vndb_cache WHERE cache_key IN (${placeholders})`)
        .all(...chunk) as { body: string }[];
      for (const r of rows) {
        const parsed = decodeCharacterFullPayload(r.body, 0);
        for (const value of parsed?.profile?.traits ?? []) {
          const trait = asJsonRecord(value);
          if (typeof trait?.id === 'string' && /^i\d+$/i.test(trait.id)) ids.add(trait.id);
        }
      }
    }
  }
  if (ids.size === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const stale = Array.from(ids).filter((iid) => {
    const cached = readTraitFullCache(iid);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: ids.size, downloaded: 0 };

  const job = startJob('vn-fetch', jobLabel('traits_for_vn', `Traits for ${vnId}`, { vnId }), stale.length, vnId);
  let downloaded = 0;
  for (const iid of stale) {
    try {
      await downloadFullTraitInfo(iid);
      downloaded += 1;
    } catch (e) {
      recordError(job.id, iid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.size, downloaded };
}
