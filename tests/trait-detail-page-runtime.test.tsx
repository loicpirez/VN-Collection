import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TraitPage, { generateMetadata as generateTraitMetadata } from '@/app/trait/[id]/page';
import { getCharacterImages, listInCollectionVnIds } from '@/lib/db';
import {
  getCharactersForTraitInVns,
  getCharactersForTraitPage,
  getTrait,
  type VndbCharacter,
  type VndbTrait,
} from '@/lib/vndb';
import { dictionaries } from '@/lib/i18n/dictionaries';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock('@/lib/db', () => ({
  getCharacterImages: vi.fn(),
  listInCollectionVnIds: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getCharactersForTraitInVns: vi.fn(),
  getCharactersForTraitPage: vi.fn(),
  getTrait: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, localSrc, alt }: { src: string | null; localSrc: string | null; alt: string }) => (
    <div data-testid="safe-image">{src ?? 'none'}:{localSrc ?? 'none'}:{alt}</div>
  ),
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <div data-testid="markup">{text}</div>,
}));

function trait(overrides: Partial<VndbTrait> = {}): VndbTrait {
  return {
    id: 'i1',
    name: 'Trait',
    aliases: [],
    description: null,
    searchable: true,
    applicable: true,
    sexual: false,
    group_id: null,
    group_name: null,
    char_count: 1,
    ...overrides,
  };
}

function character(index: number, overrides: Partial<VndbCharacter> = {}): VndbCharacter {
  return {
    id: `c${index}`,
    name: `Character ${index}`,
    original: null,
    aliases: [],
    description: null,
    image: null,
    blood_type: null,
    height: null,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: null,
    birthday: null,
    sex: null,
    gender: null,
    vns: [],
    traits: [],
    ...overrides,
  };
}

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  vi.mocked(getCharacterImages).mockReset().mockReturnValue(new Map());
  vi.mocked(listInCollectionVnIds).mockReset().mockReturnValue([]);
  vi.mocked(getCharactersForTraitInVns).mockReset().mockResolvedValue([]);
  vi.mocked(getCharactersForTraitPage).mockReset().mockResolvedValue({ results: [], more: false });
  vi.mocked(getTrait).mockReset().mockResolvedValue(trait());
});

describe('trait detail page runtime', () => {
  it('renders trait metadata and falls back to the traits title on lookup failure', async () => {
    expect(await generateTraitMetadata({ params: Promise.resolve({ id: 'i1' }) })).toEqual({ title: 'Trait' });

    vi.mocked(getTrait).mockRejectedValueOnce(new Error('offline'));
    expect(await generateTraitMetadata({ params: Promise.resolve({ id: 'i1' }) })).toEqual({ title: dictionaries.en.nav.traits });
  });

  it('rejects malformed and unknown ids', async () => {
    await expect(TraitPage({ params: Promise.resolve({ id: 'bad' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found');

    vi.mocked(getTrait).mockResolvedValueOnce(null);
    await expect(TraitPage({ params: Promise.resolve({ id: 'i404' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found');
  });

  it('renders a lookup error with a VNDB escape hatch', async () => {
    vi.mocked(getTrait).mockRejectedValueOnce(new Error('trait offline'));

    const html = renderToStaticMarkup(await TraitPage({
      params: Promise.resolve({ id: 'i1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('trait offline');
    expect(html).toContain('href="https://vndb.org/i1"');
  });

  it('renders rich trait metadata, owned VN priority, local images, and next pagination', async () => {
    vi.mocked(getTrait).mockResolvedValueOnce(trait({
      aliases: ['Alias'],
      description: 'Description',
      sexual: true,
      group_name: 'Group',
      char_count: 2,
    }));
    vi.mocked(listInCollectionVnIds).mockReturnValue(['v2']);
    vi.mocked(getCharacterImages).mockReturnValue(new Map([
      ['c1', { url: 'https://example.test/c1.jpg', local_path: '/local/c1.jpg', fetched_at: 1 }],
    ]));
    vi.mocked(getCharactersForTraitPage).mockResolvedValueOnce({
      results: [
        character(1, {
          original: 'Original',
          image: { url: 'https://example.test/c1.jpg', sexual: 0, violence: 0 },
          vns: [
            { id: 'v1', role: 'side', spoiler: 0, title: 'First VN' },
            { id: 'v2', role: 'main', spoiler: 0, title: 'Owned VN' },
          ],
        }),
        character(2),
      ],
      more: true,
    });

    const html = renderToStaticMarkup(await TraitPage({
      params: Promise.resolve({ id: 'I1' }),
      searchParams: Promise.resolve({ page: 'invalid' }),
    }));

    expect(html).toContain('Group');
    expect(html).toContain('Alias');
    expect(html).toContain('Description');
    expect(html).toContain('R18');
    expect(html).toContain('https://example.test/c1.jpg:/local/c1.jpg:Character 1');
    expect(html).toContain('Owned VN');
    expect(html).toContain('href="/trait/I1?page=2"');
    expect(getCharactersForTraitPage).toHaveBeenCalledWith('I1', { results: 60, page: 1 });
  });

  it('renders collection-only empty state and collection-only previous and next pagination', async () => {
    vi.mocked(listInCollectionVnIds).mockReturnValue(['v1']);
    let html = renderToStaticMarkup(await TraitPage({
      params: Promise.resolve({ id: 'i1' }),
      searchParams: Promise.resolve({ mine: '1' }),
    }));
    expect(html).toContain(dictionaries.en.traits.mineEmpty);

    vi.mocked(getCharactersForTraitInVns).mockResolvedValueOnce(
      Array.from({ length: 121 }, (_, index) => character(index + 1)),
    );
    html = renderToStaticMarkup(await TraitPage({
      params: Promise.resolve({ id: 'i1' }),
      searchParams: Promise.resolve({ mine: '1', page: '2' }),
    }));

    expect(html).toContain('href="/trait/i1?mine=1"');
    expect(html).toContain('href="/trait/i1?mine=1&amp;page=3"');
    expect(html).toContain('Character 61');
    expect(getCharactersForTraitInVns).toHaveBeenCalledWith('i1', ['v1']);
  });
});
