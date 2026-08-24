// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ScoreSourceLegend } from '@/components/ScoreSourceLegend';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('ScoreSourceLegend', () => {
  it('renders and explains every score source in the requested order', () => {
    const t = dictionaries.en;
    renderWithProviders(
      <ScoreSourceLegend sources={['unified', 'vndb', 'egs', 'mine']} />,
      { locale: 'en' },
    );

    const legend = screen.getByRole('list', { name: t.detail.scoreLegendLabel });
    const items = within(legend).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      t.detail.scoreUnified,
      t.detail.scoreVndb,
      t.detail.scoreEgs,
      t.detail.myRatingLabel,
    ]);

    const hints = [
      t.detail.scoreUnifiedHint,
      t.detail.scoreVndbHint,
      t.detail.scoreEgsHint,
      t.detail.scoreMineLegendHint,
    ];
    items.forEach((item, index) => {
      fireEvent.focus(item);
      expect(screen.getByRole('tooltip')).toHaveTextContent(hints[index]);
      fireEvent.blur(item);
    });
  });
});
