// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VnTagsGroupedView } from '@/components/VnTagsGroupedView';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { RawVnTag } from '@/lib/vn-tags-grouped';
import { renderWithProviders } from './helpers/render-component';

const settingsMocks = vi.hoisted(() => ({
  settings: {
    spoilerLevel: 0 as 0 | 1 | 2,
    showSexualTraits: false,
  },
}));

vi.mock('@/lib/settings/client', () => ({
  useDisplaySettings: () => settingsMocks,
}));

vi.mock('@/components/SpoilerChip', () => ({
  SpoilerChip: ({
    children,
    currentSpoilerLevel,
    href,
    lie,
    sexual,
    title,
  }: {
    children: React.ReactNode;
    currentSpoilerLevel: number;
    href: string;
    lie?: boolean;
    sexual?: boolean;
    title?: string;
  }) => (
    <a
      data-testid="spoiler-chip"
      data-level={currentSpoilerLevel}
      data-lie={lie ?? false}
      data-sexual={sexual ?? false}
      href={href}
      title={title}
    >
      {children}
    </a>
  ),
}));

const t = dictionaries.en;

function tag(index: number, overrides: Partial<RawVnTag> = {}): RawVnTag {
  return {
    id: `g${index}`,
    name: `Tag ${index}`,
    rating: index,
    spoiler: 0,
    category: 'cont',
    ...overrides,
  };
}

beforeEach(() => {
  settingsMocks.settings = {
    spoilerLevel: 0,
    showSexualTraits: false,
  };
});

afterEach(() => {
  cleanup();
});

describe('VnTagsGroupedView', () => {
  it('does not render an empty tag list', () => {
    const { container } = renderWithProviders(<VnTagsGroupedView tags={[]} />, { locale: 'en' });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders category sections, summary slicing, external links, ratings, and all local toggles', () => {
    const tags = [
      ...Array.from({ length: 11 }, (_unused, index) => tag(index + 1)),
      tag(12, { category: 'ero', lie: true }),
      tag(13, { category: 'tech', spoiler: 2 }),
    ];
    renderWithProviders(<VnTagsGroupedView tags={tags} spoilOverride={2} />, { locale: 'en' });

    expect(screen.getByText(t.vnTags.categoryContent)).toBeInTheDocument();
    expect(screen.getByText(t.vnTags.categorySexual)).toBeInTheDocument();
    expect(screen.getByText(t.vnTags.categoryTechnical)).toBeInTheDocument();
    expect(screen.getAllByTestId('spoiler-chip')).toHaveLength(12);
    expect(screen.getAllByTestId('spoiler-chip')[0]).toHaveAttribute('data-level', '2');
    expect(screen.getAllByRole('link', { name: t.detail.openOnVndb })
      .some((link) => link.getAttribute('href') === 'https://vndb.org/g13')).toBe(true);
    expect(screen.getByTitle('Tag 12 - 12.0 / 3')).toHaveAttribute('data-lie', 'true');
    expect(screen.getByTitle('Tag 12 - 12.0 / 3')).toHaveAttribute('data-sexual', 'true');

    fireEvent.click(screen.getByRole('button', { name: t.vnTags.viewAll }));
    expect(screen.getAllByTestId('spoiler-chip')).toHaveLength(13);
    fireEvent.click(screen.getByRole('button', { name: t.vnTags.viewSummary }));
    expect(screen.getAllByTestId('spoiler-chip')).toHaveLength(12);

    fireEvent.click(screen.getByRole('button', { name: t.vnTags.spoilerNone }));
    expect(screen.getAllByTestId('spoiler-chip')[0]).toHaveAttribute('data-level', '0');
    fireEvent.click(screen.getByRole('button', { name: t.vnTags.spoilerMinor }));
    expect(screen.getAllByTestId('spoiler-chip')[0]).toHaveAttribute('data-level', '1');
    fireEvent.click(screen.getByRole('button', { name: t.vnTags.spoilerAll }));
    expect(screen.getAllByTestId('spoiler-chip')[0]).toHaveAttribute('data-level', '2');
  });

  it('resynchronizes to changed display settings after consuming a deep-link seed', () => {
    const { rerender } = renderWithProviders(
      <VnTagsGroupedView tags={[tag(1)]} spoilOverride={2} />,
      { locale: 'en' },
    );
    expect(screen.getByTestId('spoiler-chip')).toHaveAttribute('data-level', '2');

    settingsMocks.settings = {
      spoilerLevel: 1,
      showSexualTraits: true,
    };
    rerender(<VnTagsGroupedView tags={[tag(1)]} spoilOverride={2} />);

    expect(screen.getByTestId('spoiler-chip')).toHaveAttribute('data-level', '1');
  });

  it('uses the global spoiler level when no deep-link override exists', () => {
    settingsMocks.settings = {
      spoilerLevel: 1,
      showSexualTraits: true,
    };
    renderWithProviders(<VnTagsGroupedView tags={[tag(1)]} />, { locale: 'en' });

    expect(screen.getByTestId('spoiler-chip')).toHaveAttribute('data-level', '1');
  });
});
