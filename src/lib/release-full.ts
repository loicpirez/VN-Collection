import 'server-only';
import { db, getAppSetting } from './db';
import { getReleasesForVn, getRelease, type VndbRelease } from './vndb';
import { finishJob, recordError, startJob, tickJob } from './download-status';

const CACHE_FRESH_MS = 30 * 24 * 3600 * 1000;
const KEY_PREFIX = 'release_full:';
const TTL_MS = 30 * 24 * 3600 * 1000;

function fanoutEnabled(): boolean {
  return getAppSetting('vndb_fanout') !== '0';
}

function key(rid: string): string {
  return `${KEY_PREFIX}${rid.toLowerCase()}`;
}

export interface ReleaseFullPayload {
  release: VndbRelease;
  fetched_at: number;
}

export function readReleaseFullCache(rid: string): ReleaseFullPayload | null {
  const row = db
    .prepare('SELECT body, fetched_at FROM vndb_cache WHERE cache_key = ?')
    .get(key(rid)) as { body: string; fetched_at: number } | undefined;
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.body) as ReleaseFullPayload;
    return { ...parsed, fetched_at: row.fetched_at };
  } catch {
    return null;
  }
}

function writeReleaseFullCache(rid: string, payload: ReleaseFullPayload): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key(rid), JSON.stringify(payload), now, now + TTL_MS);
}

/**
 * Fetch one release with every documented field and cache locally.
 */
export async function downloadFullReleaseInfo(rid: string): Promise<ReleaseFullPayload | null> {
  const release = await getRelease(rid);
  if (!release) return null;
  const payload: ReleaseFullPayload = { release, fetched_at: Date.now() };
  writeReleaseFullCache(rid, payload);
  return payload;
}

/**
 * Walk every `screenshots[].release.id` on a VN and persist the full
 * release record for each one. VNDB docs explicitly recommend selecting
 * `screenshots.release.id` on the parent VN query and fetching the rest
 * via a follow-up `/release` call — this is that follow-up call.
 */
export async function downloadScreenshotReleasesForVn(
  vnId: string,
  opts: { force?: boolean } = {},
): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  type LocalVn = { raw: string | null } | null;
  const row = (await import('./db')).db
    .prepare('SELECT raw FROM vn WHERE id = ?')
    .get(vnId) as LocalVn;
  if (!row?.raw) return { scanned: 0, downloaded: 0 };
  let parsed: { screenshots?: { release?: { id?: string } | null }[] };
  try {
    parsed = JSON.parse(row.raw) as { screenshots?: { release?: { id?: string } | null }[] };
  } catch {
    return { scanned: 0, downloaded: 0 };
  }
  const ids = Array.from(new Set(
    (parsed.screenshots ?? [])
      .map((s) => s?.release?.id ?? null)
      .filter((s): s is string => !!s && /^r\d+$/i.test(s)),
  ));
  if (ids.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const stale = ids.filter((rid) => {
    const cached = readReleaseFullCache(rid);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: ids.length, downloaded: 0 };

  const job = startJob('vn-fetch', `Screenshot releases for ${vnId}`, stale.length, vnId);
  let downloaded = 0;
  for (const rid of stale) {
    try {
      const payload = await downloadFullReleaseInfo(rid);
      if (payload) downloaded += 1;
    } catch (e) {
      recordError(job.id, rid, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: ids.length, downloaded };
}

/**
 * Pull every release linked to the given VN and cache each individually with
 * the full RELEASE_FIELDS payload. Mirrors the staff/character/producer
 * fan-out so "Download all" truly fans into releases too.
 */
export async function downloadFullReleasesForVn(vnId: string, opts: { force?: boolean } = {}): Promise<{ scanned: number; downloaded: number }> {
  if (!opts.force && !fanoutEnabled()) return { scanned: 0, downloaded: 0 };
  let releases: VndbRelease[] = [];
  try {
    releases = await getReleasesForVn(vnId, 100);
  } catch {
    return { scanned: 0, downloaded: 0 };
  }
  if (releases.length === 0) return { scanned: 0, downloaded: 0 };

  const now = Date.now();
  const stale = releases.filter((r) => {
    const cached = readReleaseFullCache(r.id);
    return !cached || now - cached.fetched_at > CACHE_FRESH_MS;
  });
  if (stale.length === 0) return { scanned: releases.length, downloaded: 0 };

  const job = startJob('vn-fetch', `Releases for ${vnId}`, stale.length, vnId);
  let downloaded = 0;
  for (const r of stale) {
    try {
      const payload: ReleaseFullPayload = { release: r, fetched_at: now };
      writeReleaseFullCache(r.id, payload);
      downloaded += 1;
    } catch (e) {
      recordError(job.id, r.id, (e as Error).message);
    } finally {
      tickJob(job.id);
    }
  }
  finishJob(job.id);
  return { scanned: releases.length, downloaded };
}
