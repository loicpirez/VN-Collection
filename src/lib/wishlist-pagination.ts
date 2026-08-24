import type { Locale } from '@/lib/i18n/dictionaries';
import { BCP47, yearOnly } from '@/lib/locale-number';
import type { WishlistClientItem } from '@/lib/vndb-ui-client-shape';
import { parseOptionalQueryInteger, parseOptionalQueryNumber, parseQueryEnum } from '@/lib/query-params';
import { createNumberedPageMeta, type NumberedPageMeta } from '@/lib/server-pagination';

/** Default number of wishlist entries requested per server page. */
export const WISHLIST_SERVER_PAGE_SIZE = 60;
const WISHLIST_SERVER_PAGE_SIZE_MAX = 120;
const WISHLIST_QUERY_MAX = 200;

/** Canonical sort values accepted by the wishlist API. */
export const WISHLIST_SORTS = [
  'added_desc',
  'added_asc',
  'title',
  'rating_desc',
  'released_desc',
  'released_asc',
  'length_desc',
  'egs_rating_desc',
] as const;
/** Sort mode accepted by server-side wishlist processing. */
export type WishlistServerSort = typeof WISHLIST_SORTS[number];

/** Canonical grouping values accepted by the wishlist API. */
export const WISHLIST_GROUPS = ['none', 'year', 'developer', 'language', 'platform', 'status'] as const;
/** Grouping mode accepted by server-side wishlist processing. */
export type WishlistServerGroup = typeof WISHLIST_GROUPS[number];

/** Pagination metadata returned with a server-processed wishlist page. */
export interface WishlistPageMetadata extends NumberedPageMeta {
  grouped: boolean;
}

/** Filter options available across the complete unfiltered wishlist. */
export interface WishlistFacets {
  languages: string[];
  platforms: string[];
}

/** Counts across the complete wishlist before display filters. */
export interface WishlistSummary {
  total: number;
  owned: number;
  todo: number;
}

/** Safe server-side wishlist query derived from local URL parameters. */
export interface WishlistServerQuery {
  q: string;
  language: string;
  platform: string;
  rating_min: number | null;
  rating_max: number | null;
  year_min: string;
  year_max: string;
  sort: WishlistServerSort;
  group: WishlistServerGroup;
  hide_owned: boolean;
  page: number;
  page_size: number;
  locale: Locale;
}

/** Result of server filtering, sorting, group-aware pagination, and facet projection. */
export interface WishlistServerPage {
  items: WishlistClientItem[];
  page: WishlistPageMetadata;
  facets: WishlistFacets;
  summary: WishlistSummary;
  download_items: Array<{ id: string; title: string }>;
}

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  return parseOptionalQueryInteger(value, { minimum: 1, maximum }) ?? fallback;
}

function optionalFiniteNumber(value: string | null): number | null {
  return parseOptionalQueryNumber(value) ?? null;
}

function enumValue<T extends string>(value: string | null, values: readonly T[], fallback: T): T {
  return parseQueryEnum(value, values, fallback);
}

/**
 * Parse and bound wishlist server query parameters.
 *
 * @param params Request URL parameters.
 * @returns A complete safe query with canonical defaults.
 */
export function parseWishlistServerQuery(params: URLSearchParams): WishlistServerQuery {
  const locale = params.get('locale');
  return {
    q: (params.get('q') ?? '').trim().slice(0, WISHLIST_QUERY_MAX),
    language: (params.get('lang') ?? '').slice(0, 32),
    platform: (params.get('platform') ?? '').slice(0, 32),
    rating_min: optionalFiniteNumber(params.get('ratingMin')),
    rating_max: optionalFiniteNumber(params.get('ratingMax')),
    year_min: (params.get('yearMin') ?? '').slice(0, 4),
    year_max: (params.get('yearMax') ?? '').slice(0, 4),
    sort: enumValue(params.get('sort'), WISHLIST_SORTS, 'added_desc'),
    group: enumValue(params.get('group'), WISHLIST_GROUPS, 'none'),
    hide_owned: params.get('hideOwned') !== '0',
    page: positiveInteger(params.get('page'), 1, Number.MAX_SAFE_INTEGER),
    page_size: positiveInteger(params.get('pageSize'), WISHLIST_SERVER_PAGE_SIZE, WISHLIST_SERVER_PAGE_SIZE_MAX),
    locale: locale === 'fr' || locale === 'ja' ? locale : 'en',
  };
}

function groupKey(item: WishlistClientItem, group: Exclude<WishlistServerGroup, 'none'>): string {
  switch (group) {
    case 'year': return item.vn.released?.slice(0, 4) || '';
    case 'developer': return item.vn.developers[0]?.name || '';
    case 'language': return item.vn.languages[0] || '';
    case 'platform': return item.vn.platforms[0] || '';
    case 'status': return item.in_collection ? 'owned' : 'todo';
  }
}

function groupedPages(
  items: WishlistClientItem[],
  group: Exclude<WishlistServerGroup, 'none'>,
  pageSize: number,
  collator: Intl.Collator,
): WishlistClientItem[][] {
  const buckets = new Map<string, WishlistClientItem[]>();
  for (const item of items) {
    const key = groupKey(item, group);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(item);
    else buckets.set(key, [item]);
  }
  const ordered = Array.from(buckets.entries()).sort(([a], [b]) => (
    group === 'year' ? collator.compare(b, a) : collator.compare(a, b)
  ));
  const pages: WishlistClientItem[][] = [];
  let current: WishlistClientItem[] = [];
  for (const [, bucket] of ordered) {
    if (current.length > 0 && current.length + bucket.length > pageSize) {
      pages.push(current);
      current = [];
    }
    current.push(...bucket);
  }
  if (current.length > 0) pages.push(current);
  return pages;
}

/**
 * Filter, sort, and paginate enriched wishlist items on the server.
 * Grouped pages keep each group intact, even when one group exceeds the nominal page size.
 *
 * @param source Complete enriched wishlist.
 * @param query Safe query returned by `parseWishlistServerQuery`.
 * @returns Current page plus full-list facets, counts, and compact download IDs.
 */
export function paginateWishlist(source: WishlistClientItem[], query: WishlistServerQuery): WishlistServerPage {
  const collator = new Intl.Collator(BCP47[query.locale], { sensitivity: 'base', numeric: true });
  const languages = new Set<string>();
  const platforms = new Set<string>();
  let owned = 0;
  for (const item of source) {
    if (item.in_collection) owned += 1;
    for (const language of item.vn.languages) languages.add(language);
    for (const platform of item.vn.platforms) platforms.add(platform);
  }
  const lower = query.q.toLocaleLowerCase(BCP47[query.locale]);
  const filtered = source.filter((item) => {
    if (query.hide_owned && item.in_collection) return false;
    if (query.language && !item.vn.languages.includes(query.language)) return false;
    if (query.platform && !item.vn.platforms.includes(query.platform)) return false;
    if (query.rating_min !== null && (item.vn.rating == null || item.vn.rating < query.rating_min)) return false;
    if (query.rating_max !== null && (item.vn.rating == null || item.vn.rating > query.rating_max)) return false;
    if (query.year_min || query.year_max) {
      const year = yearOnly(item.vn.released);
      if (!year || (query.year_min && year < query.year_min) || (query.year_max && year > query.year_max)) return false;
    }
    if (!lower) return true;
    return item.vn.title.toLocaleLowerCase(BCP47[query.locale]).includes(lower)
      || (item.vn.alttitle?.toLocaleLowerCase(BCP47[query.locale]).includes(lower) ?? false)
      || item.vn.developers.some((developer) => developer.name.toLocaleLowerCase(BCP47[query.locale]).includes(lower));
  });
  filtered.sort((a, b) => {
    switch (query.sort) {
      case 'added_desc': return b.added - a.added;
      case 'added_asc': return a.added - b.added;
      case 'title': return collator.compare(a.vn.title, b.vn.title);
      case 'rating_desc': return (b.vn.rating ?? 0) - (a.vn.rating ?? 0);
      case 'released_desc': return (b.vn.released ?? '').localeCompare(a.vn.released ?? '');
      case 'released_asc': return (a.vn.released ?? '').localeCompare(b.vn.released ?? '');
      case 'length_desc': return (b.vn.length_minutes ?? 0) - (a.vn.length_minutes ?? 0);
      case 'egs_rating_desc': return (b.egs?.median ?? 0) - (a.egs?.median ?? 0);
    }
  });

  const pages = query.group === 'none'
    ? Array.from({ length: Math.ceil(filtered.length / query.page_size) }, (_value, index) => (
        filtered.slice(index * query.page_size, (index + 1) * query.page_size)
      ))
    : groupedPages(filtered, query.group, query.page_size, collator);
  const totalPages = Math.max(1, pages.length);
  const page = Math.min(query.page, totalPages);
  const items = pages[page - 1] ?? [];
  const start = pages.slice(0, page - 1).reduce((count, rows) => count + rows.length, 0);
  return {
    items,
    page: {
      ...createNumberedPageMeta({
        page,
        pageSize: query.page_size,
        total: filtered.length,
        totalPages,
        startIndex: start,
        itemCount: items.length,
      }),
      grouped: query.group !== 'none',
    },
    facets: {
      languages: Array.from(languages).sort(collator.compare),
      platforms: Array.from(platforms).sort(collator.compare),
    },
    summary: { total: source.length, owned, todo: source.length - owned },
    download_items: filtered.map((item) => ({ id: item.vn.id, title: item.vn.title })),
  };
}
