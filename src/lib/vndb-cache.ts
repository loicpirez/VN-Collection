import 'server-only';
import { createHash } from 'node:crypto';
import {
  deleteCacheByPathPrefix,
  deleteCacheKey,
  getAppSetting,
  getCacheRow,
  putCacheRow,
  touchCacheRow,
  type CacheRow,
} from './db';
import type { ProviderId } from './proxy-config';
import { throttledFetch } from './vndb-throttle';
import { assertNoPrivateIpRebind, isAllowedHttpTarget } from './url-allowlist';

const DEFAULT_BACKUP = 'https://api.yorhel.org/kana';
const PRIMARY = 'https://api.vndb.org/kana';

/**
 * Stream a `Response` body into a UTF-8 string with a hard byte cap. Returns
 * `null` when the cap is exceeded so callers can surface a typed error
 * instead of letting `res.text()` buffer an unbounded payload (a hostile
 * user-configured mirror could otherwise OOM the Node process).
 */
async function readResponseTextWithCap(res: Response, maxBytes: number): Promise<string | null> {
  const cl = res.headers.get('content-length');
  if (cl && parseInt(cl, 10) > maxBytes) return null;
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('cap exceeded').catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
}

/**
 * Returns the configured backup base URL when fallback is enabled, else null.
 * Only consulted from doFetch() — write helpers (PATCH/DELETE /ulist) never
 * fall back because the mirror is read-only and would 404 / refuse writes.
 */
function backupBase(): string | null {
  if (getAppSetting('vndb_backup_enabled') !== '1') return null;
  return (getAppSetting('vndb_backup_url') ?? DEFAULT_BACKUP).replace(/\/+$/, '');
}

/**
 * Build the mirror URL by swapping the primary base when present. Returns
 * null if the request doesn't look like a primary VNDB call (so we don't
 * blindly re-issue, say, an EGS or Steam fetch against yorhel.org).
 */
function mirrorUrl(url: string): string | null {
  const base = backupBase();
  if (!base) return null;
  if (!url.startsWith(PRIMARY)) return null;
  const candidate = base + url.slice(PRIMARY.length);
  // Defence in depth: even though the settings API already validates
  // `vndb_backup_url` against `^https?://…`, an attacker who got
  // through the settings gate could point this at
  // http://169.254.169.254 to exfiltrate cloud metadata. Run the
  // built mirror URL through the shared SSRF allowlist — non-VNDB
  // hosts are rejected here too.
  return isAllowedHttpTarget(candidate) ? candidate : null;
}

export const TTL = {
  vnDetail: 24 * 60 * 60 * 1000,
  vnSearch: 5 * 60 * 1000,
  producer: 24 * 60 * 60 * 1000,
  characters: 7 * 24 * 60 * 60 * 1000,
  releases: 7 * 24 * 60 * 60 * 1000,
  quotesByVn: 7 * 24 * 60 * 60 * 1000,
  quotesRandom: 0,
  stats: 60 * 60 * 1000,
  schema: 7 * 24 * 60 * 60 * 1000,
  authInfo: 60 * 60 * 1000,
  user: 24 * 60 * 60 * 1000,
  tag: 60 * 60 * 1000,
  trait: 60 * 60 * 1000,
  staff: 60 * 60 * 1000,
  characterById: 24 * 60 * 60 * 1000,
  releaseById: 24 * 60 * 60 * 1000,
} as const;

/**
 * Cache key shape: `<pathTag>|<METHOD>|<body-hash>`.
 *
 * The leading `<pathTag>` segment is what `db.ts:getCacheFreshness`
 * uses to filter cache rows by `cache_key LIKE '<pathTag>|%'` (the
 * trailing pipe is the segment boundary). New `cachedFetch` callers
 * must therefore set `__pathTag` to a stable, prefix-unique value —
 * defaulting to `<METHOD> <path>` works for routes that follow the
 * `POST /vn` / `GET /trait` convention; bespoke pathTags (e.g.
 * `staff_full:<sid>`) need to keep the pipe-separator shape or the
 * freshness chip on the consumer page will silently render blank.
 */
function buildKey(method: string, path: string, body?: unknown): string {
  if (!body) return `${path}|${method}|`;
  const hash = createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 16);
  return `${path}|${method}|${hash}`;
}

export interface FetchResult<T> {
  data: T;
  fromCache: boolean;
  status: number;
  cachedAt: number;
  /**
   * `true` when the fetch upstream failed and the result is being
   * served from the cached body as a stale-while-error fallback.
   * Distinct from `fromCache` (which is also true on a regular hit
   * before TTL expiry) and from `status: 304` (a real conditional
   * revalidation). Callers can surface a warning to the user.
   */
  stale?: boolean;
}

export interface CachedFetchOptions {
  ttlMs: number;
  /** When 0, the cache is bypassed entirely (no read, no write). */
  staleWhileError?: boolean;
}

const inflight = new Map<string, Promise<FetchResult<unknown>>>();

export async function cachedFetch<T>(
  url: string,
  init: RequestInit & { __pathTag?: string },
  { ttlMs, staleWhileError = true }: CachedFetchOptions,
): Promise<FetchResult<T>> {
  const path = init.__pathTag ?? new URL(url).pathname;
  const method = (init.method ?? 'GET').toUpperCase();
  const body = init.body ? safeParse(init.body) : undefined;
  const key = buildKey(method, path, body);
  const now = Date.now();

  if (ttlMs <= 0) {
    return doFetch<T>(url, init, key, ttlMs);
  }

  const cached = getCacheRow(key);
  if (cached && now < cached.expires_at) {
    let data: T | undefined;
    try {
      data = JSON.parse(cached.body) as T;
    } catch (e) {
      // LIB-audit hardening: a corrupted/truncated cache row used to throw
      // an uncaught error here and surface as a 500. Treat the parse
      // failure as a cache miss instead, so the next branch re-fetches
      // from upstream and the bad row is overwritten.
      console.warn(`[vndb-cache] corrupt body for ${key}, treating as miss: ${(e as Error).message}`);
    }
    if (data !== undefined) {
      return {
        data,
        fromCache: true,
        status: 200,
        cachedAt: cached.fetched_at,
      };
    }
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<FetchResult<T>>;

  const p = (async (): Promise<FetchResult<T>> => {
    try {
      return await doFetch<T>(url, init, key, ttlMs, cached);
    } catch (err) {
      if (cached && staleWhileError) {
        let staleData: T;
        try {
          staleData = JSON.parse(cached.body) as T;
        } catch {
          throw err;
        }
        return {
          data: staleData,
          fromCache: true,
          status: 0,
          cachedAt: cached.fetched_at,
          stale: true,
        };
      }
      throw err;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p as Promise<FetchResult<unknown>>);
  return p;
}

async function doFetch<T>(
  url: string,
  init: RequestInit,
  key: string,
  ttlMs: number,
  cached?: CacheRow | null,
): Promise<FetchResult<T>> {
  // R5-125: gate the PRIMARY URL through the SSRF allowlist
  // before issuing any request. `mirrorUrl()` (used below) already
  // re-checks the rewritten URL, but the unrewritten path was an
  // implicit-trust gap: a caller that constructed an arbitrary
  // `https://api.vndb.org/...` would always pass, while a regressed
  // caller that built `http://169.254.169.254/...` would have hit
  // throttledFetch unguarded. The allowlist enforces both the
  // host AND the http(s)-only scheme rule, so the catch-all
  // refuses anything that isn't a known upstream.
  if (!isAllowedHttpTarget(url)) {
    throw new Error(`vndb-cache: refusing fetch to non-allowlisted URL ${url}`);
  }
  // Auth-bearing calls must hit the primary — the mirror is read-only and
  // does not have the user's token / list data.
  const isAuthed = !!new Headers(init.headers).get('Authorization');
  let mirror = isAuthed ? null : mirrorUrl(url);

  // AUD-SEC-016: DNS rebinding defence for the user-configured backup URL.
  // Resolve the mirror hostname before using it; reject if any returned
  // IPv4 address falls in a private/loopback range. Failure suppresses the
  // mirror path rather than breaking primary fetches.
  if (mirror) {
    try {
      await assertNoPrivateIpRebind(new URL(mirror).hostname);
    } catch {
      mirror = null;
    }
  }

  try {
    return await fetchOnce<T>(url, init, key, ttlMs, cached);
  } catch (err) {
    if (!mirror) throw err;
    // Try the mirror exactly once. If it also fails we surface the original
    // error so the user sees the real reason (and so cached fallback still
    // works inside cachedFetch's outer catch).
    try {
      return await fetchOnce<T>(mirror, init, key, ttlMs, cached);
    } catch {
      throw err;
    }
  }
}

async function fetchOnce<T>(
  url: string,
  init: RequestInit,
  key: string,
  ttlMs: number,
  cached?: CacheRow | null,
): Promise<FetchResult<T>> {
  const headers = new Headers(init.headers);
  if (cached?.etag) headers.set('If-None-Match', cached.etag);
  if (cached?.last_modified) headers.set('If-Modified-Since', cached.last_modified);

  const provider: ProviderId = url.startsWith(PRIMARY) ? 'vndb' : 'vndbmirror';
  const res = await throttledFetch(url, { ...init, headers, cache: 'no-store' }, provider);
  const now = Date.now();

  if (res.status === 304 && cached) {
    if (ttlMs > 0) touchCacheRow(key, now, now + ttlMs);
    let cachedData: T;
    try {
      cachedData = JSON.parse(cached.body) as T;
    } catch {
      throw new Error(`vndb-cache: corrupt cache body for key ${key} (304 path)`);
    }
    return {
      data: cachedData,
      fromCache: true,
      status: 304,
      cachedAt: cached.fetched_at,
    };
  }

  // Cap upstream response so a malicious user-configured mirror can't
  // OOM the Node process. 32 MiB is generous for any single VNDB
  // response (the largest legitimate payloads — `/vn` with 100 results
  // and every JSON column — land around 2-3 MB). The primary
  // `api.vndb.org` is trusted, but the cap also applies to it as
  // defence-in-depth.
  const MAX_VNDB_BYTES = 32 * 1024 * 1024;
  const text = await readResponseTextWithCap(res, MAX_VNDB_BYTES);
  if (text == null) {
    throw new Error(`VNDB ${url} ${res.status}: response exceeded ${MAX_VNDB_BYTES} bytes`);
  }

  if (!res.ok) {
    throw new Error(`VNDB ${url} ${res.status}: ${text.slice(0, 300)}`);
  }

  let data: T;
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T);
  } catch {
    throw new Error(`VNDB ${url}: non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }

  if (ttlMs > 0) {
    putCacheRow({
      cache_key: key,
      body: text,
      etag: res.headers.get('etag'),
      last_modified: res.headers.get('last-modified'),
      fetched_at: now,
      expires_at: now + ttlMs,
    });
  }

  return { data, fromCache: false, status: res.status, cachedAt: now };
}

function safeParse(body: BodyInit): unknown {
  if (typeof body !== 'string') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

/**
 * Drop every cache row whose key matches the supplied path prefix. Used by
 * the refresh-scope route to bust grouped caches in one call. Returns the
 * deleted-row count.
 */
export function invalidateByPath(pathPrefix: string): number {
  return deleteCacheByPathPrefix(pathPrefix);
}

/**
 * Drop the single cache row matching `method + path + body` so the next
 * request goes upstream. Mirrors the exact key shape used by `cachedFetch`.
 */
export function invalidateKey(method: string, path: string, body?: unknown): void {
  deleteCacheKey(buildKey(method.toUpperCase(), path, body));
}

/**
 * Read a cache entry directly without making any network request.
 * Returns null if the cache_key has never been populated.
 */
export function readCachedJson<T>(method: string, pathTag: string, body?: unknown): T | null {
  const key = buildKey(method.toUpperCase(), pathTag, body);
  const row = getCacheRow(key);
  if (!row) return null;
  try {
    return JSON.parse(row.body) as T;
  } catch {
    return null;
  }
}
