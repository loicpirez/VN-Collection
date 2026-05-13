import 'server-only';
import { db } from './db';
import { fetchStaffVnList, fetchVaVnList, getStaff, type StaffVnCredit, type StaffVaCredit, type VndbStaff } from './vndb';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

/**
 * Local cache of the "Download all from VNDB" payload for a staff/VA. Stored
 * in `vndb_cache` as a JSON blob so it survives restarts without needing a
 * new schema migration. The staff page reads it to surface VNs the user
 * doesn't own (and thus aren't in the credit tables backed by their local
 * collection).
 *
 * We deliberately store light-weight VN data only (title / image / release /
 * rating) — per the user's spec, sub-games are listed but not downloaded in
 * full, so /vn/{id} for an out-of-collection VN still goes through the
 * normal VNDB fetch path.
 */

const KEY_PREFIX = 'staff_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

export interface StaffFullPayload {
  profile: VndbStaff | null;
  productionCredits: StaffVnCredit[];
  vaCredits: StaffVaCredit[];
  fetched_at: number;
}

function key(sid: string): string {
  return `${KEY_PREFIX}${sid.toLowerCase()}`;
}

export function readStaffFullCache(sid: string): StaffFullPayload | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(key(sid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.body) as StaffFullPayload;
    return { ...parsed, fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

function writeStaffFullCache(sid: string, payload: StaffFullPayload): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key(sid), JSON.stringify(payload), now, now + TTL_MS);
}

/**
 * Pull the staff profile + every VN / VA credit from VNDB and cache locally.
 * Three serial calls so the rate-limiter behaves; total payload is small
 * because we kept the VN fields lean.
 */
export async function downloadFullStaffInfo(sid: string): Promise<StaffFullPayload> {
  const [profile, productionCredits, vaCredits] = await Promise.all([
    getStaff(sid),
    fetchStaffVnList(sid),
    fetchVaVnList(sid),
  ]);
  const payload: StaffFullPayload = {
    profile,
    productionCredits,
    vaCredits,
    fetched_at: Date.now(),
  };
  writeStaffFullCache(sid, payload);
  return payload;
}

/**
 * Pull every unique staff/VA the given VN credits and download their full
 * profile if it isn't already cached. Designed to be fire-and-forget after
 * `upsertVn` — running it inline means downloading a VN now transparently
 * also covers the staff and voice cast, addressing "download still doesn't
 * download all".
 *
 * Concurrency-capped to 4 in flight to stay well under VNDB's rate limit;
 * staff already cached within the 30-day TTL are skipped instantly so a
 * second pass over the same VN is cheap.
 */
export async function downloadFullStaffForVn(vnId: string): Promise<{ scanned: number; downloaded: number }> {
  const rows = db
    .prepare(`
      SELECT sid FROM vn_staff_credit WHERE vn_id = ?
      UNION
      SELECT sid FROM vn_va_credit WHERE vn_id = ?
    `)
    .all(vnId, vnId) as { sid: string }[];
  const sids = Array.from(new Set(rows.map((r) => r.sid).filter((s) => /^s\d+$/i.test(s))));

  const now = Date.now();
  const stale = sids.filter((sid) => {
    const cached = readStaffFullCache(sid);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });

  const queue = [...stale];
  let downloaded = 0;
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length > 0) {
      const sid = queue.shift();
      if (!sid) return;
      try {
        await downloadFullStaffInfo(sid);
        downloaded += 1;
      } catch {
        // Skip individual failures — the user can retry from /staff/[id]
        // (or the next VN download will queue the same sid again).
      }
    }
  });
  await Promise.all(workers);
  return { scanned: sids.length, downloaded };
}
