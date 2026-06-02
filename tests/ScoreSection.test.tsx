// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScoreSection } from '@/components/ScoreSection';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const t = dictionaries.en;

afterEach(cleanup);

describe('ScoreSection', () => {
  it('expands unavailable source details and collapses them again', () => {
    renderWithProviders(
      <ScoreSection
        unifiedRating={null}
        unifiedRatingSource="No source"
        vndbRating={null}
        egsRating={null}
        vndbAverage={null}
        userRating={null}
        votecount={0}
        formattedVotecount="0"
        ratingOf10="/ 10"
        votes="votes"
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('-')).toBeInTheDocument();
    const expand = screen.getByRole('button', { name: t.detail.scoreShowBreakdown });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expand);

    expect(screen.getByRole('button', { name: t.detail.scoreHideBreakdown })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(t.detail.scoreUnavailable)).toHaveLength(3);
    expect(screen.getByText('0 votes')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.detail.scoreHideBreakdown }));
    expect(screen.queryByText(t.detail.scoreVndb)).toBeNull();
  });

  it('renders the source breakdown for populated ratings', () => {
    renderWithProviders(
      <ScoreSection
        unifiedRating={86}
        unifiedRatingSource="VNDB"
        vndbRating={82}
        egsRating={78.6}
        vndbAverage={81}
        userRating={90}
        votecount={10}
        formattedVotecount="10"
        ratingOf10="/ 10"
        votes="votes"
      />,
      { locale: 'en' },
    );

    expect(screen.getByText('8.6')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.detail.scoreShowBreakdown }));
    expect(screen.getByText('8.2/ 10')).toBeInTheDocument();
    expect(screen.getByText('79 / 100')).toBeInTheDocument();
    expect(screen.getByText('8.1/ 10')).toBeInTheDocument();
    expect(screen.getByText('9.0/ 10')).toBeInTheDocument();
    expect(screen.getByText(t.detail.scoreEgsMedian)).toBeInTheDocument();
    expect(screen.getByText(t.detail.scoreVndbRawHint)).toBeInTheDocument();
    expect(screen.getByText(t.detail.scoreMineHint)).toBeInTheDocument();
  });
});
