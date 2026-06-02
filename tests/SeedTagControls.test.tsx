// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeedTagControls } from '@/components/SeedTagControls';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

interface PickerTag {
  id: string;
  name: string;
  category: 'cont' | 'ero' | 'tech';
  vn_count: number;
}

interface PickerProps {
  tags: PickerTag[];
  onChange: (next: PickerTag[]) => void;
  category?: 'cont' | 'ero' | 'tech';
  label: string;
  hint: string;
}

const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

const pickerMocks = vi.hoisted(() => ({
  props: null as PickerProps | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
  useSearchParams: () => navigationMocks.searchParams,
}));

vi.mock('@/components/TagPicker', () => ({
  TagPicker: (props: PickerProps) => {
    pickerMocks.props = props;
    return (
      <div data-testid="picker">
        <button
          type="button"
          onClick={() => props.onChange([
            { id: 'g2', name: 'Second', category: 'cont', vn_count: 2 },
            { id: 'g3', name: 'Third', category: 'cont', vn_count: 3 },
          ])}
        >
          replace-tags
        </button>
        <button type="button" onClick={() => props.onChange([])}>clear-tags</button>
        <button
          type="button"
          onClick={() => props.onChange([
            { id: '', name: 'Blank', category: 'ero', vn_count: 0 },
            { id: 'g9', name: 'Ninth', category: 'ero', vn_count: 9 },
          ])}
        >
          filter-tags
        </button>
      </div>
    );
  },
}));

const t = dictionaries.en;

beforeEach(() => {
  navigationMocks.replace.mockReset();
  navigationMocks.searchParams = new URLSearchParams();
  pickerMocks.props = null;
});

afterEach(() => {
  cleanup();
});

describe('SeedTagControls', () => {
  it('projects initial seeds into default picker tags and writes the default URL parameter', () => {
    renderWithProviders(
      <SeedTagControls initial={[{ id: 'g1', name: 'First', weight: 4 }]} />,
      { locale: 'en' },
    );
    expect(pickerMocks.props).toMatchObject({
      tags: [{ id: 'g1', name: 'First', category: 'cont', vn_count: 0 }],
      label: t.recommend.seedsLabel,
      hint: t.recommend.seedsHint,
    });

    fireEvent.click(screen.getByRole('button', { name: 'replace-tags' }));
    expect(navigationMocks.replace).toHaveBeenCalledWith('?tags=g2%2Cg3', { scroll: false });
  });

  it('preserves named parameters, writes an alternate seed parameter, and filters blank ids', () => {
    navigationMocks.searchParams = new URLSearchParams('ero=1&mode=hidden&tags=old');
    renderWithProviders(
      <SeedTagControls
        initial={[]}
        paramName="seed"
        preserveParams={['ero', 'missing']}
        label="Custom label"
        hint="Custom hint"
        category="ero"
      />,
      { locale: 'en' },
    );
    expect(pickerMocks.props).toMatchObject({
      tags: [],
      category: 'ero',
      label: 'Custom label',
      hint: 'Custom hint',
    });

    fireEvent.click(screen.getByRole('button', { name: 'filter-tags' }));
    expect(navigationMocks.replace).toHaveBeenCalledWith('?ero=1&seed=g9', { scroll: false });
  });

  it('removes the seed parameter when all tags are cleared', () => {
    navigationMocks.searchParams = new URLSearchParams('ero=1');
    renderWithProviders(
      <SeedTagControls initial={[{ id: 'g1', name: 'First' }]} preserveParams={['ero']} category="tech" />,
      { locale: 'en' },
    );
    expect(pickerMocks.props?.tags).toEqual([{ id: 'g1', name: 'First', category: 'tech', vn_count: 0 }]);
    fireEvent.click(screen.getByRole('button', { name: 'clear-tags' }));
    expect(navigationMocks.replace).toHaveBeenCalledWith('?ero=1', { scroll: false });
  });

  it('navigates to the explicit empty query when no tags or preserved params remain', () => {
    renderWithProviders(<SeedTagControls initial={[]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'clear-tags' }));
    expect(navigationMocks.replace).toHaveBeenCalledWith('?', { scroll: false });
  });
});
