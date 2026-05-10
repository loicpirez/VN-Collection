import 'server-only';
import { createHash } from 'node:crypto';
import {
  deleteCacheByPathPrefix,
  deleteCacheKey,
  getCacheRow,
  putCacheRow,
  touchCacheRow,
  type CacheRow,
} from './db';

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
    return {
      data: JSON.parse(cached.body) as T,
      fromCache: true,
      status: 200,
      cachedAt: cached.fetched_at,
    };
  }

  const existing = inflight.get(key);
  if (existing) return existing as Promise<FetchResult<T>>;

  const p = (async (): Promise<FetchResult<T>> => {
    try {
      return await doFetch<T>(url, init, key, ttlMs, cached);
    } catch (err) {
      if (cached && staleWhileError) {
        return {
          data: JSON.parse(cached.body) as T,
          fromCache: true,
          status: 0,
          cachedAt: cached.fetched_at,
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
  const headers = new Headers(init.headers);
  if (cached?.etag) headers.set('If-None-Match', cached.etag);
  if (cached?.last_modified) headers.set('If-Modified-Since', cached.last_modified);

  const res = await fetch(url, { ...init, headers, cache: 'no-store' });
  const now = Date.now();

  if (res.status === 304 && cached) {
    if (ttlMs > 0) touchCacheRow(key, now, now + ttlMs);
    return {
      data: JSON.parse(cached.body) as T,
      fromCache: true,
      status: 304,
      cachedAt: cached.fetched_at,
    };
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`VNDB ${url} ${res.status}: ${text.slice(0, 300)}`);
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T) : ({} as T);

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

export function invalidateByPath(pathPrefix: string): number {
  return deleteCacheByPathPrefix(pathPrefix);
}

export function invalidateKey(method: string, path: string, body?: unknown): void {
  deleteCacheKey(buildKey(method.toUpperCase(), path, body));
}
