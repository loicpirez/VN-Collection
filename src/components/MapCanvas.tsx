'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PlaceWithLinks } from '@/lib/db';

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const VIEW_STORAGE_KEY = 'places:map:view:v1';

interface SavedView {
  lat: number;
  lng: number;
  zoom: number;
}

function readSavedView(): SavedView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedView>;
    if (
      typeof parsed.lat === 'number' &&
      typeof parsed.lng === 'number' &&
      typeof parsed.zoom === 'number' &&
      Number.isFinite(parsed.lat) &&
      Number.isFinite(parsed.lng) &&
      Number.isFinite(parsed.zoom)
    ) {
      return { lat: parsed.lat, lng: parsed.lng, zoom: Math.max(1, Math.min(20, parsed.zoom)) };
    }
  } catch {
    return null;
  }
  return null;
}

function writeSavedView(view: SavedView): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // localStorage may be unavailable (privacy mode, etc.) — silent fail
  }
}

interface Props {
  places: PlaceWithLinks[];
  focusLat?: number | null;
  focusLng?: number | null;
  focusId?: number | null;
  searchTarget?: { lat: number; lng: number; zoom?: number } | null;
  onMarkerFocus?: (placeId: number) => void;
  popupOpenLabel: string;
  popupStockLabel: (n: number) => string;
  popupBranchesLabel: (n: number) => string;
}

function buildPopup(
  place: PlaceWithLinks,
  popupStockLabel: (n: number) => string,
  popupBranchesLabel: (n: number) => string,
  popupOpenLabel: string,
): string {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  return `
    <div style="font-family:system-ui;min-width:160px">
      <strong style="display:block;margin-bottom:4px;font-size:13px">${escape(place.name)}</strong>
      ${place.name_ja ? `<span style="display:block;font-size:11px;color:#94a3b8;margin-bottom:4px">${escape(place.name_ja)}</span>` : ''}
      <span style="display:block;font-size:11px;color:#94a3b8">${escape(popupStockLabel(place.stock_count))}</span>
      <span style="display:block;font-size:11px;color:#94a3b8;margin-bottom:8px">${escape(popupBranchesLabel(place.provider_labels.length))}</span>
      <a href="/places/${place.id}" style="font-size:12px;color:#818cf8;text-decoration:underline">${escape(popupOpenLabel)}</a>
    </div>
  `;
}

export function MapCanvas({
  places,
  focusLat,
  focusLng,
  focusId,
  searchTarget,
  onMarkerFocus,
  popupOpenLabel,
  popupStockLabel,
  popupBranchesLabel,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Map<number, L.Marker>>(new Map());
  const onMarkerFocusRef = useRef(onMarkerFocus);
  onMarkerFocusRef.current = onMarkerFocus;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const withCoords = places.filter((p) => p.lat != null && p.lng != null);
    const focusPlace = focusId != null ? withCoords.find((p) => p.id === focusId) : null;
    const saved = readSavedView();

    let center: [number, number];
    let zoom: number;
    if (focusPlace) {
      center = [focusPlace.lat!, focusPlace.lng!];
      zoom = 15;
    } else if (focusLat != null && focusLng != null) {
      center = [focusLat, focusLng];
      zoom = 15;
    } else if (saved) {
      center = [saved.lat, saved.lng];
      zoom = saved.zoom;
    } else if (withCoords.length > 0) {
      center = [withCoords[0].lat!, withCoords[0].lng!];
      zoom = 12;
    } else {
      center = [35.6894, 139.6917];
      zoom = 12;
    }

    const map = L.map(containerRef.current, {
      center,
      zoom,
      scrollWheelZoom: true,
    });
    mapRef.current = map;

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      },
    ).addTo(map);

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    const persist = (): void => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const c = map.getCenter();
        writeSavedView({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
      }, 400);
    };
    map.on('moveend', persist);
    map.on('zoomend', persist);

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
      markersRef.current.clear();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const withCoords = places.filter((p) => p.lat != null && p.lng != null);
    const current = markersRef.current;
    const nextIds = new Set(withCoords.map((p) => p.id));
    for (const [id, marker] of current.entries()) {
      if (!nextIds.has(id)) {
        marker.remove();
        current.delete(id);
      }
    }
    for (const place of withCoords) {
      const html = buildPopup(place, popupStockLabel, popupBranchesLabel, popupOpenLabel);
      const existing = current.get(place.id);
      if (existing) {
        const [curLat, curLng] = [existing.getLatLng().lat, existing.getLatLng().lng];
        if (curLat !== place.lat || curLng !== place.lng) existing.setLatLng([place.lat!, place.lng!]);
        existing.setPopupContent(html);
      } else {
        const marker = L.marker([place.lat!, place.lng!]).addTo(map);
        marker.bindPopup(html);
        const pid = place.id;
        marker.on('popupopen', () => { onMarkerFocusRef.current?.(pid); });
        current.set(place.id, marker);
      }
    }
  }, [places, popupOpenLabel, popupStockLabel, popupBranchesLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (focusId != null) {
      const marker = markersRef.current.get(focusId);
      if (marker) {
        map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
        setTimeout(() => marker.openPopup(), 100);
        return;
      }
    }
    if (focusLat != null && focusLng != null) {
      map.setView([focusLat, focusLng], Math.max(map.getZoom(), 14));
    }
  }, [focusId, focusLat, focusLng, places]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !searchTarget) return;
    const targetZoom = searchTarget.zoom ?? Math.max(map.getZoom(), 13);
    map.setView([searchTarget.lat, searchTarget.lng], targetZoom);
  }, [searchTarget]);

  return (
    <div
      ref={containerRef}
      className="h-[60vh] min-h-[400px] w-full rounded-xl border border-border overflow-hidden"
    />
  );
}

export function clearSavedMapView(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(VIEW_STORAGE_KEY);
  } catch {
    // ignore
  }
}
