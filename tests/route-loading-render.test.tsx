import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';
import HomeLoading from '@/app/loading';
import ActivityLoading from '@/app/activity/loading';
import BrandOverlapLoading from '@/app/brand-overlap/loading';
import CharacterLoading from '@/app/character/[id]/loading';
import CharactersLoading from '@/app/characters/loading';
import CompareLoading from '@/app/compare/loading';
import DataLoading from '@/app/data/loading';
import DumpedLoading from '@/app/dumped/loading';
import EgsLoading from '@/app/egs/loading';
import LabelsLoading from '@/app/labels/loading';
import ListsLoading from '@/app/lists/(index)/loading';
import ListDetailLoading from '@/app/lists/[id]/loading';
import MapLoading from '@/app/map/loading';
import PlacesLoading from '@/app/places/(index)/loading';
import PlaceDetailLoading from '@/app/places/[id]/loading';
import ProducerLoading from '@/app/producer/[id]/loading';
import ProducersLoading from '@/app/producers/loading';
import QuotesLoading from '@/app/quotes/loading';
import RecommendationsLoading from '@/app/recommendations/loading';
import ReleaseLoading from '@/app/release/[id]/loading';
import SchemaLoading from '@/app/schema/loading';
import SearchLoading from '@/app/search/loading';
import SeriesLoading from '@/app/series/(index)/loading';
import SeriesDetailLoading from '@/app/series/[id]/loading';
import ShelfLoading from '@/app/shelf/loading';
import SimilarLoading from '@/app/similar/loading';
import StaffLoading from '@/app/staff/(index)/loading';
import StaffDetailLoading from '@/app/staff/[id]/loading';
import StatsLoading from '@/app/stats/loading';
import SteamLoading from '@/app/steam/loading';
import StockLoading from '@/app/stock/loading';
import TagLoading from '@/app/tag/[id]/loading';
import TagsLoading from '@/app/tags/loading';
import TopRankedLoading from '@/app/top-ranked/loading';
import TraitLoading from '@/app/trait/[id]/loading';
import TraitsLoading from '@/app/traits/loading';
import UpcomingLoading from '@/app/upcoming/loading';
import VnLoading from '@/app/vn/[id]/loading';
import WishlistLoading from '@/app/wishlist/loading';
import YearLoading from '@/app/year/loading';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { DEFAULT_HOME_LAYOUT } from '@/lib/home-section-layout';
import { defaultSeriesDetailLayoutV1 } from '@/lib/series-detail-layout';
import {
  SkeletonBlock,
  SkeletonBoundary,
  SkeletonCard,
  SkeletonCardGrid,
  SkeletonCompactGrid,
  SkeletonRows,
  SkeletonTable,
  SkeletonTabRow,
  SkeletonText,
} from '@/components/Skeleton';
import { HomeSectionSkeleton } from '@/components/HomePageSkeleton';
import { SeedTagControlsSkeleton } from '@/components/SeedTagControlsSkeleton';
import { TraitResultsSkeleton } from '@/components/TraitsBrowserSkeleton';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}));

function renderToStaticMarkup(node: React.ReactNode): string {
  return renderReactToStaticMarkup(
    <DisplaySettingsProvider initial={{ density: { staffWorks: 300 } }}>
      {node}
    </DisplaySettingsProvider>,
  );
}

const routeLoaders = [
  HomeLoading,
  ActivityLoading,
  BrandOverlapLoading,
  CharacterLoading,
  CharactersLoading,
  CompareLoading,
  DataLoading,
  DumpedLoading,
  EgsLoading,
  LabelsLoading,
  ListsLoading,
  ListDetailLoading,
  MapLoading,
  PlacesLoading,
  PlaceDetailLoading,
  ProducerLoading,
  ProducersLoading,
  QuotesLoading,
  RecommendationsLoading,
  ReleaseLoading,
  SchemaLoading,
  SearchLoading,
  SeriesLoading,
  SeriesDetailLoading,
  ShelfLoading,
  SimilarLoading,
  StaffLoading,
  StaffDetailLoading,
  StatsLoading,
  SteamLoading,
  StockLoading,
  TagLoading,
  TagsLoading,
  TopRankedLoading,
  TraitLoading,
  TraitsLoading,
  UpcomingLoading,
  VnLoading,
  WishlistLoading,
  YearLoading,
] as const;

describe('route loading skeletons', () => {
  it('renders a busy skeleton surface for every App Router loading boundary', async () => {
    for (const load of routeLoaders) {
      const html = renderToStaticMarkup(await load());
      expect(html).toContain('role="status"');
      expect(html).toContain('animate-pulse');
    }
  });

  it('matches the VN detail hero, cover overlap, metadata, media, and section geometry', async () => {
    const html = renderToStaticMarkup(await VnLoading());
    expect(html).toContain('vn-mobile-library-return h-11 w-24 md:hidden');
    expect(html).toContain('h-64 overflow-hidden rounded-t-2xl');
    expect(html).toContain('h-full w-full rounded-none');
    expect(html).toContain('-mt-44');
    expect(html).toContain('md:grid-cols-[260px_1fr]');
    expect(html).toContain('max-w-[260px]');
    expect(html).toContain('data-vn-cover-skeleton-shell');
    expect(html).toContain('data-vn-banner-skeleton-shell');
    expect(html).toContain('data-vn-hero-skeleton');
    expect(html.match(/animate-pulse/g)).toHaveLength(2);
    expect(html).toContain('relative z-10 mx-auto aspect-[2/3]');
    expect(html).toContain('overflow-hidden rounded-xl border border-border bg-bg-card shadow-card');
    expect(html).toContain('grid-cols-3');
    expect(html).toContain('sm:grid-cols-3 lg:grid-cols-5');
    expect(html.match(/aspect-\[2\/3\]/g)).toHaveLength(6);
    expect(html).not.toContain('bg-bg-elev/30 p-3');
  });

  it('reserves the full mobile return-control height on affected routes', async () => {
    const markup = await Promise.all([
      VnLoading(),
      ReleaseLoading(),
      ShelfLoading(),
      CharactersLoading(),
    ]);

    for (const route of markup) {
      const html = renderToStaticMarkup(route);
      expect(html).toMatch(/h-11 w-(?:24|28) md:hidden/);
      expect(html).not.toMatch(/h-5 w-(?:24|28) md:hidden/);
    }
  });

  it('matches the configurable home strips, controls, and library grid geometry', async () => {
    const html = renderToStaticMarkup(await HomeLoading());
    expect(html).toContain('data-home-section-skeleton="recently-viewed"');
    expect(html).toContain('data-home-section-skeleton="reading-queue"');
    expect(html).toContain('data-home-section-skeleton="anniversary"');
    expect(html).toContain('data-home-section-skeleton="library-controls"');
    expect(html).toContain('data-home-section-skeleton="library-grid"');
    expect(html).toContain('data-home-library-grid-skeleton');
    expect(html).toContain('min(40vw, calc(var(--card-density-px, 180px) * 0.55))');
    expect(html.match(/flex flex-col overflow-hidden rounded-xl border border-border bg-bg-card/g)).toHaveLength(18);
  });

  it('announces an isolated home section while only that server feed is pending', () => {
    const html = renderToStaticMarkup(
      <HomeSectionSkeleton
        id="reading-queue"
        state={{ visible: true, collapsed: false }}
        label="Loading queue"
      />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('Loading queue');
    expect(html).toContain('data-home-section-skeleton="reading-queue"');
    expect(html).not.toContain('data-home-section-skeleton="library-grid"');
  });

  it('keeps the home skeleton in saved order and honours hidden and collapsed sections', async () => {
    const repository = getAppSettingRepository();
    const previous = await repository.get('home_section_layout_v1');
    const layout = structuredClone(DEFAULT_HOME_LAYOUT);
    layout.order = ['library-grid', 'anniversary', 'recently-viewed', 'reading-queue', 'library-controls'];
    layout.sections.anniversary.visible = false;
    layout.sections['recently-viewed'].collapsed = true;
    layout.sections['library-controls'].collapsed = true;
    layout.sections['library-grid'].collapsed = true;
    await repository.set('home_section_layout_v1', JSON.stringify(layout));
    try {
      const html = renderToStaticMarkup(await HomeLoading());
      const gridIndex = html.indexOf('data-home-section-skeleton="library-grid"');
      const recentIndex = html.indexOf('data-home-section-skeleton="recently-viewed"');
      const queueIndex = html.indexOf('data-home-section-skeleton="reading-queue"');
      expect(gridIndex).toBeGreaterThan(0);
      expect(recentIndex).toBeGreaterThan(gridIndex);
      expect(queueIndex).toBeGreaterThan(recentIndex);
      expect(html).not.toContain('data-home-section-skeleton="anniversary"');
      expect(html).not.toContain('data-home-library-grid-skeleton');
      expect(html).not.toContain('min(40vw, calc(var(--card-density-px, 180px) * 0.55))');
      expect(html).not.toContain('min-w-[180px] flex-1');
    } finally {
      await repository.set('home_section_layout_v1', previous);
    }
  });

  it('falls back to the default home skeleton when its saved layout cannot be read', async () => {
    const repository = getAppSettingRepository();
    const get = vi.spyOn(repository, 'get').mockRejectedValueOnce(new Error('storage unavailable'));
    try {
      const html = renderToStaticMarkup(await HomeLoading());
      expect(html).toContain('data-home-section-skeleton="recently-viewed"');
      expect(html).toContain('data-home-library-grid-skeleton');
    } finally {
      get.mockRestore();
    }
  });

  it('does not flash skeleton bodies for home sections hidden in settings', async () => {
    const repository = getAppSettingRepository();
    const previous = await repository.get('home_section_layout_v1');
    const layout = structuredClone(DEFAULT_HOME_LAYOUT);
    for (const id of layout.order) layout.sections[id].visible = false;
    await repository.set('home_section_layout_v1', JSON.stringify(layout));
    try {
      const html = renderToStaticMarkup(await HomeLoading());
      expect(html).toContain('role="status"');
      expect(html).not.toContain('data-home-section-skeleton');
    } finally {
      await repository.set('home_section_layout_v1', previous);
    }
  });

  it('matches the staff search controls and compact result geometry', async () => {
    const html = renderToStaticMarkup(await StaffLoading());
    expect(html).toContain('data-staff-list-results-skeleton');
    expect(html).toContain('min-w-[140px]');
    expect(html).toContain('var(--card-density-px, 220px)');
    expect(html.match(/rounded-lg border border-border bg-bg-elev\/40 p-3/g)).toHaveLength(10);
  });

  it('matches the staff detail profile and one route-safe horizontal credit grid', async () => {
    const html = renderToStaticMarkup(await StaffDetailLoading());
    expect(html).toContain('--card-density-px:300px');
    expect(html).toContain('data-staff-detail-skeleton');
    expect(html).toContain('data-staff-primary-credit-skeleton');
    expect(html.match(/data-staff-credit-grid-skeleton/g)).toHaveLength(1);
    expect(html).not.toContain('data-staff-timeline-skeleton');
    expect(html).not.toContain('data-staff-siblings-skeleton');
    expect(html).not.toContain('data-staff-extra-group-skeleton');
    expect(html).toContain('calc(var(--card-density-px, 220px) * 0.42)');
    expect(html).toContain('var(--card-density-px, 280px)');
    expect(html.match(/gap-3 rounded-lg border border-border bg-bg-elev\/40 p-2/g)).toHaveLength(12);
    expect(html.match(/h-11 w-11 shrink-0/g)).toHaveLength(12);
    expect(html.match(/hidden sm:flex gap-3/g)).toHaveLength(4);
    expect(html.match(/hidden xl:flex gap-3/g)).toHaveLength(4);
    expect(html).toContain('data-staff-profile-common-skeleton');
    expect(html).toContain('h-[54px] w-[400px] max-w-full');
    expect(html).toContain('h-11 w-[104px]');
    expect(html).toContain('mt-2 space-y-2');
  });

  it('distinguishes nested detail fallbacks from their index fallbacks', async () => {
    const [listIndex, listDetail, placeIndex, placeDetail, seriesIndex, seriesDetail, staffIndex, staffDetail] = await Promise.all([
      ListsLoading(),
      ListDetailLoading(),
      PlacesLoading(),
      PlaceDetailLoading(),
      SeriesLoading(),
      SeriesDetailLoading(),
      StaffLoading(),
      StaffDetailLoading(),
    ]).then((nodes) => nodes.map((node) => renderToStaticMarkup(node)));

    expect(listIndex).not.toContain('data-list-detail-skeleton');
    expect(listDetail).toContain('data-list-detail-skeleton');
    expect(placeIndex).not.toContain('data-place-detail-skeleton');
    expect(placeDetail).toContain('data-place-detail-skeleton');
    expect(seriesIndex).not.toContain('data-series-detail-skeleton');
    expect(seriesDetail).toContain('data-series-detail-skeleton');
    expect(staffIndex).not.toContain('data-staff-detail-skeleton');
    expect(staffDetail).toContain('data-staff-detail-skeleton');
  });

  it('matches list detail identity, tools, add form, and removable item grid', async () => {
    const html = renderToStaticMarkup(await ListDetailLoading());
    expect(html).toContain('data-list-detail-skeleton');
    expect(html).toContain('data-list-add-skeleton');
    expect(html).toContain('data-list-items-skeleton');
    expect(html).toContain('h-12 w-12 shrink-0');
    expect(html.match(/absolute right-2 top-2 h-11 w-11/g)).toHaveLength(12);
    expect(html.match(/aspect-\[2\/3\]/g)).toHaveLength(12);
  });

  it('matches series detail layout tools, works, media editor, and removable item grid', async () => {
    const html = renderToStaticMarkup(await SeriesDetailLoading());
    expect(html).toContain('data-series-detail-skeleton');
    expect(html).toContain('data-series-hero-skeleton');
    expect(html).toContain('data-series-works-skeleton');
    expect(html).toContain('data-series-metadata-skeleton');
    expect(html).toContain('md:grid-cols-[140px_1fr]');
    expect(html.match(/absolute right-2 top-2 h-11 w-11/g)).toHaveLength(12);
    expect(html.match(/aspect-\[2\/3\]/g)).toHaveLength(13);
  });

  it('keeps series loading sections in saved order and honours hidden or collapsed state', async () => {
    const repository = getAppSettingRepository();
    const key = 'series_detail_section_layout_v1';
    const previous = await repository.get(key);
    const layout = defaultSeriesDetailLayoutV1();
    layout.order = ['metadata', 'works', 'hero', 'related', 'stats'];
    layout.sections.works.visible = false;
    layout.sections.hero.collapsedByDefault = true;
    await repository.set(key, JSON.stringify(layout));
    try {
      const html = renderToStaticMarkup(await SeriesDetailLoading());
      expect(html).toContain('data-series-collapsed-skeleton="hero"');
      expect(html).not.toContain('data-series-works-skeleton');
      expect(html.indexOf('data-series-metadata-skeleton')).toBeLessThan(html.indexOf('data-series-collapsed-skeleton="hero"'));
    } finally {
      await repository.set(key, previous);
    }
  });

  it('matches the character detail portrait ratio, metadata, and horizontal appearance cards', async () => {
    const html = renderToStaticMarkup(await CharacterLoading());
    expect(html).toContain('md:grid-cols-[200px_1fr]');
    expect(html).toContain('aspect-[2/3]');
    expect(html).not.toContain('aspect-[3/4]');
    expect(html).toContain('data-character-credit-grid-skeleton');
    expect(html).toContain('calc(var(--card-density-px, 220px) * 0.32)');
    expect(html.match(/flex gap-3 rounded-lg border border-border bg-bg-elev\/40 p-2/g)).toHaveLength(8);
  });

  it('matches the character browser search, modes, filters, ranges, and portrait grid', async () => {
    const html = renderToStaticMarkup(await CharactersLoading());
    expect(html).toContain('data-characters-browser-skeleton');
    expect(html).toContain('sm:grid-cols-2');
    expect(html).toContain('sm:grid-cols-3');
    expect(html.match(/aspect-\[3\/4\]/g)).toHaveLength(12);
    expect(html.match(/rounded-md border border-border bg-bg-elev\/30 p-2/g)).toHaveLength(6);
    expect(html).not.toContain('h-72 w-full');
  });

  it('keeps compare loading to the guaranteed picker controls', async () => {
    const html = renderToStaticMarkup(await CompareLoading());
    expect(html).toContain('data-compare-picker-skeleton');
    expect(html).toContain('data-compare-picker-controls-skeleton');
    expect(html).toContain('h-11 w-full rounded-md');
    expect(html).not.toContain('data-compare-common-skeleton');
    expect(html).not.toContain('data-compare-mobile-skeleton');
    expect(html).not.toContain('data-compare-desktop-skeleton');
  });

  it('matches the map container and every guaranteed control above the canvas', async () => {
    const html = renderToStaticMarkup(await MapLoading());
    expect(html).toContain('data-map-route-skeleton');
    expect(html).toContain('mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8');
    expect(html).toContain('data-map-header-actions-skeleton');
    expect(html.match(/h-11 w-(?:36|32)/g)).toHaveLength(2);
    expect(html).toContain('data-map-privacy-skeleton');
    expect(html).toContain('data-map-search-skeleton');
    expect(html).toContain('data-map-size-skeleton');
    expect(html.match(/h-11 min-w-24 flex-1 rounded sm:flex-none/g)).toHaveLength(4);
    expect(html).toContain('data-map-frame-skeleton');
    expect(html).toContain('h-[55vh] min-h-[400px]');
  });

  it('matches printable label toolbar and horizontal QR label geometry', async () => {
    const html = renderToStaticMarkup(await LabelsLoading());
    expect(html).toContain('data-labels-toolbar-skeleton');
    expect(html).toContain('data-label-sheet-skeleton');
    expect(html).toContain('sm:grid-cols-3 md:grid-cols-4');
    expect(html.match(/h-20 w-20 shrink-0/g)).toHaveLength(12);
    expect(html).not.toContain('h-24 w-full');
    expect(html).not.toContain('h-32 w-full');
  });

  it('matches series creation fields and actionable series cards', async () => {
    const html = renderToStaticMarkup(await SeriesLoading());
    expect(html).toContain('data-series-create-skeleton');
    expect(html).toContain('data-series-grid-skeleton');
    expect(html).toContain('sm:grid-cols-[1fr_2fr_auto]');
    expect(html.match(/h-11 w-11 shrink-0/g)).toHaveLength(8);
    expect(html).not.toContain('h-24 w-full');
  });

  it('matches list creation controls and actionable list cards', async () => {
    const html = renderToStaticMarkup(await ListsLoading());
    expect(html).toContain('data-lists-create-skeleton');
    expect(html).toContain('data-lists-grid-skeleton');
    expect(html).toContain('sm:grid-cols-2 lg:grid-cols-3');
    expect(html.match(/absolute right-2 top-2 h-11 w-11/g)).toHaveLength(6);
    expect(html.match(/h-8 w-8 shrink-0/g)).toHaveLength(6);
    expect(html).not.toContain('h-32 w-full');
  });

  it('matches the trait detail header, scope controls, and horizontal character cards', async () => {
    const html = renderToStaticMarkup(await TraitLoading());
    expect(html).toContain('data-trait-detail-skeleton');
    expect(html).toContain('data-trait-character-grid-skeleton');
    expect(html).toContain('var(--card-density-px, 220px)');
    expect(html).toContain('calc(var(--card-density-px, 220px) * 0.32)');
    expect(html.match(/aspect-ratio:2 \/ 3/g)).toHaveLength(10);
    expect(html.match(/flex gap-3 rounded-lg border border-border bg-bg-elev\/40 p-2/g)).toHaveLength(10);
    expect(html).not.toContain('h-20 w-14 shrink-0');
  });

  it('matches trait browser identity, controls, density, and result cards', async () => {
    const html = renderToStaticMarkup(await TraitsLoading());
    expect(html).toContain('data-traits-header-skeleton');
    expect(html).toContain('data-traits-controls-skeleton');
    expect(html).toContain('data-traits-results-skeleton');
    expect(html).toContain('h-[54px] w-full max-w-[320px]');
    expect(html.match(/rounded-xl border border-border bg-bg-card p-4/g)).toHaveLength(12);
    expect(html.match(/h-5 w-10 shrink-0/g)).toHaveLength(3);

    const announced = renderToStaticMarkup(<TraitResultsSkeleton label="Loading traits" />);
    expect(announced).toContain('Loading traits');
    expect(announced).toContain('role="status"');
  });

  it('matches tag detail metadata, mode controls, actions, and VN result section', async () => {
    const html = renderToStaticMarkup(await TagLoading());
    expect(html).toContain('data-tag-detail-skeleton');
    expect(html).toContain('data-tag-results-skeleton');
    expect(html).toContain('h-[54px] w-full max-w-[320px]');
    expect(html.match(/aspect-\[2\/3\]/g)).toHaveLength(12);
    expect(html).not.toContain('h-36 w-full');
  });

  it('matches tag browser identity, source tabs, filters, and external-link cards', async () => {
    const html = renderToStaticMarkup(await TagsLoading());
    expect(html).toContain('data-tags-header-skeleton');
    expect(html).toContain('data-tags-tabs-skeleton');
    expect(html).toContain('data-tags-controls-skeleton');
    expect(html).toContain('data-tag-flat-results-skeleton');
    expect(html.match(/absolute right-3 top-3 h-11 w-11/g)).toHaveLength(12);
    expect(html.match(/relative min-h-\[112px\]/g)).toHaveLength(12);
  });

  it('keeps similar loading on the seed-picker geometry shared by every route state', async () => {
    const html = renderToStaticMarkup(await SimilarLoading());
    expect(html).toContain('data-similar-seed-skeleton');
    expect(html).toContain('rounded-2xl border border-border bg-bg-card p-4 sm:p-6');
    expect(html).toContain('h-11 w-full rounded-md');
    expect(html).not.toContain('aspect-[2/3]');
    expect(html).not.toContain('grid gap-5');
  });

  it('matches the recommendation seed controls while server-derived tags resolve', () => {
    const html = renderToStaticMarkup(<SeedTagControlsSkeleton />);
    expect(html).toContain('data-seed-tag-controls-skeleton');
    expect(html).toContain('rounded-lg border border-border bg-bg-elev/40 p-3');
    expect(html.match(/rounded-full/g)).toHaveLength(3);
    expect(html).toContain('h-11 w-full rounded-md');
  });

  it('matches release inventory identity and owned-action rows', async () => {
    const html = renderToStaticMarkup(await ReleaseLoading());
    expect(html).toContain('data-release-inventory-skeleton');
    expect(html.match(/flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg-elev\/30 px-3 py-2/g)).toHaveLength(2);
    expect(html.match(/h-11 w-24 can-hover:sm:h-8/g)).toHaveLength(2);
    expect(html).toContain('h-11 w-20 can-hover:sm:h-8');
    expect(html).toContain('h-11 w-11 can-hover:sm:h-8 can-hover:sm:w-8');
    expect(html).not.toContain('h-20 w-14 shrink-0');
  });

  it('matches the ranked header and density-aware horizontal result cards', async () => {
    const html = renderToStaticMarkup(await TopRankedLoading());
    expect(html).toContain('data-top-ranked-results-skeleton');
    expect(html).toContain('calc(var(--card-density-px, 220px) * 0.42)');
    expect(html.match(/relative flex gap-3 rounded-xl border border-border bg-bg-card p-3/g)).toHaveLength(12);
    expect(html.match(/absolute -left-1.5 -top-1.5/g)).toHaveLength(12);
  });

  it('matches the producer logo, tools, and both density-aware credit groups', async () => {
    const html = renderToStaticMarkup(await ProducerLoading());
    expect(html).toContain('h-24 w-24 shrink-0');
    expect(html.match(/data-producer-role-skeleton=/g)).toHaveLength(2);
    expect(html).toContain('data-producer-role-skeleton="developer"');
    expect(html).toContain('data-producer-role-skeleton="publisher"');
    expect(html).toContain('clamp(72px, calc(var(--card-density-px, 220px) * 0.42), 200px)');
    expect(html.match(/relative flex gap-2 rounded-lg border border-border bg-bg-elev\/40 p-2 pr-10/g)).toHaveLength(12);
  });

  it('matches the places registry counters, controls, and action rows without VN cover cards', async () => {
    const html = renderToStaticMarkup(await PlacesLoading());
    expect(html).toContain('max-w-7xl');
    expect(html).toContain('data-place-stats-skeleton');
    expect(html).toContain('data-place-rows-skeleton');
    expect(html.match(/rounded-xl border border-border bg-bg-card p-4 text-center/g)).toHaveLength(6);
    expect(html.match(/rounded-xl border border-border bg-bg-card p-3/g)).toHaveLength(6);
    expect(html).not.toContain('aspect-[2/3]');
  });

  it('matches the statistics summary, goal, histogram, and responsive chart groups', async () => {
    const html = renderToStaticMarkup(await StatsLoading());
    expect(html).toContain('data-stats-panel-skeleton="summary"');
    expect(html).toContain('data-stats-panel-skeleton="goal"');
    expect(html).toContain('data-stats-panel-skeleton="histogram"');
    expect(html).toContain('data-stats-bars-skeleton');
    expect(html).toContain('data-stats-chart-grid-skeleton');
    expect(html.match(/rounded-lg border border-border bg-bg-elev\/50 p-4 text-center/g)).toHaveLength(4);
  });

  it('matches the data status, actions, maintenance columns, and tool groups', async () => {
    const html = renderToStaticMarkup(await DataLoading());
    expect(html).toContain('data-data-panel-skeleton="status"');
    expect(html).toContain('data-data-panel-skeleton="export"');
    expect(html).toContain('data-data-panel-skeleton="import"');
    expect(html).toContain('data-data-panel-skeleton="maintenance"');
    expect(html).toContain('data-data-status-grid-skeleton');
    expect(html).toContain('data-data-maintenance-grid-skeleton');
    expect(html).toContain('data-data-tools-grid-skeleton');
    expect(html).toContain('md:grid-cols-2 lg:grid-cols-3');
  });

  it('uses one EGS skeleton for sync tools and density-aware horizontal result rows', async () => {
    const html = renderToStaticMarkup(await EgsLoading());
    expect(html).toContain('data-egs-results-skeleton');
    expect(html).toContain('calc(var(--card-density-px, 220px) * 0.42)');
    expect(html.match(/relative flex gap-3 rounded-xl border border-border bg-bg-card p-3 pr-10/g)).toHaveLength(9);
    expect(html).not.toContain('flex flex-col overflow-hidden');
  });

  it('matches the place detail actions, seven counters, controls, and stock-card grid', async () => {
    const html = renderToStaticMarkup(await PlaceDetailLoading());
    expect(html).toContain('max-w-7xl');
    expect(html).toContain('data-place-detail-stats-skeleton');
    expect(html).toContain('data-place-detail-controls-skeleton');
    expect(html).toContain('data-place-detail-items-skeleton');
    expect(html.match(/rounded-xl border border-border bg-bg-card p-4 text-center/g)).toHaveLength(7);
    expect(html.match(/h-96 w-full rounded-xl/g)).toHaveLength(8);
  });

  it('matches the stock picker, recent activity, and batch workspace', async () => {
    const html = renderToStaticMarkup(await StockLoading());
    expect(html).toContain('data-stock-picker-skeleton');
    expect(html).toContain('data-stock-recent-skeleton');
    expect(html).toContain('data-stock-recent-checks-skeleton');
    expect(html).toContain('data-stock-recent-batches-skeleton');
    expect(html).toContain('data-stock-batch-skeleton');
    expect(html).toContain('sm:grid-cols-2 lg:grid-cols-3');
  });

  it('matches the activity filters and both paginated event logs', async () => {
    const html = renderToStaticMarkup(await ActivityLoading());
    expect(html).toContain('data-activity-header-skeleton');
    expect(html.match(/data-activity-log-skeleton=/g)).toHaveLength(2);
    expect(html.match(/rounded-xl border border-border bg-bg-card p-3/g)).toHaveLength(10);
    expect(html).toContain('sm:min-w-[220px]');
  });

  it('matches the brand picker and two-column overlap credit cards without thumbnails', async () => {
    const html = renderToStaticMarkup(await BrandOverlapLoading());
    expect(html).toContain('data-brand-overlap-header-skeleton');
    expect(html).toContain('data-brand-overlap-results-skeleton');
    expect(html).toContain('sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto]');
    expect(html.match(/rounded-lg border border-border bg-bg-elev\/30 p-3/g)).toHaveLength(6);
    expect(html).not.toContain('h-20 w-14');
  });

  it('matches dumped summary, status navigation, density control, and compact progress rows', async () => {
    const html = renderToStaticMarkup(await DumpedLoading());
    expect(html).toContain('data-dumped-header-skeleton');
    expect(html).toContain('data-dumped-tabs-skeleton');
    expect(html).toContain('data-dumped-items-skeleton');
    expect(html).toContain('calc(var(--card-density-px, 220px) * 0.32)');
    expect(html.match(/flex gap-3 rounded-lg border border-border bg-bg-elev\/40 p-2/g)).toHaveLength(9);
    expect(html).not.toContain('flex flex-col overflow-hidden');
  });

  it('matches the quote search and citation cards with square avatars and pagination', async () => {
    const html = renderToStaticMarkup(await QuotesLoading());
    expect(html).toContain('data-quotes-header-skeleton');
    expect(html).toContain('data-quotes-results-skeleton');
    expect(html.match(/rounded-xl border border-border bg-bg-card p-4/g)).toHaveLength(8);
    expect(html.match(/h-7 w-7 shrink-0 rounded-full/g)).toHaveLength(8);
    expect(html).not.toContain('h-20 w-14');
  });

  it('matches the year navigation, summary, goal, heatmap, tags, and ranking without covers', async () => {
    const html = renderToStaticMarkup(await YearLoading());
    expect(html).toContain('data-year-header-skeleton');
    expect(html).toContain('data-year-stats-skeleton');
    expect(html).toContain('data-year-goal-skeleton');
    expect(html).toContain('data-year-heatmap-skeleton');
    expect(html).toContain('data-year-ranking-skeleton');
    expect(html.match(/aspect-square min-w-2 rounded-sm/g)).toHaveLength(108);
    expect(html).not.toContain('aspect-[2/3]');
  });

  it('matches the local, EGS, and VNDB schema sections with a tabular browser', async () => {
    const html = renderToStaticMarkup(await SchemaLoading());
    expect(html).toContain('data-schema-header-skeleton');
    expect(html).toContain('data-schema-section-skeleton="local"');
    expect(html).toContain('data-schema-section-skeleton="egs"');
    expect(html).toContain('data-schema-section-skeleton="vndb"');
    expect(html).toContain('grid-template-columns:repeat(4, 1fr)');
    expect(html.match(/class="grid p-3"/g)).toHaveLength(7);
  });

  it('matches Steam suggestions, linked mappings, and unlinked search rows without cover cards', async () => {
    const html = renderToStaticMarkup(await SteamLoading());
    expect(html).toContain('data-steam-header-skeleton');
    expect(html).toContain('data-steam-section-skeleton="suggestions"');
    expect(html).toContain('data-steam-section-skeleton="links"');
    expect(html).toContain('data-steam-section-skeleton="unlinked"');
    expect(html.match(/rounded-lg border border-border bg-bg-elev\/30 p-2/g)).toHaveLength(5);
    expect(html).not.toContain('aspect-[2/3]');
  });

  it('matches recommendation modes, explanation, options, seed controls, and cover results', async () => {
    const html = renderToStaticMarkup(await RecommendationsLoading());
    expect(html).toContain('data-recommendations-header-skeleton');
    expect(html).toContain('data-recommendation-modes-skeleton');
    expect(html.match(/h-16 w-full/g)).toHaveLength(5);
    expect(html.match(/flex flex-col overflow-hidden/g)).toHaveLength(12);
  });

  it('matches the upcoming header controls, tabs, and density-aware horizontal release cards', async () => {
    const html = renderToStaticMarkup(await UpcomingLoading());
    expect(html).toContain('data-upcoming-header-skeleton');
    expect(html).toContain('data-upcoming-results-skeleton="releases"');
    expect(html).toContain('var(--card-density-px, 240px)');
    expect(html).toContain('calc(var(--card-density-px, 220px) * 0.42)');
    expect(html.match(/flex items-start gap-3 rounded-xl border border-border bg-bg-card p-3 sm:p-4/g)).toHaveLength(8);
  });

  it('matches the complete wishlist workspace before its real cover grid', async () => {
    const html = renderToStaticMarkup(await WishlistLoading());
    expect(html).toContain('data-wishlist-header-skeleton');
    expect(html).toContain('data-wishlist-workspace-skeleton');
    expect(html).toContain('data-wishlist-controls-skeleton');
    expect(html).toContain('data-wishlist-filters-skeleton');
    expect(html.match(/flex flex-col overflow-hidden/g)).toHaveLength(18);
    expect(html).toContain('h-7 w-7 shrink-0');
  });

  it('renders every shared skeleton variant with optional labels and compact branches', () => {
    const html = renderToStaticMarkup(
      <div>
        <SkeletonBoundary label="Loading" className="boundary">
          <SkeletonBlock className="h-1" data-testid="block" />
          <SkeletonBlock className="h-2" data-testid="static-block" animated={false} />
        </SkeletonBoundary>
        <SkeletonBoundary>
          <SkeletonCard />
        </SkeletonBoundary>
        <SkeletonCardGrid count={1} label="Cards" />
        <SkeletonCompactGrid count={1} label="Compact" className="compact" />
        <SkeletonRows count={1} withThumb={false} label="Rows" />
        <SkeletonTabRow count={1} className="tabs" />
        <SkeletonText lines={1} className="text" />
        <SkeletonTable rows={1} cols={1} label="Table" />
      </div>,
    );
    expect(html).toContain('Loading');
    expect(html).toContain('Cards');
    expect(html).toContain('Compact');
    expect(html).toContain('compact');
    expect(html).toContain('Rows');
    expect(html).toContain('tabs');
    expect(html).toContain('text');
    expect(html).toContain('Table');
    expect(html).toMatch(/class="skeleton-surface-static rounded-md h-2" data-testid="static-block"/);
    expect(html).not.toContain('h-20 w-14 shrink-0');
  });

  it('renders shared skeleton defaults', () => {
    const html = renderToStaticMarkup(
      <div>
        <SkeletonBlock />
        <SkeletonCardGrid />
        <SkeletonCompactGrid />
        <SkeletonRows />
        <SkeletonTabRow />
        <SkeletonText />
        <SkeletonTable />
      </div>,
    );
    expect(html).toContain('h-20 w-14 shrink-0');
    expect(html).toContain('repeat(4, 1fr)');
  });
});
