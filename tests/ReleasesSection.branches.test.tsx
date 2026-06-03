// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ReleasesSection } from '@/components/ReleasesSection';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { OWNED_EDITIONS_EVENT } from '@/components/ReleaseOwnedToggle';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function lang(code: string) {
  return { lang: code, title: null, latin: null, mtl: false, main: true };
}

function fullRelease(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r90001',
    title: 'Release Alpha',
    alttitle: 'Release Alpha JP',
    languages: [lang('en'), lang('ja')],
    platforms: ['win', 'ps4'],
    media: [{ medium: 'disc', qty: 2 }, { medium: 'dl', qty: 1 }],
    released: '2026-01-10',
    minage: 18,
    patch: false,
    freeware: false,
    uncensored: true,
    official: true,
    has_ero: true,
    voiced: 4,
    resolution: [1920, 1080],
    engine: 'KiriKiri',
    notes: null,
    gtin: '4900000000001',
    catalog: 'CAT-001',
    producers: [
      { id: 'p90001', developer: true, publisher: false, name: 'Studio X' },
      { id: 'p90002', developer: false, publisher: true, name: 'Publisher Z' },
    ],
    extlinks: [{ url: 'https://example.com/store', label: 'Store', name: 'store' }],
    vns: [{ id: 'v90001', rtype: 'complete' }],
    images: [],
    ...overrides,
  };
}

function releasesResponse(releases: unknown[]) {
  return new Response(JSON.stringify({ releases }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function ownedResponse(rows: unknown[]) {
  return new Response(JSON.stringify({ owned: rows }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function ownedRow(releaseId: string) {
  return {
    vn_id: 'v90001',
    release_id: releaseId,
    notes: null,
    location: 'jp',
    physical_location: [],
    box_type: 'none',
    edition_label: null,
    condition: null,
    price_paid: null,
    currency: null,
    acquired_date: null,
    purchase_place: null,
    owned_platform: null,
    rel_platforms: [],
    dumped: false,
    added_at: 1,
    shelf: null,
    aspect: { width: null, height: null, raw_resolution: null, aspect_key: 'unknown', source: 'unknown', note: null },
  };
}

/**
 * Route the mock per-URL: the releases endpoint returns the release list,
 * the owned-releases endpoint returns the owned set, everything else 200s.
 */
function routedFetch(releases: unknown[], owned: unknown[] = []) {
  return vi.fn((url: RequestInfo | URL, _init?: RequestInit) => {
    if (String(url).includes('/releases')) return Promise.resolve(releasesResponse(releases));
    if (String(url).includes('/owned-releases')) return Promise.resolve(ownedResponse(owned));
    return Promise.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
}

describe('ReleasesSection branches', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows a loading skeleton before the releases resolve', async () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { container } = renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders the empty copy when the release list is empty', async () => {
    global.fetch = routedFetch([]) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(screen.getByText(t.releases.empty)).toBeInTheDocument());
  });

  it('shows an error alert when the releases fetch returns non-ok', async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ error: 'releases boom' }), { status: 500, headers: { 'content-type': 'application/json' } }))) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    await waitFor(() => expect(screen.getByText('releases boom')).toBeInTheDocument());
  });

  it('shows the generic error when the decoder rejects the payload', async () => {
    global.fetch = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ releases: 'not-an-array' }), { status: 200, headers: { 'content-type': 'application/json' } }))) as unknown as typeof fetch;
    const { container } = renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    // The generic error message is the decoder fallback; ErrorAlert renders
    // it as both a title and body (t.common.error), so assert the alert role.
    await waitFor(() => expect(container.querySelector('[role="alert"]')).not.toBeNull());
    expect(container.querySelector('[role="alert"]')!.textContent).toContain(t.common.error);
  });

  it('renders a full release row with flags, producers, media, gtin/catalog and an external link', async () => {
    global.fetch = routedFetch([fullRelease()]) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    const item = await screen.findByRole('listitem');
    expect(within(item).getByRole('link', { name: 'Release Alpha' })).toBeInTheDocument();
    expect(within(item).getByText('Release Alpha JP')).toBeInTheDocument();
    expect(within(item).getByText(t.releases.official)).toBeInTheDocument();
    expect(within(item).getByText(t.releases.uncensored)).toBeInTheDocument();
    expect(within(item).getByText(t.releases.hasEro)).toBeInTheDocument();
    expect(within(item).getByText(t.releases.voiced4)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Studio X' })).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Publisher Z' })).toBeInTheDocument();
    expect(within(item).getByText('CAT-001')).toBeInTheDocument();
    expect(within(item).getByText('4900000000001')).toBeInTheDocument();
    const ext = within(item).getByRole('link', { name: new RegExp('Store') });
    expect(ext.getAttribute('href')).toBe('https://example.com/store');
    expect(ext.getAttribute('target')).toBe('_blank');
    // Resolution renders as WxH.
    expect(within(item).getByText('1920x1080', { exact: false })).toBeInTheDocument();
  });

  it('does not render an owned-toggle button when not in collection', async () => {
    global.fetch = routedFetch([fullRelease()]) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection={false} />, { locale: 'en' });
    await screen.findByRole('listitem');
    expect(screen.queryByRole('button', { name: t.releases.markOwned })).toBeNull();
  });

  it('POSTs to mark a release owned when in collection', async () => {
    const fetchMock = routedFetch([fullRelease()], []);
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    const markBtn = await screen.findByRole('button', { name: t.releases.markOwned });
    fireEvent.click(markBtn);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/owned-releases') && c[1]?.method === 'POST')).toBe(true));
    const post = fetchMock.mock.calls.find((c) => String(c[0]).includes('/owned-releases') && c[1]?.method === 'POST')!;
    expect(JSON.parse(post[1]?.body as string)).toEqual({ release_id: 'r90001' });
  });

  it('renders the owned state and DELETEs when un-marking an already owned release', async () => {
    const fetchMock = routedFetch([fullRelease()], [ownedRow('r90001')]);
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    const ownedBtn = await screen.findByRole('button', { name: t.releases.ownedYes });
    expect(ownedBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(ownedBtn);
    await waitFor(() => expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/owned-releases') && c[1]?.method === 'DELETE')).toBe(true));
    const del = fetchMock.mock.calls.find((c) => String(c[0]).includes('/owned-releases') && c[1]?.method === 'DELETE')!;
    expect(String(del[0])).toContain('release_id=r90001');
  });

  it('syncs owned state from an external owned-editions-changed event', async () => {
    global.fetch = routedFetch([fullRelease()], []) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    await screen.findByRole('button', { name: t.releases.markOwned });
    act(() => {
      window.dispatchEvent(new CustomEvent(OWNED_EDITIONS_EVENT, {
        detail: { vnId: 'v90001', releaseId: 'r90001', isNowOwned: true },
      }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: t.releases.ownedYes })).toBeInTheDocument());
  });

  it('renders a trial rtype badge and skips an external link with an unsafe scheme', async () => {
    global.fetch = routedFetch([
      fullRelease({
        id: 'r90002',
        title: 'Trial Beta',
        alttitle: 'Trial Beta',
        platforms: ['win'],
        languages: [lang('en')],
        media: [],
        gtin: null,
        catalog: null,
        engine: null,
        resolution: null,
        voiced: null,
        minage: null,
        uncensored: false,
        has_ero: false,
        official: false,
        producers: [],
        vns: [{ id: 'v90001', rtype: 'trial' }],
        extlinks: [{ url: 'javascript:alert(1)', label: 'Bad', name: 'bad' }],
      }),
    ]) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    const item = await screen.findByRole('listitem');
    expect(within(item).getByText(t.releases.rtype.trial)).toBeInTheDocument();
    // alttitle equals title → not rendered as a separate subtitle.
    expect(within(item).queryByRole('link', { name: 'Bad' })).toBeNull();
  });
});
