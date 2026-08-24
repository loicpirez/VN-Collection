'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, Edit2, Filter, Globe, Grid3X3, Link2, Link2Off, List, MapPin, PackageCheck, Plus, RotateCcw, Search } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { readApiError } from '@/lib/api-error-read';
import type { PlaceWithLinks } from '@/lib/db';
import { PlaceCard } from './PlaceCard';
import { AddEditPlaceModal } from './AddEditPlaceModal';
import { AssignProviderDialog } from './AssignProviderDialog';
import { ErrorAlert } from './ErrorAlert';
import { SkeletonBlock } from './Skeleton';
import { CardDensitySlider } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';
import { AcronymLabel } from './AcronymLabel';
import { safeHref } from '@/lib/safe-href';
import { parseClientPreferenceRecord } from '@/lib/client-persisted-shape';
import { decodePlacesResponse, decodeUnassignedBranchesPageResponse } from '@/lib/place-client-shape';
import { fmtNum } from '@/lib/locale-number';
import type { PlaceRegistryStats, RegistryPageMeta } from '@/lib/place-registry-page';

const STALE_MS = 86_400_000 * 7;
const PREFS_KEY = 'vncoll.places.prefs.v1';
const PLACE_REGISTRY_PAGE_SIZE = 60;

type Tab = 'all' | 'linked' | 'unlinked' | 'unassigned';
type SortKey = 'name' | 'stock' | 'fresh';
type ViewMode = 'cards' | 'list';
type GpsFilter = 'all' | 'gps' | 'no_gps';

export function loadPrefs(): { sort?: SortKey; view?: ViewMode } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const obj = parseClientPreferenceRecord(raw);
    const s = obj.sort;
    const v = obj.view;
    return {
      sort: (s === 'name' || s === 'stock' || s === 'fresh') ? s : undefined,
      view: (v === 'cards' || v === 'list') ? v : undefined,
    };
  } catch {
    return {};
  }
}

function kindLabel(t: ReturnType<typeof useT>, kind: PlaceWithLinks['kind']): string {
  const key = `kind${kind.charAt(0).toUpperCase()}${kind.slice(1)}`;
  return (t.places as Record<string, string>)[key];
}

function linkedBranchesLabel(t: ReturnType<typeof useT>, count: number): string {
  const template = count === 1 ? t.places.linkedBranch : t.places.linkedBranches;
  return template.replace('{n}', String(count));
}

function namedPlaceAction(template: string, placeName: string): string {
  return template.replace('{name}', placeName);
}

function placeStockFreshnessAt(place: PlaceWithLinks): number | null {
  return place.stock_updated_at && place.stock_updated_at > 0 ? place.stock_updated_at : null;
}

function freshnessStale(place: PlaceWithLinks): boolean {
  const stockUpdatedAt = placeStockFreshnessAt(place);
  return stockUpdatedAt != null && Date.now() - stockUpdatedAt > STALE_MS;
}

function placeFreshSortValue(place: PlaceWithLinks): number {
  const stockUpdatedAt = placeStockFreshnessAt(place);
  return stockUpdatedAt != null ? stockUpdatedAt : place.updated_at;
}

function hasGps(place: PlaceWithLinks): boolean {
  return place.lat != null && place.lng != null;
}

export function PlaceBrowser() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [places, setPlaces] = useState<PlaceWithLinks[]>([]);
  const [unassigned, setUnassigned] = useState<string[]>([]);
  const [placePage, setPlacePage] = useState<RegistryPageMeta | null>(null);
  const [unassignedPage, setUnassignedPage] = useState<RegistryPageMeta | null>(null);
  const [placeStats, setPlaceStats] = useState<PlaceRegistryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<SortKey>(() => loadPrefs().sort ?? 'name');
  const [view, setView] = useState<ViewMode>(() => loadPrefs().view ?? 'cards');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [kindFilter, setKindFilter] = useState('');
  const [gpsFilter, setGpsFilter] = useState<GpsFilter>('all');
  const [hideStale, setHideStale] = useState(false);
  const [page, setPage] = useState(1);
  const [editTarget, setEditTarget] = useState<PlaceWithLinks | null | 'new'>(null);
  const [assignTarget, setAssignTarget] = useState<PlaceWithLinks | null>(null);
  const [assignBranchTarget, setAssignBranchTarget] = useState<string | null>(null);
  const reloadAbortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const initialLoadCompleteRef = useRef(false);
  const assignBranchTargetRef = useRef<string | null>(null);
  const assignBranchLinkRef = useRef(false);
  const assignBranchLinkAbortRef = useRef<AbortController | null>(null);
  const q = search.trim().toLowerCase();

  const reload = useCallback(async () => {
    reloadAbortRef.current?.abort();
    const controller = new AbortController();
    reloadAbortRef.current = controller;
    const { signal } = controller;
    setLoadError(null);
    setLoading(true);
    try {
      const offset = (page - 1) * PLACE_REGISTRY_PAGE_SIZE;
      const placeParams = new URLSearchParams();
      const unassignedParams = new URLSearchParams();
      if (initialLoadCompleteRef.current) {
        if (tab !== 'all' && tab !== 'unassigned') placeParams.set('tab', tab);
        if (sort !== 'name') placeParams.set('sort', sort);
        if (q) placeParams.set('q', q);
        if (kindFilter) placeParams.set('kind', kindFilter);
        if (gpsFilter !== 'all') placeParams.set('gps', gpsFilter);
        if (hideStale) placeParams.set('hide_stale', '1');
        if (tab !== 'unassigned' && offset > 0) placeParams.set('offset', String(offset));
        if (tab === 'unassigned' && q) unassignedParams.set('q', q);
        if (tab === 'unassigned' && offset > 0) unassignedParams.set('offset', String(offset));
      }
      const placeQuery = placeParams.size ? `?${placeParams}` : '';
      const unassignedQuery = unassignedParams.size ? `?${unassignedParams}` : '';
      const [pRes, uRes] = await Promise.all([
        fetch(`/api/places${placeQuery}`, { cache: 'no-store', signal }),
        fetch(`/api/places/unassigned${unassignedQuery}`, { cache: 'no-store', signal }),
      ]);
      if (!pRes.ok) throw new Error(await readApiError(pRes, t.common.error as string));
      if (!uRes.ok) throw new Error(await readApiError(uRes, t.common.error as string));
      const [pd, ud] = await Promise.all([
        pRes.json().then(decodePlacesResponse),
        uRes.json().then(decodeUnassignedBranchesPageResponse),
      ]);
      if (!pd || !ud) throw new Error(t.common.error as string);
      if (signal.aborted || !mountedRef.current || reloadAbortRef.current !== controller) return;
      setPlaces(pd.places);
      setPlacePage(pd.page ?? null);
      setPlaceStats(pd.stats ?? null);
      setUnassigned(ud.branches);
      setUnassignedPage(ud.page ?? null);
    } catch (error) {
      if (signal.aborted || error instanceof Error && error.name === 'AbortError') return;
      setLoadError(error instanceof Error ? error.message : t.common.error as string);
    } finally {
      initialLoadCompleteRef.current = true;
      if (!signal.aborted && mountedRef.current && reloadAbortRef.current === controller) setLoading(false);
    }
  }, [gpsFilter, hideStale, kindFilter, page, q, sort, t, tab]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      assignBranchLinkRef.current = false;
      assignBranchLinkAbortRef.current?.abort();
      assignBranchLinkAbortRef.current = null;
      reloadAbortRef.current?.abort();
    };
  }, []);

  const serverPagination = placePage !== null || unassignedPage !== null;
  useEffect(() => {
    if (!initialLoadCompleteRef.current || serverPagination) void reload();
  }, [reload, serverPagination]);

  useEffect(() => {
    assignBranchTargetRef.current = assignBranchTarget;
    assignBranchLinkRef.current = false;
    assignBranchLinkAbortRef.current?.abort();
    assignBranchLinkAbortRef.current = null;
  }, [assignBranchTarget]);

  useEffect(() => {
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ sort, view })); } catch { }
  }, [sort, view]);

  function handleDelete(deleted: PlaceWithLinks) {
    setPlaces((prev) => prev.filter((p) => p.id !== deleted.id));
  }

  const staleCount = useMemo(
    () => placeStats?.stale ?? places.filter((p) => p.provider_labels.length > 0 && freshnessStale(p)).length,
    [placeStats?.stale, places],
  );

  const withGps = useMemo(() => placeStats?.with_gps ?? places.filter(hasGps).length, [placeStats?.with_gps, places]);
  const placeTotal = placeStats?.total ?? places.length;
  const noGpsCount = placeStats?.no_gps ?? placeTotal - withGps;
  const withBranches = placeStats?.linked ?? places.filter((p) => p.provider_labels.length > 0).length;
  const totalVns = placeStats?.stock_count ?? places.reduce((s, p) => s + p.stock_count, 0);
  const unassignedTotal = unassignedPage?.total ?? unassigned.length;

  const activeFilterCount =
    (tab !== 'all' ? 1 : 0) +
    (kindFilter ? 1 : 0) +
    (gpsFilter !== 'all' ? 1 : 0) +
    (hideStale ? 1 : 0) +
    (q ? 1 : 0);

  function resetFilters() {
    setTab('all');
    setKindFilter('');
    setGpsFilter('all');
    setHideStale(false);
    setSearch('');
  }

  const filtered = useMemo(() => {
    if (placePage) return places;
    let list =
      tab === 'linked'
        ? places.filter((p) => p.provider_labels.length > 0)
        : tab === 'unlinked'
          ? places.filter((p) => p.provider_labels.length === 0)
          : tab === 'unassigned'
            ? []
            : places;
    if (kindFilter) list = list.filter((p) => p.kind === kindFilter);
    if (gpsFilter === 'gps') list = list.filter(hasGps);
    if (gpsFilter === 'no_gps') list = list.filter((p) => !hasGps(p));
    if (hideStale) list = list.filter((p) => !(p.provider_labels.length > 0 && freshnessStale(p)));
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.name_ja?.toLowerCase().includes(q) ?? false) ||
          p.provider_labels.some((l) => l.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => {
      if (sort === 'stock') return b.stock_count - a.stock_count;
      if (sort === 'fresh') return placeFreshSortValue(b) - placeFreshSortValue(a);
      return a.name.localeCompare(b.name);
    });
  }, [placePage, places, tab, kindFilter, gpsFilter, hideStale, q, sort]);

  const filteredUnassigned = useMemo(() => {
    if (unassignedPage) return unassigned;
    if (!q) return unassigned;
    return unassigned.filter((b) => b.toLowerCase().includes(q));
  }, [q, unassigned, unassignedPage]);
  const registryTotal = tab === 'unassigned'
    ? unassignedPage?.total ?? filteredUnassigned.length
    : placePage?.total ?? filtered.length;
  const totalPages = Math.max(1, Math.ceil(registryTotal / PLACE_REGISTRY_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PLACE_REGISTRY_PAGE_SIZE;
  const visiblePlaces = placePage ? filtered : filtered.slice(pageStart, pageStart + PLACE_REGISTRY_PAGE_SIZE);
  const visibleUnassigned = unassignedPage
    ? filteredUnassigned
    : filteredUnassigned.slice(pageStart, pageStart + PLACE_REGISTRY_PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [tab, sort, q, kindFilter, gpsFilter, hideStale]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!loading && tab === 'all' && placeTotal === 0 && unassignedTotal > 0) {
      setTab('unassigned');
    }
  }, [loading, placeTotal, tab, unassignedTotal]);

  const showStatsSkeleton = loading && places.length === 0;

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: t.places.tabAll as string, count: placeTotal },
    { id: 'linked', label: t.places.tabLinked as string, count: withBranches },
    { id: 'unlinked', label: t.places.tabUnlinked as string, count: placeStats?.unlinked ?? placeTotal - withBranches },
    { id: 'unassigned', label: t.places.tabUnassigned as string, count: unassignedTotal },
  ];

  const sortOptions: { id: SortKey; label: string }[] = [
    { id: 'name', label: t.places.sortName as string },
    { id: 'stock', label: t.places.sortStock as string },
    { id: 'fresh', label: t.places.sortFresh as string },
  ];

  function renderPlaceRow(place: PlaceWithLinks) {
    const hasGps = place.lat != null && place.lng != null;
    const placeHref = safeHref(place.url);
    const stockFreshnessAt = placeStockFreshnessAt(place);
    const stale = place.provider_labels.length > 0 && freshnessStale(place);
    const staleDays = stockFreshnessAt == null ? 0 : Math.floor((Date.now() - stockFreshnessAt) / 86_400_000);
    return (
      <li key={place.id} className="rounded-xl border border-border bg-bg-card p-3 transition-shadow hover:shadow-card">
        <div className="flex gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight" title={place.name}>{place.name}</p>
                {place.name_ja && (
                  <p className="truncate text-[11px] text-muted">{place.name_ja}</p>
                )}
                {place.address && (
                  <p className="mt-0.5 flex items-start gap-1 truncate text-[11px] text-muted">
                    <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-accent" aria-hidden />
                    {place.address}
                  </p>
                )}
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {hasGps ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-status-completed/10 px-2 py-0.5 text-[11px] font-semibold text-status-completed">
                      <MapPin className="h-3 w-3" aria-hidden />
                      <AcronymLabel acronym="gps" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/25 bg-status-on_hold/10 px-2 py-0.5 text-[11px] font-semibold text-status-on_hold">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {t.places.noCoords as string}
                    </span>
                  )}
                  {place.stock_count > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      <PackageCheck className="h-3 w-3" aria-hidden />
                      {(t.places.stockCount as string).replace('{n}', String(place.stock_count))}
                    </span>
                  )}
                  {place.provider_labels.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
                      <Link2 className="h-3 w-3" aria-hidden />
                      {linkedBranchesLabel(t, place.provider_labels.length)}
                    </span>
                  )}
                  {stale && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/25 bg-status-on_hold/10 px-2 py-0.5 text-[11px] font-semibold text-status-on_hold">
                      <Clock className="h-3 w-3" aria-hidden />
                      {(t.places.freshStale as string).replace('{n}', String(staleDays))}
                    </span>
                  )}
                  <span className="rounded border border-border bg-bg-elev/30 px-2 py-0.5 text-[11px] text-muted">
                    {kindLabel(t, place.kind)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0 sm:justify-end">
                <Link
                  href={`/places/${place.id}`}
                  aria-label={namedPlaceAction(t.places.openPlaceNamed as string, place.name)}
                  className="btn btn-xs btn-primary"
                >
                  {t.places.openPlace as string}
                </Link>
                {placeHref && (
                  <a
                    href={placeHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={namedPlaceAction(t.places.openWebsiteNamed as string, place.name)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded border border-border bg-bg-elev/30 px-2 text-xs text-muted hover:border-accent/50 hover:text-accent"
                    title={placeHref}
                  >
                    <Globe className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only lg:not-sr-only">{t.places.openWebsite as string}</span>
                  </a>
                )}
                {hasGps && (
                  <Link
                    href={`/map?place=${place.id}`}
                    aria-label={namedPlaceAction(t.places.viewOnMapNamed as string, place.name)}
                    className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded border border-border bg-bg-elev/30 px-2 text-xs text-muted hover:border-accent/50 hover:text-accent"
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only lg:not-sr-only">{t.places.viewOnMap as string}</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setEditTarget(place)}
                  aria-label={namedPlaceAction(t.places.editPlaceNamed as string, place.name)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded border border-border bg-bg-elev/30 px-2 text-xs text-muted hover:border-accent/50 hover:text-white"
                >
                  <Edit2 className="h-3.5 w-3.5" aria-hidden />
                  <span className="sr-only lg:not-sr-only">{t.places.editPlace as string}</span>
                </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <DensityScopeProvider scope="places">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <MapPin className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-xl font-bold text-white">{t.places.title as string}</h1>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {showStatsSkeleton ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <SkeletonBlock className="mx-auto mb-3 h-3 w-20" />
              <SkeletonBlock className="mx-auto h-8 w-14" />
            </div>
          ))
        ) : (
          <>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.statsTotal as string}</div>
              <div className="text-2xl font-bold">{places.length}</div>
              <p className="mt-1 text-[11px] leading-snug text-muted/80">{t.places.statsTotalHint as string}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.statsOnMap as string}</div>
              <div className="text-2xl font-bold text-status-completed">{withGps}</div>
              <p className="mt-1 text-[11px] leading-snug text-muted/80">{t.places.statsOnMapHint as string}</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${noGpsCount > 0 ? 'border-status-on_hold/20 bg-status-on_hold/5' : 'border-border bg-bg-card'}`}>
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <AlertCircle className="h-3 w-3" aria-hidden />
                {t.places.noCoords as string}
              </div>
              <div className={`text-2xl font-bold ${noGpsCount > 0 ? 'text-status-on_hold' : ''}`}>
                {noGpsCount}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted/80">{t.places.statsNoCoordsHint as string}</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${totalVns > 0 ? 'border-accent/30 bg-accent/5' : 'border-border bg-bg-card'}`}>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.vnBrowserTitle as string}</div>
              <div className={`text-2xl font-bold ${totalVns > 0 ? 'text-accent' : ''}`}>{totalVns}</div>
              <p className="mt-1 text-[11px] leading-snug text-muted/80">{t.places.statsStockHint as string}</p>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.statsWithBranches as string}</div>
              <div className="text-2xl font-bold">{withBranches}</div>
              <p className="mt-1 text-[11px] leading-snug text-muted/80">{t.places.statsWithBranchesHint as string}</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${unassigned.length > 0 ? 'border-status-on_hold/20 bg-status-on_hold/5' : 'border-border bg-bg-card'}`}>
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <Link2Off className="h-3 w-3" aria-hidden />
                {t.places.statsUnassigned as string}
              </div>
              <div className={`text-2xl font-bold ${unassigned.length > 0 ? 'text-status-on_hold' : ''}`}>
                {unassigned.length}
              </div>
              <p className="mt-1 text-[11px] leading-snug text-muted/80">{t.places.statsUnassignedHint as string}</p>
            </div>
          </>
        )}
      </div>
      {!showStatsSkeleton && (
        <p className="-mt-3 mb-5 text-xs text-muted/80">{t.places.statsCaption as string}</p>
      )}

      <div className="mb-5 rounded-xl border border-border bg-bg-card p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <section className="min-w-0">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.places.title as string}</div>
            <button
              type="button"
              onClick={() => setEditTarget('new')}
              className="btn btn-sm btn-primary"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {t.places.addPlace as string}
            </button>
            <p className="mt-1 text-[11px] leading-snug text-muted">{t.places.subtitle as string}</p>
          </section>
          <section className="min-w-0 flex items-center border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
            <Link href="/map" className="btn btn-sm">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {t.map.title as string}
            </Link>
          </section>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-bg-card p-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.places.tabAll as string}>
            {TABS.map((tab_) => (
              <button
                key={tab_.id}
                type="button"
                onClick={() => setTab(tab_.id)}
                aria-pressed={tab === tab_.id}
                className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  tab === tab_.id
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'border-border bg-bg-elev/30 text-muted hover:border-accent hover:text-white'
                }`}
              >
                <span>{tab_.label}</span>
                <span className={`rounded px-1 text-[10px] ${tab === tab_.id ? 'bg-accent/20 text-accent' : 'bg-bg text-muted'}`}>
                  {tab_.count}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_auto] lg:items-end">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                inputMode="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.places.searchPlaceholder as string}
                aria-label={t.places.searchPlaceholder as string}
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
                {sortOptions.map(({ id, label }) => (
                  <option key={id} value={id}>{label}</option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-2">
              <div
                className="inline-flex rounded-md border border-border bg-bg-elev/40 p-1"
                role="group"
                aria-label={t.places.viewCards as string}
              >
                <button
                  type="button"
                  onClick={() => setView('cards')}
                  aria-label={t.places.viewCards as string}
                  title={t.places.viewCards as string}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'cards' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                >
                  <Grid3X3 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  aria-label={t.places.viewList as string}
                  title={t.places.viewList as string}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'list' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                >
                  <List className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                aria-expanded={showFilters}
                className={`btn btn-sm ${showFilters || activeFilterCount > 0 ? 'border-accent text-accent' : ''}`}
              >
                <Filter className="h-3.5 w-3.5" aria-hidden />
                {t.places.filtersLabel as string}
                {activeFilterCount > 0 && (
                  <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">{activeFilterCount}</span>
                )}
              </button>
              <CardDensitySlider scope="places" />
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.places.kindLabel as string}
              <select
                value={kindFilter}
                onChange={(e) => setKindFilter(e.target.value)}
                className="input min-h-[44px] text-xs normal-case tracking-normal"
              >
                <option value="">{t.places.filterKindAll as string}</option>
                <option value="shop">{t.places.kindShop as string}</option>
                <option value="chain">{t.places.kindChain as string}</option>
                <option value="storage">{t.places.kindStorage as string}</option>
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              <AcronymLabel acronym="gps" />
              <select
                value={gpsFilter}
                onChange={(e) => setGpsFilter(e.target.value as GpsFilter)}
                className="input min-h-[44px] text-xs normal-case tracking-normal"
              >
                <option value="all">{t.places.filterAll as string}</option>
                <option value="gps">{t.places.filterGpsOnly as string}</option>
                <option value="no_gps">{t.places.filterNoGps as string}</option>
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                {t.places.freshStale as string}
              </span>
              <button
                type="button"
                onClick={() => setHideStale((v) => !v)}
                className={`btn btn-sm mt-auto ${hideStale ? 'border-accent text-accent' : ''}`}
              >
                {hideStale
                  ? (t.places.showStale as string).replace('{n}', String(staleCount))
                  : (t.places.hideStale as string).replace('{n}', String(staleCount))}
              </button>
            </div>
            <div className="flex items-end">
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

      {loading ? (
        <div
          aria-busy
          aria-live="polite"
          role="status"
          className={view === 'cards' ? 'grid gap-3' : 'space-y-2'}
          style={
            view === 'cards'
              ? { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 280px)), 1fr))' }
              : undefined
          }
        >
          <span className="sr-only">{t.common.loading as string}</span>
          {Array.from({ length: view === 'cards' ? 8 : 6 }).map((_, i) => (
            <SkeletonBlock key={i} className={`${view === 'cards' ? 'h-52' : 'h-20'} rounded-xl`} />
          ))}
        </div>
      ) : loadError ? (
        <ErrorAlert title={loadError}>
          <button
            type="button"
            onClick={() => { setLoading(true); void reload(); }}
            className="btn btn-sm mt-2"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            {t.common.retry as string}
          </button>
        </ErrorAlert>
      ) : tab === 'unassigned' ? (
        filteredUnassigned.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
            {t.places.unassignedEmpty as string}
          </div>
        ) : (
          <ul className="space-y-2">
            {visibleUnassigned.map((branch) => (
              <li
                key={branch}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-card px-4 py-3"
              >
                <span className="truncate text-sm text-white">{branch}</span>
                <button
                  type="button"
                  onClick={() => setAssignBranchTarget(branch)}
                  className="btn btn-xs btn-primary shrink-0"
                >
                  {t.places.unassignedAssignCta as string}
                </button>
              </li>
            ))}
          </ul>
        )
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
          {t.places.noPlaces as string}
        </div>
      ) : view === 'cards' ? (
        <div
          role="list"
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 280px)), 1fr))' }}
        >
          {visiblePlaces.map((place) => (
            <PlaceCard
              key={place.id}
              place={place}
              onEdit={setEditTarget}
              onDelete={handleDelete}
              onAssign={setAssignTarget}
            />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {visiblePlaces.map(renderPlaceRow)}
        </ul>
      )}

      {!loading && !loadError && registryTotal > PLACE_REGISTRY_PAGE_SIZE && (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-2" aria-label={t.places.registryPaginationLabel as string}>
          <button
            type="button"
            className="btn min-h-[44px]"
            disabled={currentPage <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t.common.prev}
          </button>
          <span className="text-xs text-muted">
            {fmtNum(pageStart + 1, locale)}-{fmtNum(Math.min(registryTotal, pageStart + PLACE_REGISTRY_PAGE_SIZE), locale)}
            {' / '}
            {fmtNum(registryTotal, locale)}
          </span>
          <button
            type="button"
            className="btn min-h-[44px]"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
          >
            {t.common.next}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </nav>
      )}

      {editTarget !== null && (
        <AddEditPlaceModal
          place={editTarget === 'new' ? null : editTarget}
          initialBranch={null}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); void reload(); }}
        />
      )}
      {assignTarget !== null && (
        <AssignProviderDialog
          place={assignTarget}
          onClose={() => setAssignTarget(null)}
          onSaved={() => { void reload(); }}
        />
      )}
      {assignBranchTarget !== null && (
        <AddEditPlaceModal
          place={null}
          initialBranch={assignBranchTarget}
          onClose={() => setAssignBranchTarget(null)}
          onSaved={async (newId) => {
            const ownerBranch = assignBranchTarget;
            if (assignBranchLinkRef.current || assignBranchTargetRef.current !== ownerBranch) return;
            assignBranchLinkAbortRef.current?.abort();
            const controller = new AbortController();
            assignBranchLinkAbortRef.current = controller;
            assignBranchLinkRef.current = true;
            try {
              if (newId != null) {
                const r = await fetch(`/api/places/${newId}/link`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ provider_label: ownerBranch }),
                  signal: controller.signal,
                });
                if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
              }
            } catch (e) {
              if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
              toast.error((e as Error).message);
            } finally {
              if (!mountedRef.current || assignBranchTargetRef.current !== ownerBranch || assignBranchLinkAbortRef.current !== controller) return;
              assignBranchLinkAbortRef.current = null;
              assignBranchLinkRef.current = false;
              setAssignBranchTarget(null);
              void reload();
            }
          }}
        />
      )}
    </DensityScopeProvider>
  );
}
