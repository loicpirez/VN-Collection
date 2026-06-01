import { asJsonRecord } from './json-shape';
import { hasFiniteCoordinates } from './place-coordinates';

const VIEW_STORAGE_KEY = 'places:map:view:v1';

interface SavedMapView {
  lat: number;
  lng: number;
  zoom: number;
}

function normalizeSavedMapView(value: unknown): SavedMapView | null {
  const record = asJsonRecord(value);
  if (
    !record ||
    typeof record.lat !== 'number' ||
    typeof record.lng !== 'number' ||
    typeof record.zoom !== 'number' ||
    !Number.isFinite(record.zoom) ||
    !hasFiniteCoordinates({ lat: record.lat, lng: record.lng })
  ) {
    return null;
  }
  return {
    lat: record.lat,
    lng: record.lng,
    zoom: Math.max(1, Math.min(20, record.zoom)),
  };
}

/** Reads a browser-persisted map viewport without importing Leaflet into SSR. */
export function readSavedMapView(): SavedMapView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    return normalizeSavedMapView(JSON.parse(raw));
  } catch {}
  return null;
}

/** Persists the latest map viewport when browser storage is available. */
export function writeSavedMapView(view: SavedMapView): void {
  if (typeof window === 'undefined') return;
  const normalized = normalizeSavedMapView(view);
  if (!normalized) return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(normalized));
  } catch {}
}

/** Removes the persisted map viewport without importing Leaflet into SSR. */
export function clearSavedMapView(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(VIEW_STORAGE_KEY);
  } catch {}
}
