import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StaffSearchPage, { generateMetadata } from '@/app/staff/page';
import { searchLocalStaff } from '@/lib/db';
import { searchStaff, type VndbStaff } from '@/lib/vndb';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('@/lib/db', () => ({
  searchLocalStaff: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  searchStaff: vi.fn(),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/components/CardDensitySlider', () => ({
  CardDensitySlider: ({ scope }: { scope: string }) => <div data-testid="density">{scope}</div>,
}));

vi.mock('@/components/DensityScopeProvider', () => ({
  DensityScopeProvider: ({ children, scope }: { children: React.ReactNode; scope: string }) => (
    <div data-testid="density-scope" data-scope={scope}>{children}</div>
  ),
}));

vi.mock('@/components/NavTabStrip', () => ({
  NavTabStrip: ({ tabs }: { tabs: Array<{ href: string; label: string; isActive: boolean }> }) => (
    <nav data-testid="nav-tabs">{JSON.stringify(tabs)}</nav>
  ),
}));

function localStaff(id: string, name: string, overrides: Partial<ReturnType<typeof searchLocalStaff>[number]> = {}) {
  return {
    id,
    name,
    original: null,
    lang: null,
    roles: [],
    vn_count: 0,
    ...overrides,
  };
}

function remoteStaff(id: string, name: string, overrides: Partial<VndbStaff> = {}): VndbStaff {
  return {
    id,
    aid: 1,
    ismain: true,
    name,
    original: null,
    lang: null,
    gender: null,
    description: null,
    aliases: [],
    extlinks: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(searchLocalStaff).mockReset().mockReturnValue([]);
  vi.mocked(searchStaff).mockReset().mockResolvedValue([]);
});

describe('staff search page runtime', () => {
  it('renders localized metadata and the idle local-tab state', async () => {
    expect(await generateMetadata({ searchParams: Promise.resolve({}) })).toEqual({
      title: dictionaries.en.staffSearch.pageTitle,
    });
    expect(await generateMetadata({ searchParams: Promise.resolve({ q: ['Writer', 'ignored'] }) })).toEqual({
      title: `Writer - ${dictionaries.en.staffSearch.pageTitle}`,
    });

    const html = renderToStaticMarkup(await StaffSearchPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain(dictionaries.en.staffSearch.idleHint);
    expect(searchLocalStaff).toHaveBeenCalledWith({ q: undefined, role: null, lang: null, limit: 200 });
    expect(searchStaff).not.toHaveBeenCalled();
  });

  it('renders collection-scope empty state without calling VNDB', async () => {
    const html = renderToStaticMarkup(await StaffSearchPage({
      searchParams: Promise.resolve({ scope: 'collection', role: 'translator', lang: 'ja' }),
    }));

    expect(html).toContain(dictionaries.en.staffSearch.empty);
    expect(html).toContain('name="scope" value="collection"');
    expect(html).toContain('name="role" value="translator"');
    expect(html).toContain('name="lang" value="ja"');
    expect(searchStaff).not.toHaveBeenCalled();
  });

  it('merges VNDB with local rows, keeps local precedence, filters languages, and renders card metadata', async () => {
    vi.mocked(searchLocalStaff).mockReturnValue([
      localStaff('s1', 'Local winner', {
        original: 'Original local',
        lang: 'ja',
        roles: ['scenario', 'unknown-role', 'music'],
        vn_count: 4,
      }),
      localStaff('s4', 'Null language', { lang: null, vn_count: 1 }),
    ]);
    vi.mocked(searchStaff).mockResolvedValue([
      remoteStaff('s1', 'Remote duplicate', { lang: 'ja' }),
      remoteStaff('s2', 'Alias voice', {
        original: 'Original remote',
        lang: 'ja',
        gender: 'f',
        ismain: false,
        aliases: [
          { aid: 1, name: 'Alias one', latin: null, ismain: false },
          { aid: 2, name: 'Alias two', latin: null, ismain: false },
        ],
      }),
      remoteStaff('s3', 'Filtered English', { lang: 'en', gender: 'm' }),
    ]);

    const html = renderToStaticMarkup(await StaffSearchPage({
      searchParams: Promise.resolve({
        q: ' voice ',
        tab: 'vndb',
        role: 'scenario',
        lang: 'ja',
        vn: 'V90001',
        aliases: '1',
        sort: 'vn_count',
        reverse: '1',
      }),
    }));

    expect(searchStaff).toHaveBeenCalledWith('voice', {
      results: 60,
      mainOnly: false,
      role: 'scenario',
      lang: 'ja',
      vn: 'v90001',
    });
    expect(html).toContain('Local winner');
    expect(html).not.toContain('Remote duplicate');
    expect(html).toContain('Alias voice');
    expect(html).not.toContain('Filtered English');
    expect(html).toContain('Null language');
    expect(html).toContain('Original local');
    expect(html).toContain(dictionaries.en.staffSearch.aliasChip);
    expect(html).toContain(`${dictionaries.en.common.aka} Alias one / Alias two`);
    expect(html).toContain(dictionaries.en.staff.genderF);
    expect(html).toContain(dictionaries.en.staffSearch.localVnCount.replace('{n}', '4'));
    expect(html).toContain(dictionaries.en.staff.role_scenario);
    expect(html).toContain('unknown-role');
    expect(html).toContain('&amp;reverse=1');
    expect(html.indexOf('Alias voice')).toBeLessThan(html.indexOf('Local winner'));
  });

  it('maps male and raw gender values, name sorting, and VNDB search rejection', async () => {
    vi.mocked(searchStaff).mockResolvedValueOnce([
      remoteStaff('s2', 'Zulu', { gender: 'x' }),
      remoteStaff('s1', 'Alpha', { gender: 'm' }),
    ]);

    let html = renderToStaticMarkup(await StaffSearchPage({
      searchParams: Promise.resolve({ q: 'actor', tab: 'vndb' }),
    }));

    expect(html.indexOf('Alpha')).toBeLessThan(html.indexOf('Zulu'));
    expect(html).toContain(dictionaries.en.staff.genderM);
    expect(html).toContain('>x</span>');

    vi.mocked(searchStaff).mockRejectedValueOnce(new Error('offline'));
    html = renderToStaticMarkup(await StaffSearchPage({
      searchParams: Promise.resolve({ q: 'missing', tab: 'vndb' }),
    }));
    expect(html).toContain(dictionaries.en.staffSearch.empty);
  });
});
