import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function tsxFiles(path: string): string[] {
  return readdirSync(join(process.cwd(), path), { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    if (entry.isDirectory()) return tsxFiles(child);
    return entry.name.endsWith('.tsx') ? [child] : [];
  });
}

function closeButtons(path: string): string[] {
  const body = source(path);
  const file = ts.createSourceFile(path, body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const matches: string[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node))
      && node.tagName.getText(file) === 'button'
      && /aria-label=\{[^}]*close|aria-label=\{closeLabel/.test(node.getText(file))
    ) {
      matches.push(node.getText(file));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return matches;
}

describe('responsive tap targets', () => {
  it('compacts touch targets only when a fine pointer can hover', () => {
    const widthOnlyCompaction = /(?<!can-hover:)sm:min-(?:h|w)-(?:0|[6-9]|10|\[(?:24|28|32|36)px\])/;
    for (const path of tsxFiles('src')) {
      expect(source(path), path).not.toMatch(widthOnlyCompaction);
    }
  });

  it('gives every close button a real touch-sized layout box', () => {
    const buttons = tsxFiles('src').flatMap(closeButtons);
    expect(buttons).toHaveLength(31);
    for (const button of buttons) {
      expect(button).toMatch(/min-h-\[44px\]|\bh-11\b|absolute inset-0/);
      expect(button).toMatch(/min-w-\[44px\]|\bw-11\b|absolute inset-0|btn btn-xs/);
    }
  });

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
    const css = source('src/app/globals.css');
    expect(css).toMatch(/\.tap-target,[\s\S]*\.tap-target-tight\s*\{[\s\S]*min-height:\s*44px;[\s\S]*min-width:\s*44px;/);
    expect(css).not.toMatch(/\.tap-target(?::after|::after)/);
    expect(css).toContain('@media (hover: hover) and (pointer: fine) and (min-width: 640px)');
    const toast = source('src/components/ToastProvider.tsx');
    expect(toast).toMatch(/tap-target|min-h-\[44px\]/);
    expect(source('src/components/TagInput.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/DateInput.tsx')).toContain('min-h-[44px]');
  });

  it('keeps list colour swatches compact inside real touch targets', () => {
    for (const path of ['src/components/CreateListForm.tsx', 'src/components/ListMetaEditor.tsx']) {
      const body = source(path);
      expect(body, path).toContain('tap-target-tight inline-flex items-center justify-center');
      expect(body, path).toContain('className={`h-6 w-6 rounded');
    }
    expect(source('src/components/CreateListForm.tsx')).toContain('flex flex-wrap items-center gap-1');
  });

  it('uses an explicit touch height for the native language selector in WebKit', () => {
    expect(source('src/components/LanguageSwitcher.tsx')).toContain('className="h-11 rounded-lg');
  });

  it('keeps mobile route back links touch-safe', () => {
    const routeSources = [
      'src/app/brand-overlap/page.tsx',
      'src/app/character/[id]/page.tsx',
      'src/app/characters/page.tsx',
      'src/app/compare/page.tsx',
      'src/app/dumped/page.tsx',
      'src/app/egs/page.tsx',
      'src/app/lists/[id]/page.tsx',
      'src/app/producer/[id]/page.tsx',
      'src/app/quotes/page.tsx',
      'src/app/recommendations/page.tsx',
      'src/app/release/[id]/page.tsx',
      'src/app/schema/page.tsx',
      'src/app/series/[id]/page.tsx',
      'src/app/shelf/page.tsx',
      'src/app/similar/page.tsx',
      'src/app/staff/[id]/page.tsx',
      'src/app/staff/(index)/page.tsx',
      'src/app/steam/page.tsx',
      'src/app/top-ranked/page.tsx',
      'src/app/trait/[id]/page.tsx',
      'src/app/upcoming/page.tsx',
      'src/app/vn/[id]/page.tsx',
      'src/app/year/page.tsx',
    ].map(source);
    for (const body of routeSources) {
      expect(body).not.toContain('mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden');
    }
    expect(source('src/app/tag/[id]/page.tsx')).toContain('mb-4 inline-flex min-h-[44px] items-center');
    expect(source('src/components/PlaceDetailClient.tsx')).toContain('inline-flex min-h-[44px] items-center gap-1.5');
    expect(source('src/app/labels/page.tsx')).toContain('inline-flex min-h-[44px] items-center gap-1');
    expect(source('src/app/shelf/page.tsx')).toContain('sm:min-h-0');
  });

  it('keeps compact metadata and card links touch-safe on mobile', () => {
    for (const path of [
      'src/app/top-ranked/page.tsx',
      'src/app/staff/[id]/page.tsx',
      'src/app/release/[id]/page.tsx',
      'src/components/StaffExtraCredits.tsx',
      'src/components/CastSection.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('min-h-[44px]');
      expect(body, path).toContain('sm:min-h-0');
    }
    const staff = source('src/app/staff/[id]/page.tsx');
    expect(staff).toContain('min-w-[44px]');
    expect(staff).toContain('sm:min-w-0');
  });

  it('keeps shared compact navigation and filter primitives touch-safe on mobile', () => {
    const css = source('src/app/globals.css');
    expect(css).toMatch(/\.chip\s*\{[\s\S]*min-h-\[44px\][\s\S]*min-w-\[44px\]/);
    expect(css).toContain('@media (hover: hover) and (pointer: fine) and (min-width: 640px)');
    for (const path of [
      'src/components/NavTabStrip.tsx',
      'src/components/RecommendModeTabs.tsx',
      'src/app/top-ranked/page.tsx',
      'src/app/upcoming/page.tsx',
      'src/app/recommendations/page.tsx',
      'src/app/producers/page.tsx',
      'src/app/shelf/page.tsx',
      'src/app/tag/[id]/page.tsx',
      'src/app/trait/[id]/page.tsx',
      'src/components/charts/BarChart.tsx',
      'src/components/ResetViewDefaultsButton.tsx',
      'src/components/library/MoreFilters.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('min-h-[44px]');
      expect(body, path).toContain('sm:min-h-0');
    }
  });

  it('keeps upcoming producer metadata links touch-safe on mobile', () => {
    expect(source('src/app/upcoming/page.tsx')).toContain(
      'className="inline-flex min-h-[44px] min-w-[44px] items-center hover:text-accent can-hover:sm:min-h-0 can-hover:sm:min-w-0"',
    );
  });

  it('uses actual touch-safe select and producer-scope heights in WebKit', () => {
    const css = source('src/app/globals.css');
    const producer = source('src/components/ProducerVnsSections.tsx');
    expect(css).toMatch(/select\.input\s*\{\s*height:\s*44px;/);
    expect(producer.match(/inline-flex min-h-\[44px\]/g)).toHaveLength(2);
    expect(producer.match(/can-hover:sm:min-h-9/g)).toHaveLength(2);
  });

  it('keeps anniversary cards touch-safe without inflating desktop rows', () => {
    const anniversary = source('src/components/AnniversaryFeedView.tsx');
    expect(anniversary).toContain('flex min-h-[44px] items-center');
    expect(anniversary).toContain('sm:min-h-0');
    expect(anniversary).toContain('h-11 w-11 shrink-0');
    expect(anniversary).toContain('can-hover:sm:h-8 can-hover:sm:w-6');
  });

  it('keeps route-matrix disclosures, cards, goals, and VN metadata touch-safe', () => {
    const queue = source('src/components/ReadingQueueStripView.tsx');
    expect(queue).toContain('flex min-h-[44px] items-center');
    expect(queue).toContain('h-11 w-11 shrink-0');
    expect(queue).toContain('can-hover:sm:h-8 can-hover:sm:w-6');

    const card = source('src/components/VnCard.tsx');
    expect(card).toContain('min-h-[44px] min-w-[44px]');
    expect(card).toContain('can-hover:sm:min-h-7 can-hover:sm:min-w-0');
    expect(card).toContain('card-action-touch absolute left-2');
    expect(card).toContain('card-action-visual bg-bg-card/90');

    const globalStyles = source('src/app/globals.css');
    expect(globalStyles).toContain('.card-action-touch');
    expect(globalStyles).toContain('@apply pointer-events-auto inline-flex h-11 w-11');
    expect(globalStyles).toContain('.card-action-visual');
    expect(globalStyles).toContain('@apply pointer-events-none inline-flex h-8 min-w-8');

    for (const path of [
      'src/app/data/page.tsx',
      'src/components/SchemaLocalSection.tsx',
      'src/components/StaffSection.tsx',
      'src/app/vn/[id]/page.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('min-h-[44px]');
      expect(body, path).toContain('can-hover:sm:min-h-0');
    }

    const goal = source('src/components/ReadingGoalCard.tsx');
    expect(goal).toContain('min-w-[44px]');
    expect(goal).toContain('can-hover:sm:min-w-0');

    expect(source('src/components/CastSection.tsx')).toContain('aria-label={c.name}');
  });

  it('keeps independently clickable VN metadata controls touch-safe', () => {
    for (const path of [
      'src/components/EgsPanel.tsx',
      'src/components/EgsRichDetails.tsx',
      'src/components/TagCoOccurrence.tsx',
      'src/components/StaffSection.tsx',
      'src/components/AspectOverrideControl.tsx',
      'src/components/TagInput.tsx',
      'src/components/EditForm.tsx',
      'src/components/WishlistClient.tsx',
      'src/app/vn/[id]/page.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('min-h-[44px]');
    }
    for (const path of [
      'src/components/EgsPanel.tsx',
      'src/components/StaffSection.tsx',
      'src/components/AspectOverrideControl.tsx',
      'src/components/EditForm.tsx',
      'src/components/WishlistClient.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('min-w-[44px]');
      expect(body, path).toContain('can-hover:sm:min-w-0');
    }
  });

  it('keeps the mobile header, library toolbar, and dense entity links touch-safe', () => {
    expect(source('src/app/layout.tsx')).toContain('flex min-h-[44px] items-center gap-2 can-hover:sm:min-h-0');
    const library = source('src/components/LibraryClient.tsx');
    expect(library).toContain('inline-flex min-h-[44px] items-center gap-1.5');
    expect(library).toContain('inline-flex min-h-[44px] w-full items-center justify-between');
    expect(source('src/app/activity/page.tsx')).toContain('className="input h-11 w-full"');
    expect(source('src/app/characters/page.tsx')).toContain('className="h-5 w-5 accent-accent"');
    expect(source('src/app/staff/(index)/page.tsx')).toContain('className="h-5 w-5 accent-accent"');
    expect(source('src/app/compare/page.tsx')).toContain('min-w-[44px]');
    expect(source('src/app/quotes/page.tsx')).toContain('inline-flex min-h-[44px] min-w-[44px] items-center');
    expect(source('src/components/CompareVnPicker.tsx')).toContain('min-w-[44px]');
    expect(source('src/components/SeriesManager.tsx')).toContain('flex min-h-[44px] min-w-0 flex-1');
    expect(source('src/components/TagsBrowser.tsx')).toContain('className="input h-11 w-full');
  });

  it('keeps dumped tracker navigation and ignore actions touch-safe without inflating desktop rows', () => {
    const dumped = source('src/app/dumped/page.tsx');
    const ignore = source('src/components/DumpIgnoreButton.tsx');
    expect(dumped).toContain('inline-flex min-h-[44px] items-center gap-1.5');
    expect(dumped).toContain('sm:min-h-0');
    expect(ignore).toContain('inline-flex min-h-[44px] items-center gap-1');
    expect(ignore).toContain('can-hover:sm:min-h-8');
  });

  it('keeps detail reorder, density, mobile nav, and game-log controls touch-safe', () => {
    expect(source('src/components/DetailReorderLayout.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/CardDensitySlider.tsx')).toContain('min-h-[44px]');
    expect(source('src/components/MoreNavMenu.tsx')).toContain('min-h-[44px]');
    const quoteFooter = source('src/components/QuoteFooter.tsx');
    expect(quoteFooter).toContain('visual-viewport-anchor-bottom z-layer-footer pointer-events-none');
    expect(quoteFooter).toContain('data-visual-viewport-anchor');
    expect(quoteFooter).toContain('<PageSpaceFrame>');
    expect(quoteFooter).toContain('data-quote-footer-surface');
    expect(quoteFooter).toContain('max-h-12');
    expect(quoteFooter).toContain('can-hover:sm:max-h-5');
    expect(quoteFooter).toContain('min-h-[44px] min-w-0 flex-1');
    expect(quoteFooter).toContain('aria-expanded={expanded}');
    expect(quoteFooter).toContain('hidden={!expanded}');
    expect(quoteFooter).toContain('inline-flex min-h-[44px] min-w-[44px]');
    expect(quoteFooter).toContain('can-hover:sm:min-h-0 can-hover:sm:w-3 can-hover:sm:min-w-0 can-hover:sm:opacity-0');
    const globals = source('src/app/globals.css');
    expect(globals).toContain('.visual-viewport-anchor-bottom[data-visual-viewport-anchor]');
    expect(globals).toContain('position: static');
    expect(globals).toContain('@media (hover: hover) and (pointer: fine)');
    expect(globals).toContain('position: fixed');
    expect(globals).toContain('@supports (display: grid-lanes)');
    expect(globals).toContain('display: grid-lanes !important');
    expect(globals).toContain('grid-auto-flow: row dense');
    const downloadStatus = source('src/components/DownloadStatusBar.tsx');
    expect(downloadStatus).toContain('className="visual-viewport-anchor-bottom fixed bottom-16');
    expect(downloadStatus).toContain('can-hover:sm:bottom-5');
    expect(source('src/components/GameLog.tsx')).toContain('min-h-[44px]');
  });

  it('keeps activity-timeline delete controls touch-safe without inflating desktop rows', () => {
    const activity = source('src/components/ActivityTimeline.tsx');
    expect(activity).toContain('inline-flex min-h-[44px] min-w-[44px] items-center justify-center');
    expect(activity).toContain('can-hover:sm:min-h-0 can-hover:sm:min-w-0');
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
    expect(stock).toContain('can-hover:sm:min-h-[36px]');
    expect(stock).toContain('can-hover:sm:h-7 can-hover:sm:w-7');
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
    expect(map).toContain('absolute inset-y-0 right-2 my-auto flex min-h-[44px] min-w-[44px]');
    expect(map).toContain('className={`min-h-[44px] rounded border px-2 py-0.5');
    expect(map).toContain('min-h-[44px] w-full px-3 py-2 text-left text-[12px]');
    expect(modal).toContain('className="min-h-[44px] w-full rounded border');
    expect(places).not.toContain('min-h-[36px]');
    expect(stock).not.toContain('min-h-[32px]');
    expect(stock).not.toContain('min-h-[36px]');
  });

  it('keeps secondary stock and place management controls touch-safe', () => {
    const assign = source('src/components/AssignProviderDialog.tsx');
    const batch = source('src/components/StockBatchClient.tsx');
    const placeCard = source('src/components/PlaceCard.tsx');
    const alicenet = source('src/components/AliceNetClient.tsx');
    expect(assign).toContain('className="input min-h-[44px] w-full pl-8 text-sm"');
    expect(assign).toContain('inline-flex min-h-[44px] shrink-0 items-center');
    expect(batch).toContain('className="tap-target rounded p-0.5');
    expect(batch).toContain('can-hover:sm:min-h-[36px]');
    expect(batch).toContain('can-hover:sm:min-h-0 can-hover:sm:min-w-0');
    expect(placeCard).toContain('can-hover:sm:min-h-[32px] can-hover:sm:min-w-[32px]');
    expect(alicenet).toContain('can-hover:sm:min-h-[32px]');
    expect(alicenet).toContain('can-hover:sm:min-h-0');
    expect(alicenet).not.toMatch(/(?<!can-hover:)sm:min-h-(?:0|\[32px\]|\[36px\])/);
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
    expect(layout).toContain('min-h-[44px] rounded px-2.5 py-1 can-hover:sm:min-h-0');
    expect(layout).toContain('tap-target-tight cursor-grab');
    expect(layout).toContain('inline-flex min-h-[44px] items-center gap-1 rounded-md border');
    expect(layout).toContain('flex min-h-[44px] w-full items-center justify-between');
    expect(layout).toContain('min-h-[44px] rounded-md border px-2.5 py-1 text-xs');
    expect(layout).toContain('sm:min-h-0');
  });

  it('keeps maintenance row actions touch-safe without inflating desktop rows', () => {
    const maintenance = source('src/components/DataMaintenance.tsx');
    expect(maintenance).toContain('inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded bg-bg-card');
    expect(maintenance).toContain('flex min-h-[44px] min-w-0 max-w-full items-center truncate');
    expect(maintenance).toContain('className="min-h-[44px] min-w-[44px] shrink-0 rounded-md border');
    expect(maintenance).toContain('can-hover:sm:min-h-0 can-hover:sm:min-w-0');
  });

  it('keeps audited search, metadata, chart, and clear controls touch-safe', () => {
    const schema = source('src/components/SchemaBrowser.tsx');
    const tags = source('src/components/TagPicker.tsx');
    const quotes = source('src/app/quotes/page.tsx');
    const upcoming = source('src/components/UpcomingCard.tsx');
    const charts = source('src/components/charts/BarChart.tsx');
    const stats = source('src/components/StatsExtras.tsx');
    expect(schema).toContain('flex min-h-[44px] items-center gap-2');
    expect(schema).toContain('className="min-h-[44px] flex-1 bg-transparent');
    expect(schema).toContain('inline-flex min-h-[44px] min-w-[44px] items-center');
    expect(tags).toContain('inline-flex min-h-[44px] min-w-[44px] items-center');
    expect(quotes).toContain('inline-flex min-h-[44px] min-w-[44px] items-center');
    expect(upcoming.match(/min-h-\[44px\] min-w-0 max-w-full/g)).toHaveLength(2);
    expect(charts).toContain('flex min-h-[44px] items-center rounded-md');
    expect(stats).toContain('inline-flex min-h-[44px] items-center font-semibold');
  });

  it('keeps entity metadata links and spoiler controls touch-safe', () => {
    const languages = source('src/components/LangFlag.tsx');
    const spoilerChip = source('src/components/SpoilerChip.tsx');
    const spoilerReveal = source('src/components/SpoilerReveal.tsx');
    const character = source('src/app/character/[id]/page.tsx');
    const staff = source('src/app/staff/[id]/page.tsx');
    const detail = source('src/app/vn/[id]/page.tsx');
    const compare = source('src/app/compare/page.tsx');
    const placeStock = source('src/components/PlaceVnBrowser.tsx');
    const releaseOwned = source('src/components/ReleaseOwnedToggle.tsx');
    expect(languages).toContain('inline-flex min-h-[44px] min-w-[44px]');
    expect(spoilerChip.match(/min-h-\[44px\] min-w-\[44px\]/g)).toHaveLength(2);
    expect(spoilerReveal).toContain('inline-block min-h-[44px] min-w-[44px]');
    expect(character).toContain('inline-flex min-h-[44px] min-w-[44px] items-center hover:text-accent');
    expect(staff).toContain('inline-flex min-h-[44px] min-w-[44px] items-center justify-center');
    expect(detail).toContain('inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded border');
    expect((compare.match(/inline-flex min-h-\[44px\] min-w-\[44px\]/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect((placeStock.match(/inline-flex min-h-\[44px\] min-w-\[44px\]/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(releaseOwned).toContain('min-h-[44px] min-w-[44px] flex-1');
  });

  it('keeps saved-filter popover actions touch-safe without inflating desktop rows', () => {
    const filters = source('src/components/SavedFilters.tsx');
    expect(filters).toContain('flex min-h-[44px] w-full items-center');
    expect(filters).toContain('flex min-h-[44px] flex-1 items-center');
    expect(filters).toContain('btn btn-primary btn-xs min-h-[44px] can-hover:sm:min-h-0');
    expect(filters).toContain('h-11 w-11');
    expect(filters).toContain('can-hover:sm:h-8 can-hover:sm:w-7');
    expect(filters).toContain('sm:min-h-0');
  });

  it('keeps audited compact disclosures and loading controls touch-shaped on coarse pointers', () => {
    const platforms = source('src/components/PlatformOverflowDisclosure.tsx');
    const stockSkeleton = source('src/components/StockPanelSkeleton.tsx');
    const topRankedSkeleton = source('src/components/TopRankedSkeleton.tsx');
    const dumpedSkeleton = source('src/app/dumped/loading.tsx');
    const listPicker = source('src/components/ListsPickerButton.tsx');
    expect(platforms.match(/can-hover:sm:min-h-\[28px\]/g)).toHaveLength(2);
    expect(stockSkeleton).toContain('can-hover:sm:h-9');
    expect(topRankedSkeleton.match(/can-hover:sm:h-/g)).toHaveLength(3);
    expect(dumpedSkeleton).toContain('can-hover:sm:h-8');
    expect(listPicker).toContain('h-11 w-full can-hover:sm:h-8');
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

  it('keeps AliceNet filters and remap controls touch-safe without inflating desktop rows', () => {
    const client = source('src/components/AliceNetClient.tsx');
    const dialog = source('src/components/alicenet/AliceNetLinkDialog.tsx');
    expect(client).toContain('inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded');
    expect(client).toContain('inline-flex min-h-[44px] items-center gap-1.5 rounded-md border');
    expect(client).toContain('btn btn-xs min-h-[44px] can-hover:sm:min-h-0');
    expect(dialog).toContain('input min-h-[44px] w-full');
    expect(dialog).toContain('btn btn-primary min-h-[44px] can-hover:sm:min-h-0');
    expect(dialog).toContain('btn btn-danger btn-xs min-h-[44px] can-hover:sm:min-h-0');
    expect(dialog).not.toMatch(/(?<!can-hover:)sm:min-h-0/);
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
    expect(releaseOwned).toContain('can-hover:sm:min-h-[24px] can-hover:sm:min-w-[24px]');
    expect(popover).toContain('inline-flex min-h-[44px] items-center gap-1 rounded border');
    expect(popover).toContain('sm:min-h-0');
  });

  it('keeps VN tag controls and the inline favorite action touch-safe', () => {
    const tags = source('src/components/VnTagsGroupedView.tsx');
    const favorite = source('src/components/FavoriteToggleButton.tsx');
    expect(tags).toContain('min-h-[44px] min-w-[44px] rounded-md border');
    expect(tags).toContain('min-h-[44px] min-w-[44px] items-center justify-center rounded-r-md');
    expect(tags).toContain('can-hover:sm:min-h-0 can-hover:sm:min-w-0');
    expect(favorite).toContain('inline-flex min-h-[44px] items-center justify-center');
    expect(favorite).toContain('can-hover:sm:min-h-9');
  });

  it('keeps activity, data, and Steam linking controls touch-safe', () => {
    const activity = source('src/app/activity/page.tsx');
    const data = source('src/app/data/page.tsx');
    const steam = source('src/app/steam/page.tsx');
    expect(activity).toContain('inline-flex min-h-[44px] items-center rounded');
    expect(data).toContain('inline-flex min-h-[44px] items-center rounded text-accent');
    expect(steam).toContain('className="min-h-[44px] w-full bg-transparent text-xs focus:outline-none can-hover:sm:min-h-0"');
    expect(steam).toContain('can-hover:sm:min-h-0 can-hover:sm:py-1');
  });

  it('keeps statistics disclosure and account controls touch-safe', () => {
    const cache = source('src/components/CachePanel.tsx');
    const stats = source('src/app/stats/page.tsx');
    expect(cache).toContain('flex min-h-[44px] w-full items-center');
    expect(cache).toContain('can-hover:sm:min-h-0');
    expect(stats).toContain('inline-flex min-h-[44px] items-center rounded font-bold');
  });
});
