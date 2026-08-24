// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SourceChoiceTooltip } from '@/components/SourceChoiceTooltip';
import type { SourceChoice } from '@/lib/source-resolve';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

afterEach(cleanup);

describe('SourceChoiceTooltip', () => {
  it('explains every source choice on keyboard focus', () => {
    const choices: Array<[SourceChoice, string]> = [
      ['auto', dictionaries.en.compare.sourceAutoHint],
      ['vndb', dictionaries.en.compare.sourceVndbHint],
      ['egs', dictionaries.en.compare.sourceEgsHint],
      ['custom', dictionaries.en.compare.sourceCustomHint],
    ];

    renderWithProviders(
      <>
        {choices.map(([choice]) => (
          <SourceChoiceTooltip key={choice} choice={choice}>
            <button type="button">{choice}</button>
          </SourceChoiceTooltip>
        ))}
      </>,
      { locale: 'en' },
    );

    for (const [choice, description] of choices) {
      const button = screen.getByRole('button', { name: choice });
      fireEvent.focus(button);
      expect(screen.getByRole('tooltip')).toHaveTextContent(description);
      fireEvent.blur(button);
      expect(screen.queryByRole('tooltip')).toBeNull();
    }
  });
});
