import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SeiyuuPage, { generateMetadata } from '@/app/seiyuu/page';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { VoiceActorBrowseResult } from '@/lib/db/repositories/voice-actors';

const mocks = vi.hoisted(() => ({
  browse: vi.fn(),
}));

vi.mock('@/lib/db/repositories/voice-actors', () => ({
  getVoiceActorRepository: () => ({ browse: mocks.browse }),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-density={scope} />,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => (
    <div data-density-scope={scope}>{children}</div>
  ),
}));

vi.mock('@/components/NavTabStrip', () => ({
  NavTabStrip: ({ tabs, ariaLabel }: {
    tabs: Array<{ href: string; label: string; isActive: boolean }>;
    ariaLabel: string;
  }) => <nav aria-label={ariaLabel}>{JSON.stringify(tabs)}</nav>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, localSrc, alt }: { src: string | null; localSrc: string | null; alt: string }) => (
    <div data-safe-image={`${src ?? ''}|${localSrc ?? ''}`}>{alt}</div>
  ),
}));

function result(overrides: Partial<VoiceActorBrowseResult> = {}): VoiceActorBrowseResult {
  return {
    rows: [],
    total: 0,
    page: 1,
    pageSize: 48,
    stats: {
      actorCount: 3285,
      vnCount: 2157,
      characterCount: 16312,
      creditCount: 21341,
      collectionActorCount: 220,
      collectionVnCount: 340,
    },
    languages: [
      { language: 'ja', actorCount: 3147 },
      { language: 'en', actorCount: 93 },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.browse.mockResolvedValue(result());
});

describe('dedicated seiyuu page', () => {
  it('provides localized metadata and the default empty browser', async () => {
    expect(await generateMetadata()).toEqual({ title: dictionaries.en.seiyuuBrowse.pageTitle });
    const html = renderToStaticMarkup(await SeiyuuPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain(dictionaries.en.seiyuuBrowse.pageTitle);
    expect(html).toContain(dictionaries.en.seiyuuBrowse.empty);
    expect(html).toContain('data-density-scope="staffWorks"');
    expect(html).toContain('data-density="staffWorks"');
    expect(html).toContain('3,285');
    expect(html).toContain('16,312');
    expect(html).toContain('21,341');
    expect(html).toContain('340');
    expect(html).toContain('Japanese (3,147)');
    expect(html).not.toContain('aria-label="Clear filters"');
    expect(mocks.browse).toHaveBeenCalledWith(expect.objectContaining({
      query: '',
      scope: 'all',
      sort: 'vns',
      direction: 'desc',
      page: 1,
    }));
  });

  it('renders ranked local data, aliases, roles, progress, filters, and middle-page links', async () => {
    mocks.browse.mockResolvedValue(result({
      total: 97,
      page: 2,
      rows: [
        {
          id: 's990101',
          name: 'Primary Voice',
          original: 'Primary Original',
          language: 'ja',
          vnCount: 20,
          collectionVnCount: 5,
          characterCount: 12,
          creditCount: 24,
          aliasCount: 2,
          firstYear: 2001,
          lastYear: 2024,
          aliases: ['Alias One'],
          characters: [{
            id: 'c990101',
            name: 'Representative role',
            original: 'Role original',
            imageUrl: 'https://example.test/role.jpg',
            localImage: 'role.webp',
            vnCount: 3,
          }],
        },
        {
          id: 's990102',
          name: 'Same-year Voice',
          original: 'Same-year Voice',
          language: null,
          vnCount: 1,
          collectionVnCount: 0,
          characterCount: 1,
          creditCount: 1,
          aliasCount: 1,
          firstYear: 2018,
          lastYear: 2018,
          aliases: [],
          characters: [],
        },
        {
          id: 's990103',
          name: 'Unknown-year Voice',
          original: null,
          language: 'en',
          vnCount: 0,
          collectionVnCount: 0,
          characterCount: 0,
          creditCount: 0,
          aliasCount: 0,
          firstYear: null,
          lastYear: null,
          aliases: [],
          characters: [],
        },
      ],
    }));

    const html = renderToStaticMarkup(await SeiyuuPage({
      searchParams: Promise.resolve({
        q: ' Voice ',
        lang: 'ja',
        scope: 'collection',
        sort: 'characters',
        direction: 'asc',
        minimum: '10',
        page: '2',
      }),
    }));

    expect(html).toContain('Primary Voice');
    expect(html).toContain('Primary Original');
    expect(html).toContain('Alias One');
    expect(html).toContain('Representative role');
    expect(html).toContain('data-safe-image="https://example.test/role.jpg|role.webp"');
    expect(html).toContain('2001 - 2024');
    expect(html).toContain('2018');
    expect(html).toContain(dictionaries.en.seiyuuBrowse.unknownYear);
    expect(html).toContain('aria-valuemax="20"');
    expect(html).toContain('aria-valuenow="5"');
    expect(html).toContain('style="width:25%"');
    expect(html).toContain('aria-label="Reset"');
    expect(html).toContain('href="/seiyuu?q=Voice&amp;lang=ja&amp;scope=collection&amp;sort=characters&amp;direction=asc&amp;minimum=10"');
    expect(html).toContain('page=3');
    expect(html).toContain('href="/staff/s990101"');
    expect(html).toContain('href="/character/c990101"');
    expect(html).not.toContain('>Same-year Voice</p>');
  });

  it('renders disabled pagination boundaries on the first and last pages', async () => {
    mocks.browse.mockResolvedValue(result({
      total: 96,
      page: 1,
      rows: [{
        id: 's990104', name: 'Boundary Voice', original: null, language: null,
        vnCount: 1, collectionVnCount: 0, characterCount: 1, creditCount: 1,
        aliasCount: 1, firstYear: 2020, lastYear: 2021, aliases: [], characters: [],
      }],
    }));
    let html = renderToStaticMarkup(await SeiyuuPage({ searchParams: Promise.resolve({}) }));
    expect(html).toContain('href="/seiyuu?page=2"');
    expect(html.match(/aria-hidden="true"/g)?.length).toBeGreaterThan(0);

    mocks.browse.mockResolvedValue(result({
      total: 49,
      page: 2,
      rows: [{
        id: 's990105', name: 'Last Voice', original: null, language: null,
        vnCount: 1, collectionVnCount: 0, characterCount: 1, creditCount: 1,
        aliasCount: 1, firstYear: 2020, lastYear: 2021, aliases: [], characters: [],
      }],
    }));
    html = renderToStaticMarkup(await SeiyuuPage({ searchParams: Promise.resolve({ page: '2' }) }));
    expect(html).toContain('href="/seiyuu"');
    expect(html).not.toContain('page=3');
  });
});
