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

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

  it('renders patch and freeware flags, string resolutions, and multi-producer separators', async () => {
    global.fetch = routedFetch([
      fullRelease({
        patch: true,
        freeware: true,
        resolution: 'non-standard',
        producers: [
          { id: 'p90001', developer: true, publisher: false, name: 'Studio X' },
          { id: 'p90003', developer: true, publisher: false, name: 'Studio Y' },
          { id: 'p90002', developer: false, publisher: true, name: 'Publisher Z' },
          { id: 'p90004', developer: false, publisher: true, name: 'Publisher Q' },
        ],
      }),
    ]) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    const item = await screen.findByRole('listitem');
    expect(within(item).getByText(t.releases.patch)).toBeInTheDocument();
    expect(within(item).getByText(t.releases.freeware)).toBeInTheDocument();
    expect(within(item).getByText('non-standard', { exact: false })).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Studio Y' })).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: 'Publisher Q' })).toBeInTheDocument();
    expect(within(item).getAllByText('/').length).toBeGreaterThanOrEqual(3);
  });

  it('does not update release state after the release request is aborted by unmount', async () => {
    const releasesRequest = deferredResponse();
    global.fetch = vi.fn(() => releasesRequest.promise) as unknown as typeof fetch;
    const { unmount } = renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    unmount();
    await act(async () => {
      releasesRequest.resolve(releasesResponse([fullRelease()]));
      await flushAsyncWork();
    });
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('ignores an AbortError from the releases request', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(() => Promise.reject(abortError)) as unknown as typeof fetch;
    const { container } = renderWithProviders(<ReleasesSection vnId="v90001" />, { locale: 'en' });
    await act(flushAsyncWork);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the mark-owned state when owned refresh returns non-ok or malformed data', async () => {
    const nonOkFetch = vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('/releases')) return Promise.resolve(releasesResponse([fullRelease()]));
      return Promise.resolve(new Response(JSON.stringify({ error: 'owned boom' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    });
    global.fetch = nonOkFetch as unknown as typeof fetch;
    const first = renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    expect(await screen.findByRole('button', { name: t.releases.markOwned })).toBeInTheDocument();
    first.unmount();

    const malformedFetch = vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('/releases')) return Promise.resolve(releasesResponse([fullRelease()]));
      return Promise.resolve(new Response(JSON.stringify({ owned: 'bad' }), { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    global.fetch = malformedFetch as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    expect(await screen.findByRole('button', { name: t.releases.markOwned })).toBeInTheDocument();
  });

  it('does not apply owned refresh data after unmount aborts the owned request', async () => {
    const ownedRequest = deferredResponse();
    global.fetch = vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('/releases')) return Promise.resolve(releasesResponse([fullRelease()]));
      return ownedRequest.promise;
    }) as unknown as typeof fetch;
    const rendered = renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    await screen.findByRole('button', { name: t.releases.markOwned });
    rendered.unmount();
    await act(async () => {
      ownedRequest.resolve(ownedResponse([ownedRow('r90001')]));
      await flushAsyncWork();
    });
    expect(screen.queryByRole('button', { name: t.releases.ownedYes })).toBeNull();
  });

  it('ignores owned-change events without matching release details', async () => {
    global.fetch = routedFetch([fullRelease()], [ownedRow('r90001')]) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    await screen.findByRole('button', { name: t.releases.ownedYes });
    act(() => {
      window.dispatchEvent(new CustomEvent(OWNED_EDITIONS_EVENT));
      window.dispatchEvent(new CustomEvent(OWNED_EDITIONS_EVENT, {
        detail: { vnId: 'v90002', releaseId: 'r90001', isNowOwned: false },
      }));
    });
    expect(screen.getByRole('button', { name: t.releases.ownedYes })).toBeInTheDocument();
  });

  it('removes owned state from an external owned-editions-changed event', async () => {
    global.fetch = routedFetch([fullRelease()], [ownedRow('r90001')]) as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    await screen.findByRole('button', { name: t.releases.ownedYes });
    act(() => {
      window.dispatchEvent(new CustomEvent(OWNED_EDITIONS_EVENT, {
        detail: { vnId: 'v90001', releaseId: 'r90001', isNowOwned: false },
      }));
    });
    await waitFor(() => expect(screen.getByRole('button', { name: t.releases.markOwned })).toBeInTheDocument());
  });

  it('blocks a second owned toggle while the first mutation is pending', async () => {
    const postRequest = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/releases')) return Promise.resolve(releasesResponse([fullRelease()]));
      if (init?.method === 'POST') return postRequest.promise;
      return Promise.resolve(ownedResponse([]));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    const markBtn = await screen.findByRole('button', { name: t.releases.markOwned });
    fireEvent.click(markBtn);
    fireEvent.click(markBtn);
    expect(fetchMock.mock.calls.filter((c) => c[1]?.method === 'POST')).toHaveLength(1);
    await act(async () => {
      postRequest.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      await flushAsyncWork();
    });
  });

  it('shows a mutation error when marking a release owned fails', async () => {
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/releases')) return Promise.resolve(releasesResponse([fullRelease()]));
      if (init?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ error: 'save failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      return Promise.resolve(ownedResponse([]));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.releases.markOwned }));
    await waitFor(() => expect(screen.getByText('save failed')).toBeInTheDocument());
  });

  it('does not update owned state after a mutation is aborted by unmount', async () => {
    const postRequest = deferredResponse();
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/releases')) return Promise.resolve(releasesResponse([fullRelease()]));
      if (init?.method === 'POST') return postRequest.promise;
      return Promise.resolve(ownedResponse([]));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const rendered = renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.releases.markOwned }));
    rendered.unmount();
    await act(async () => {
      postRequest.resolve(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
      await flushAsyncWork();
    });
    expect(screen.queryByRole('button', { name: t.releases.ownedYes })).toBeNull();
  });

  it('ignores AbortError mutations without showing an alert', async () => {
    const abortError = new Error('mutation aborted');
    abortError.name = 'AbortError';
    const fetchMock = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes('/releases')) return Promise.resolve(releasesResponse([fullRelease()]));
      if (init?.method === 'POST') return Promise.reject(abortError);
      return Promise.resolve(ownedResponse([]));
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const { container } = renderWithProviders(<ReleasesSection vnId="v90001" inCollection />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.releases.markOwned }));
    await act(flushAsyncWork);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});
