import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { generateMetadata as generateRootMetadata, viewport } from '@/app/layout';
import HomePage, { generateMetadata as generateHomeMetadata } from '@/app/page';
import { getAppSetting } from '@/lib/db';
import { dictionaries } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({
  cookieValue: undefined as string | undefined,
  sanitize: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    get: vi.fn(() => mocks.cookieValue === undefined ? undefined : { value: mocks.cookieValue }),
  })),
}));

vi.mock('@/lib/i18n/server', () => ({
  getDict: vi.fn(async () => dictionaries.en),
  getLocale: vi.fn(async () => 'en'),
}));

vi.mock('@/lib/settings/client', () => ({
  CARD_DENSITY_MAX: 480,
  CARD_DENSITY_MIN: 120,
  DisplaySettingsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sanitizeDisplaySettings: mocks.sanitize,
}));

vi.mock('@/lib/db', () => ({
  getAppSetting: vi.fn(),
}));

vi.mock('@/components/CardDensityVarSetter', () => ({ CardDensityVarSetter: () => <span data-testid="density" /> }));
vi.mock('@/components/ConfirmDialog', () => ({ ConfirmProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/DownloadStatusBar', () => ({ DownloadStatusBar: () => <span data-testid="downloads" /> }));
vi.mock('@/components/HeaderHeightVar', () => ({ HeaderHeightVar: () => <span data-testid="header-height" /> }));
vi.mock('@/components/KeyboardShortcuts', () => ({ KeyboardShortcuts: () => <span data-testid="shortcuts" /> }));
vi.mock('@/components/LanguageSwitcher', () => ({ LanguageSwitcher: () => <span data-testid="language" /> }));
vi.mock('@/components/MoreNavMenu', () => ({
  GroupedNav: () => <span data-testid="grouped-nav" />,
}));
vi.mock('@/components/PageSpaceFrame', () => ({
  HeaderSpaceFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PageSpaceFrame: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/QuoteFooter', () => ({ QuoteFooter: () => <span data-testid="quote-footer" /> }));
vi.mock('@/components/SettingsButton', () => ({ SettingsButton: () => <span data-testid="settings" /> }));
vi.mock('@/components/SpoilerToggle', () => ({ SpoilerToggle: () => <span data-testid="spoiler" /> }));
vi.mock('@/components/ToastProvider', () => ({ ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock('@/components/TutorialTour', () => ({ TutorialTour: () => <span data-testid="tour" /> }));

vi.mock('@/components/RecentlyViewedStrip', () => ({ RecentlyViewedStrip: () => <div>recent</div> }));
vi.mock('@/components/ReadingQueueStrip', () => ({ ReadingQueueStrip: () => <div>queue</div> }));
vi.mock('@/components/AnniversaryFeed', () => ({ AnniversaryFeed: () => <div>anniversary</div> }));
vi.mock('@/components/HomeLibrarySection', () => ({
  HomeLibraryControlsSection: () => <div>controls</div>,
  HomeLibraryGridSection: () => <div>grid</div>,
}));
vi.mock('@/components/HomeLayoutEditorTrigger', () => ({ HomeLayoutEditorTrigger: () => <div>editor</div> }));

beforeEach(() => {
  mocks.cookieValue = undefined;
  mocks.sanitize.mockReset().mockReturnValue({});
  vi.mocked(getAppSetting).mockReset().mockReturnValue(null);
});

describe('root layout composition', () => {
  it('renders metadata, viewport, providers, and the default density seed', async () => {
    expect(await generateRootMetadata()).toEqual({
      title: { template: '%s / VN Collection', default: 'VN Collection' },
      description: dictionaries.en.app.tagline,
    });
    expect(viewport).toEqual({ width: 'device-width', initialScale: 1, themeColor: '#0b1220' });
    const html = renderToStaticMarkup(await RootLayout({ children: <span>Body</span> }));
    expect(html).toContain('lang="en"');
    expect(html).toContain('--card-density-px:220px');
    expect(html).toContain('href="#main-content"');
    expect(html).toContain('data-testid="grouped-nav"');
    expect(html).toContain('Body');
  });

  it('uses sanitized settings and clamps density', async () => {
    mocks.cookieValue = encodeURIComponent(JSON.stringify({ cardDensityPx: 999 }));
    mocks.sanitize.mockReturnValue({ cardDensityPx: 999 });
    let html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html).toContain('--card-density-px:480px');

    mocks.sanitize.mockReturnValue({ cardDensityPx: 0 });
    html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html).toContain('--card-density-px:120px');
  });

  it('falls back to default density for malformed cookies and non-numeric settings', async () => {
    mocks.cookieValue = '%E0%A4%A';
    let html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html).toContain('--card-density-px:220px');
    mocks.cookieValue = encodeURIComponent('{}');
    mocks.sanitize.mockReturnValue({ cardDensityPx: Number.NaN });
    html = renderToStaticMarkup(await RootLayout({ children: null }));
    expect(html).toContain('--card-density-px:220px');
  });
});

describe('home page composition', () => {
  it('renders localized metadata and the persisted section order', async () => {
    vi.mocked(getAppSetting).mockReturnValue(JSON.stringify({
      sections: {},
      order: ['library-grid', 'recently-viewed', 'reading-queue', 'anniversary', 'library-controls'],
    }));
    expect(await generateHomeMetadata()).toEqual({ title: dictionaries.en.nav.library });
    const html = renderToStaticMarkup(await HomePage());
    expect(html.indexOf('grid')).toBeLessThan(html.indexOf('recent'));
    expect(html).toContain(dictionaries.en.nav.library);
  });

  it('falls back to the default layout when the setting read throws', async () => {
    vi.mocked(getAppSetting).mockImplementation(() => {
      throw new Error('storage unavailable');
    });
    const html = renderToStaticMarkup(await HomePage());
    expect(html.indexOf('recent')).toBeLessThan(html.indexOf('queue'));
    expect(html.indexOf('queue')).toBeLessThan(html.indexOf('anniversary'));
  });
});
