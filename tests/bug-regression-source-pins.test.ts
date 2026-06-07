import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(__dirname, '..', path), 'utf8');
}

describe('metadata title template composition', () => {
  it.each([
    'src/app/map/page.tsx',
    'src/app/places/page.tsx',
    'src/app/places/[id]/page.tsx',
  ])('%s leaves product-name suffixing to the root layout', (path) => {
    expect(source(path)).not.toContain('t.app.title');
  });
});

describe('stock-price navigation race', () => {
  it('hydrates from snapshots where mounted and keeps stock prices off VN detail pages', () => {
    const body = source('src/components/StockPricesSection.tsx');
    const page = source('src/app/vn/[id]/page.tsx');
    expect(body).toContain('extrasFromStockSnapshot(initialSnapshot)');
    expect(body).toContain('if (initialSnapshot)');
    expect(body).toContain('setLoading(false)');
    expect(page).not.toContain('<StockPricesSection');
    expect(body).toContain('const controller = new AbortController()');
    expect(body).toContain('fetchStockPriceExtras(vnId, controller.signal)');
    expect(body).toContain('setExtras(data)');
    expect(body).toContain('setError(null)');
    expect(body).toContain('setLoading(true)');
    expect(body).toContain('return () => controller.abort()');
  });
});

describe('place and AliceNet navigation races', () => {
  it('surfaces per-place stock load failures instead of rendering an empty result', () => {
    const body = source('src/components/PlaceVnBrowser.tsx');
    expect(body).toContain("import { readApiError } from '@/lib/api-error-read'");
    expect(body).toContain("import { ErrorAlert } from './ErrorAlert'");
    expect(body).toContain('throw new Error(await readApiError(r, t.common.error as string))');
    expect(body).toContain('if (!d) throw new Error(t.common.error as string)');
    expect(body).toContain('<ErrorAlert title={t.common.error as string} className="mb-4">');
    expect(body).toContain('loadError && items.length === 0 ? null');
  });

  it.each([
    ['src/components/PlaceBrowser.tsx', 'reloadAbortRef.current?.abort()'],
    ['src/components/PlaceVnBrowser.tsx', 'load(controller.signal)'],
  ])('%s cancels its mount request during cleanup', (path, invocation) => {
    const body = source(path);
    expect(body).toContain('const controller = new AbortController()');
    expect(body).toContain(invocation);
    expect(body).toMatch(/return \(\) => (?:controller\.abort\(\)|\{[\s\S]*?\.current\?\.abort\(\);[\s\S]*?\})/);
    expect(body).toContain("error.name === 'AbortError'");
  });

  it('owns every AliceNet reload and aborts it during cleanup', () => {
    const body = source('src/components/AliceNetClient.tsx');
    expect(body).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('loadAbortRef.current?.abort()');
    expect(body).toContain("{ cache: 'no-store', signal }");
    expect(body).toContain('loadAbortRef.current !== controller');
    expect(body).toContain("error.name === 'AbortError'");
  });
});

describe('shelf fullscreen focus restoration', () => {
  it('delegates modal focus restoration to the shared dialog hook', () => {
    const body = source('src/components/ShelfSpatialFullscreen.tsx');
    expect(body).toContain('useDialogA11y({ open: fullscreen');
    expect(body).toContain("role={fullscreen ? 'dialog' : undefined}");
    expect(body).toContain("aria-modal={fullscreen ? 'true' : undefined}");
    expect(body).toContain('aria-labelledby={fullscreen ? fullscreenTitleId : undefined}');
  });
});

describe('shelf editor fullscreen accessibility', () => {
  it('applies the shared modal keyboard contract to the DnD editor overlay', () => {
    const body = source('src/components/ShelfLayoutEditor.tsx');
    expect(body).toContain('useDialogA11y({ open: fullscreen');
    expect(body).toContain("role={fullscreen ? 'dialog' : undefined}");
    expect(body).toContain("aria-modal={fullscreen ? 'true' : undefined}");
    expect(body).toContain('aria-labelledby={fullscreen ? fullscreenTitleId : undefined}');
  });
});

describe('single main landmark shell', () => {
  it.each([
    'src/app/map/page.tsx',
    'src/app/places/page.tsx',
    'src/app/places/[id]/page.tsx',
    'src/app/stock/loading.tsx',
  ])('%s leaves the primary main landmark to the root layout', (path) => {
    expect(source(path)).not.toContain('<main');
  });
});

describe('map loading skeleton', () => {
  it('announces the client-side map placeholder through the shared boundary', () => {
    const body = source('src/components/MapPageClient.tsx');
    expect(body).toContain('<SkeletonBoundary');
    expect(body).toContain('label={t.map.loadingMap as string}');
    expect(body).toContain('<SkeletonBlock className="h-full w-full rounded-lg" />');
  });

  it('keeps Leaflet behind the client-only dynamic boundary', () => {
    const body = source('src/components/MapPageClient.tsx');
    expect(body).toContain("import { clearSavedMapView } from '@/lib/map-view-storage'");
    expect(body).not.toContain("from './MapCanvas'");
  });

  it('uses explicit local marker icon assets', () => {
    const body = source('src/components/MapCanvas.tsx');
    expect(body).toContain("iconRetinaUrl: '/leaflet/marker-icon-2x.png'");
    expect(body).toContain("iconUrl: '/leaflet/marker-icon.png'");
    expect(body).toContain("shadowUrl: '/leaflet/marker-shadow.png'");
    expect(body).toContain('L.marker([place.lat, place.lng], { icon: markerIcon })');
    expect(body).not.toContain('unpkg.com');
    expect(body).not.toContain('Icon.Default.prototype');
  });
});
