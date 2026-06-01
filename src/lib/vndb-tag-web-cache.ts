import 'server-only';
import { getCacheRow, putCacheRow } from './db';
import { asJsonRecord } from './json-shape';
import { isAllowedHttpTarget } from './url-allowlist';
import { fetchVndbWebHtml } from './vndb-scrape';
import {
  parseVndbTagHomeTree,
  parseVndbTagWebDetail,
  type VndbTagBreadcrumb,
  type VndbTagHomeTree,
  type VndbTagListItem,
  type VndbTagTreeGroup,
  type VndbTagTreeNode,
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

function isOptionalNullableNumber(value: unknown): value is number | null | undefined {
  return value === undefined || value === null || (typeof value === 'number' && Number.isFinite(value));
}

function isOptionalNullableString(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === 'string';
}

function isOptionalRecentlyTaggedHref(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || value === '/g/links';
}

function isOptionalNullableBoolean(value: unknown): value is boolean | null | undefined {
  return value === undefined || value === null || typeof value === 'boolean';
}

function isCanonicalTagHref(id: string, href: unknown): href is string {
  return href === `/tag/${id.toLowerCase()}?tab=vndb`;
}

function isTagTreeNode(value: unknown, depth = 0): value is VndbTagTreeNode {
  if (depth > 8) return false;
  const row = asJsonRecord(value);
  if (
    row === null
    || typeof row.id !== 'string'
    || !/^g\d+$/i.test(row.id)
    || typeof row.name !== 'string'
    || !isCanonicalTagHref(row.id, row.href)
    || !isOptionalNullableNumber(row.count)
    || !isOptionalNullableNumber(row.moreCount)
  ) {
    return false;
  }
  return row.children === undefined
    || (Array.isArray(row.children) && row.children.every((child) => isTagTreeNode(child, depth + 1)));
}

function isTagTreeGroup(value: unknown): value is VndbTagTreeGroup {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.id === 'string'
    && /^g\d+$/i.test(row.id)
    && typeof row.label === 'string'
    && isCanonicalTagHref(row.id, row.href)
    && Array.isArray(row.children)
    && row.children.every((child) => isTagTreeNode(child))
    && isOptionalNullableNumber(row.moreCount);
}

function isTagListItem(value: unknown): value is VndbTagListItem {
  const row = asJsonRecord(value);
  return row !== null
    && typeof row.id === 'string'
    && /^g\d+$/i.test(row.id)
    && typeof row.name === 'string'
    && isCanonicalTagHref(row.id, row.href)
    && isOptionalNullableNumber(row.count)
    && isOptionalNullableString(row.dateLabel);
}

function decodeTagHomeTree(value: unknown): VndbTagHomeTree | null {
  const row = asJsonRecord(value);
  if (
    row === null
    || !Array.isArray(row.groups)
    || !row.groups.every(isTagTreeGroup)
    || !Array.isArray(row.recentlyAdded)
    || !row.recentlyAdded.every(isTagListItem)
    || !Array.isArray(row.popular)
    || !row.popular.every(isTagListItem)
    || !isOptionalRecentlyTaggedHref(row.recentlyTaggedHref)
  ) {
    return null;
  }
  return {
    groups: row.groups,
    recentlyAdded: row.recentlyAdded,
    popular: row.popular,
    recentlyTaggedHref: row.recentlyTaggedHref,
  };
}

function isTagBreadcrumb(value: unknown): value is VndbTagBreadcrumb {
  const row = asJsonRecord(value);
  if (row === null || typeof row.name !== 'string') return false;
  if (row.id === null) return row.href === '/tags?mode=vndb';
  return typeof row.id === 'string'
    && /^g\d+$/i.test(row.id)
    && (row.href === null || isCanonicalTagHref(row.id, row.href));
}

function decodeTagWebDetail(value: unknown): VndbTagWebDetail | null {
  const row = asJsonRecord(value);
  const properties = asJsonRecord(row?.properties);
  if (
    row === null
    || typeof row.id !== 'string'
    || !/^g\d+$/i.test(row.id)
    || typeof row.name !== 'string'
    || !Array.isArray(row.breadcrumb)
    || !row.breadcrumb.every(isTagBreadcrumb)
    || !isOptionalNullableString(row.descriptionText)
    || properties === null
    || !isOptionalNullableBoolean(properties.searchable)
    || !isOptionalNullableBoolean(properties.applicable)
    || !isOptionalNullableString(row.categoryLabel)
    || (row.aliases !== undefined && (!Array.isArray(row.aliases) || !row.aliases.every((alias) => typeof alias === 'string')))
    || !Array.isArray(row.childGroups)
    || !row.childGroups.every((group) => {
      const childGroup = asJsonRecord(group);
      return childGroup !== null
        && typeof childGroup.title === 'string'
        && Array.isArray(childGroup.children)
        && childGroup.children.every((child) => isTagTreeNode(child));
    })
  ) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    breadcrumb: row.breadcrumb,
    descriptionText: row.descriptionText,
    properties: {
      searchable: properties.searchable,
      applicable: properties.applicable,
    },
    categoryLabel: row.categoryLabel,
    aliases: row.aliases,
    childGroups: row.childGroups,
  };
}

function isVndbSourceUrl(value: unknown): value is string {
  return typeof value === 'string'
    && isAllowedHttpTarget(value)
    && new URL(value).hostname.toLowerCase() === 'vndb.org';
}

function readParsed<T>(cacheKey: string, decode: (value: unknown) => T | null): VndbTagWebCacheResult<T> | null {
  const row = getCacheRow(cacheKey);
  if (!row) return null;
  try {
    const parsed = asJsonRecord(JSON.parse(row.body));
    if (parsed === null || !isVndbSourceUrl(parsed.source_url)) return null;
    const data = decode(parsed.data);
    if (data === null) return null;
    return {
      data,
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

/** Read the cached `/g` home-tree payload without issuing a network fetch. */
export function readVndbTagHomeTreeCache(): VndbTagWebCacheResult<VndbTagHomeTree> | null {
  return readParsed(HOME_KEY, decodeTagHomeTree);
}

/** Read the cached `/g<id>` detail payload without issuing a network fetch. */
export function readVndbTagWebDetailCache(tagId: string): VndbTagWebCacheResult<VndbTagWebDetail> | null {
  return readParsed(`${DETAIL_KEY_PREFIX}${tagId.toLowerCase()}`, decodeTagWebDetail);
}

/**
 * Resolve the tag home tree from cache, refetching when stale or `force`.
 * On network failure with a usable cache, returns the cached payload with
 * a `stale: true` flag so the page can surface a "stale" badge instead of
 * showing nothing.
 */
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

/**
 * Resolve one tag's detail payload from cache, refetching when stale or
 * `force`. Stale-while-error behaviour mirrors `getVndbTagHomeTree`.
 */
export async function getVndbTagWebDetail(
  tagId: string,
  opts: { force?: boolean } = {},
): Promise<VndbTagWebCacheResult<VndbTagWebDetail>> {
  const id = tagId.toLowerCase();
  const key = `${DETAIL_KEY_PREFIX}${id}`;
  const cached = readParsed(key, decodeTagWebDetail);
  if (cached && !cached.stale && !opts.force) return cached;

  const html = await fetchVndbWebHtml(`/${id}`, { force: opts.force });
  if (!html) {
    if (cached) return { ...cached, stale: true, warning: `VNDB unreachable; stale ${id} tag hierarchy shown.` };
    throw new Error(`VNDB tag page ${id} is unavailable and no local cache exists.`);
  }
  return writeParsed(key, `https://vndb.org/${id}`, parseVndbTagWebDetail(html, id));
}

/** Force-refresh the cached tag home tree; detail pages refresh on demand. */
export async function refreshVndbTagWebCache(): Promise<void> {
  await getVndbTagHomeTree({ force: true });
}
