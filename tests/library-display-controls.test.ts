import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const SOURCE = readFileSync('src/components/LibraryClient.tsx', 'utf8');

describe('library display controls', () => {
  it('groups density mode and home-section layout into one display surface', () => {
    expect(SOURCE).toContain('aria-label={t.library.displayOptionsLabel}');
    expect(SOURCE).toContain('<CardDensitySlider scope="library" />');
    expect(SOURCE).toContain('window.dispatchEvent(new CustomEvent(HOME_LAYOUT_OPEN_EVENT))');
    expect(SOURCE).toContain('{t.homeLayout.openEditor}');
  });

  it('keeps filter presets and reset in the options menu without duplicating layout', () => {
    const menu = SOURCE.slice(SOURCE.indexOf('function LibraryActionsMenu('));
    expect(menu).toContain('SAVED_FILTERS_OPEN_EVENT');
    expect(menu).toContain('t.library.resetFilters');
    expect(menu).not.toContain('HOME_LAYOUT_OPEN_EVENT');
  });
});
