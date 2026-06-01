'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import type { PlaceWithLinks } from '@/lib/db';
import { clearSavedMapView } from '@/lib/map-view-storage';
import { geocodingAcceptLanguage } from '@/lib/map-privacy';
import { AddEditPlaceModal } from './AddEditPlaceModal';
import { hasFiniteCoordinates } from '@/lib/place-coordinates';
import { decodeNominatimResults, type NominatimResult } from '@/lib/nominatim-shape';
import { SkeletonBlock, SkeletonBoundary } from './Skeleton';
import { MapPrivacyControl } from './MapPrivacyControl';

type MapSize = 'compact' | 'normal' | 'large' | 'tall';

const SIZE_CLASSES: Record<MapSize, string> = {
  compact: 'h-[35vh] min-h-[280px]',
  normal:  'h-[55vh] min-h-[400px]',
  large:   'h-[72vh] min-h-[500px]',
  tall:    'h-[88vh] min-h-[600px]',
};
const MAP_SIZE_KEY = 'vncoll.map.size.v1';

function loadMapSize(): MapSize {
  if (typeof window === 'undefined') return 'normal';
  try {
    const v = window.localStorage.getItem(MAP_SIZE_KEY);
    if (v === 'compact' || v === 'normal' || v === 'large' || v === 'tall') return v;
  } catch { /* ignore */ }
  return 'normal';
}

const MapCanvas = dynamic(() => import('./MapCanvas').then((m) => m.MapCanvas), {
  ssr: false,
  loading: () => <MapLoadingPlaceholder />,
});

function MapLoadingPlaceholder() {
  const t = useT();
  return (
    <SkeletonBoundary
      label={t.map.loadingMap as string}
      className="h-[55vh] min-h-[400px] w-full rounded-xl border border-border bg-bg-card p-3"
    >
      <SkeletonBlock className="h-full w-full rounded-lg" />
    </SkeletonBoundary>
  );
}

interface Props {
  places: PlaceWithLinks[];
  focusLat?: number | null;
  focusLng?: number | null;
  focusId?: number | null;
}

export function MapPageClient({ places, focusLat, focusLng, focusId }: Props) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();

  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchTarget, setSearchTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [activePlaceId, setActivePlaceId] = useState<number | null>(focusId ?? null);
  const [resetKey, setResetKey] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [mapSize, setMapSize] = useState<MapSize>(loadMapSize);
  const [externalNetworkAllowed, setExternalNetworkAllowed] = useState(false);
  const searchControllerRef = useRef<AbortController | null>(null);

  const handleExternalNetworkChange = useCallback((enabled: boolean) => {
    setExternalNetworkAllowed(enabled);
    if (!enabled) {
      searchControllerRef.current?.abort();
      searchControllerRef.current = null;
      setSearching(false);
      setSearchResults([]);
      setSearchError(null);
    }
  }, []);

  useEffect(() => () => searchControllerRef.current?.abort(), []);

  useEffect(() => {
    setActivePlaceId(focusId ?? null);
    setSearchTarget(null);
  }, [focusId, focusLat, focusLng]);

  function changeSize(s: MapSize) {
    setMapSize(s);
    try { window.localStorage.setItem(MAP_SIZE_KEY, s); } catch { /* ignore */ }
  }

  const withCoords = places.filter(hasFiniteCoordinates);
  const withoutCoords = places.filter((p) => !hasFiniteCoordinates(p));
  const invalidCoords = places.filter(
    (p) => (p.lat != null || p.lng != null) && !hasFiniteCoordinates(p),
  );

  async function doSearch() {
    const q = searchQ.trim();
    if (!q) return;
    if (!externalNetworkAllowed) {
      setSearchError(t.map.externalPrivacyRequired as string);
      return;
    }
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearching(true);
    setSearchResults([]);
    setSearchError(null);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=jsonv2&limit=5`,
        { headers: { 'Accept-Language': geocodingAcceptLanguage(locale) }, signal: controller.signal },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const data = decodeNominatimResults(await res.json());
      if (!data) throw new Error('invalid Nominatim payload');
      if (controller.signal.aborted || searchControllerRef.current !== controller) return;
      if (data.length === 0) setSearchError(t.map.searchEmpty as string);
      else setSearchResults(data);
    } catch {
      if (!controller.signal.aborted && searchControllerRef.current === controller) setSearchError(t.map.searchError as string);
    } finally {
      if (searchControllerRef.current === controller) {
        searchControllerRef.current = null;
        setSearching(false);
      }
    }
  }

  function pickSearchResult(r: NominatimResult) {
    const target = { lat: Number(r.lat), lng: Number(r.lon), zoom: 14 };
    if (!hasFiniteCoordinates(target)) {
      setSearchError(t.map.searchError as string);
      return;
    }
    setSearchTarget(target);
    setSearchResults([]);
    setSearchQ('');
    setSearchError(null);
  }

  function clearSearch() {
    searchControllerRef.current?.abort();
    searchControllerRef.current = null;
    setSearching(false);
    setSearchQ('');
    setSearchResults([]);
    setSearchError(null);
  }

  function handleSidebarClick(place: PlaceWithLinks) {
    setActivePlaceId(place.id);
    if (hasFiniteCoordinates(place)) {
      setSearchTarget({ lat: place.lat, lng: place.lng, zoom: 15 });
    }
  }

  function handleResetView() {
    clearSavedMapView();
    setSearchTarget(null);
    setActivePlaceId(null);
    setResetKey((k) => k + 1);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-white">{t.map.title as string}</h1>
          <p className="mt-1 text-sm text-muted">{t.map.subtitle as string}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleResetView}
            className="btn btn-sm bg-bg-elev text-muted hover:text-white"
            title={t.map.resetView as string}
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="ml-1.5">{t.map.resetView as string}</span>
          </button>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn btn-sm bg-accent text-bg hover:bg-accent/80"
          >
            <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="ml-1">{t.map.addPlace as string}</span>
          </button>
        </div>
      </div>

      <div className="mb-3">
        <MapPrivacyControl onChange={handleExternalNetworkChange} />
      </div>

      <div className="relative mb-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute inset-y-0 left-3 my-auto h-3.5 w-3.5 text-muted"
              aria-hidden
            />
            <input
              className="input min-h-[44px] w-full pl-9 text-sm"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              disabled={!externalNetworkAllowed}
              placeholder={t.map.searchPlaceholder as string}
              aria-label={t.map.searchPlaceholder as string}
            />
            {(searchQ || searchResults.length > 0) && (
              <button
                type="button"
                onClick={clearSearch}
                className="tap-target absolute inset-y-0 right-2 my-auto flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
                aria-label={t.common.close as string}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={doSearch}
            disabled={searching || !searchQ.trim() || !externalNetworkAllowed}
            className="btn btn-sm bg-bg-elev text-muted hover:text-white"
          >
            {t.places.geocodeButton as string}
          </button>
        </div>
        {searchError && (
          <p className="mt-1 text-[11px] text-status-dropped">{searchError}</p>
        )}
        {searchResults.length > 0 && (
          <ul
            role="listbox"
            className="absolute z-[9999] mt-1 w-full overflow-hidden rounded-lg border border-border bg-bg-card shadow-card"
          >
            {searchResults.map((r, i) => (
              <li key={i} role="option" aria-selected={false}>
                <button
                  type="button"
                  onClick={() => pickSearchResult(r)}
                  className="min-h-[44px] w-full px-3 py-2 text-left text-[12px] text-muted hover:bg-bg-elev hover:text-white"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mb-4 flex items-center justify-end gap-1" role="group" aria-label={t.map.mapSizeLabel as string}>
        {(['compact', 'normal', 'large', 'tall'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => changeSize(s)}
            aria-pressed={mapSize === s}
            className={`min-h-[44px] rounded border px-2 py-0.5 text-[11px] transition-colors ${
              mapSize === s
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-elev/30 text-muted hover:border-accent/50 hover:text-white'
            }`}
          >
            {t.map[`mapSize${s.charAt(0).toUpperCase()}${s.slice(1)}` as 'mapSizeCompact' | 'mapSizeNormal' | 'mapSizeLarge' | 'mapSizeTall'] as string}
          </button>
        ))}
      </div>

      {invalidCoords.length > 0 && (
        <p role="alert" className="mb-3 text-sm text-status-onhold">
          {(t.map.invalidCoordinates as string).replace('{n}', String(invalidCoords.length))}
        </p>
      )}

      {withCoords.length === 0 ? (
        <p className="text-sm text-muted">{t.map.noPlaces as string}</p>
      ) : !externalNetworkAllowed ? (
        <div className={`flex w-full items-center justify-center rounded-xl border border-border bg-bg-card p-6 ${SIZE_CLASSES[mapSize]}`}>
          <p className="max-w-md text-center text-sm text-muted">{t.map.externalMapDisabled as string}</p>
        </div>
      ) : (
        <MapCanvas
          key={resetKey}
          places={withCoords}
          focusLat={focusLat}
          focusLng={focusLng}
          focusId={activePlaceId}
          searchTarget={searchTarget}
          onMarkerFocus={(id) => setActivePlaceId(id)}
          popupOpenLabel={t.map.popupOpen as string}
          popupStockLabel={(n) => (t.map.popupStock as string).replace('{n}', String(n))}
          popupBranchesLabel={(n) => (t.map.popupBranches as string).replace('{n}', String(n))}
          sizeClass={SIZE_CLASSES[mapSize]}
          externalNetworkAllowed={externalNetworkAllowed}
        />
      )}

      <div className="mt-6 space-y-4">
        {withCoords.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
              {t.map.allPlaces as string}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {withCoords.map((place) => (
                <PlaceSidebarItem
                  key={place.id}
                  place={place}
                  t={t}
                  active={activePlaceId === place.id}
                  onClick={handleSidebarClick}
                />
              ))}
            </div>
          </div>
        )}

        {withoutCoords.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted">
              {t.map.noCoords as string}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {withoutCoords.map((place) => (
                <PlaceSidebarItem
                  key={place.id}
                  place={place}
                  t={t}
                  active={activePlaceId === place.id}
                  onClick={handleSidebarClick}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddEditPlaceModal
          place={null}
          onClose={() => setShowAddModal(false)}
          onSaved={(newId) => {
            setShowAddModal(false);
            router.refresh();
            if (newId != null) setActivePlaceId(newId);
          }}
        />
      )}
    </div>
  );
}

function PlaceSidebarItem({
  place,
  t,
  active,
  onClick,
}: {
  place: PlaceWithLinks;
  t: ReturnType<typeof useT>;
  active: boolean;
  onClick: (place: PlaceWithLinks) => void;
}) {
  const hasCoords = hasFiniteCoordinates(place);
  return (
    <div
      className={`group flex items-center gap-3 rounded-lg border bg-bg-card px-3 py-2.5 transition-colors ${
        active ? 'border-accent/60 bg-accent/5' : 'border-border hover:border-accent/30'
      }`}
    >
      <button
        type="button"
        onClick={() => onClick(place)}
        className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left"
        title={hasCoords ? (t.map.focusPlace as string) : undefined}
        disabled={!hasCoords}
      >
        <MapPin
          className={`h-3.5 w-3.5 shrink-0 ${hasCoords ? (active ? 'text-accent' : 'text-muted group-hover:text-accent/70') : 'text-muted/30'}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">{place.name}</p>
          {place.name_ja && (
            <p className="truncate text-[11px] text-muted">{place.name_ja}</p>
          )}
        </div>
      </button>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {place.stock_count > 0 ? (
          <span className="text-[11px] font-bold text-accent">
            {(t.map.popupStock as string).replace('{n}', String(place.stock_count))}
          </span>
        ) : (
          <span className="text-[11px] text-muted">{t.places.noStock as string}</span>
        )}
        <Link
          href={`/places/${place.id}`}
          className="inline-flex min-h-[44px] items-center text-[10px] text-muted/60 hover:text-accent/80"
          onClick={(e) => e.stopPropagation()}
        >
          {t.places.openPlace as string}
        </Link>
      </div>
    </div>
  );
}
