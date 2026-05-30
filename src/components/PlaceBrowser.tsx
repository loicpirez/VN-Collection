'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, Edit2, Filter, Globe, Grid3X3, Link2, Link2Off, List, MapPin, PackageCheck, Plus, RotateCcw, Search } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
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

const STALE_MS = 86_400_000 * 7;
const PREFS_KEY = 'vncoll.places.prefs.v1';

type Tab = 'all' | 'linked' | 'unlinked' | 'unassigned';
type SortKey = 'name' | 'stock' | 'fresh';
type ViewMode = 'cards' | 'list';
type GpsFilter = 'all' | 'gps' | 'no_gps';

function loadPrefs(): { sort?: SortKey; view?: ViewMode } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw) as { sort?: unknown; view?: unknown };
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
  return (t.places as Record<string, unknown>)[key] as string ?? kind;
}

function freshnessStale(updatedAt: number): boolean {
  return Date.now() - updatedAt > STALE_MS;
}

export function PlaceBrowser() {
  const t = useT();
  const toast = useToast();
  const [places, setPlaces] = useState<PlaceWithLinks[]>([]);
  const [unassigned, setUnassigned] = useState<string[]>([]);
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
  const [editTarget, setEditTarget] = useState<PlaceWithLinks | null | 'new'>(null);
  const [assignTarget, setAssignTarget] = useState<PlaceWithLinks | null>(null);
  const [assignBranchTarget, setAssignBranchTarget] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoadError(null);
    try {
      const [pRes, uRes] = await Promise.all([
        fetch('/api/places', { cache: 'no-store' }),
        fetch('/api/places/unassigned', { cache: 'no-store' }),
      ]);
      if (!pRes.ok) throw new Error(await readApiError(pRes, t.common.error as string));
      if (!uRes.ok) throw new Error(await readApiError(uRes, t.common.error as string));
      const [pd, ud] = await Promise.all([pRes.json(), uRes.json()]);
      setPlaces(pd.places ?? []);
      setUnassigned(ud.branches ?? []);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(PREFS_KEY, JSON.stringify({ sort, view })); } catch { }
  }, [sort, view]);

  function handleDelete(deleted: PlaceWithLinks) {
    setPlaces((prev) => prev.filter((p) => p.id !== deleted.id));
  }

  const q = search.trim().toLowerCase();

  const staleCount = useMemo(
    () => places.filter((p) => p.provider_labels.length > 0 && freshnessStale(p.updated_at)).length,
    [places],
  );

  const withGps = useMemo(() => places.filter((p) => p.lat != null && p.lng != null).length, [places]);
  const noGpsCount = useMemo(() => places.length - withGps, [places, withGps]);
  const withBranches = useMemo(() => places.filter((p) => p.provider_labels.length > 0).length, [places]);
  const totalVns = useMemo(() => places.reduce((s, p) => s + p.stock_count, 0), [places]);

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
    let list =
      tab === 'linked'
        ? places.filter((p) => p.provider_labels.length > 0)
        : tab === 'unlinked'
          ? places.filter((p) => p.provider_labels.length === 0)
          : tab === 'unassigned'
            ? []
            : places;
    if (kindFilter) list = list.filter((p) => p.kind === kindFilter);
    if (gpsFilter === 'gps') list = list.filter((p) => p.lat != null && p.lng != null);
    if (gpsFilter === 'no_gps') list = list.filter((p) => p.lat == null || p.lng == null);
    if (hideStale) list = list.filter((p) => !(p.provider_labels.length > 0 && freshnessStale(p.updated_at)));
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
      if (sort === 'fresh') return b.updated_at - a.updated_at;
      return a.name.localeCompare(b.name);
    });
  }, [places, tab, kindFilter, gpsFilter, hideStale, q, sort]);

  const filteredUnassigned = useMemo(() => {
    if (!q) return unassigned;
    return unassigned.filter((b) => b.toLowerCase().includes(q));
  }, [unassigned, q]);

  const showStatsSkeleton = loading && places.length === 0;

  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: t.places.tabAll as string, count: places.length },
    { id: 'linked', label: t.places.tabLinked as string, count: withBranches },
    { id: 'unlinked', label: t.places.tabUnlinked as string, count: places.length - withBranches },
    { id: 'unassigned', label: t.places.tabUnassigned as string, count: unassigned.length },
  ];

  const sortOptions: { id: SortKey; label: string }[] = [
    { id: 'name', label: t.places.sortName as string },
    { id: 'stock', label: t.places.sortStock as string },
    { id: 'fresh', label: t.places.sortFresh as string },
  ];

  function renderPlaceRow(place: PlaceWithLinks) {
    const hasGps = place.lat != null && place.lng != null;
    const stale = place.provider_labels.length > 0 && freshnessStale(place.updated_at);
    const staleDays = Math.floor((Date.now() - place.updated_at) / 86_400_000);
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
              <div className="flex flex-wrap items-center justify-end gap-2">
                {hasGps ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-status-completed/10 px-2 py-0.5 text-[11px] font-semibold text-status-completed">
                    <MapPin className="h-3 w-3" aria-hidden />
                    GPS
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
                    {(t.places.linkedBranches as string).replace('{n}', String(place.provider_labels.length))}
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
                <Link href={`/places/${place.id}`} className="btn btn-xs btn-primary">
                  {t.places.openPlace as string}
                </Link>
                {place.url && (
                  <a
                    href={place.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t.places.urlPlaceholder as string}
                    className="icon-btn tap-target text-muted hover:text-accent"
                    title={place.url}
                  >
                    <Globe className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
                {hasGps && (
                  <Link
                    href={`/map?place=${place.id}`}
                    aria-label={t.places.viewOnMap as string}
                    className="icon-btn tap-target text-muted hover:text-accent"
                  >
                    <MapPin className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setEditTarget(place)}
                  aria-label={t.places.editPlace as string}
                  className="icon-btn tap-target text-muted hover:text-white"
                >
                  <Edit2 className="h-3.5 w-3.5" aria-hidden />
                </button>
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
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.statsOnMap as string}</div>
              <div className="text-2xl font-bold text-status-completed">{withGps}</div>
            </div>
            <div className={`rounded-xl border p-4 text-center ${noGpsCount > 0 ? 'border-status-on_hold/20 bg-status-on_hold/5' : 'border-border bg-bg-card'}`}>
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <AlertCircle className="h-3 w-3" aria-hidden />
                {t.places.noCoords as string}
              </div>
              <div className={`text-2xl font-bold ${noGpsCount > 0 ? 'text-status-on_hold' : ''}`}>
                {noGpsCount}
              </div>
            </div>
            <div className={`rounded-xl border p-4 text-center ${totalVns > 0 ? 'border-accent/30 bg-accent/5' : 'border-border bg-bg-card'}`}>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.vnBrowserTitle as string}</div>
              <div className={`text-2xl font-bold ${totalVns > 0 ? 'text-accent' : ''}`}>{totalVns}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.places.statsWithBranches as string}</div>
              <div className="text-2xl font-bold">{withBranches}</div>
            </div>
            <div className={`rounded-xl border p-4 text-center ${unassigned.length > 0 ? 'border-status-on_hold/20 bg-status-on_hold/5' : 'border-border bg-bg-card'}`}>
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <Link2Off className="h-3 w-3" aria-hidden />
                {t.places.statsUnassigned as string}
              </div>
              <div className={`text-2xl font-bold ${unassigned.length > 0 ? 'text-status-on_hold' : ''}`}>
                {unassigned.length}
              </div>
            </div>
          </>
        )}
      </div>

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
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
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
              GPS
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
            onClick={() => { setLoading(true); reload(); }}
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
            {filteredUnassigned.map((branch) => (
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
          {filtered.map((place) => (
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
          {filtered.map(renderPlaceRow)}
        </ul>
      )}

      {editTarget !== null && (
        <AddEditPlaceModal
          place={editTarget === 'new' ? null : editTarget}
          initialBranch={null}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); reload(); }}
        />
      )}
      {assignTarget !== null && (
        <AssignProviderDialog
          place={assignTarget}
          onClose={() => setAssignTarget(null)}
          onSaved={reload}
        />
      )}
      {assignBranchTarget !== null && (
        <AddEditPlaceModal
          place={null}
          initialBranch={assignBranchTarget}
          onClose={() => setAssignBranchTarget(null)}
          onSaved={async (newId) => {
            if (newId != null) {
              try {
                const r = await fetch(`/api/places/${newId}/link`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ provider_label: assignBranchTarget }),
                });
                if (!r.ok) throw new Error(await readApiError(r, t.common.error as string));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }
            setAssignBranchTarget(null);
            reload();
          }}
        />
      )}
    </DensityScopeProvider>
  );
}
