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
import ListsError from '@/app/lists/error';
import ListDetailError from '@/app/lists/[id]/error';
import ProducerError from '@/app/producer/[id]/error';
import ProducersError from '@/app/producers/error';
import QuotesError from '@/app/quotes/error';
import RecommendationsError from '@/app/recommendations/error';
import ReleaseError from '@/app/release/[id]/error';
import SchemaError from '@/app/schema/error';
import SeriesError from '@/app/series/error';
import SeriesDetailError from '@/app/series/[id]/error';
import ShelfError from '@/app/shelf/error';
import SimilarError from '@/app/similar/error';
import StaffError from '@/app/staff/error';
import StaffDetailError from '@/app/staff/[id]/error';
import StatsError from '@/app/stats/error';
import TagError from '@/app/tag/[id]/error';
import TagsError from '@/app/tags/error';
import TopRankedError from '@/app/top-ranked/error';
import TraitError from '@/app/trait/[id]/error';
import UpcomingError from '@/app/upcoming/error';
import VnError from '@/app/vn/[id]/error';
import WishlistError from '@/app/wishlist/error';
import YearError from '@/app/year/error';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

type BoundaryProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

const boundaries: ComponentType<BoundaryProps>[] = [
  RootError,
  ActivityError,
  BrandOverlapError,
  CharacterError,
  CharactersError,
  CompareError,
  DataError,
  DumpedError,
  EgsError,
  ListsError,
  ListDetailError,
  ProducerError,
  ProducersError,
  QuotesError,
  RecommendationsError,
  ReleaseError,
  SchemaError,
  SeriesError,
  SeriesDetailError,
  ShelfError,
  SimilarError,
  StaffError,
  StaffDetailError,
  StatsError,
  TagError,
  TagsError,
  TopRankedError,
  TraitError,
  UpcomingError,
  VnError,
  WishlistError,
  YearError,
];

const t = dictionaries[DEFAULT_LOCALE];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('route error boundaries', () => {
  it('renders recovery UI, logs the error, exposes an optional digest, and resets every segment', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const Boundary of boundaries) {
      const reset = vi.fn();
      const { container, unmount } = renderWithProviders(
        <Boundary error={Object.assign(new Error('boom'), { digest: 'trace-123' })} reset={reset} />,
      );
      expect(container.textContent).toContain('trace-123');
      fireEvent.click(screen.getByRole('button', { name: t.errorBoundary.retry }));
      expect(reset).toHaveBeenCalledTimes(1);
      unmount();
    }
    expect(log).toHaveBeenCalledTimes(boundaries.length);
  });

  it('omits the digest row when a segment error has no digest', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const Boundary of boundaries) {
      const { container, unmount } = renderWithProviders(<Boundary error={new Error('boom')} reset={vi.fn()} />);
      expect(container.textContent).not.toContain('trace-123');
      unmount();
    }
  });
});
