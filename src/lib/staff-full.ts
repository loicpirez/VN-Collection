import 'server-only';
import { fetchStaffVnList, fetchVaVnList, getStaff, type StaffVnCredit, type StaffVaCredit, type VndbStaff } from './vndb';
import { finishJob, jobLabel, recordError, setJobCurrent, startJob, tickJob } from './download-status';
import { asJsonRecord, parseJsonRecord } from './json-shape';
import { decodeVndbStaff } from './vndb-profile-row-shape';
import { isVndbVnId, normalizeVnId } from './vn-id-shape';
import { getAppSettingRepository } from './db/repositories/app-setting';
import { getCacheRepository, type CacheRow } from './db/repositories/cache';
import { getPeopleRepository } from './db/repositories/people';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;

/** Read the user's auto-fan-out toggle. Default ON; '0' means disabled. */
async function fanoutEnabled(): Promise<boolean> {
  return await getAppSettingRepository().get('vndb_fanout') !== '0';
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
function decodeStaffCacheRow(row: Pick<CacheRow, 'body' | 'fetched_at'> | null): StaffFullPayload | null {
  if (!row) return null;
  return decodeStaffFullPayload(row.body, row.fetched_at);
}

export async function readStaffFullCache(sid: string): Promise<StaffFullPayload | null> {
  return decodeStaffCacheRow(await getCacheRepository().get(key(sid)));
}

async function writeStaffFullCache(sid: string, payload: StaffFullPayload): Promise<void> {
  const now = Date.now();
  await getPeopleRepository().persistStaffFullCache({
    staffId: sid,
    body: JSON.stringify(payload),
    fetchedAt: now,
    expiresAt: now + TTL_MS,
    productionVnIds: payload.productionCredits.map((credit) => credit.id),
    voiceVnIds: payload.vaCredits.map((credit) => credit.id),
  });
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
  await writeStaffFullCache(sid, payload);
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
  if (!opts.force && !await fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  const sids = (await getPeopleRepository().staffIdsForVn(vnId))
    .filter((staffId) => /^s\d+$/i.test(staffId));

  const now = Date.now();
  const cacheRows = await getCacheRepository().getMany(sids.map(key));
  const stale = sids.filter((sid) => {
    const cached = decodeStaffCacheRow(cacheRows.get(key(sid)) ?? null);
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
