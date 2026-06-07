'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BookHeart,
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Filter,
  Grid3X3,
  Link2,
  List,
  PackageCheck,
  PackageX,
  RotateCcw,
  Search,
} from 'lucide-react';
import { SafeImage } from './SafeImage';
import { SkeletonBlock } from './Skeleton';
import { useT, useLocale } from '@/lib/i18n/client';
import { currencyFormatter, fmtNum, formatVndbDateString } from '@/lib/locale-number';
import { CardDensitySlider } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';
import type { PlaceOfferRow, PlaceVnRow } from '@/lib/db';
import { parseClientPreferenceRecord, parseNamedIdRows } from '@/lib/client-persisted-shape';
import { decodePlaceStockResponse, type PlaceStockStats, type PlaceStockVn } from '@/lib/place-client-shape';
import { readApiError } from '@/lib/api-error-read';
import { ErrorAlert } from './ErrorAlert';

type PlaceVn = PlaceStockVn;
type FilterTab = 'all' | 'in_stock' | 'out_of_stock' | 'in_collection' | 'in_wishlist';
type SortKey = 'name' | 'price_asc' | 'price_desc' | 'fresh';
type GroupKey = 'none' | 'provider' | 'year';
type ViewMode = 'cards' | 'list';

const SORTS = ['name', 'price_asc', 'price_desc', 'fresh'] as const satisfies readonly SortKey[];
const GROUPS = ['none', 'provider', 'year'] as const satisfies readonly GroupKey[];
const PREFS_KEY = 'vncoll.place-vn-browser.prefs.v1';
const PLACE_VN_PAGE_SIZE = 60;
const EMPTY_STATS: PlaceStockStats = { total: 0, in_stock: 0, out_of_stock: 0, offer_count: 0, in_collection: 0, branch_count: 0, in_wishlist: 0 };

function isSort(v: unknown): v is SortKey { return (SORTS as readonly unknown[]).includes(v); }
function isGroup(v: unknown): v is GroupKey { return (GROUPS as readonly unknown[]).includes(v); }
function isView(v: unknown): v is ViewMode { return v === 'cards' || v === 'list'; }

export function loadPrefs(): { sort?: SortKey; group?: GroupKey; view?: ViewMode } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const obj = parseClientPreferenceRecord(raw);
    return {
      sort: isSort(obj.sort) ? obj.sort : undefined,
      group: isGroup(obj.group) ? obj.group : undefined,
      view: isView(obj.view) ? obj.view : undefined,
    };
  } catch { return {}; }
}

function parseDevs(json: string | null): { id: string; name: string }[] {
  return parseNamedIdRows(json);
}

/** AliceNet-identical VN browser for a single place's stock. */
export function PlaceVnBrowser({ placeId, placeName: _placeName }: { placeId: number; placeName: string }) {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<PlaceVn[]>([]);
  const [apiStats, setApiStats] = useState<PlaceStockStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [sort, setSort] = useState<SortKey>(() => loadPrefs().sort ?? 'name');
  const [group, setGroup] = useState<GroupKey>(() => loadPrefs().group ?? 'none');
  const [view, setView] = useState<ViewMode>(() => loadPrefs().view ?? 'cards');
  const [showFilters, setShowFilters] = useState(true);
  const [providerFilter, setProviderFilter] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const currency = useMemo(
    () => currencyFormatter(locale),
    [locale],
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch(`/api/places/${placeId}/stock`, { cache: 'no-store', signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
      const d = decodePlaceStockResponse(await r.json());
      if (!d) throw new Error(t.common.error as string);
      if (signal?.aborted) return;
      setItems(d.vns);
      setApiStats(d.stats);
    } catch (error) {
      if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) return;
      setLoadError(error instanceof Error ? error.message : t.common.error as string);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [placeId, t.common.error]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ sort, group, view })); } catch {}
  }, [sort, group, view]);

  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const producers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const vn of items) {
      for (const d of parseDevs(vn.developers)) {
        if (!d.id) continue;
        const prev = map.get(d.id);
        map.set(d.id, { id: d.id, name: d.name || d.id, count: (prev?.count ?? 0) + 1 });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'in_stock') list = list.filter((v) => v.in_stock_count > 0);
    else if (filter === 'out_of_stock') list = list.filter((v) => v.in_stock_count === 0 && v.out_of_stock_count > 0);
    else if (filter === 'in_collection') list = list.filter((v) => v.in_collection === 1);
    else if (filter === 'in_wishlist') list = list.filter((v) => v.in_wishlist === 1);
    if (providerFilter) {
      list = list.filter((v) => parseDevs(v.developers).some((d) => d.id === providerFilter));
    }
    const pMin = priceMin ? Number(priceMin) : null;
    const pMax = priceMax ? Number(priceMax) : null;
    if (pMin != null || pMax != null) {
      list = list.filter((v) => {
        if (v.min_price == null) return false;
        if (pMin != null && v.min_price < pMin) return false;
        if (pMax != null && v.min_price > pMax) return false;
        return true;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          (v.alttitle ?? '').toLowerCase().includes(q) ||
          v.vn_id.toLowerCase().includes(q),
      );
    }
    return list;
  }, [items, filter, providerFilter, priceMin, priceMax, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sort) {
        case 'name': return a.title.localeCompare(b.title);
        case 'price_asc': return (a.min_price ?? Number.MAX_SAFE_INTEGER) - (b.min_price ?? Number.MAX_SAFE_INTEGER);
        case 'price_desc': return (b.min_price ?? -1) - (a.min_price ?? -1);
        case 'fresh': return b.max_updated_at - a.max_updated_at;
      }
    });
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PLACE_VN_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PLACE_VN_PAGE_SIZE;
  const pageItems = useMemo(
    () => sorted.slice(pageStart, pageStart + PLACE_VN_PAGE_SIZE),
    [sorted, pageStart],
  );

  useEffect(() => {
    setPage(1);
  }, [filter, sort, group, providerFilter, priceMin, priceMax, search]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const grouped = useMemo<{ key: string; items: PlaceVn[] }[]>(() => {
    if (group === 'none') return [{ key: '', items: pageItems }];
    const buckets = new Map<string, PlaceVn[]>();
    for (const vn of pageItems) {
      let key = '';
      if (group === 'provider') {
        key = parseDevs(vn.developers)[0]?.name || (t.wishlist.groupUnknown as string);
      } else {
        key = vn.released?.slice(0, 4) || (t.wishlist.groupUnknown as string);
      }
      const bucket = buckets.get(key);
      if (bucket) bucket.push(vn);
      else buckets.set(key, [vn]);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (group === 'year' ? b.localeCompare(a) : a.localeCompare(b)))
      .map(([key, items]) => ({ key, items }));
  }, [pageItems, group, t.wishlist.groupUnknown]);

  const showStatsSkeleton = loading && items.length === 0;

  const tabs: { id: FilterTab; label: string; count: number; icon?: React.ReactNode }[] = [
    { id: 'all', label: t.places.filterAll as string, count: apiStats.total },
    { id: 'in_stock', label: t.places.filterInStock as string, count: apiStats.in_stock, icon: <CheckCircle2 className="h-3 w-3 text-status-completed" aria-hidden /> },
    { id: 'out_of_stock', label: t.places.filterOutOfStock as string, count: apiStats.out_of_stock, icon: <PackageX className="h-3 w-3 text-status-dropped" aria-hidden /> },
    { id: 'in_collection', label: t.places.filterInCollection as string, count: apiStats.in_collection, icon: <BookHeart className="h-3 w-3 text-status-completed" aria-hidden /> },
    { id: 'in_wishlist', label: t.places.filterInWishlist as string, count: apiStats.in_wishlist, icon: <BookHeart className="h-3 w-3 text-status-dropped" aria-hidden /> },
  ];

  const sortLabels: Record<SortKey, string> = {
    name: t.places.sortTitle as string,
    price_asc: t.places.sortPrice as string,
    price_desc: t.places.sortPriceDesc as string,
    fresh: t.places.sortFresh as string,
  };

  const groupLabels: Record<GroupKey, string> = {
    none: t.places.groupNone as string,
    provider: t.places.groupByProvider as string,
    year: t.places.groupByYear as string,
  };

  const activeFilterCount =
    (filter !== 'all' ? 1 : 0) +
    (providerFilter ? 1 : 0) +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0) +
    (searchInput ? 1 : 0);

  function resetFilters() {
    setFilter('all');
    setProviderFilter('');
    setPriceMin('');
    setPriceMax('');
    setSearchInput('');
  }

  function statusBadge(vn: PlaceVn) {
    if (vn.in_stock_count > 0) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-status-completed/10 px-2 py-0.5 text-[11px] font-semibold text-status-completed">
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          {t.places.filterInStock as string}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-status-dropped/25 bg-status-dropped/10 px-2 py-0.5 text-[11px] font-semibold text-status-dropped">
        <PackageX className="h-3 w-3" aria-hidden />
        {t.places.filterOutOfStock as string}
      </span>
    );
  }

  function renderCard(vn: PlaceVn) {
    const devs = parseDevs(vn.developers);
    const producer = devs[0];
    return (
      <article key={vn.vn_id} role="listitem" className="group flex min-h-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-bg-card transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-card">
        <div className="relative aspect-[2/3] bg-bg-elev">
          <SafeImage
            src={vn.image_url}
            localSrc={vn.local_image}
            sexual={vn.image_sexual}
            alt={vn.title}
            className="h-full w-full"
            fit="cover"
          />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">{statusBadge(vn)}</div>
          {(vn.in_wishlist === 1 || vn.in_collection === 1) && (
            <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
              {vn.in_wishlist === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-status-dropped/25 bg-bg/85 px-2 py-0.5 text-[10px] font-semibold text-status-dropped backdrop-blur">
                  <BookHeart className="h-2.5 w-2.5" aria-hidden />
                  {t.places.filterInWishlist as string}
                </span>
              )}
              {vn.in_collection === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-bg/85 px-2 py-0.5 text-[10px] font-semibold text-status-completed backdrop-blur">
                  <BookHeart className="h-2.5 w-2.5" aria-hidden />
                  {t.places.filterInCollection as string}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug" title={vn.title}>{vn.title}</h3>
            {vn.alttitle && <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">{vn.alttitle}</p>}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
            {vn.min_price != null && <span className="font-semibold text-white">{currency.format(vn.min_price)}</span>}
            {vn.released && <span>{formatVndbDateString(vn.released, locale)}</span>}
            <span className="font-mono opacity-70">{vn.vn_id}</span>
          </div>
          {producer && (
            <button
              type="button"
              onClick={() => setProviderFilter(producer.id)}
              className="inline-flex min-h-[44px] w-fit items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              <Building2 className="h-3 w-3" aria-hidden />
              {producer.name}
            </button>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <Link
              href={`/vn/${vn.vn_id}`}
              className="inline-flex min-h-[44px] items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-mono text-accent hover:bg-accent/20"
            >
              <Link2 className="h-3 w-3" aria-hidden />
              {vn.vn_id}
            </Link>
            <a
              href={`https://vndb.org/${vn.vn_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-1 rounded border border-border bg-bg-elev/50 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
              title={`vndb.org/${vn.vn_id}`}
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              VNDB
            </a>
          </div>
        </div>
      </article>
    );
  }

  function renderRow(vn: PlaceVn) {
    const devs = parseDevs(vn.developers);
    const producer = devs[0]?.name;
    return (
      <li key={vn.vn_id} className="rounded-xl border border-border bg-bg-card p-3 transition-shadow hover:shadow-card">
        <div className="flex gap-3">
          <SafeImage
            src={vn.image_url}
            localSrc={vn.local_image}
            sexual={vn.image_sexual}
            alt={vn.title}
            className="h-20 w-14 shrink-0 rounded-lg"
            fit="cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight" title={vn.title}>{vn.title}</p>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
                  {vn.min_price != null && <span className="font-semibold text-white">{currency.format(vn.min_price)}</span>}
                  {vn.released && <span>{formatVndbDateString(vn.released, locale)}</span>}
                  {producer && <span>{producer}</span>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {statusBadge(vn)}
                {vn.in_wishlist === 1 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-dropped/25 bg-status-dropped/10 px-2 py-0.5 text-[11px] font-semibold text-status-dropped">
                    <BookHeart className="h-3 w-3" aria-hidden />
                    {t.places.filterInWishlist as string}
                  </span>
                )}
                {vn.in_collection === 1 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-status-completed/10 px-2 py-0.5 text-[11px] font-semibold text-status-completed">
                    <BookHeart className="h-3 w-3" aria-hidden />
                    {t.places.filterInCollection as string}
                  </span>
                )}
                <Link
                  href={`/vn/${vn.vn_id}`}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-mono text-accent hover:bg-accent/20"
                >
                  <Link2 className="h-3 w-3" aria-hidden />
                  {vn.vn_id}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <DensityScopeProvider scope="places">

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {showStatsSkeleton ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <SkeletonBlock className="mx-auto mb-3 h-3 w-20" />
              <SkeletonBlock className="mx-auto h-8 w-14" />
            </div>
          ))
        ) : (
          <>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.vnBrowserTitle as string}</div>
              <div className="text-2xl font-bold">{apiStats.total}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <CheckCircle2 className="h-3 w-3 text-status-completed" aria-hidden />
                {t.places.filterInStock as string}
              </div>
              <div className="text-2xl font-bold text-status-completed">{apiStats.in_stock}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <PackageX className="h-3 w-3 text-status-dropped" aria-hidden />
                {t.places.filterOutOfStock as string}
              </div>
              <div className="text-2xl font-bold text-status-dropped">{apiStats.out_of_stock}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.statsOffers as string}</div>
              <div className="text-2xl font-bold">{apiStats.offer_count}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <BookHeart className="h-3 w-3 text-status-completed" aria-hidden />
                {t.places.filterInCollection as string}
              </div>
              <div className="text-2xl font-bold text-status-completed">{apiStats.in_collection}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <BookHeart className="h-3 w-3 text-status-dropped" aria-hidden />
                {t.places.filterInWishlist as string}
              </div>
              <div className="text-2xl font-bold text-status-dropped">{apiStats.in_wishlist}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <PackageCheck className="h-3 w-3" aria-hidden />
                {t.places.tabLinked as string}
              </div>
              <div className="text-2xl font-bold">{apiStats.branch_count}</div>
            </div>
          </>
        )}
      </div>

      {loadError && (
        <ErrorAlert title={t.common.error as string} className="mb-4">
          {loadError}
        </ErrorAlert>
      )}

      {/* Browsing controls */}
      <div className="mb-4 rounded-xl border border-border bg-bg-card p-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.places.filtersLabel as string}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={filter === tab.id}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  filter === tab.id
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'border-border bg-bg-elev/30 text-muted hover:border-accent hover:text-white'
                }`}
              >
                {tab.icon ?? null}
                <span>{tab.label}</span>
                <span className={`rounded px-1 text-[10px] ${filter === tab.id ? 'bg-accent/20 text-accent' : 'bg-bg text-muted'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto] lg:items-end">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                inputMode="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.places.vnBrowserSearch as string}
                aria-label={t.places.vnBrowserSearch as string}
                className="input min-h-[44px] w-full pl-9 text-sm"
              />
            </div>

            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.places.sortLabel as string}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="input min-h-[44px] text-xs normal-case tracking-normal"
              >
                {SORTS.map((id) => <option key={id} value={id}>{sortLabels[id]}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.places.groupLabel as string}
              <select
                value={group}
                onChange={(e) => setGroup(e.target.value as GroupKey)}
                className="input min-h-[44px] text-xs normal-case tracking-normal"
              >
                {GROUPS.map((id) => <option key={id} value={id}>{groupLabels[id]}</option>)}
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-2 lg:min-w-[24rem] lg:justify-end">
              <div
                className="inline-flex rounded-md border border-border bg-bg-elev/40 p-1"
                role="group"
                aria-label={t.places.viewLabel as string}
              >
                <button
                  type="button"
                  onClick={() => setView('cards')}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'cards' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                  aria-label={t.places.viewCards as string}
                  title={t.places.viewCards as string}
                >
                  <Grid3X3 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'list' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                  aria-label={t.places.viewList as string}
                  title={t.places.viewList as string}
                >
                  <List className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`btn btn-sm ${showFilters || activeFilterCount > 0 ? 'border-accent text-accent' : ''}`}
                aria-expanded={showFilters}
              >
                <Filter className="h-3.5 w-3.5" aria-hidden />
                {t.places.filtersLabel as string}
                {activeFilterCount > 0 && (
                  <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">{activeFilterCount}</span>
                )}
              </button>
              <CardDensitySlider scope="places" className="min-w-[14rem] max-w-full flex-1 lg:flex-none" />
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted sm:col-span-2 lg:col-span-1">
              {t.places.filterProducer as string}
              <select
                value={providerFilter}
                onChange={(e) => setProviderFilter(e.target.value)}
                className="input min-h-[44px] text-xs normal-case tracking-normal"
              >
                <option value="">{t.places.filterProducerAll as string}</option>
                {producers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.count})</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.places.priceMin as string}
              <input
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
                inputMode="numeric"
                className="input min-h-[44px] text-xs normal-case tracking-normal"
                placeholder="0"
              />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.places.priceMax as string}
              <input
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
                inputMode="numeric"
                className="input min-h-[44px] text-xs normal-case tracking-normal"
                placeholder="5000"
              />
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-1">
              <button
                type="button"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
                className="btn btn-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {t.places.resetFilters as string}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      {loading ? (
        <div
          aria-busy
          aria-live="polite"
          role="status"
          className={view === 'cards' ? 'grid gap-3' : 'space-y-2'}
          style={
            view === 'cards'
              ? { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }
              : undefined
          }
        >
          <span className="sr-only">{t.common.loading as string}</span>
          {Array.from({ length: view === 'cards' ? 12 : 10 }).map((_, i) => (
            <SkeletonBlock key={i} className={`${view === 'cards' ? 'h-96' : 'h-24'} rounded-xl`} />
          ))}
        </div>
      ) : loadError && items.length === 0 ? null : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
          {items.length === 0 ? (
            <p>{t.places.vnBrowserEmpty as string}</p>
          ) : (
            <p>{t.places.vnBrowserAllFiltered as string}</p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((section) => (
            <section key={section.key || 'all'} className="space-y-2">
              {group !== 'none' && (
                <div className="flex items-center gap-2 border-b border-border pb-1">
                  <h2 className="min-w-0 truncate text-sm font-semibold">{section.key}</h2>
                  <span className="rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted">{section.items.length}</span>
                </div>
              )}
              {view === 'cards' ? (
                <div
                  role="list"
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
                >
                  {section.items.map(renderCard)}
                </div>
              ) : (
                <ul className="space-y-2">
                  {section.items.map(renderRow)}
                </ul>
              )}
            </section>
          ))}
          {totalPages > 1 && (
            <nav className="flex flex-wrap items-center justify-between gap-2" aria-label={t.places.vnPaginationLabel as string}>
              <button
                type="button"
                className="btn min-h-[44px]"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
                {t.common.prev as string}
              </button>
              <span className="text-xs text-muted">
                {fmtNum(pageStart + 1, locale)}-{fmtNum(Math.min(sorted.length, pageStart + PLACE_VN_PAGE_SIZE), locale)}
                {' / '}
                {fmtNum(sorted.length, locale)}
              </span>
              <button
                type="button"
                className="btn min-h-[44px]"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                {t.common.next as string}
                <ChevronRight className="h-4 w-4" aria-hidden />
              </button>
            </nav>
          )}
        </div>
      )}
    </DensityScopeProvider>
  );
}
