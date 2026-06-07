// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { EditionInfoTrigger, type EditionInfoPopoverData } from '@/components/EditionInfoPopover';
import { dictionaries } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;

function makeData(overrides: Partial<EditionInfoPopoverData> = {}): EditionInfoPopoverData {
  return {
    vn_id: 'v90001',
    release_id: 'r90001',
    vn_title: 'Title Y',
    vn_image_thumb: null,
    vn_image_url: null,
    vn_local_image_thumb: null,
    vn_image_sexual: null,
    owned_platform: null,
    edition_label: null,
    box_type: 'none',
    condition: null,
    physical_location: [],
    price_paid: null,
    currency: null,
    acquired_date: null,
    dumped: false,
    vn_platforms: [],
    vn_languages: [],
    vn_released: null,
    rel_title: null,
    rel_platforms: [],
    rel_languages: [],
    rel_released: null,
    rel_resolution: null,
    ...overrides,
  };
}

function renderTrigger(data: EditionInfoPopoverData) {
  return renderWithProviders(<EditionInfoTrigger data={data} />, { locale: 'en' });
}

async function openPopover() {
  fireEvent.click(screen.getByRole('button', { name: t.shelfLayout.poolItemDetails }));
  return screen.findByRole('region', { name: t.shelfLayout.poolItemDetails });
}

describe('EditionInfoPopover branches', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts closed and toggles the popover open on the info button', async () => {
    renderTrigger(makeData());
    expect(screen.queryByRole('region', { name: t.shelfLayout.poolItemDetails })).toBeNull();
    const region = await openPopover();
    expect(region).toBeInTheDocument();
    expect(within(region).getByText('Title Y')).toBeInTheDocument();
  });

  it('closes the popover on Escape', async () => {
    renderTrigger(makeData());
    await openPopover();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(screen.getByRole('region', { name: t.shelfLayout.poolItemDetails })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('region', { name: t.shelfLayout.poolItemDetails })).toBeNull());
  });

  it('closes the popover on an outside click', async () => {
    renderTrigger(makeData());
    await openPopover();
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('region', { name: t.shelfLayout.poolItemDetails })).toBeNull());
  });

  it('keeps the popover open for trigger and popover pointer events', async () => {
    renderTrigger(makeData());
    const button = screen.getByRole('button', { name: t.shelfLayout.poolItemDetails });
    fireEvent.pointerDown(button);
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    const region = await screen.findByRole('region', { name: t.shelfLayout.poolItemDetails });
    fireEvent.pointerDown(region);
    fireEvent.mouseDown(region);
    expect(screen.getByRole('region', { name: t.shelfLayout.poolItemDetails })).toBeInTheDocument();
  });

  it('applies the scoped hover class when requested', () => {
    renderWithProviders(
      <EditionInfoTrigger data={makeData()} groupHoverHidden groupHoverScope="group/slot" />,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: t.shelfLayout.poolItemDetails }).className).toContain('sm:group/slot-hover:text-accent');
  });

  it('computes above/right placement when viewport space is constrained', async () => {
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 20,
      y: 720,
      top: 720,
      right: 120,
      bottom: 780,
      left: 20,
      width: 100,
      height: 60,
      toJSON: () => ({}),
    } as DOMRect);
    const offsetHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(220);
    const offsetWidth = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
    const innerHeight = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(800);
    const innerWidth = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(260);
    renderTrigger(makeData());
    const region = await openPopover();
    await act(async () => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
    });
    await waitFor(() => expect(region.className).toContain('bottom-full'));
    expect(region.className).toContain('right-0');
    expect(rectSpy).toHaveBeenCalled();
    offsetHeight.mockRestore();
    offsetWidth.mockRestore();
    innerHeight.mockRestore();
    innerWidth.mockRestore();
  });

  it('renders rel_title and edition_label as distinct secondary lines', async () => {
    renderTrigger(makeData({ rel_title: 'Limited Edition X', edition_label: 'First press' }));
    const region = await openPopover();
    expect(within(region).getByText('Limited Edition X')).toBeInTheDocument();
    expect(within(region).getByText('First press')).toBeInTheDocument();
  });

  it('shows the owned-platform pin with the owned badge when owned_platform is set', async () => {
    renderTrigger(makeData({ owned_platform: 'win', rel_platforms: ['win'] }));
    const region = await openPopover();
    expect(within(region).getByText(t.shelfLayout.ownedBadge)).toBeInTheDocument();
  });

  it('shows the also-available-on secondary line for a multi-platform pinned release', async () => {
    renderTrigger(makeData({ owned_platform: 'win', rel_platforms: ['win', 'ps4', 'swi'] }));
    const region = await openPopover();
    expect(within(region).getByText(t.shelfLayout.alsoAvailableOn)).toBeInTheDocument();
  });

  it('auto-derives a single-platform release with the release badge', async () => {
    renderTrigger(makeData({ owned_platform: null, rel_platforms: ['ps4'] }));
    const region = await openPopover();
    expect(within(region).getByText(t.shelfLayout.releaseFieldBadge)).toBeInTheDocument();
  });

  it('renders the choose-platform action for a multi-platform release with no pin', async () => {
    renderTrigger(makeData({ owned_platform: null, rel_platforms: ['win', 'ps4'] }));
    const region = await openPopover();
    expect(within(region).getByText(t.shelfLayout.platformChooseLabel)).toBeInTheDocument();
    const chooseLink = within(region).getByRole('link', { name: new RegExp(t.form.choosePlatform) });
    expect(chooseLink.getAttribute('href')).toContain('edit_release=r90001');
    fireEvent.pointerDown(chooseLink);
    fireEvent.mouseDown(chooseLink);
    fireEvent.click(chooseLink);
  });

  it('offers a refresh action when release metadata is missing for a real release', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    renderTrigger(makeData({ owned_platform: null, rel_platforms: [], release_id: 'r90055' }));
    const region = await openPopover();
    expect(within(region).getByText(t.shelfLayout.platformUnknownLabel)).toBeInTheDocument();
    const refreshBtn = within(region).getByRole('button', { name: t.shelfLayout.refreshReleases });
    fireEvent.click(refreshBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/collection/v90001/assets?refresh=true');
    expect(init.method).toBe('POST');
  });

  it('ignores duplicate metadata refresh clicks while the first request is pending', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    global.fetch = fetchMock as typeof fetch;
    renderTrigger(makeData({ owned_platform: null, rel_platforms: [], release_id: 'r90057' }));
    const region = await openPopover();
    const refresh = within(region).getByRole('button', { name: t.shelfLayout.refreshReleases });
    act(() => {
      fireEvent.click(refresh);
      fireEvent.click(refresh);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    await waitFor(() => expect(screen.getByText(t.toast.saved)).toBeInTheDocument());
  });

  it('ignores a stale successful metadata refresh after unmount', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    global.fetch = fetchMock as typeof fetch;
    const view = renderTrigger(makeData({ owned_platform: null, rel_platforms: [], release_id: 'r90058' }));
    const region = await openPopover();
    fireEvent.click(within(region).getByRole('button', { name: t.shelfLayout.refreshReleases }));
    view.unmount();
    await act(async () => {
      resolveFetch(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(t.toast.saved)).toBeNull();
  });

  it('ignores abort errors from a metadata refresh', async () => {
    const fetchMock = vi.fn(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    global.fetch = fetchMock as typeof fetch;
    renderTrigger(makeData({ owned_platform: null, rel_platforms: [], release_id: 'r90059' }));
    const region = await openPopover();
    fireEvent.click(within(region).getByRole('button', { name: t.shelfLayout.refreshReleases }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('aborted')).toBeNull();
  });

  it('ignores a stale failed metadata refresh after unmount', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    global.fetch = fetchMock as typeof fetch;
    const view = renderTrigger(makeData({ owned_platform: null, rel_platforms: [], release_id: 'r90060' }));
    const region = await openPopover();
    fireEvent.click(within(region).getByRole('button', { name: t.shelfLayout.refreshReleases }));
    view.unmount();
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ error: 'late refresh failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('late refresh failed')).toBeNull();
  });

  it('surfaces an error toast when the metadata refresh fails', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'refresh boom' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    renderTrigger(makeData({ owned_platform: null, rel_platforms: [], release_id: 'r90056' }));
    const region = await openPopover();
    fireEvent.click(within(region).getByRole('button', { name: t.shelfLayout.refreshReleases }));
    await waitFor(() => expect(screen.getByText('refresh boom')).toBeInTheDocument());
  });

  it('renders only the bare unknown label and no release link for a synthetic edition', async () => {
    renderTrigger(makeData({ release_id: 'synthetic:v90001', owned_platform: null, rel_platforms: [] }));
    const region = await openPopover();
    expect(within(region).getByText(t.shelfLayout.platformUnknownLabel)).toBeInTheDocument();
    expect(within(region).queryByText(t.shelfLayout.refreshReleases)).toBeNull();
    // Synthetic editions hide the "open release" link but keep "open VN".
    expect(within(region).getByRole('link', { name: t.shelfLayout.poolOpenVn })).toBeInTheDocument();
    expect(within(region).queryByRole('link', { name: t.shelfLayout.poolOpenRelease })).toBeNull();
  });

  it('renders the open-release link for a real (non-synthetic) edition', async () => {
    renderTrigger(makeData());
    const region = await openPopover();
    const releaseLink = within(region).getByRole('link', { name: t.shelfLayout.poolOpenRelease });
    expect(releaseLink.getAttribute('href')).toBe('/release/r90001');
  });

  it('renders released/languages/resolution and all owned-edition annotation rows', async () => {
    renderTrigger(makeData({
      rel_released: '2026-01-15',
      rel_languages: ['en', 'ja'],
      rel_resolution: '1920x1080',
      condition: 'new',
      box_type: 'big',
      physical_location: ['Shelf A', 'Box 2'],
      price_paid: 5800,
      currency: 'JPY',
      acquired_date: '2026-02-01',
      dumped: true,
    }));
    const region = await openPopover();
    expect(within(region).getByText('1920x1080')).toBeInTheDocument();
    expect(within(region).getByText(t.detail.released, { exact: false })).toBeInTheDocument();
    expect(within(region).getByText(t.detail.languages, { exact: false })).toBeInTheDocument();
    expect(within(region).getByText(t.inventory.condition, { exact: false })).toBeInTheDocument();
    expect(within(region).getByText('Shelf A / Box 2')).toBeInTheDocument();
    expect(within(region).getByText('JPY', { exact: false })).toBeInTheDocument();
    expect(within(region).getByText(t.shelf.dumped)).toBeInTheDocument();
  });

  it('falls back to raw condition and box labels and omits a blank currency suffix', async () => {
    renderTrigger(makeData({
      condition: 'shopworn',
      box_type: 'steelcase',
      price_paid: 1234,
      currency: null,
    }));
    const region = await openPopover();
    expect(within(region).getByText('shopworn')).toBeInTheDocument();
    expect(within(region).getByText('steelcase')).toBeInTheDocument();
    expect(within(region).getByText('1,234', { exact: false })).toBeInTheDocument();
  });

  it('falls back to vn_* released/languages when rel_* are empty', async () => {
    renderTrigger(makeData({
      rel_released: null,
      vn_released: '2025-12-01',
      rel_languages: [],
      vn_languages: ['en'],
    }));
    const region = await openPopover();
    expect(within(region).getByText(t.detail.released, { exact: false })).toBeInTheDocument();
    expect(within(region).getByText(t.detail.languages, { exact: false })).toBeInTheDocument();
    // No release badge since the data came from the VN aggregate fallback.
    expect(within(region).queryByText(t.shelfLayout.releaseFieldBadge)).toBeNull();
  });

  it('uses a custom aria-label override on the trigger and region', async () => {
    renderWithProviders(<EditionInfoTrigger data={makeData()} ariaLabelOverride="Custom details" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: 'Custom details' }));
    expect(await screen.findByRole('region', { name: 'Custom details' })).toBeInTheDocument();
  });

  it('keeps the popover open when VN and release links receive pointer/click events', async () => {
    renderTrigger(makeData());
    const region = await openPopover();
    for (const link of [
      within(region).getByRole('link', { name: t.shelfLayout.poolOpenVn }),
      within(region).getByRole('link', { name: t.shelfLayout.poolOpenRelease }),
    ]) {
      fireEvent.pointerDown(link);
      fireEvent.mouseDown(link);
      fireEvent.click(link);
    }
    expect(screen.getByRole('region', { name: t.shelfLayout.poolItemDetails })).toBeInTheDocument();
  });
});
