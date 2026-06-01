const VIEW_STORAGE_KEY = 'places:map:view:v1';

interface SavedMapView {
  lat: number;
  lng: number;
  zoom: number;
}

/** Reads a browser-persisted map viewport without importing Leaflet into SSR. */
export function readSavedMapView(): SavedMapView | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedMapView>;
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
  } catch {}
  return null;
}

/** Persists the latest map viewport when browser storage is available. */
export function writeSavedMapView(view: SavedMapView): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {}
}

/** Removes the persisted map viewport without importing Leaflet into SSR. */
export function clearSavedMapView(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(VIEW_STORAGE_KEY);
  } catch {}
}
