import 'server-only';
import { db, getAppSetting } from './db';
import { fetchStaffVnList, fetchVaVnList, getStaff, type StaffVnCredit, type StaffVaCredit, type VndbStaff } from './vndb';
import { finishJob, jobLabel, recordError, setJobCurrent, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonRecord } from './json-shape';
import { decodeVndbStaff } from './vndb-profile-row-shape';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

/** Read the user's auto-fan-out toggle. Default ON; '0' means disabled. */
function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
}

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

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

function decodeArray<T>(value: unknown, decode: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > 5000) return null;
  const out: T[] = [];
  for (const item of value) {
    const decoded = decode(item);
    if (!decoded) return null;
    out.push(decoded);
  }
  return out;
}

function decodeStaffProfile(value: unknown): VndbStaff | null | undefined {
  if (value === null) return null;
  return decodeVndbStaff(value) ?? undefined;
}

function decodeStaffVnCredit(value: unknown): StaffVnCredit | null {
  const row = asJsonRecord(value);
  const roles = decodeArray(row?.roles, (role) => {
      const item = asJsonRecord(role);
      return item && typeof item.role === 'string' && isNullableString(item.note)
        ? { role: item.role, note: item.note }
        : null;
    });
  if (
    !row ||
    typeof row.id !== 'string' ||
    !isVndbVnId(row.id) ||
    typeof row.title !== 'string' ||
    !isNullableString(row.alttitle) ||
    !isNullableString(row.released) ||
    !isNullableFiniteNumber(row.rating) ||
    !isNullableString(row.image_url) ||
    !isNullableString(row.image_thumb) ||
    !roles
  ) return null;
  return {
    id: normalizeVnId(row.id),
    title: row.title,
    alttitle: row.alttitle,
    released: row.released,
    rating: row.rating,
    image_url: row.image_url,
    image_thumb: row.image_thumb,
    roles,
  };
}

function decodeStaffVaCredit(value: unknown): StaffVaCredit | null {
  const row = asJsonRecord(value);
  const characters = decodeArray(row?.characters, (character) => {
      const item = asJsonRecord(character);
      return item &&
        typeof item.id === 'string' &&
        /^c\d+$/i.test(item.id) &&
        typeof item.name === 'string' &&
        isNullableString(item.original) &&
        isNullableString(item.image_url) &&
        isNullableString(item.note)
        ? {
            id: item.id.toLowerCase(),
            name: item.name,
            original: item.original,
            image_url: item.image_url,
            note: item.note,
          }
        : null;
    });
  if (
    !row ||
    typeof row.id !== 'string' ||
    !isVndbVnId(row.id) ||
    typeof row.title !== 'string' ||
    !isNullableString(row.alttitle) ||
    !isNullableString(row.released) ||
    !isNullableFiniteNumber(row.rating) ||
    !isNullableString(row.image_url) ||
    !isNullableString(row.image_thumb) ||
    !characters
  ) return null;
  return {
    id: normalizeVnId(row.id),
    title: row.title,
    alttitle: row.alttitle,
    released: row.released,
    rating: row.rating,
    image_url: row.image_url,
    image_thumb: row.image_thumb,
    characters,
  };
}

/**
 * Decode a stored staff full-cache payload.
 *
 * @param raw Stored JSON text.
 * @param fetchedAt Cache-row freshness timestamp.
 * @returns A structurally usable payload, or `null` for malformed input.
 */
export function decodeStaffFullPayload(raw: string | null | undefined, fetchedAt: number): StaffFullPayload | null {
  const parsed = parseJsonRecord(raw);
  const profile = decodeStaffProfile(parsed?.profile);
  const productionCredits = decodeArray(parsed?.productionCredits, decodeStaffVnCredit);
  const vaCredits = decodeArray(parsed?.vaCredits, decodeStaffVaCredit);
  if (
    !parsed
    || profile === undefined
    || !productionCredits
    || !vaCredits
  ) return null;
  return {
    profile,
    productionCredits,
    vaCredits,
    fetched_at: fetchedAt,
  };
}

/**
 * `null` on miss or parse error so callers can decide between cache miss
 * and live re-fetch.
 */
export function readStaffFullCache(sid: string): StaffFullPayload | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(key(sid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  return decodeStaffFullPayload(row.body, row.fetched_at);
}

function writeStaffFullCache(sid: string, payload: StaffFullPayload): void {
  const now = Date.now();
  const txn = db.transaction(() => {
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES (?, ?, NULL, NULL, ?, ?)
      ON CONFLICT(cache_key) DO UPDATE SET
        body = excluded.body,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at
    `).run(key(sid), JSON.stringify(payload), now, now + TTL_MS);
    db.prepare('DELETE FROM staff_credit_index WHERE sid = ?').run(sid);
    const ins = db.prepare('INSERT OR IGNORE INTO staff_credit_index (sid, vn_id, is_va) VALUES (?, ?, ?)');
    for (const c of payload.productionCredits) ins.run(sid, c.id, 0);
    for (const c of payload.vaCredits) ins.run(sid, c.id, 1);
  });
  txn();
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
export async function downloadFullStaffForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
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

  if (stale.length === 0) return { scanned: sids.length, downloaded: 0 };
  const job = startJob('staff', jobLabel('staff_for_vn', `Staff for ${vnId}`, { vnId }), stale.length, vnId);

  let downloaded = 0;
  // Strictly sequential — the global vndb-throttle already caps everything
  // at 1 req/sec, so internal concurrency just bloats the in-flight queue
  // without speeding anything up.
  for (const sid of stale) {
    setJobCurrent(job.id, sid);
    try {
      await downloadFullStaffInfo(sid);
      downloaded += 1;
    } catch (e) {
      recordError(job.id, sid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: sids.length, downloaded };
}
