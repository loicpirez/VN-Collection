import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('responsive tap targets', () => {
  it('keeps VN detail action buttons and menus at touch-safe height', () => {
    const src = source('src/components/VnDetailActionsBar.tsx');
    expect(src).toContain('const ACTION_BUTTON_CLASSES');
    expect(src).toContain('min-h-[44px]');
    expect(src).toContain('[role="menuitem"]');
  });

  it('keeps media and cover adjustment controls touch-safe', () => {
    expect(source('src/components/MediaGallery.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/CoverRotationButtons.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/AspectOverrideControl.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/CoverQuickActions.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/HeroBanner.tsx')).toContain('sm:min-h-0');
  });

  it('keeps floating and input chip controls touch-safe', () => {
    // ToastProvider migrated from `min-h-[44px] min-w-[44px]` on the
    // dismiss button to the `.tap-target` utility class. The visible
    // chrome is smaller (the toast no longer leaves an empty 20-px
    // band below single-line text — see
    // tests/toast-no-empty-bottom-space.test.ts) but the WCAG-AA
    // ±10-px invisible hit area is provided by the CSS pseudo-element.
    const toast = source('src/components/ToastProvider.tsx');
    expect(toast).toMatch(/tap-target|min-h-\[44px\]/);
    expect(source('src/components/TagInput.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/DateInput.tsx')).toContain('min-h-[44px]');
  });

  it('keeps detail reorder, density, mobile nav, and game-log controls touch-safe', () => {
    expect(source('src/components/DetailReorderLayout.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/CardDensitySlider.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/MoreNavMenu.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/GameLog.tsx')).toContain('min-h-[44px]');
  });

  it('keeps activity-timeline delete controls touch-safe without inflating desktop rows', () => {
    const activity = source('src/components/ActivityTimeline.tsx');
    expect(activity).toContain('inline-flex min-h-[44px] min-w-[44px] items-center justify-center');
    expect(activity).toContain('sm:min-h-0 sm:min-w-0');
  });

  it('adds touch-safe horizontal section navigation on VN detail pages', () => {
    const detail = source('src/components/VnDetailLayout.tsx');
    expect(detail).toContain('aria-label={t.vnLayout.mobileNavigation}');
    expect(detail).toContain('overflow-x-auto');
    expect(detail).toContain('href={`#section-${id}`}');
    expect(detail).toContain('min-h-[44px]');
  });

  it('keeps settings tabs and per-page layout controls reachable on narrow screens', () => {
    const src = source('src/components/SettingsButton.tsx');
    expect(src).toContain('overflow-x-auto');
    expect(src).toContain('shrink-0');
    expect(src).toContain('min-h-[44px]');
  });

  it('keeps shelf fullscreen and editor controls touch-safe without inflating desktop density', () => {
    const fullscreen = source('src/components/ShelfSpatialFullscreen.tsx');
    const editor = source('src/components/ShelfLayoutEditor.tsx');
    expect(fullscreen).toContain('min-h-[44px]');
    expect(fullscreen).toContain('sm:min-h-0');
    expect(editor).toContain('min-h-[44px]');
    expect(editor).toContain('sm:min-h-0');
  });

  it('keeps shared inputs and hand-built shelf or layout controls touch-safe', () => {
    const css = source('src/app/globals.css');
    const shelf = source('src/components/ShelfLayoutEditor.tsx');
    const layout = source('src/components/DetailReorderLayout.tsx');
    expect(css).toMatch(/\.input\s*\{[\s\S]*min-h-\[44px\]/);
    expect(shelf).toContain('inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border');
    expect(shelf).toContain('className="min-h-[44px] flex-1 rounded border');
    expect(layout).toContain('className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border');
  });

  it('keeps stock refresh actions visible and query controls touch-safe on narrow screens', () => {
    const stock = source('src/components/StockPanel.tsx');
    expect(stock).toContain('aria-busy={isRefreshingThis}');
    expect(stock).toContain('className="absolute right-1.5 top-1.5 inline-flex h-11 w-11');
    expect(stock).not.toContain('top-1.5 hidden h-6 w-6');
    expect(stock).toContain('min-h-[44px] flex-1 rounded-md');
    expect(stock).toContain('sm:min-h-[36px]');
  });

  it('keeps stock provider setup compact until the user opens it', () => {
    const stock = source('src/components/StockPanel.tsx');
    expect(stock).toContain('const [providerSetupOpen, setProviderSetupOpen]');
    expect(stock).toContain('open={providerSetupOpen}');
    expect(stock).toContain('setProviderSetupOpen((e.currentTarget as HTMLDetailsElement).open)');
  });

  it('keeps map and place browsing controls touch-safe', () => {
    const map = source('src/components/MapPageClient.tsx');
    const modal = source('src/components/AddEditPlaceModal.tsx');
    const places = source('src/components/PlaceBrowser.tsx');
    const stock = source('src/components/PlaceVnBrowser.tsx');
    expect(map).toContain('tap-target absolute inset-y-0 right-2');
    expect(map).toContain('className={`min-h-[44px] rounded border px-2 py-0.5');
    expect(map).toContain('className="min-h-[44px] w-full px-3 py-2');
    expect(modal).toContain('className="min-h-[44px] w-full rounded border');
    expect(places).not.toContain('min-h-[36px]');
    expect(stock).not.toContain('min-h-[32px]');
    expect(stock).not.toContain('min-h-[36px]');
  });

  it('keeps secondary stock and place management controls touch-safe', () => {
    const assign = source('src/components/AssignProviderDialog.tsx');
    const batch = source('src/components/StockBatchClient.tsx');
    const placeCard = source('src/components/PlaceCard.tsx');
    const kobe = source('src/components/AliceNetKobeClient.tsx');
    expect(assign).toContain('className="input min-h-[44px] w-full pl-8 text-sm"');
    expect(assign).toContain('inline-flex min-h-[44px] shrink-0 items-center');
    expect(batch).toContain('className="tap-target rounded p-0.5');
    expect(batch).toContain('sm:min-h-[36px]');
    expect(batch).toContain('sm:min-h-0');
    expect(placeCard).toContain('sm:min-h-[32px]');
    expect(kobe).toContain('sm:min-h-[32px]');
  });

  it('keeps VN-detail secondary actions and shelf navigation touch-safe without inflating desktop rows', () => {
    for (const path of [
      'src/components/CoverEditOverlay.tsx',
      'src/components/BannerControls.tsx',
      'src/components/CoverUploader.tsx',
      'src/components/StockPanelBoundary.tsx',
      'src/components/ScoreSection.tsx',
      'src/components/VnDetailLayout.tsx',
      'src/components/ReleaseOwnedToggle.tsx',
      'src/components/VndbStatusPanel.tsx',
      'src/components/EgsPanel.tsx',
      'src/components/ShelfSpatialView.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('min-h-[44px]');
      expect(body, path).toMatch(/sm:min-h-(?:0|\[36px\])/);
    }
  });

  it('keeps source-comparison, artwork-picker, and series-layout controls touch-safe', () => {
    for (const path of [
      'src/components/SourceSwitcher.tsx',
      'src/components/FieldCompare.tsx',
      'src/components/BrandCompare.tsx',
      'src/components/PlaytimeCompare.tsx',
      'src/components/CoverCompare.tsx',
      'src/components/CoverSourcePicker.tsx',
      'src/components/BannerSourcePicker.tsx',
      'src/components/SeriesDetailLayout.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('min-h-[44px]');
      expect(body, path).toContain('sm:min-h-0');
    }
  });

  it('keeps smart-status confirmation and list-membership navigation touch-safe', () => {
    const smartStatus = source('src/components/SmartStatusHint.tsx');
    const listMemberships = source('src/components/VnListMemberships.tsx');
    expect(smartStatus).toContain('className="min-h-[44px] rounded-md bg-accent');
    expect(smartStatus).toContain('sm:min-h-0');
    expect(listMemberships).toContain('className="inline-flex min-h-[44px] items-center px-1');
    expect(listMemberships).toContain('sm:min-h-0');
  });

  it('keeps route tracking completion, notes, and suggestion controls touch-safe', () => {
    const routes = source('src/components/RoutesSection.tsx');
    expect(routes).toContain('className={`tap-target flex h-6 w-6');
    expect(routes).toContain('className="min-h-[44px] rounded-md border border-border px-2 py-0.5');
    expect(routes).toContain('className="inline-flex min-h-[44px] items-center gap-1 rounded-md bg-accent');
    expect(routes).toContain('className="min-h-[44px] rounded-md border border-border bg-bg-elev/40');
    expect(routes).toContain('sm:min-h-0');
  });

  it('keeps series auto-suggestion actions touch-safe without inflating desktop rows', () => {
    const suggestions = source('src/components/SeriesAutoSuggest.tsx');
    expect(suggestions).toContain('inline-flex min-h-[44px] items-center gap-1 rounded-md bg-accent');
    expect(suggestions).toContain('inline-flex min-h-[44px] items-center gap-1 rounded-md border border-accent/60');
    expect(suggestions).toContain('sm:min-h-0');
  });

  it('keeps list metadata and card-menu controls touch-safe without inflating desktop rows', () => {
    const metadata = source('src/components/ListMetaEditor.tsx');
    const cardActions = source('src/components/ListCardActions.tsx');
    expect(metadata).toContain('className="tap-target rounded-md p-2 text-muted');
    expect(cardActions).toContain('min-h-[44px] min-w-[44px]');
    expect(cardActions).toContain('min-h-[44px] w-full');
    expect(cardActions).toContain('sm:min-h-0');
  });

  it('keeps VN asset-download menu rows touch-safe without inflating desktop rows', () => {
    const assets = source('src/components/DownloadAssetsButton.tsx');
    expect(assets).toContain("const MENU_ITEM = 'inline-flex min-h-[44px] w-full");
    expect(assets).toContain('sm:min-h-0');
  });

  it('keeps card context-menu rows touch-safe without inflating desktop rows', () => {
    const menu = source('src/components/CardContextMenu.tsx');
    expect(menu).toContain('flex min-h-[44px] w-full');
    expect(menu).toContain('flex min-h-[44px] flex-1');
    expect(menu).toContain('sm:min-h-0');
  });

  it('keeps Settings section-layout controls touch-safe without inflating desktop rows', () => {
    const layout = source('src/components/settings/LayoutSettingsTab.tsx');
    expect(layout).toContain('min-h-[44px] rounded px-2.5 py-1 sm:min-h-0');
    expect(layout).toContain('tap-target-tight cursor-grab');
    expect(layout).toContain('inline-flex min-h-[44px] items-center gap-1 rounded-md border');
    expect(layout).toContain('flex min-h-[44px] w-full items-center justify-between');
    expect(layout).toContain('sm:min-h-0');
  });

  it('keeps maintenance row actions touch-safe without inflating desktop rows', () => {
    const maintenance = source('src/components/DataMaintenance.tsx');
    expect(maintenance).toContain('inline-flex min-h-[44px] items-center rounded bg-bg-card');
    expect(maintenance).toContain('inline-flex min-h-[44px] items-center truncate');
    expect(maintenance).toContain('className="min-h-[44px] rounded-md border');
    expect(maintenance).toContain('sm:min-h-0');
  });

  it('keeps saved-filter popover actions touch-safe without inflating desktop rows', () => {
    const filters = source('src/components/SavedFilters.tsx');
    expect(filters).toContain('flex min-h-[44px] w-full items-center');
    expect(filters).toContain('flex min-h-[44px] flex-1 items-center');
    expect(filters).toContain('btn btn-primary btn-xs min-h-[44px] sm:min-h-0');
    expect(filters).toContain('sm:min-h-0');
  });

  it('keeps VNDB and EGS mapping controls touch-safe without inflating desktop rows', () => {
    for (const path of [
      'src/components/MapEgsToVndbButton.tsx',
      'src/components/MapVnToEgsButton.tsx',
    ]) {
      const picker = source(path);
      expect(picker, path).toContain('inline-flex min-h-[44px] items-center');
      expect(picker, path).toContain('min-h-[44px] min-w-[44px]');
      expect(picker, path).toContain('sm:min-h-0');
    }
  });

  it('keeps list-membership picker controls touch-safe without inflating desktop rows', () => {
    const picker = source('src/components/ListsPickerButton.tsx');
    expect(picker).toContain('inline-flex min-h-[44px] items-center justify-center');
    expect(picker).toContain('min-h-[44px] min-w-[44px]');
    expect(picker).toContain('flex min-h-[44px] w-full items-center');
    expect(picker).toContain('sm:min-h-0');
  });

  it('keeps selective-download VN rows touch-safe without inflating desktop rows', () => {
    const selective = source('src/components/SelectiveFullDownload.tsx');
    expect(selective).toContain('flex min-h-[44px] w-full items-center');
    expect(selective).toContain('sm:min-h-0');
  });

  it('keeps bulk-download menu and progress actions touch-safe without inflating desktop rows', () => {
    const bulk = source('src/components/BulkDownloadButton.tsx');
    expect(bulk).toContain('flex min-h-[44px] w-full flex-col');
    expect(bulk).toContain('className="min-h-[44px] rounded-md border');
    expect(bulk).toContain('inline-flex min-h-[44px] items-center');
    expect(bulk).toContain('sm:min-h-0');
  });

  it('keeps AliceNet Kobe filters and remap controls touch-safe without inflating desktop rows', () => {
    const client = source('src/components/AliceNetKobeClient.tsx');
    const dialog = source('src/components/kobe/KobeLinkDialog.tsx');
    expect(client).toContain('inline-flex min-h-[44px] items-center gap-1 rounded');
    expect(client).toContain('inline-flex min-h-[44px] items-center gap-1.5 rounded-md border');
    expect(client).toContain('btn btn-xs min-h-[44px] sm:min-h-0');
    expect(dialog).toContain('input min-h-[44px] w-full');
    expect(dialog).toContain('btn btn-primary min-h-[44px] sm:min-h-0');
    expect(dialog).toContain('btn btn-danger btn-xs min-h-[44px] sm:min-h-0');
  });

  it('keeps the stock-batch queue Clear action touch-safe without inflating desktop rows', () => {
    const batch = source('src/components/StockBatchClient.tsx');
    expect(batch).toContain('className="min-h-[44px] rounded px-2 text-[11px]');
    expect(batch).toContain('sm:min-h-0');
  });

  it('keeps Eroge Price candidate and secondary controls touch-safe without hover-only actions', () => {
    const panel = source('src/components/ErogePricePanel.tsx');
    expect(panel).toContain('min-h-[44px] min-w-[44px]');
    expect(panel).toContain('min-h-[44px] w-32 rounded-md');
    expect(panel).toContain('sm:min-h-0');
    expect(panel).not.toContain('focus:flex group-hover:flex');
  });

  it('keeps release-owned removal and shelf popover navigation touch-safe without inflating desktop rows', () => {
    const releaseOwned = source('src/components/ReleaseOwnedToggle.tsx');
    const popover = source('src/components/EditionInfoPopover.tsx');
    expect(releaseOwned).toContain('min-h-[44px] min-w-[44px]');
    expect(releaseOwned).toContain('sm:min-h-[24px] sm:min-w-[24px]');
    expect(popover).toContain('inline-flex min-h-[44px] items-center gap-1 rounded border');
    expect(popover).toContain('sm:min-h-0');
  });
});
