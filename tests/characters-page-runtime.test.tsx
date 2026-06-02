import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CharactersPage, { generateMetadata } from '@/app/characters/page';
import { searchLocalCharacters } from '@/lib/db';
import { searchCharacters, type VndbCharacter } from '@/lib/vndb';
import { dictionaries } from '@/lib/i18n/dictionaries';

const navigationMocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`redirect:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: navigationMocks.redirect,
}));

vi.mock('@/lib/db', () => ({
  searchLocalCharacters: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  searchCharacters: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => (
    <main data-testid="density-scope" data-scope={scope}>{children}</main>
  ),
}));

vi.mock('@/components/NavTabStrip', () => ({
  NavTabStrip: ({ tabs }: { tabs: Array<{ href: string; label: string; isActive: boolean }> }) => (
    <nav data-testid="nav-tabs">{JSON.stringify(tabs)}</nav>
  ),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src: string | null; alt: string }) => <img src={src ?? undefined} alt={alt} />,
}));

function character(id: string, name: string, overrides: Partial<VndbCharacter> = {}): VndbCharacter {
  return {
    id,
    name,
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

function local(profile: VndbCharacter, voiceLanguages: string[] = []) {
  return { profile, voice_languages: voiceLanguages };
}

beforeEach(() => {
  navigationMocks.redirect.mockClear();
  vi.mocked(searchLocalCharacters).mockReset().mockReturnValue([]);
  vi.mocked(searchCharacters).mockReset().mockResolvedValue([]);
});

describe('characters page runtime', () => {
  it('renders localized metadata, empty local browsing, and canonical ID redirects', async () => {
    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).toEqual({
      title: dictionaries.en.charactersSearch.pageTitle,
    });
    expect(await generateMetadata({ searchParams: Promise.resolve({ q: ['Heroine', 'ignored'] }) })).toEqual({
      title: `Heroine - ${dictionaries.en.charactersSearch.pageTitle}`,
    });

    const html = renderToStaticMarkup(await CharactersPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain(dictionaries.en.charactersSearch.empty);
    expect(searchLocalCharacters).toHaveBeenCalledWith({ q: undefined, limit: 200 });
    expect(searchCharacters).not.toHaveBeenCalled();

    await expect(CharactersPage({ searchParams: Promise.resolve({ q: 'C123' }) })).rejects.toThrow('redirect:/character/c123');
  });

  it('renders local cards, filters sexual images unless opted in, and exposes a VNDB fallback for filtered empties', async () => {
    vi.mocked(searchLocalCharacters).mockReturnValue([
      local(character('c1', 'Visible', {
        original: 'Original title',
        image: { url: 'https://example.invalid/visible.jpg', sexual: 0 },
        blood_type: 'a',
        age: 18,
        height: 160,
        sex: ['f', null],
        vns: [{ id: 'v1', role: 'main', spoiler: 0 }],
      }), ['ja']),
      local(character('c2', 'Hidden', {
        image: { url: 'https://example.invalid/hidden.jpg', sexual: 2 },
      })),
    ]);

    let html = renderToStaticMarkup(await CharactersPage({
      searchParams: Promise.resolve({ q: 'heroine' }),
    }));
    expect(html).toContain('Visible');
    expect(html).not.toContain('Hidden');
    expect(html).toContain('Original title');
    expect(html).toContain(dictionaries.en.charactersSearch.sex.f);
    expect(html).toContain(dictionaries.en.charactersSearch.ageSuffix.replace('{n}', '18'));
    expect(html).toContain(dictionaries.en.charactersSearch.heightSuffix.replace('{n}', '160'));
    expect(html).toContain(dictionaries.en.charactersSearch.vnCountSingular.replace('{n}', '1'));

    html = renderToStaticMarkup(await CharactersPage({
      searchParams: Promise.resolve({ q: 'heroine', ero: '1' }),
    }));
    expect(html).toContain('Hidden');
    expect(html).toContain(dictionaries.en.charactersSearch.vnCount.replace('{n}', '0'));

    vi.mocked(searchLocalCharacters).mockReturnValue([]);
    html = renderToStaticMarkup(await CharactersPage({
      searchParams: Promise.resolve({ sex: 'f' }),
    }));
    expect(html).toContain(dictionaries.en.charactersSearch.empty);
    expect(html).toContain('href="/characters?sex=f&amp;tab=vndb"');
  });

  it('deduplicates combined rows in favor of an imaged VNDB result and handles VNDB rejection', async () => {
    vi.mocked(searchLocalCharacters).mockReturnValue([
      local(character('c1', 'Local duplicate')),
    ]);
    vi.mocked(searchCharacters).mockResolvedValue([
      character('c1', 'Remote with image', { image: { url: 'https://example.invalid/remote.jpg' } }),
    ]);

    let html = renderToStaticMarkup(await CharactersPage({
      searchParams: Promise.resolve({ tab: 'combined', q: 'duplicate' }),
    }));
    expect(html).toContain('Remote with image');
    expect(html).not.toContain('Local duplicate');
    expect(html).toContain('src="https://example.invalid/remote.jpg"');

    vi.mocked(searchLocalCharacters).mockReturnValue([]);
    vi.mocked(searchCharacters).mockRejectedValue(new Error('offline'));
    html = renderToStaticMarkup(await CharactersPage({
      searchParams: Promise.resolve({ tab: 'vndb', q: 'missing' }),
    }));
    expect(html).toContain(dictionaries.en.charactersSearch.idleHint);
  });

  it('forwards numeric VNDB filters and renders grouped results with preserved filter form values', async () => {
    vi.mocked(searchCharacters).mockResolvedValue([
      character('c1', 'Filtered', {
        image: { url: 'https://example.invalid/filtered.jpg' },
        blood_type: 'a',
        age: 20,
        height: 165,
        bust: 80,
        waist: 55,
        hips: 82,
        birthday: [3, 10],
        sex: ['f', null],
        vns: [{ id: 'v1', role: 'main', spoiler: 0 }],
      }),
    ]);

    const html = renderToStaticMarkup(await CharactersPage({
      searchParams: Promise.resolve({
        tab: 'vndb',
        q: 'filtered',
        role: 'main',
        sex: 'f',
        bloodType: 'A',
        birthMonth: '3',
        ageMin: '18',
        ageMax: '30',
        heightMin: '150',
        heightMax: '180',
        bustMin: '70',
        bustMax: '90',
        waistMin: '50',
        waistMax: '60',
        hipsMin: '75',
        hipsMax: '90',
        sort: 'height',
        reverse: '1',
        groupBy: 'blood',
      }),
    }));

    expect(searchCharacters).toHaveBeenCalledWith('filtered', {
      results: 60,
      ageMin: 18,
      ageMax: 30,
      heightMin: 150,
      heightMax: 180,
      bustMin: 70,
      bustMax: 90,
      waistMin: 50,
      waistMax: 60,
      hipsMin: 75,
      hipsMax: 90,
      blood: 'a',
      sex: 'f',
      role: 'main',
    });
    expect(html).toContain('Filtered');
    expect(html).toContain('>a</h2>');
    expect(html).toContain('name="sort" value="height"');
    expect(html).toContain('name="reverse" value="1"');
    expect(html).toContain('name="groupBy" value="blood"');
    expect(html).toContain('name="ageMin" value="18"');
  });

  it('paginates capped local browsing and preserves array-valued query parameters', async () => {
    vi.mocked(searchLocalCharacters).mockReturnValue(
      Array.from({ length: 200 }, (_, index) => local(character(`c${index + 1}`, `Character ${index + 1}`, {
        sex: [index % 2 === 0 ? 'f' : 'm', null],
      }))),
    );

    const html = renderToStaticMarkup(await CharactersPage({
      searchParams: Promise.resolve({ q: ['character', 'alias'], page: '2', groupBy: 'sex' }),
    }));

    expect(html).toContain(dictionaries.en.charactersSearch.localLimitNotice);
    expect(html).toContain(dictionaries.en.charactersSearch.pageLabel.replace('{current}', '2').replace('{total}', '4'));
    expect(html).toContain('href="/characters?q=character&amp;q=alias&amp;groupBy=sex"');
    expect(html).toContain('href="/characters?q=character&amp;q=alias&amp;groupBy=sex&amp;page=3"');
  });
});
