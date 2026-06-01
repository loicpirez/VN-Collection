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
  it('hydrates from the server snapshot and aborts stale fallback requests', () => {
    const body = source('src/components/StockPricesSection.tsx');
    const page = source('src/app/vn/[id]/page.tsx');
    expect(body).toContain('extrasFromStockSnapshot(initialSnapshot)');
    expect(body).toContain('if (initialSnapshot)');
    expect(body).toContain('setLoading(false)');
    expect(page).toContain('<StockPricesSection vnId={vn.id} initialSnapshot={stockSnapshot} />');
    expect(body).toContain('const controller = new AbortController()');
    expect(body).toContain('fetchStockPriceExtras(vnId, controller.signal)');
    expect(body).toContain('setExtras(data)');
    expect(body).toContain('setError(null)');
    expect(body).toContain('setLoading(true)');
    expect(body).toContain('return () => controller.abort()');
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
