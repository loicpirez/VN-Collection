// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { PlaceWithLinks } from '@/lib/db';
import { dictionaries, type Locale } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('leaflet/dist/leaflet.css', () => ({}));

/**
 * Hoisted Leaflet test double. Each created map/marker records the
 * calls the component makes so the test can assert which branch ran
 * and re-fire the `moveend` / `zoomend` / `popupopen` handlers the
 * component registers.
 */
const leaflet = vi.hoisted(() => {
  interface FakeMarker {
    latlng: [number, number];
    popupHtml: string;
    handlers: Record<string, () => void>;
    removed: boolean;
    getLatLng: () => { lat: number; lng: number };
    setLatLng: (c: [number, number]) => void;
    bindPopup: (html: string) => FakeMarker;
    setPopupContent: (html: string) => void;
    on: (evt: string, cb: () => void) => void;
    openPopup: () => void;
    remove: () => void;
    addTo: () => FakeMarker;
  }
  interface FakeMap {
    center: [number, number];
    zoom: number;
    handlers: Record<string, () => void>;
    invalidated: number;
    removed: boolean;
    on: (evt: string, cb: () => void) => void;
    setView: (c: [number, number], z: number) => FakeMap;
    getCenter: () => { lat: number; lng: number };
    getZoom: () => number;
    getBounds: () => {
      pad: (ratio: number) => {
        contains: (c: [number, number]) => boolean;
      };
    };
    invalidateSize: () => void;
    remove: () => void;
  }
  const state: {
    maps: FakeMap[];
    markers: FakeMarker[];
    tileLayerOpts: unknown[];
    lastMapOptions: Record<string, unknown> | null;
  } = { maps: [], markers: [], tileLayerOpts: [], lastMapOptions: null };

  function makeMarker(latlng: [number, number]): FakeMarker {
    const m: FakeMarker = {
      latlng,
      popupHtml: '',
      handlers: {},
      removed: false,
      getLatLng: () => ({ lat: m.latlng[0], lng: m.latlng[1] }),
      setLatLng: (c) => { m.latlng = c; },
      bindPopup: (html) => { m.popupHtml = html; return m; },
      setPopupContent: (html) => { m.popupHtml = html; },
      on: (evt, cb) => { m.handlers[evt] = cb; },
      openPopup: vi.fn(),
      remove: vi.fn(() => { m.removed = true; }),
      addTo: () => m,
    };
    state.markers.push(m);
    return m;
  }

  function makeMap(opts: Record<string, unknown>): FakeMap {
    state.lastMapOptions = opts;
    const map: FakeMap = {
      center: opts.center as [number, number],
      zoom: opts.zoom as number,
      handlers: {},
      invalidated: 0,
      removed: false,
      on: (evt, cb) => { map.handlers[evt] = cb; },
      setView: (c, z) => { map.center = c; map.zoom = z; return map; },
      getCenter: () => ({ lat: map.center[0], lng: map.center[1] }),
      getZoom: () => map.zoom,
      getBounds: () => ({
        pad: (ratio) => ({
          contains: ([lat, lng]) => {
            const radius = 2 * (1 + ratio);
            return Math.abs(lat - map.center[0]) <= radius && Math.abs(lng - map.center[1]) <= radius;
          },
        }),
      }),
      invalidateSize: () => { map.invalidated += 1; },
      remove: () => { map.removed = true; },
    };
    state.maps.push(map);
    return map;
  }

  const L = {
    icon: (o: unknown) => ({ _icon: o }),
    map: (_el: unknown, opts: Record<string, unknown>) => makeMap(opts),
    marker: (latlng: [number, number]) => makeMarker(latlng),
    tileLayer: (_url: string, opts: unknown) => {
      state.tileLayerOpts.push(opts);
      return { addTo: (_m: unknown) => ({}) };
    },
  };
  return { L, state };
});

vi.mock('leaflet', () => ({ default: leaflet.L }));

import { MapCanvas } from '@/components/MapCanvas';

function place(overrides: Partial<PlaceWithLinks> = {}): PlaceWithLinks {
  return {
    id: 1,
    name: 'Shop One',
    name_ja: null,
    kind: 'shop',
    address: null,
    lat: 35.68,
    lng: 139.69,
    url: null,
    notes: null,
    created_at: 1,
    updated_at: 1,
    provider_labels: [],
    stock_count: 0,
    stock_updated_at: null,
    ...overrides,
  };
}

const labels = {
  popupOpenLabel: 'View',
  popupStockLabel: (n: number) => `${n} in stock`,
  popupBranchesLabel: (n: number) => `${n} branch(es)`,
};

function lastMap() {
  return leaflet.state.maps[leaflet.state.maps.length - 1];
}

describe('MapCanvas branches', () => {
  beforeEach(() => {
    leaflet.state.maps.length = 0;
    leaflet.state.markers.length = 0;
    leaflet.state.tileLayerOpts.length = 0;
    leaflet.state.lastMapOptions = null;
    try { localStorage.clear(); } catch {}
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    cleanup();
  });

  it('does not create a map while external network is disallowed', () => {
    render(
      <MapCanvas
        places={[place()]}
        externalNetworkAllowed={false}
        {...labels}
      />,
    );
    expect(leaflet.state.maps).toHaveLength(0);
  });

  it('centers on the focused place when focusId resolves to a coordinate place', () => {
    render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 }), place({ id: 2, lat: 30, lng: 40 })]}
        focusId={2}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(leaflet.state.lastMapOptions?.center).toEqual([30, 40]);
    expect(leaflet.state.lastMapOptions?.zoom).toBe(15);
    // One tile layer added with CARTO options.
    expect(leaflet.state.tileLayerOpts).toHaveLength(1);
    // A marker was created and bound a popup with the open label.
    expect(leaflet.state.markers.length).toBeGreaterThan(0);
    expect(leaflet.state.markers[0].popupHtml).toContain('View');
  });

  it('centers on requestedFocus coords when no focusId place matches', () => {
    render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        focusId={999}
        focusLat={51.5}
        focusLng={-0.12}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(lastMap().center).toEqual([51.5, -0.12]);
    expect(lastMap().zoom).toBe(15);
  });

  it('restores a saved viewport when no focus is provided', () => {
    localStorage.setItem('places:map:view:v1', JSON.stringify({ lat: 1.23, lng: 4.56, zoom: 9 }));
    render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(lastMap().center).toEqual([1.23, 4.56]);
    expect(lastMap().zoom).toBe(9);
  });

  it('falls back to the first place when nothing else applies', () => {
    render(
      <MapCanvas
        places={[place({ id: 5, lat: 12, lng: 13 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(lastMap().center).toEqual([12, 13]);
    expect(lastMap().zoom).toBe(12);
  });

  it('defaults to Tokyo when there are no coordinate places at all', () => {
    render(
      <MapCanvas
        places={[]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(lastMap().center).toEqual([35.6894, 139.6917]);
    expect(lastMap().zoom).toBe(12);
  });

  it('persists the viewport on moveend after the debounce window', () => {
    render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    map.center = [44, 55];
    map.zoom = 7;
    // Fire moveend twice to also exercise the clearTimeout branch.
    map.handlers.moveend();
    map.handlers.zoomend();
    vi.advanceTimersByTime(400);
    const saved = JSON.parse(localStorage.getItem('places:map:view:v1') ?? 'null');
    expect(saved).toEqual({ lat: 44, lng: 55, zoom: 7 });
  });

  it('renders name_ja inside the popup when present', () => {
    render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20, name: 'A & B <x>', name_ja: 'ジャパン' })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const html = leaflet.state.markers[0].popupHtml;
    expect(html).toContain('ジャパン');
    // HTML-escaped name.
    expect(html).toContain('A &amp; B &lt;x&gt;');
  });

  it('escapes every interpolated popup field before giving HTML to Leaflet', () => {
    const malicious = '<img src=x onerror=alert(1)>&"\'';
    render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20, name: malicious, name_ja: malicious, address: '<address>', stock_count: 2, provider_labels: ['p'] })]}
        externalNetworkAllowed
        popupOpenLabel="<open>"
        popupStockLabel={() => '<stock>'}
        popupBranchesLabel={() => '<branches>'}
      />,
    );
    const html = leaflet.state.markers[0].popupHtml;
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<open>');
    expect(html).not.toContain('<stock>');
    expect(html).not.toContain('<branches>');
    expect(html).not.toContain('<address>');
    expect(html).not.toContain('&lt;address&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;&amp;&quot;&#39;');
    expect(html).toContain('&lt;open&gt;');
    expect(html).toContain('&lt;stock&gt;');
    expect(html).toContain('&lt;branches&gt;');
  });

  it.each(['en', 'fr', 'ja'] as const)('uses localized popup labels for %s', (locale: Locale) => {
    const t = dictionaries[locale];
    render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20, stock_count: 3, provider_labels: ['A', 'B'] })]}
        externalNetworkAllowed
        popupOpenLabel={t.map.popupOpen}
        popupStockLabel={(n) => t.map.popupStock.replace('{n}', String(n))}
        popupBranchesLabel={(n) => (n === 1 ? t.map.popupBranch : t.map.popupBranches).replace('{n}', String(n))}
      />,
    );
    const html = leaflet.state.markers[0].popupHtml;
    expect(html).toContain(t.map.popupOpen);
    expect(html).toContain(t.map.popupStock.replace('{n}', '3'));
    expect(html).toContain(t.map.popupBranches.replace('{n}', '2'));
  });

  it('invokes onMarkerFocus when a marker popup opens', () => {
    const onMarkerFocus = vi.fn();
    render(
      <MapCanvas
        places={[place({ id: 42, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        onMarkerFocus={onMarkerFocus}
        {...labels}
      />,
    );
    leaflet.state.markers[0].handlers.popupopen();
    expect(onMarkerFocus).toHaveBeenCalledWith(42);
  });

  it('updates, moves, and removes markers when the places prop changes', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 }), place({ id: 2, lat: 30, lng: 40 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(leaflet.state.markers).toHaveLength(2);
    const markerOne = leaflet.state.markers.find((m) => m.latlng[0] === 10)!;
    const markerTwo = leaflet.state.markers.find((m) => m.latlng[0] === 30)!;

    // Place 1 moves to new valid coordinates, place 2 is dropped.
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 44, lng: 55 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(markerOne.latlng).toEqual([44, 55]);
    expect(markerTwo.remove).toHaveBeenCalled();
    // No third marker was created for the reused id.
    expect(leaflet.state.markers).toHaveLength(2);
  });

  it('bounds-filters large marker sets and resynchronizes after viewport movement', () => {
    const places = Array.from({ length: 90 }, (_unused, index) => place({
      id: index + 1,
      lat: index,
      lng: index,
      name: `Shop ${index + 1}`,
    }));
    render(
      <MapCanvas
        places={places}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    const initialVisible = leaflet.state.markers.filter((marker) => !marker.removed);
    expect(initialVisible).toHaveLength(3);
    expect(initialVisible.map((marker) => marker.latlng[0])).toEqual([0, 1, 2]);

    map.center = [50, 50];
    map.handlers.moveend();

    const movedVisible = leaflet.state.markers.filter((marker) => !marker.removed);
    expect(movedVisible.map((marker) => marker.latlng[0])).toEqual([48, 49, 50, 51, 52]);
    expect(initialVisible.every((marker) => marker.removed)).toBe(true);
  });

  it('keeps an explicitly focused place rendered outside the current large-set viewport', () => {
    const places = Array.from({ length: 90 }, (_unused, index) => place({
      id: index + 1,
      lat: index,
      lng: index,
    }));
    const { rerender } = render(
      <MapCanvas
        places={places}
        externalNetworkAllowed
        {...labels}
      />,
    );

    rerender(
      <MapCanvas
        places={places}
        focusId={90}
        externalNetworkAllowed
        {...labels}
      />,
    );

    const focusedMarker = leaflet.state.markers.find((marker) => marker.latlng[0] === 89);
    expect(focusedMarker?.removed).toBe(false);
    vi.advanceTimersByTime(100);
    expect(focusedMarker?.openPopup).toHaveBeenCalled();
  });

  it('removes a marker whose coordinates become invalid', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const marker = leaflet.state.markers[0];
    // Latitude 200 is out of range, so the place is filtered out.
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 200, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(marker.remove).toHaveBeenCalled();
  });

  it('keeps marker position when coordinates are unchanged across rerenders', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const marker = leaflet.state.markers[0];
    const setLatLng = vi.spyOn(marker, 'setLatLng');
    // Same coords, different label -> setPopupContent runs, setLatLng does not.
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
        popupOpenLabel="Open"
      />,
    );
    expect(setLatLng).not.toHaveBeenCalled();
    expect(marker.popupHtml).toContain('Open');
  });

  it('focuses an existing marker and opens its popup when focusId changes', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    const setView = vi.spyOn(map, 'setView');
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        focusId={1}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(setView).toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(leaflet.state.markers[0].openPopup).toHaveBeenCalled();
  });

  it('falls back to requestedFocus coords when focusId has no marker', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    const setView = vi.spyOn(map, 'setView');
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        focusId={777}
        focusLat={12}
        focusLng={13}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(setView).toHaveBeenCalledWith([12, 13], expect.any(Number));
  });

  it('applies an explicit searchTarget zoom', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    const setView = vi.spyOn(map, 'setView');
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        searchTarget={{ lat: 1, lng: 2, zoom: 17 }}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(setView).toHaveBeenCalledWith([1, 2], 17);
  });

  it('derives a search zoom when searchTarget omits one', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    map.zoom = 5;
    const setView = vi.spyOn(map, 'setView');
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        searchTarget={{ lat: 1, lng: 2 }}
        externalNetworkAllowed
        {...labels}
      />,
    );
    expect(setView).toHaveBeenCalledWith([1, 2], 13);
  });

  it('invalidates size after the sizeClass debounce when it changes', () => {
    const { rerender } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        sizeClass="h-1"
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    rerender(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        sizeClass="h-2"
        externalNetworkAllowed
        {...labels}
      />,
    );
    vi.advanceTimersByTime(40);
    expect(map.invalidated).toBeGreaterThan(0);
  });

  it('tears down the map on unmount', () => {
    const { unmount } = render(
      <MapCanvas
        places={[place({ id: 1, lat: 10, lng: 20 })]}
        externalNetworkAllowed
        {...labels}
      />,
    );
    const map = lastMap();
    // Schedule a pending save so the unmount clearTimeout branch runs.
    map.handlers.moveend();
    unmount();
    expect(map.removed).toBe(true);
  });
});
