// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ComponentType } from 'react';
import { renderWithProviders } from './helpers/render-component';
import RootError from '@/app/error';
import ActivityError from '@/app/activity/error';
import BrandOverlapError from '@/app/brand-overlap/error';
import CharacterError from '@/app/character/[id]/error';
import CharactersError from '@/app/characters/error';
import CompareError from '@/app/compare/error';
import DataError from '@/app/data/error';
import DumpedError from '@/app/dumped/error';
import EgsError from '@/app/egs/error';
import LabelsError from '@/app/labels/error';
import ListsError from '@/app/lists/(index)/error';
import ListDetailError from '@/app/lists/[id]/error';
import MapError from '@/app/map/error';
import PlaceDetailError from '@/app/places/[id]/error';
import PlacesError from '@/app/places/(index)/error';
import ProducerError from '@/app/producer/[id]/error';
import ProducersError from '@/app/producers/error';
import QuotesError from '@/app/quotes/error';
import RecommendationsError from '@/app/recommendations/error';
import ReleaseError from '@/app/release/[id]/error';
import SchemaError from '@/app/schema/error';
import SearchError from '@/app/search/error';
import SeriesError from '@/app/series/(index)/error';
import SeriesDetailError from '@/app/series/[id]/error';
import ShelfError from '@/app/shelf/error';
import SimilarError from '@/app/similar/error';
import StaffError from '@/app/staff/(index)/error';
import StaffDetailError from '@/app/staff/[id]/error';
import StatsError from '@/app/stats/error';
import SteamError from '@/app/steam/error';
import StockError from '@/app/stock/error';
import TagError from '@/app/tag/[id]/error';
import TagsError from '@/app/tags/error';
import TopRankedError from '@/app/top-ranked/error';
import TraitError from '@/app/trait/[id]/error';
import TraitsError from '@/app/traits/error';
import UpcomingError from '@/app/upcoming/error';
import VnError from '@/app/vn/[id]/error';
import WishlistError from '@/app/wishlist/error';
import YearError from '@/app/year/error';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

type BoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const boundaries: Array<[string, ComponentType<BoundaryProps>, string, string]> = [
  ['root', RootError, '/', 'Route error'],
  ['activity', ActivityError, '/', 'Activity page error'],
  ['brand overlap', BrandOverlapError, '/', 'Route error'],
  ['character detail', CharacterError, '/characters', 'Character detail error'],
  ['characters', CharactersError, '/', 'Route error'],
  ['compare', CompareError, '/', 'Route error'],
  ['data', DataError, '/', 'Route error'],
  ['dumped', DumpedError, '/', 'Route error'],
  ['egs', EgsError, '/', 'Route error'],
  ['labels', LabelsError, '/', 'Labels page error'],
  ['lists', ListsError, '/', 'Lists error'],
  ['list detail', ListDetailError, '/lists', 'List detail error'],
  ['map', MapError, '/places', 'Map page error'],
  ['place detail', PlaceDetailError, '/places', 'Place detail error'],
  ['places', PlacesError, '/', 'Places page error'],
  ['producer detail', ProducerError, '/producers', 'Producer detail error'],
  ['producers', ProducersError, '/', 'Route error'],
  ['quotes', QuotesError, '/', 'Quotes error'],
  ['recommendations', RecommendationsError, '/', 'Route error'],
  ['release detail', ReleaseError, '/', 'Release detail error'],
  ['schema', SchemaError, '/', 'Schema page error'],
  ['search', SearchError, '/', 'Search page error'],
  ['series', SeriesError, '/', 'Series page error'],
  ['series detail', SeriesDetailError, '/series', 'Series detail error'],
  ['shelf', ShelfError, '/', 'Shelf page error'],
  ['similar', SimilarError, '/', 'Similar page error'],
  ['staff', StaffError, '/', 'Staff page error'],
  ['staff detail', StaffDetailError, '/staff', 'Staff detail error'],
  ['stats', StatsError, '/', 'Stats page error'],
  ['steam', SteamError, '/', 'Steam page error'],
  ['stock', StockError, '/', 'Stock page error'],
  ['tag detail', TagError, '/tags', 'Tag detail error'],
  ['tags', TagsError, '/', 'Tags page error'],
  ['top ranked', TopRankedError, '/', 'Top-ranked page error'],
  ['trait detail', TraitError, '/traits', 'Trait detail error'],
  ['traits', TraitsError, '/', 'Traits page error'],
  ['upcoming', UpcomingError, '/', 'Upcoming page error'],
  ['vn detail', VnError, '/', 'VN detail error'],
  ['wishlist', WishlistError, '/', 'Wishlist page error'],
  ['year', YearError, '/', 'Year page error'],
];

const t = dictionaries[DEFAULT_LOCALE];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('route error boundaries', () => {
  it.each(boundaries)('renders recovery UI, logs the error, exposes an optional digest, and resets %s', (_name, Boundary, returnHref, logLabel) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    const { container } = renderWithProviders(
      <Boundary error={Object.assign(new Error('boom'), { digest: 'trace-123' })} reset={reset} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(container.textContent).toContain('trace-123');
    fireEvent.click(screen.getByRole('button', { name: t.errorBoundary.retry }));
    expect(reset).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(`${logLabel}:`, expect.any(Error));
    expect(screen.getByRole('link', {
      name: returnHref === '/' ? t.errorBoundary.home : t.errorBoundary.back,
    })).toHaveAttribute('href', returnHref);
  });

  it.each(boundaries)('omits the digest row when %s has no digest', (_name, Boundary) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = renderWithProviders(<Boundary error={new Error('boom')} reset={vi.fn()} />);
    expect(container.textContent).not.toContain('trace-123');
  });
});
