// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelationsSection, type EnrichedRelation } from '@/components/RelationsSection';
import { renderWithProviders } from './helpers/render-component';

const sectionMocks = vi.hoisted(() => ({
  count: vi.fn(),
}));

vi.mock('@/components/vn-detail/DetailSectionFrame', () => ({
  useSectionCount: sectionMocks.count,
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ badge, data }: {
    badge: { label: string; tone: string };
    data: {
      id: string;
      poster: string | null;
      publishers: Array<{ name: string }>;
    };
  }) => <div>{`${data.id}:${data.poster ?? 'none'}:${data.publishers.length}:${badge.label}:${badge.tone}`}</div>,
}));

function relation(overrides: Partial<EnrichedRelation> = {}): EnrichedRelation {
  return {
    id: 'v90001',
    title: 'Related VN',
    alttitle: null,
    released: null,
    rating: null,
    votecount: null,
    length_minutes: null,
    languages: [],
    platforms: [],
    developers: [],
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    relation: 'seq',
    relation_official: true,
    in_collection: false,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  sectionMocks.count.mockReset();
});

describe('RelationsSection', () => {
  it('renders nothing and clears the section count when no relations exist', () => {
    const { container } = renderWithProviders(<RelationsSection relations={[]} />, { locale: 'en' });
    expect(container).toBeEmptyDOMElement();
    expect(sectionMocks.count).toHaveBeenCalledWith(null);
  });

  it('groups, sorts, labels, caches, and projects official or unofficial relation cards', () => {
    const first = relation({
      id: 'v90001',
      image_url: 'full.jpg',
      image_thumb: 'thumb.jpg',
    });
    const second = relation({
      id: 'v90002',
      relation_official: false,
      image_thumb: 'second-thumb.jpg',
      publishers: [{ name: 'Publisher' }],
    });
    const unknown = relation({
      id: 'v90003',
      relation: 'custom',
    });
    const relations = [unknown, first, second];
    const { rerender } = renderWithProviders(<RelationsSection relations={relations} />, { locale: 'en' });

    expect(sectionMocks.count).toHaveBeenCalledWith(3);
    expect(screen.getByText('v90001:full.jpg:0:Sequel:accent')).toBeInTheDocument();
    expect(screen.getByText('v90002:second-thumb.jpg:1:Sequel / unofficial:muted')).toBeInTheDocument();
    expect(screen.getByText('v90003:none:0:custom:accent')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading').map((heading) => heading.textContent);
    expect(headings[0]).toContain('Sequel');
    expect(headings[1]).toContain('custom');

    rerender(<RelationsSection relations={relations} />);
    expect(screen.getByText('v90001:full.jpg:0:Sequel:accent')).toBeInTheDocument();

    cleanup();
    renderWithProviders(<RelationsSection relations={[first, unknown]} />, { locale: 'en' });
    expect(screen.getByText('v90001:full.jpg:0:Sequel:accent')).toBeInTheDocument();
  });
});
