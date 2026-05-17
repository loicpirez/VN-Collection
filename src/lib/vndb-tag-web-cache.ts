import 'server-only';
import { getCacheRow, putCacheRow } from './db';
import { fetchVndbWebHtml } from './vndb-scrape';
import {
  parseVndbTagHomeTree,
  parseVndbTagWebDetail,
  type VndbTagHomeTree,
  type VndbTagWebDetail,
} from './vndb-tag-web-parser';

const TTL_MS = 7 * 24 * 3600 * 1000;
const HOME_KEY = 'vndb-tag-web:home';
const DETAIL_KEY_PREFIX = 'vndb-tag-web:detail:';

export interface VndbTagWebCacheResult<T> {
  data: T;
  fetched_at: number;
  stale: boolean;
  source_url: string;
  warning?: string | null;
}

interface Stored<T> {
  data: T;
  source_url: string;
}

function now() {
  return Date.now();
}

function readParsed<T>(cacheKey: string): VndbTagWebCacheResult<T> | null {
  const row = getCacheRow(cacheKey);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.body) as Stored<T>;
    return {
      data: parsed.data,
      fetched_at: row.fetched_at,
      stale: row.expires_at <= now(),
      source_url: parsed.source_url,
      warning: row.expires_at <= now() ? 'stale-cache' : null,
    };
  } catch {
    return null;
  }
}

function writeParsed<T>(cacheKey: string, sourceUrl: string, data: T): VndbTagWebCacheResult<T> {
  const fetchedAt = now();
  putCacheRow({
    cache_key: cacheKey,
    body: JSON.stringify({ data, source_url: sourceUrl } satisfies Stored<T>),
    etag: null,
    last_modified: null,
    fetched_at: fetchedAt,
    expires_at: fetchedAt + TTL_MS,
  });
  return { data, fetched_at: fetchedAt, stale: false, source_url: sourceUrl, warning: null };
}

export function readVndbTagHomeTreeCache(): VndbTagWebCacheResult<VndbTagHomeTree> | null {
  return readParsed<VndbTagHomeTree>(HOME_KEY);
}

export function readVndbTagWebDetailCache(tagId: string): VndbTagWebCacheResult<VndbTagWebDetail> | null {
  return readParsed<VndbTagWebDetail>(`${DETAIL_KEY_PREFIX}${tagId.toLowerCase()}`);
}

export async function getVndbTagHomeTree(opts: { force?: boolean } = {}): Promise<VndbTagWebCacheResult<VndbTagHomeTree>> {
  const cached = readVndbTagHomeTreeCache();
  if (cached && !cached.stale && !opts.force) return cached;

  const html = await fetchVndbWebHtml('/g', { force: opts.force });
  if (!html) {
    if (cached) return { ...cached, stale: true, warning: 'VNDB unreachable; stale tag hierarchy shown.' };
    throw new Error('VNDB tag hierarchy is unavailable and no local cache exists.');
  }
  return writeParsed(HOME_KEY, 'https://vndb.org/g', parseVndbTagHomeTree(html));
}

export async function getVndbTagWebDetail(
  tagId: string,
  opts: { force?: boolean } = {},
): Promise<VndbTagWebCacheResult<VndbTagWebDetail>> {
  const id = tagId.toLowerCase();
  const key = `${DETAIL_KEY_PREFIX}${id}`;
  const cached = readParsed<VndbTagWebDetail>(key);
  if (cached && !cached.stale && !opts.force) return cached;

  const html = await fetchVndbWebHtml(`/${id}`, { force: opts.force });
  if (!html) {
    if (cached) return { ...cached, stale: true, warning: `VNDB unreachable; stale ${id} tag hierarchy shown.` };
    throw new Error(`VNDB tag page ${id} is unavailable and no local cache exists.`);
  }
  return writeParsed(key, `https://vndb.org/${id}`, parseVndbTagWebDetail(html, id));
}

export async function refreshVndbTagWebCache(): Promise<void> {
  await getVndbTagHomeTree({ force: true });
}
