import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import HomeLoading from '@/app/loading';
import ActivityLoading from '@/app/activity/loading';
import AliceNetLoading from '@/app/alicenet/loading';
import BrandOverlapLoading from '@/app/brand-overlap/loading';
import CharacterLoading from '@/app/character/[id]/loading';
import CharactersLoading from '@/app/characters/loading';
import CompareLoading from '@/app/compare/loading';
import DataLoading from '@/app/data/loading';
import DumpedLoading from '@/app/dumped/loading';
import EgsLoading from '@/app/egs/loading';
import LabelsLoading from '@/app/labels/loading';
import ListsLoading from '@/app/lists/loading';
import ListDetailLoading from '@/app/lists/[id]/loading';
import MapLoading from '@/app/map/loading';
import PlacesLoading from '@/app/places/loading';
import PlaceDetailLoading from '@/app/places/[id]/loading';
import ProducerLoading from '@/app/producer/[id]/loading';
import ProducersLoading from '@/app/producers/loading';
import QuotesLoading from '@/app/quotes/loading';
import RecommendationsLoading from '@/app/recommendations/loading';
import ReleaseLoading from '@/app/release/[id]/loading';
import SchemaLoading from '@/app/schema/loading';
import SearchLoading from '@/app/search/loading';
import SeriesLoading from '@/app/series/loading';
import SeriesDetailLoading from '@/app/series/[id]/loading';
import ShelfLoading from '@/app/shelf/loading';
import SimilarLoading from '@/app/similar/loading';
import StaffLoading from '@/app/staff/loading';
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
import {
  SkeletonBlock,
  SkeletonBoundary,
  SkeletonCard,
  SkeletonCardGrid,
  SkeletonRows,
  SkeletonTable,
  SkeletonTabRow,
  SkeletonText,
} from '@/components/Skeleton';

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

const routeLoaders = [
  HomeLoading,
  ActivityLoading,
  AliceNetLoading,
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

  it('renders every shared skeleton variant with optional labels and compact branches', () => {
    const html = renderToStaticMarkup(
      <div>
        <SkeletonBoundary label="Loading" className="boundary">
          <SkeletonBlock className="h-1" data-testid="block" />
        </SkeletonBoundary>
        <SkeletonBoundary>
          <SkeletonCard />
        </SkeletonBoundary>
        <SkeletonCardGrid count={1} label="Cards" />
        <SkeletonRows count={1} withThumb={false} label="Rows" />
        <SkeletonTabRow count={1} className="tabs" />
        <SkeletonText lines={1} className="text" />
        <SkeletonTable rows={1} cols={1} label="Table" />
      </div>,
    );
    expect(html).toContain('Loading');
    expect(html).toContain('Cards');
    expect(html).toContain('Rows');
    expect(html).toContain('tabs');
    expect(html).toContain('text');
    expect(html).toContain('Table');
    expect(html).not.toContain('h-20 w-14 shrink-0');
  });

  it('renders shared skeleton defaults', () => {
    const html = renderToStaticMarkup(
      <div>
        <SkeletonBlock />
        <SkeletonCardGrid />
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
