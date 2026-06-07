import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CharacterPage from '@/app/character/[id]/page';
import {
  findCharacterSiblings,
  getAppSetting,
  getVasForCharacter,
  isInCollectionMany,
  type CharacterSibling,
  type CharacterVoiceCredit,
} from '@/lib/db';
import { getCharacter, type VndbCharacter } from '@/lib/vndb';
import { readScrapedCharacterInfo, type ScrapedCharacterInfo } from '@/lib/scrape-character-instances';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { DetailSection } from '@/components/DetailReorderLayout';

const navigationMocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: navigationMocks.notFound,
}));

vi.mock('@/lib/db', () => ({
  findCharacterSiblings: vi.fn(),
  getAppSetting: vi.fn(),
  getVasForCharacter: vi.fn(),
  isInCollectionMany: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  getCharacter: vi.fn(),
}));

vi.mock('@/lib/scrape-character-instances', () => ({
  readScrapedCharacterInfo: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/CharacterMetaClient', () => ({
  CharacterMetaClient: ({ char }: { char: VndbCharacter }) => <div data-testid="character-meta">{char.id}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => <div data-scope={scope}>{children}</div>,
}));

vi.mock('@/components/DetailReorderLayout', () => ({
  DetailReorderLayout: ({ sections }: { sections: DetailSection[] }) => (
    <div data-testid="detail-layout">
      {sections.map((section) => <section key={section.id} data-section={section.id}>{section.node}</section>)}
    </div>
  ),
}));

vi.mock('@/components/PaginatedGrid', () => ({
  PaginatedGrid: ({ children, resetKey }: { children: React.ReactNode; resetKey: string }) => <ul data-reset-key={resetKey}>{children}</ul>,
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, localSrc, alt }: { src: string | null; localSrc?: string | null; alt: string }) => (
    <div data-testid="safe-image">{src ?? 'none'}:{localSrc ?? 'none'}:{alt}</div>
  ),
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <div data-testid="markup">{text}</div>,
}));

function character(overrides: Partial<VndbCharacter> = {}): VndbCharacter {
  return {
    id: 'c1',
    name: 'Character',
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

const sibling: CharacterSibling = {
  c_id: 'c2',
  c_name: 'Sibling',
  c_original: 'Sibling original',
  c_image_url: 'sibling.jpg',
  vns: [{ vn_id: 'v2', vn_title: 'Sibling VN' }],
};

const voiceCredit: CharacterVoiceCredit = {
  sid: 's1',
  va_name: 'Voice actor',
  va_original: 'Voice original',
  va_lang: 'ja',
  vns: [{ id: 'v1', title: 'VN One', released: '2026-01-01', in_collection: true }],
};

const scraped: ScrapedCharacterInfo = {
  cid: 'c1',
  instances: [{ cid: 'c3', name: 'Instance', vn_id: 'v3', vn_title: 'Instance VN' }],
  voiced_by: [{ sid: 's2', staff_name: 'Scraped voice actor', vn_id: 'v4', vn_title: 'Scraped VN', note: null }],
  fetched_at: 1,
};

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  vi.mocked(findCharacterSiblings).mockReset().mockReturnValue([]);
  vi.mocked(getAppSetting).mockReset().mockReturnValue(null);
  vi.mocked(getVasForCharacter).mockReset().mockReturnValue([]);
  vi.mocked(isInCollectionMany).mockReset().mockReturnValue(new Set());
  vi.mocked(getCharacter).mockReset().mockResolvedValue(character());
  vi.mocked(readScrapedCharacterInfo).mockReset().mockReturnValue(null);
});

describe('character detail page runtime', () => {
  it('rejects malformed, missing, and upstream-failed character ids', async () => {
    await expect(CharacterPage({ params: Promise.resolve({ id: 'bad' }) })).rejects.toThrow('not-found');

    vi.mocked(getCharacter).mockResolvedValueOnce(null);
    await expect(CharacterPage({ params: Promise.resolve({ id: 'c404' }) })).rejects.toThrow('not-found');

    vi.mocked(getCharacter).mockRejectedValueOnce(new Error('offline'));
    await expect(CharacterPage({ params: Promise.resolve({ id: 'c1' }) })).rejects.toThrow('not-found');
  });

  it('renders a minimal character with only the always-present metadata section', async () => {
    const html = renderToStaticMarkup(await CharacterPage({ params: Promise.resolve({ id: 'C1' }) }));

    expect(html).toContain('Character');
    expect(html).toContain('data-section="meta"');
    expect(html).not.toContain('data-section="description"');
    expect(getCharacter).toHaveBeenCalledWith('C1');
  });

  it('renders all optional metadata pivots and detail sections', async () => {
    vi.mocked(getCharacter).mockResolvedValueOnce(character({
      name: 'Character',
      original: 'Original',
      aliases: ['Alias one', 'Alias two'],
      description: 'Description',
      image: { url: 'character.jpg', sexual: 1, violence: 0 },
      blood_type: 'ab',
      height: 160,
      weight: 50,
      bust: 80,
      waist: 55,
      hips: 82,
      cup: 'C',
      age: 18,
      birthday: [5, 6],
      sex: ['b', null],
      gender: ['o', null],
      vns: [
        {
          id: 'v1',
          role: 'side',
          spoiler: 0,
          title: 'VN One',
          alttitle: 'Alt title',
          released: '2026-01-01',
          rating: 85,
          image: { url: 'full.jpg', thumbnail: 'thumb.jpg', sexual: 0, violence: 0 },
        },
        {
          id: 'v1',
          role: 'main',
          spoiler: 0,
          title: 'VN One',
          alttitle: 'Alt title',
          released: '2026-01-01',
          rating: 85,
          image: { url: 'full.jpg', thumbnail: 'thumb.jpg', sexual: 0, violence: 0 },
        },
        { id: 'v2', role: 'appears', spoiler: 0 },
      ],
    }));
    vi.mocked(findCharacterSiblings).mockReturnValue([sibling]);
    vi.mocked(getVasForCharacter).mockReturnValue([voiceCredit]);
    vi.mocked(isInCollectionMany).mockReturnValue(new Set(['v1']));
    vi.mocked(readScrapedCharacterInfo).mockReturnValue(scraped);

    const html = renderToStaticMarkup(await CharacterPage({ params: Promise.resolve({ id: 'c1' }) }));

    expect(html).toContain('character.jpg:none:Character');
    expect(html).toContain('Original');
    expect(html).toContain('Alias one / Alias two');
    expect(html).toContain('href="/characters?bloodType=ab"');
    expect(html).toContain('href="/characters?birthMonth=5"');
    expect(html).toContain('href="/characters?sex=b"');
    expect(html).toContain('data-section="siblings"');
    expect(html).toContain('data-section="description"');
    expect(html).toContain('data-section="instances"');
    expect(html).toContain('data-section="voiced-by-all"');
    expect(html).toContain('data-section="also-voiced-by"');
    expect(html).toContain('data-section="appears-in"');
    expect(html).toContain('Sibling VN');
    expect(html).toContain('Instance VN');
    expect(html).toContain('Scraped voice actor');
    expect(html).toContain('Voice actor');
    expect(html).toContain(dictionaries.en.staff.ownedLabel);
    expect(html).toContain(dictionaries.en.characters.releaseCountChip.replace('{n}', '2'));
    expect(html).toContain('8.5');
    expect(html).toContain('2026');
  });

  it('renders month-only birthdays and alternate mapped labels', async () => {
    vi.mocked(getCharacter).mockResolvedValueOnce(character({
      birthday: [5, 0],
      sex: ['n', null],
      gender: ['a', null],
    }));

    const html = renderToStaticMarkup(await CharacterPage({ params: Promise.resolve({ id: 'c1' }) }));

    expect(html).toContain('May');
    expect(html).toContain(dictionaries.en.common.none);
    expect(html).toContain(dictionaries.en.characters.genderA);
  });

  it('renders raw sex and gender labels, missing birthday, and appearance fallbacks', async () => {
    vi.mocked(getCharacter).mockResolvedValueOnce(character({
      birthday: [0, 0],
      sex: ['x', null],
      gender: ['z', null],
      vns: [{ id: 'v9', role: 'appears', spoiler: 0 }],
    }));

    const html = renderToStaticMarkup(await CharacterPage({ params: Promise.resolve({ id: 'c1' }) }));

    expect(html).toContain('href="/characters?sex=x"');
    expect(html).toContain('>z</dd>');
    expect(html).not.toContain('birthMonth=');
    expect(html).toContain('>v9</span>');
    expect(html).not.toContain('fill-accent');
  });

  it('skips primary sex and gender rows when VNDB leaves them empty', async () => {
    vi.mocked(getCharacter).mockResolvedValueOnce(character({
      sex: [null, 'f'],
      gender: [null, 'm'],
    }));

    const html = renderToStaticMarkup(await CharacterPage({ params: Promise.resolve({ id: 'c1' }) }));

    expect(html).not.toContain(dictionaries.en.characters.sex);
    expect(html).not.toContain(dictionaries.en.characters.gender);
  });
});
