import 'server-only';
import { db } from './db';
import { fetchStaffVnList, fetchVaVnList, getStaff, type StaffVnCredit, type StaffVaCredit, type VndbStaff } from './vndb';

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
