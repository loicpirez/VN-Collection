import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearSavedMapView,
  readSavedMapView,
  writeSavedMapView,
} from '@/lib/map-view-storage';

const VIEW_STORAGE_KEY = 'places:map:view:v1';

function setupStorage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) values.set(VIEW_STORAGE_KEY, initial);
  const localStorage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
  vi.stubGlobal('window', { localStorage });
  return { values, localStorage };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('map view storage', () => {
  it('reads valid coordinates and clamps zoom', () => {
    setupStorage(JSON.stringify({ lat: 35.6, lng: 139.7, zoom: 25 }));
    expect(readSavedMapView()).toEqual({ lat: 35.6, lng: 139.7, zoom: 20 });
  });

  it('returns null when no viewport has been persisted yet', () => {
    setupStorage();
    expect(readSavedMapView()).toBeNull();
  });

  it('rejects malformed, non-finite, and out-of-range persisted values', () => {
    const state = setupStorage('{');
    expect(readSavedMapView()).toBeNull();

    state.values.set(VIEW_STORAGE_KEY, JSON.stringify({ lat: 91, lng: 139.7, zoom: 10 }));
    expect(readSavedMapView()).toBeNull();

    state.values.set(VIEW_STORAGE_KEY, JSON.stringify({ lat: 35.6, lng: -181, zoom: 10 }));
    expect(readSavedMapView()).toBeNull();

    state.values.set(VIEW_STORAGE_KEY, JSON.stringify({ lat: 35.6, lng: 139.7, zoom: Number.NaN }));
    expect(readSavedMapView()).toBeNull();
  });

  it('persists normalized view state and refuses invalid centers', () => {
    const { localStorage } = setupStorage();
    writeSavedMapView({ lat: 35.6, lng: 139.7, zoom: 0 });
    expect(localStorage.setItem).toHaveBeenCalledWith(
      VIEW_STORAGE_KEY,
      JSON.stringify({ lat: 35.6, lng: 139.7, zoom: 1 }),
    );

    writeSavedMapView({ lat: 91, lng: 139.7, zoom: 10 });
    expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('clears persisted view state', () => {
    const { localStorage } = setupStorage();
    clearSavedMapView();
    expect(localStorage.removeItem).toHaveBeenCalledWith(VIEW_STORAGE_KEY);
  });

  it('is inert during server rendering', () => {
    expect(readSavedMapView()).toBeNull();
    expect(() => writeSavedMapView({ lat: 35.6, lng: 139.7, zoom: 10 })).not.toThrow();
    expect(() => clearSavedMapView()).not.toThrow();
  });
});
