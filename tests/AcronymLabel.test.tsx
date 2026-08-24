// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { AcronymLabel } from '@/components/AcronymLabel';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

describe('AcronymLabel', () => {
  it('renders canonical acronyms with their localized explanations', () => {
    renderWithProviders(
      <div>
        <AcronymLabel acronym="vndb" />
        <AcronymLabel acronym="egs" className="font-semibold" />
        <AcronymLabel acronym="gps" />
      </div>,
      { locale: 'fr' },
    );

    const vndb = screen.getByText('VNDB');
    const egs = screen.getByText('EGS');
    const gps = screen.getByText('GPS');

    expect(vndb.tagName).toBe('ABBR');
    expect(vndb.getAttribute('title')).toBe(dictionaries.fr.acronyms.vndb);
    expect(egs.getAttribute('title')).toBe(dictionaries.fr.acronyms.egs);
    expect(egs.classList.contains('font-semibold')).toBe(true);
    expect(gps.getAttribute('title')).toBe(dictionaries.fr.acronyms.gps);
  });
});
