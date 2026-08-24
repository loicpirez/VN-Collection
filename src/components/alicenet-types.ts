/**
 * Shared alicenet types — extracted from AliceNetClient.tsx during the
 * U-234 file split. Lives in a sibling `.ts` so both the main client
 * and the extracted sub-components (`AliceNetLinkDialog`,
 * `AliceNetCandidateChips`) can import without cycles.
 */
import type { Locale } from '@/lib/i18n/dictionaries';
import { formatVndbDateString } from '@/lib/locale-number';
import {
  parseNamedIdRows,
  parseVndbCandidateRows,
  type VndbCandidateRow,
} from '@/lib/client-persisted-shape';
import type { AliceNetClientItem, AliceNetClientStats } from '@/lib/alicenet-client-shape';

/** Candidate VNDB row persisted for AliceNet remapping. */
export type AliceNetCandidate = VndbCandidateRow;

/** AliceNet stock row rendered by card and list views. */
export type AliceNetItem = AliceNetClientItem;

/** AliceNet header counters rendered by the browser. */
export type AliceNetStats = AliceNetClientStats;

export interface AliceNetSearchHit {
  id: string;
  title: string;
  released: string | null;
  developers?: { id: string; name: string }[];
}

export type AliceNetFilterTab =
  | 'all' | 'matched' | 'vndb' | 'egs_only' | 'unmatched'
  | 'none_found' | 'collection' | 'wishlist';
export type AliceNetSort =
  | 'title' | 'release_desc' | 'release_asc' | 'price_asc' | 'price_desc'
  | 'match_status' | 'updated_desc';
export type AliceNetGroup = 'none' | 'match' | 'producer' | 'year';
export type AliceNetView = 'cards' | 'list';

export const ALICENET_FILTER_TABS: AliceNetFilterTab[] = [
  'all', 'matched', 'vndb', 'egs_only', 'unmatched', 'none_found', 'collection', 'wishlist',
];
export const ALICENET_SORTS: AliceNetSort[] = [
  'match_status', 'release_desc', 'release_asc',
  'price_asc', 'price_desc', 'title', 'updated_desc',
];
export const ALICENET_GROUPS: AliceNetGroup[] = ['none', 'match', 'producer', 'year'];
export const ALICENET_VIEWS: AliceNetView[] = ['cards', 'list'];

interface SearchParamReader {
  get(name: string): string | null;
}

export interface AliceNetQueryState {
  filter: AliceNetFilterTab;
  sort: AliceNetSort | null;
  group: AliceNetGroup | null;
  view: AliceNetView | null;
  showFilters: boolean | null;
  producer: string;
  yearMin: string;
  yearMax: string;
  priceMin: string;
  priceMax: string;
  search: string;
  page: number;
}

function includesValue<T extends string>(values: readonly T[], value: string | null): value is T {
  return value != null && values.some((candidate) => candidate === value);
}

/**
 * Return whether a raw value is a supported AliceNet sort key.
 *
 * @param value Raw persisted or URL-provided value.
 * @returns Whether the value belongs to the supported sort union.
 */
export function isAliceNetSort(value: string | null): value is AliceNetSort {
  return includesValue(ALICENET_SORTS, value);
}

/**
 * Return whether a raw value is a supported AliceNet group key.
 *
 * @param value Raw persisted or URL-provided value.
 * @returns Whether the value belongs to the supported group union.
 */
export function isAliceNetGroup(value: string | null): value is AliceNetGroup {
  return includesValue(ALICENET_GROUPS, value);
}

/**
 * Return whether a raw value is a supported AliceNet view key.
 *
 * @param value Raw persisted or URL-provided value.
 * @returns Whether the value belongs to the supported view union.
 */
export function isAliceNetView(value: string | null): value is AliceNetView {
  return includesValue(ALICENET_VIEWS, value);
}

/**
 * Parse and validate the complete AliceNet browser query state.
 *
 * @param search URL-compatible search parameter reader.
 * @returns Canonical initial state with invalid enums omitted and invalid pages reset to one.
 */
export function parseAliceNetQueryState(search: SearchParamReader): AliceNetQueryState {
  const rawFilter = search.get('filter');
  const rawSort = search.get('sort');
  const rawGroup = search.get('group');
  const rawView = search.get('view');
  const producer = search.get('producer') ?? '';
  const yearMin = search.get('yearMin') ?? '';
  const yearMax = search.get('yearMax') ?? '';
  const priceMin = search.get('priceMin') ?? '';
  const priceMax = search.get('priceMax') ?? '';
  const explicitFilters = search.get('filters');
  const hasAdvancedFilter = [producer, yearMin, yearMax, priceMin, priceMax].some(Boolean);
  const rawPage = Number(search.get('page') ?? '1');

  return {
    filter: includesValue(ALICENET_FILTER_TABS, rawFilter) ? rawFilter : 'all',
    sort: isAliceNetSort(rawSort) ? rawSort : null,
    group: isAliceNetGroup(rawGroup) ? rawGroup : null,
    view: isAliceNetView(rawView) ? rawView : null,
    showFilters: hasAdvancedFilter ? true : explicitFilters === '1' ? true : explicitFilters === '0' ? false : null,
    producer,
    yearMin,
    yearMax,
    priceMin,
    priceMax,
    search: search.get('q') ?? '',
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
  };
}

/**
 * Parse a raw alicenet price string ("¥4,270", "4,270円") to its integer
 * yen value. Returns null when there are no digits or the value is ≤ 0.
 */
export function parseAliceNetPrice(value: string | null): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^\d]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Canonicalise a JP-shaped date ("2017/12/22", "2017-12-22") to the
 * ISO `YYYY-MM-DD` form used by sort comparisons. Returns '' for null,
 * and passes through unrecognised formats verbatim.
 */
export function comparableAliceNetDate(value: string | null): string {
  if (!value) return '';
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
  if (!m) return value;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** Locale-format a alicenet date for display. */
export function formatAliceNetDate(value: string | null, locale: Locale): string {
  if (!value) return '';
  const iso = comparableAliceNetDate(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return formatVndbDateString(iso, locale);
  const m = /^(\d{4})年(?:(\d{1,2})月(?:(\d{1,2})日)?)?$/.exec(value);
  if (m) {
    const [, y, mo, d] = m;
    const padded = `${y}-${(mo ?? '01').padStart(2, '0')}-${(d ?? '01').padStart(2, '0')}`;
    return formatVndbDateString(padded, locale);
  }
  return value;
}

/** Parse persisted developer rows used by AliceNet cards. */
export function parseAliceNetDevs(json: string | null): { id: string; name: string }[] {
  return parseNamedIdRows(json);
}

/** Parse persisted VNDB candidates used by AliceNet remapping controls. */
export function parseAliceNetCandidates(json: string | null): AliceNetCandidate[] {
  return parseVndbCandidateRows(json);
}

export function alicenetMatchKind(item: AliceNetItem): 'vndb' | 'egs' | 'unresolved' | 'new' {
  if (item.vn_id) return 'vndb';
  if (item.egs_id) return 'egs';
  if (item.vn_match_source === 'none') return 'unresolved';
  return 'new';
}

export function displayAliceNetTitle(item: AliceNetItem): string {
  return item.egs_title || item.title;
}

export function displayAliceNetProducer(item: AliceNetItem): string {
  const dev = parseAliceNetDevs(item.vn_developers)[0]?.name;
  return dev || item.egs_brand || '';
}
