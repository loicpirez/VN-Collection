import type { PlaceWithLinks } from './db';
import { parseOptionalQueryInteger, parseQueryEnum } from './query-params';
import { createOffsetPageWindow, type OffsetPageWindow } from './server-pagination';

/** Supported place-registry tabs. */
export type PlaceRegistryTab = 'all' | 'linked' | 'unlinked';

/** Supported place-registry sort modes. */
export type PlaceRegistrySort = 'name' | 'stock' | 'fresh';

/** Supported place-registry GPS filters. */
export type PlaceRegistryGps = 'all' | 'gps' | 'no_gps';

/** Bounded server-side place-registry query. */
export interface PlaceRegistryQuery {
  limit: number;
  offset: number;
  tab: PlaceRegistryTab;
  sort: PlaceRegistrySort;
  search: string;
  kind: '' | PlaceWithLinks['kind'];
  gps: PlaceRegistryGps;
  hideStale: boolean;
}

/** Global registry counters returned beside each server page. */
export interface PlaceRegistryStats {
  total: number;
  linked: number;
  unlinked: number;
  with_gps: number;
  no_gps: number;
  stock_count: number;
  stale: number;
}

/** Pagination metadata shared by place registry endpoints. */
export type RegistryPageMeta = OffsetPageWindow;

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 120;
const MAX_OFFSET = 10_000_000;
const STALE_MS = 7 * 86_400_000;

function boundedInteger(raw: string | null, fallback: number, maximum: number): number {
  return parseOptionalQueryInteger(raw, { maximum }) ?? fallback;
}

function enumValue<T extends string>(raw: string | null, values: readonly T[], fallback: T): T {
  return parseQueryEnum(raw, values, fallback);
}

function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('und');
}

/** Parse and bound place-registry query parameters. */
export function parsePlaceRegistryQuery(params: URLSearchParams): PlaceRegistryQuery {
  const limit = Math.max(1, boundedInteger(params.get('limit'), DEFAULT_LIMIT, MAX_LIMIT));
  const kind = enumValue(params.get('kind'), ['', 'shop', 'chain', 'storage'] as const, '');
  return {
    limit,
    offset: boundedInteger(params.get('offset'), 0, MAX_OFFSET),
    tab: enumValue(params.get('tab'), ['all', 'linked', 'unlinked'] as const, 'all'),
    sort: enumValue(params.get('sort'), ['name', 'stock', 'fresh'] as const, 'name'),
    search: normalizeSearch((params.get('q') ?? '').trim().slice(0, 200)),
    kind,
    gps: enumValue(params.get('gps'), ['all', 'gps', 'no_gps'] as const, 'all'),
    hideStale: params.get('hide_stale') === '1',
  };
}

function stockTimestamp(place: PlaceWithLinks): number | null {
  return place.stock_updated_at != null && place.stock_updated_at > 0 ? place.stock_updated_at : null;
}

function isStale(place: PlaceWithLinks, now: number): boolean {
  const timestamp = stockTimestamp(place);
  return place.provider_labels.length > 0 && timestamp !== null && now - timestamp > STALE_MS;
}

function hasGps(place: PlaceWithLinks): boolean {
  return place.lat !== null && place.lng !== null;
}

function searchableText(place: PlaceWithLinks): string {
  return normalizeSearch([place.name, place.name_ja ?? '', ...place.provider_labels].join(' '));
}

/** Filter, sort, aggregate, and page a place registry on the server. */
export function queryPlaceRegistry(
  places: readonly PlaceWithLinks[],
  query: PlaceRegistryQuery,
  now = Date.now(),
): { places: PlaceWithLinks[]; page: RegistryPageMeta; stats: PlaceRegistryStats } {
  const linked = places.filter((place) => place.provider_labels.length > 0).length;
  const withGps = places.filter(hasGps).length;
  const stats: PlaceRegistryStats = {
    total: places.length,
    linked,
    unlinked: places.length - linked,
    with_gps: withGps,
    no_gps: places.length - withGps,
    stock_count: places.reduce((total, place) => total + place.stock_count, 0),
    stale: places.filter((place) => isStale(place, now)).length,
  };
  const filtered = places.filter((place) => {
    if (query.tab === 'linked' && place.provider_labels.length === 0) return false;
    if (query.tab === 'unlinked' && place.provider_labels.length > 0) return false;
    if (query.kind && place.kind !== query.kind) return false;
    if (query.gps === 'gps' && !hasGps(place)) return false;
    if (query.gps === 'no_gps' && hasGps(place)) return false;
    if (query.hideStale && isStale(place, now)) return false;
    return !query.search || searchableText(place).includes(query.search);
  });
  filtered.sort((left, right) => {
    if (query.sort === 'stock') return right.stock_count - left.stock_count || left.id - right.id;
    if (query.sort === 'fresh') {
      const leftFresh = stockTimestamp(left) ?? left.updated_at;
      const rightFresh = stockTimestamp(right) ?? right.updated_at;
      return rightFresh - leftFresh || left.id - right.id;
    }
    return left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) || left.id - right.id;
  });
  return {
    places: filtered.slice(query.offset, query.offset + query.limit),
    page: createOffsetPageWindow(filtered.length, query.limit, query.offset),
    stats,
  };
}

/** Filter and page unassigned provider branches on the server. */
export function queryUnassignedBranches(
  branches: readonly string[],
  params: URLSearchParams,
): { branches: string[]; page: RegistryPageMeta } {
  const limit = Math.max(1, boundedInteger(params.get('limit'), DEFAULT_LIMIT, MAX_LIMIT));
  const offset = boundedInteger(params.get('offset'), 0, MAX_OFFSET);
  const search = normalizeSearch((params.get('q') ?? '').trim().slice(0, 200));
  const filtered = search
    ? branches.filter((branch) => normalizeSearch(branch).includes(search))
    : [...branches];
  return {
    branches: filtered.slice(offset, offset + limit),
    page: createOffsetPageWindow(filtered.length, limit, offset),
  };
}
