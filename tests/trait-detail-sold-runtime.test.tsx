import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToReadableStream } from 'react-dom/server';
import TraitPage from '@/app/trait/[id]/page';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { I18nProvider } from '@/lib/i18n/client';

const mocks = vi.hoisted(() => ({
  getTrait: vi.fn(),
  getCharactersForTraitInVns: vi.fn(),
  getCharactersForTraitPage: vi.fn(),
  listIds: vi.fn(),
  soldIds: vi.fn(),
  characterImages: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getTrait: mocks.getTrait,
  getCharactersForTraitInVns: mocks.getCharactersForTraitInVns,
  getCharactersForTraitPage: mocks.getCharactersForTraitPage,
}));
vi.mock('@/lib/db/repositories/collection-core', () => ({
  getCollectionCoreRepository: () => ({ listIds: mocks.listIds, soldIds: mocks.soldIds }),
}));
vi.mock('@/lib/db/repositories/people', () => ({
  getPeopleRepository: () => ({ characterImages: mocks.characterImages }),
}));
vi.mock('@/lib/i18n/server', () => ({
  getDict: async () => dictionaries.en,
  getLocale: async () => 'en',
}));
vi.mock('@/components/SafeImage', () => ({ SafeImage: () => null }));
vi.mock('@/components/CardDensitySlider', () => ({ CardDensitySlider: () => null }));
vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

async function renderPage(searchParams: { scope?: string; mine?: string; page?: string }) {
  const tree = await TraitPage({
    params: Promise.resolve({ id: 'i1' }),
    searchParams: Promise.resolve(searchParams),
  });
  const stream = await renderToReadableStream(<I18nProvider locale="en" dict={dictionaries.en}>{tree}</I18nProvider>);
  await stream.allReady;
  return new Response(stream).text();
}

function character(id: number, vns: { id: string; title: string }[]) {
  return { id: 'c' + id, name: 'Character ' + id, image: null, vns };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTrait.mockResolvedValue({ id: 'i1', name: 'Trait A', char_count: 61, aliases: [] });
  mocks.listIds.mockImplementation((scope?: 'sold') => Promise.resolve(scope === 'sold' ? ['v2'] : ['v1']));
  mocks.soldIds.mockImplementation((ids: string[]) => Promise.resolve(new Set(ids.includes('v2') ? ['v2'] : [])));
  mocks.characterImages.mockResolvedValue(new Map());
  mocks.getCharactersForTraitPage.mockResolvedValue({ results: [], more: false });
});

describe('trait membership scope', () => {
  it('requests archived characters and keeps Sold through pagination', async () => {
    mocks.getCharactersForTraitInVns.mockResolvedValue(Array.from({ length: 61 }, (_, index) =>
      character(index + 1, [{ id: 'v1', title: 'Active game' }, { id: 'v2', title: 'Sold game' }]),
    ));
    const html = await renderPage({ scope: 'sold', page: '2' });
    expect(mocks.getCharactersForTraitInVns).toHaveBeenCalledWith('i1', ['v2']);
    expect(html).toContain('Character 61');
    expect(html).not.toContain('Active game');
    expect(html).toContain('Sold game');
    expect(html).toContain('<span>Sold</span>');
    expect(html).toContain('href="/trait/i1?scope=sold"');
  });

  it('retains the Sold badge on catalog appearances and keeps Owned restricted to active IDs', async () => {
    mocks.getCharactersForTraitPage.mockResolvedValue({
      results: [character(1, [{ id: 'v2', title: 'Sold game' }])], more: false,
    });
    expect(await renderPage({})).toContain('<span>Sold</span>');

    mocks.getCharactersForTraitInVns.mockResolvedValue([
      character(1, [{ id: 'v2', title: 'Sold game' }, { id: 'v1', title: 'Active game' }]),
    ]);
    const owned = await renderPage({ mine: '1' });
    expect(mocks.getCharactersForTraitInVns).toHaveBeenCalledWith('i1', ['v1']);
    expect(owned).toContain('Active game');
    expect(owned).not.toContain('Sold game');
  });
});
