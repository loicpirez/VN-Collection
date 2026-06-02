import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StaffPage, { generateMetadata as generateStaffMetadata } from '@/app/staff/[id]/page';
import {
  findStaffSiblings,
  getAppSetting,
  getStaffProfileFromCredits,
  listStaffProductionCredits,
  listStaffVaCredits,
  type StaffProfile,
  type StaffSibling,
  type StaffVaCredit,
  type StaffWorkCredit,
} from '@/lib/db';
import { readStaffFullCache, type StaffFullPayload } from '@/lib/staff-full';
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
  findStaffSiblings: vi.fn(),
  getAppSetting: vi.fn(),
  getStaffProfileFromCredits: vi.fn(),
  listStaffProductionCredits: vi.fn(),
  listStaffVaCredits: vi.fn(),
}));

vi.mock('@/lib/staff-full', () => ({
  readStaffFullCache: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => (await import('@/lib/i18n/dictionaries')).dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
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
  SafeImage: ({ alt, localSrc, src }: { alt: string; localSrc?: string | null; src?: string | null }) => (
    <img alt={alt} src={localSrc ?? src ?? undefined} />
  ),
}));

vi.mock('@/components/StaffDownloadButton', () => ({
  StaffDownloadButton: ({ sid }: { sid: string }) => <button type="button">download:{sid}</button>,
}));

vi.mock('@/components/StaffExtraCredits', () => ({
  StaffExtraCredits: ({ knownProdVnIds, knownVaVnIds, sid }: { knownProdVnIds: Set<string>; knownVaVnIds: Set<string>; sid: string }) => (
    <div data-testid="extra-credits">{sid}:{knownProdVnIds.size}:{knownVaVnIds.size}</div>
  ),
  StaffExtraCreditsSkeleton: () => <div data-testid="extra-skeleton" />,
}));

vi.mock('@/components/VaTimeline', () => ({
  VaTimeline: ({ sid }: { sid: string }) => <div data-testid="timeline">{sid}</div>,
}));

vi.mock('@/components/VndbMarkup', () => ({
  VndbMarkup: ({ text }: { text: string }) => <div data-testid="markup">{text}</div>,
}));

function profile(overrides: Partial<StaffProfile> = {}): StaffProfile {
  return {
    sid: 's1',
    name: 'Staff member',
    original: null,
    lang: null,
    ...overrides,
  };
}

function vn(
  id: string,
  overrides: Partial<StaffWorkCredit['vn']> = {},
): StaffWorkCredit['vn'] {
  return {
    id,
    title: `Visual novel ${id}`,
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    local_image: null,
    local_image_thumb: null,
    released: null,
    rating: null,
    in_collection: false,
    ...overrides,
  };
}

function work(
  id: string,
  roles: StaffWorkCredit['roles'] = [{ role: 'scenario', eid: null, note: null, credited_as: 'Staff member' }],
  overrides: Partial<StaffWorkCredit['vn']> = {},
): StaffWorkCredit {
  return { vn: vn(id, overrides), roles };
}

function voice(
  id: string,
  overrides: Partial<StaffVaCredit['vn']> = {},
): StaffVaCredit {
  return {
    vn: vn(id, overrides),
    characters: [{
      id: 'c1',
      name: 'Character',
      original: null,
      image_url: null,
      local_image: null,
      credited_as: 'Staff member',
      note: null,
    }],
  };
}

function fullProfile(overrides: Partial<NonNullable<StaffFullPayload['profile']>> = {}): StaffFullPayload {
  return {
    profile: {
      id: 's1',
      aid: 1,
      ismain: true,
      name: 'Staff member',
      original: null,
      lang: null,
      gender: null,
      description: null,
      aliases: [],
      extlinks: [],
      ...overrides,
    },
    productionCredits: [],
    vaCredits: [],
    fetched_at: 1,
  };
}

beforeEach(() => {
  navigationMocks.notFound.mockClear();
  vi.mocked(findStaffSiblings).mockReset().mockReturnValue([]);
  vi.mocked(getAppSetting).mockReset().mockReturnValue(null);
  vi.mocked(getStaffProfileFromCredits).mockReset().mockReturnValue(null);
  vi.mocked(listStaffProductionCredits).mockReset().mockReturnValue([]);
  vi.mocked(listStaffVaCredits).mockReset().mockReturnValue([]);
  vi.mocked(readStaffFullCache).mockReset().mockReturnValue(null);
});

describe('staff detail page runtime', () => {
  it('renders metadata from a local profile or an empty object', async () => {
    expect(await generateStaffMetadata({ params: Promise.resolve({ id: 's1' }) })).toEqual({});

    vi.mocked(getStaffProfileFromCredits).mockReturnValueOnce(profile());
    expect(await generateStaffMetadata({ params: Promise.resolve({ id: 's1' }) })).toEqual({ title: 'Staff member' });
  });

  it('rejects malformed and unknown staff ids', async () => {
    await expect(StaffPage({ params: Promise.resolve({ id: 'bad' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found');
    await expect(StaffPage({ params: Promise.resolve({ id: 's404' }), searchParams: Promise.resolve({}) })).rejects.toThrow('not-found');
  });

  it('renders the empty-credit notice when a known profile has no works', async () => {
    vi.mocked(getStaffProfileFromCredits).mockReturnValue(profile());

    const html = renderToStaticMarkup(await StaffPage({
      params: Promise.resolve({ id: 's1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('Staff member');
    expect(html).toContain('No credit.');
    expect(html).not.toContain('data-testid="detail-layout"');
  });

  it('renders rich cached profile metadata, grouped credits, voice cards, siblings, and synthetic VNs', async () => {
    const siblings: StaffSibling[] = [{
      sid: 's2',
      name: 'Sibling',
      original: 'Original sibling',
      vns: [
        { vn_id: 'v1', vn_title: 'First work' },
        { vn_id: 'v2', vn_title: 'Second work' },
      ],
    }];
    vi.mocked(getStaffProfileFromCredits).mockReturnValue(profile({ original: 'Original name', lang: 'ja' }));
    vi.mocked(findStaffSiblings).mockReturnValue(siblings);
    vi.mocked(listStaffProductionCredits).mockReturnValue([
      work('v1', [
        { role: 'scenario', eid: 1, note: 'Lead', credited_as: 'Staff member' },
        { role: 'unexpected', eid: null, note: null, credited_as: 'Staff member' },
      ], {
        alttitle: 'Alternative title',
        image_thumb: 'https://example.test/thumb.jpg',
        local_image_thumb: '/local/thumb.jpg',
        released: '2020-01-01',
        rating: 85,
        in_collection: true,
      }),
      work('egs_2', [{ role: 'art', eid: null, note: null, credited_as: 'Staff member' }]),
      work('v1'),
    ]);
    vi.mocked(listStaffVaCredits).mockReturnValue([
      {
        ...voice('v2', { image_url: 'https://example.test/voice.jpg', in_collection: true }),
        characters: [{
          id: 'c1',
          name: 'Character',
          original: 'Original character',
          image_url: 'https://example.test/character.jpg',
          local_image: '/local/character.jpg',
          credited_as: 'Staff member',
          note: 'Voice note',
        }],
      },
    ]);
    vi.mocked(readStaffFullCache).mockReturnValue(fullProfile({
      gender: 'f',
      description: 'Description',
      aliases: [
        { aid: 1, name: 'Staff member', latin: null, ismain: true },
        { aid: 2, name: 'Alias', latin: 'Latin alias', ismain: false },
      ],
      extlinks: [
        { url: 'https://example.test/staff', label: 'Website', name: 'website' },
        { url: 'javascript:alert(1)', label: 'Unsafe', name: 'unsafe' },
      ],
    }));

    const html = renderToStaticMarkup(await StaffPage({
      params: Promise.resolve({ id: 's1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('Original name');
    expect(html).toContain('Japanese');
    expect(html).toContain('Alias');
    expect(html).toContain('Latin alias');
    expect(html).toContain('Description');
    expect(html).toContain('href="https://example.test/staff"');
    expect(html).not.toContain('Unsafe');
    expect(html).toContain('Sibling');
    expect(html).toContain('Original sibling');
    expect(html).toContain('Second work');
    expect(html).toContain('data-section="timeline"');
    expect(html).toContain('data-section="siblings"');
    expect(html).toContain('data-section="voice-credits"');
    expect(html).toContain('data-section="production-credits"');
    expect(html).toContain('data-section="extra-credits"');
    expect(html).toContain('Alternative title');
    expect(html).toContain('/local/thumb.jpg');
    expect(html).toContain('/local/character.jpg');
    expect(html).toContain('Original character');
    expect(html).toContain('Voice note');
    expect(html).toContain('8.5');
    expect(html).toContain('href="/?yearMin=2020&amp;yearMax=2020"');
    expect(html).toContain('href="https://vndb.org/v1"');
    expect(html).not.toContain('href="https://vndb.org/egs_2"');
    expect(html).toContain('data-testid="extra-credits">s1:2:1');
  });

  it('filters collection scope while retaining all-credit toggle counters', async () => {
    vi.mocked(getStaffProfileFromCredits).mockReturnValue(profile());
    vi.mocked(listStaffProductionCredits).mockReturnValue([
      work('v1', undefined, { in_collection: true }),
      work('v2'),
    ]);
    vi.mocked(listStaffVaCredits).mockReturnValue([
      voice('v1', { in_collection: true }),
      voice('v3'),
    ]);

    const html = renderToStaticMarkup(await StaffPage({
      params: Promise.resolve({ id: 's1' }),
      searchParams: Promise.resolve({ scope: 'collection' }),
    }));

    expect(html).toContain('All credits (3)');
    expect(html).toContain('In the collection (1)');
    expect(html).toContain('data-testid="extra-credits">s1:1:1');
    expect(html).not.toContain('Visual novel v2');
    expect(html).not.toContain('Visual novel v3');
  });

  it('uses the id heading when credits exist without a reconstructed profile and renders raw gender fallbacks', async () => {
    vi.mocked(listStaffProductionCredits).mockReturnValue([work('v1')]);
    vi.mocked(readStaffFullCache).mockReturnValue(fullProfile({ gender: 'x' }));

    const html = renderToStaticMarkup(await StaffPage({
      params: Promise.resolve({ id: 's1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('>s1</h1>');
    expect(html).toContain('Gender: x');
  });

  it('renders the male gender label', async () => {
    vi.mocked(getStaffProfileFromCredits).mockReturnValue(profile());
    vi.mocked(listStaffProductionCredits).mockReturnValue([work('v1')]);
    vi.mocked(readStaffFullCache).mockReturnValue(fullProfile({ gender: 'm' }));

    const html = renderToStaticMarkup(await StaffPage({
      params: Promise.resolve({ id: 's1' }),
      searchParams: Promise.resolve({}),
    }));

    expect(html).toContain('Gender: M');
  });
});
