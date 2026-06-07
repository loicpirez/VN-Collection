// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { WishlistClient } from '@/components/WishlistClient';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import type { WishlistClientItem, WishlistClientState } from '@/lib/vndb-ui-client-shape';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: nav.replace,
    refresh: nav.refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/wishlist',
  useSearchParams: () => nav.searchParams,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({
    data,
    onAdded,
    onRemoveFromWishlist,
    onSelect,
    removingFromWishlist,
    selectable,
    selected,
  }: {
    data: { id: string; title: string; inCollectionBadge?: boolean };
    onAdded?: (id: string) => void;
    onRemoveFromWishlist?: () => void | Promise<void>;
    onSelect?: () => void;
    removingFromWishlist?: boolean;
    selectable?: boolean;
    selected?: boolean;
  }) => (
    <article data-selected={selected ? '1' : '0'} data-testid={`wishlist-card-${data.id}`}>
      <h2>{data.title}</h2>
      <span>{data.inCollectionBadge ? 'owned' : 'todo'}</span>
      {selectable ? (
        <button type="button" onClick={onSelect}>{`Select ${data.title}`}</button>
      ) : (
        <button type="button" disabled={removingFromWishlist} onClick={() => void onRemoveFromWishlist?.()}>{`Remove ${data.title}`}</button>
      )}
      <button type="button" onClick={() => onAdded?.(data.id)}>{`Mark added ${data.title}`}</button>
    </article>
  ),
}));

vi.mock('@/components/BulkDownloadButton', () => ({
  BulkDownloadButton: ({ itemsOverride, label }: { itemsOverride: Array<{ id: string; title: string }>; label: string }) => (
    <button type="button">{`${label}: ${itemsOverride.length}`}</button>
  ),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function item(id: string, title: string, overrides: Partial<WishlistClientItem> = {}): WishlistClientItem {
  return {
    id,
    added: 1700000000,
    voted: null,
    vote: null,
    started: null,
    finished: null,
    notes: null,
    labels: [{ id: 7, label: 'Wishlist' }],
    in_collection: false,
    egs: { median: 70, playtime_median_minutes: 600 },
    vn: {
      id,
      title,
      alttitle: `${title} Alt`,
      released: '2020-01-02',
      rating: 78,
      votecount: 100,
      length_minutes: 600,
      languages: ['en', 'ja'],
      platforms: ['win'],
      image: { url: 'https://img.example.invalid/full.jpg', thumbnail: 'https://img.example.invalid/thumb.jpg', sexual: 0 },
      developers: [{ id: 'p90001', name: 'Studio One' }],
    },
    ...overrides,
  };
}

function state(items: WishlistClientItem[], overrides: Partial<WishlistClientState> = {}): WishlistClientState {
  return { needsAuth: false, items, ...overrides };
}

function renderWishlist() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <WishlistClient />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

function installFetch(payload: WishlistClientState = state([item('v90001', 'Alpha'), item('v90002', 'Beta', { in_collection: true })])) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url === '/api/wishlist' && init?.method !== 'DELETE') return json(payload);
    if (url.startsWith('/api/wishlist/') && init?.method === 'DELETE') return json({ ok: true });
    return json({ ok: true });
  });
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.refresh.mockClear();
  nav.searchParams = new URLSearchParams();
  localStorage.clear();
  installFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('WishlistClient', () => {
  it('shows the skeleton while loading, then the token-required state', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const { container } = renderWishlist();

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    resolveFetch(json(state([], { needsAuth: true })));

    expect(await screen.findByText('VNDB token required')).toBeInTheDocument();
    expect(screen.getByText(/vndb.org\/u\/tokens/)).toBeInTheDocument();
  });

  it('renders wishlist cards, hides owned entries by default, and marks a card as added locally', async () => {
    renderWishlist();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.queryByText('Beta')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download filtered wishlist: 1' })).toBeInTheDocument();

    await screen.findByTestId('wishlist-card-v90001');
    fireEvent.click(screen.getByRole('button', { name: 'Mark added Alpha' }));
    expect(screen.queryByTestId('wishlist-card-v90001')).not.toBeInTheDocument();
  });

  it('updates sort, group, hide-owned, search, and advanced filter URL params', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0');
    renderWishlist();
    expect(await screen.findByText('Beta')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'title' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&sort=title', { scroll: false });
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'developer' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&group=developer', { scroll: false });
    fireEvent.click(screen.getByLabelText('Hide already in collection'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist', { scroll: false });
    fireEvent.change(screen.getByLabelText('Language'), { target: { value: 'ja' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=ja', { scroll: false });
    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'win' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&platform=win', { scroll: false });
    fireEvent.change(screen.getByLabelText('Min rating'), { target: { value: '70' } });
    fireEvent.keyDown(screen.getByLabelText('Min rating'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&ratingMin=70', { scroll: false });
    fireEvent.blur(screen.getByLabelText('Min rating'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&ratingMin=70', { scroll: false });
    fireEvent.change(screen.getByLabelText('Max rating'), { target: { value: '85' } });
    fireEvent.keyDown(screen.getByLabelText('Max rating'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&ratingMax=85', { scroll: false });
    fireEvent.blur(screen.getByLabelText('Max rating'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&ratingMax=85', { scroll: false });
    fireEvent.change(screen.getByLabelText('Min year'), { target: { value: '2018' } });
    fireEvent.blur(screen.getByLabelText('Min year'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&yearMin=2018', { scroll: false });
    fireEvent.keyDown(screen.getByLabelText('Min year'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&yearMin=2018', { scroll: false });
    fireEvent.change(screen.getByLabelText('Max year'), { target: { value: '2021' } });
    fireEvent.blur(screen.getByLabelText('Max year'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&yearMax=2021', { scroll: false });
    fireEvent.keyDown(screen.getByLabelText('Max year'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&yearMax=2021', { scroll: false });
    fireEvent.change(screen.getByLabelText('Filter wishlist...'), { target: { value: 'studio' } });
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&q=studio', { scroll: false }));
  });

  it('clears default-valued sort/group params and writes hide-owned when unchecked', async () => {
    nav.searchParams = new URLSearchParams('sort=title&group=developer');
    renderWishlist();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'added_desc' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?group=developer', { scroll: false });
    fireEvent.change(screen.getByLabelText('Group'), { target: { value: 'none' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?sort=title', { scroll: false });
    fireEvent.click(screen.getByLabelText('Hide already in collection'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?sort=title&group=developer&hideOwned=0', { scroll: false });
  });

  it('clears language, platform, rating, and year params when controls are emptied', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0&lang=en&platform=win&ratingMin=70&ratingMax=90&yearMin=2018&yearMax=2021');
    renderWishlist();
    expect(await screen.findByText('Alpha')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Language'), { target: { value: '' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&platform=win&ratingMin=70&ratingMax=90&yearMin=2018&yearMax=2021', { scroll: false });
    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: '' } });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&ratingMin=70&ratingMax=90&yearMin=2018&yearMax=2021', { scroll: false });

    fireEvent.change(screen.getByLabelText('Min rating'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Min rating'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMax=90&yearMin=2018&yearMax=2021', { scroll: false });
    fireEvent.keyDown(screen.getByLabelText('Min rating'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMax=90&yearMin=2018&yearMax=2021', { scroll: false });

    fireEvent.change(screen.getByLabelText('Max rating'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Max rating'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMin=70&yearMin=2018&yearMax=2021', { scroll: false });
    fireEvent.keyDown(screen.getByLabelText('Max rating'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMin=70&yearMin=2018&yearMax=2021', { scroll: false });

    fireEvent.change(screen.getByLabelText('Min year'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Min year'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMin=70&ratingMax=90&yearMax=2021', { scroll: false });
    fireEvent.keyDown(screen.getByLabelText('Min year'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMin=70&ratingMax=90&yearMax=2021', { scroll: false });

    fireEvent.change(screen.getByLabelText('Max year'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Max year'));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMin=70&ratingMax=90&yearMin=2018', { scroll: false });
    fireEvent.keyDown(screen.getByLabelText('Max year'), { key: 'Enter' });
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&lang=en&platform=win&ratingMin=70&ratingMax=90&yearMin=2018', { scroll: false });
  });

  it('renders active filtered and grouped results, then resets filters', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0&group=developer&ratingMin=70&ratingMax=90&yearMin=2019&yearMax=2021&lang=en&platform=win');
    renderWishlist();

    expect(await screen.findByText('Studio One')).toBeInTheDocument();
    expect(screen.getByText('6 active')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&group=developer', { scroll: false });
  });

  it('applies URL-only filters for language, platform, rating, year, alt title, and developer search', async () => {
    const base = item('v90001', 'Alpha', {
      vn: {
        ...item('v90001', 'Alpha').vn,
        alttitle: 'Alt Match',
        released: '2020-01-02',
        rating: 70,
        languages: ['en'],
        platforms: ['win'],
        developers: [{ id: 'p90001', name: 'Studio One' }],
      },
    });
    const cases: Array<{ query: string; rows: WishlistClientItem[]; empty: boolean }> = [
      { query: 'hideOwned=0&lang=fr', rows: [base], empty: true },
      { query: 'hideOwned=0&platform=ps4', rows: [base], empty: true },
      { query: 'hideOwned=0&ratingMin=80', rows: [base, item('v90002', 'No Rating', { vn: { ...item('v90002', 'No Rating').vn, rating: null } })], empty: true },
      { query: 'hideOwned=0&ratingMax=60', rows: [base, item('v90003', 'No Rating Two', { vn: { ...item('v90003', 'No Rating Two').vn, rating: null } })], empty: true },
      { query: 'hideOwned=0&yearMin=2021', rows: [base, item('v90004', 'No Date', { vn: { ...item('v90004', 'No Date').vn, released: null } })], empty: true },
      { query: 'hideOwned=0&yearMax=2019', rows: [base], empty: true },
      { query: 'hideOwned=0&q=alt', rows: [base], empty: false },
      { query: 'hideOwned=0&q=studio', rows: [base], empty: false },
      { query: 'hideOwned=0&q=missing', rows: [item('v90005', 'Other', { vn: { ...item('v90005', 'Other').vn, alttitle: null, developers: [] } })], empty: true },
    ];

    for (const entry of cases) {
      cleanup();
      nav.searchParams = new URLSearchParams(entry.query);
      installFetch(state(entry.rows));
      renderWishlist();
      if (entry.empty) expect(await screen.findByText('No VNs match the active filters.')).toBeInTheDocument();
      else expect(await screen.findByText('Alpha')).toBeInTheDocument();
    }
  });

  it('projects cards with missing optional image and EGS metadata', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0');
    installFetch(state([
      item('v90010', 'No Image', {
        egs: null,
        vn: { ...item('v90010', 'No Image').vn, image: null, alttitle: null, rating: null, released: null, length_minutes: null },
      }),
      item('v90011', 'URL Fallback', {
        vn: { ...item('v90011', 'URL Fallback').vn, image: { url: 'https://img.example.invalid/fallback.jpg', thumbnail: '' } },
      }),
    ]));
    renderWishlist();

    expect(await screen.findByText('No Image')).toBeInTheDocument();
    expect(screen.getByText('URL Fallback')).toBeInTheDocument();
  });

  it.each([
    ['rating_desc', { rating: null }],
    ['released_desc', { released: null }],
    ['released_asc', { released: null }],
    ['length_desc', { length_minutes: null }],
  ])('sorts %s when one side is missing local VN metadata', async (sortMode, vnPatch) => {
    nav.searchParams = new URLSearchParams(`hideOwned=0&sort=${sortMode}`);
    installFetch(state([
      item('v90020', 'Complete', { vn: { ...item('v90020', 'Complete').vn, rating: 90, released: '2021-01-01', length_minutes: 900 } }),
      item('v90021', 'Partial', { vn: { ...item('v90021', 'Partial').vn, ...vnPatch } }),
    ]));
    renderWishlist();

    expect(await screen.findByText('Complete')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  it('sorts by EGS rating when one side has no EGS summary', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0&sort=egs_rating_desc');
    installFetch(state([
      item('v90022', 'With EGS', { egs: { median: 90, playtime_median_minutes: 600 } }),
      item('v90023', 'Without EGS', { egs: null }),
    ]));
    renderWishlist();

    expect(await screen.findByText('With EGS')).toBeInTheDocument();
    expect(screen.getByText('Without EGS')).toBeInTheDocument();
  });

  it.each([
    ['rating_desc', { rating: null }],
    ['released_desc', { released: null }],
    ['released_asc', { released: null }],
    ['length_desc', { length_minutes: null }],
  ])('sorts %s when both sides are missing local VN metadata', async (sortMode, vnPatch) => {
    nav.searchParams = new URLSearchParams(`hideOwned=0&sort=${sortMode}`);
    installFetch(state([
      item('v90030', 'Partial One', { vn: { ...item('v90030', 'Partial One').vn, ...vnPatch } }),
      item('v90031', 'Partial Two', { vn: { ...item('v90031', 'Partial Two').vn, ...vnPatch } }),
    ]));
    renderWishlist();

    expect(await screen.findByText('Partial One')).toBeInTheDocument();
    expect(screen.getByText('Partial Two')).toBeInTheDocument();
  });

  it('sorts by EGS rating when both sides have no EGS summary', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0&sort=egs_rating_desc');
    installFetch(state([
      item('v90032', 'No EGS One', { egs: null }),
      item('v90033', 'No EGS Two', { egs: null }),
    ]));
    renderWishlist();

    expect(await screen.findByText('No EGS One')).toBeInTheDocument();
    expect(screen.getByText('No EGS Two')).toBeInTheDocument();
  });

  it('shows empty, error, and no-match states after resolved fetches', async () => {
    installFetch(state([]));
    const first = renderWishlist();

    expect(await screen.findByText('Your VNDB wishlist is empty.')).toBeInTheDocument();
    first.unmount();

    global.fetch = vi.fn(async (): Promise<Response> => json({ needsAuth: 'bad', items: [] }));
    renderWishlist();
    expect(await screen.findByRole('alert')).toHaveTextContent('Error');
    cleanup();

    nav.searchParams = new URLSearchParams('ratingMin=95');
    installFetch(state([item('v90001', 'Alpha', { vn: { ...item('v90001', 'Alpha').vn, rating: 70 } })]));
    renderWishlist();
    expect(await screen.findByText('No VNs match the active filters.')).toBeInTheDocument();
  });

  it('refreshes the wishlist and removes a single card', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/wishlist') return json(state([item('v90001', 'Alpha')]));
      if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') return json({ ok: true });
      return json({ ok: true });
    });
    const { user } = renderWishlist();

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(calls.filter((call) => call === 'GET /api/wishlist').length).toBeGreaterThan(1));
    await user.click(screen.getByRole('button', { name: 'Remove Alpha' }));

    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    expect(calls).toContain('DELETE /api/wishlist/v90001');
    expect(await screen.findByText('Removed from wishlist')).toBeInTheDocument();
  });

  it('selects multiple cards and deletes them through the confirmation dialog', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0');
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/wishlist') return json(state([item('v90001', 'Alpha'), item('v90002', 'Beta')]));
      if (url.startsWith('/api/wishlist/') && init?.method === 'DELETE') return json({ ok: true });
      return json({ ok: true });
    });
    const { user } = renderWishlist();

    expect(await screen.findByText('Beta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Select Beta' }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.queryByText('Alpha')).not.toBeInTheDocument());
    expect(calls).toContain('DELETE /api/wishlist/v90001');
    expect(calls).toContain('DELETE /api/wishlist/v90002');
    expect(await screen.findByText('2 VN(s) removed from VNDB wishlist')).toBeInTheDocument();
  });

  it('cancels bulk deletion and clears selection from the floating toolbar', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0');
    installFetch(state([item('v90001', 'Alpha'), item('v90002', 'Beta')]));
    const { user } = renderWishlist();

    expect(await screen.findByText('Beta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
  });

  it('logs thrown bulk-delete failures and keeps failed rows visible', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = String(input);
      if (url === '/api/wishlist') return json(state([item('v90001', 'Alpha'), item('v90002', 'Beta')]));
      if (url === '/api/wishlist/v90001' && init?.method === 'DELETE') throw new Error('network down');
      if (url === '/api/wishlist/v90002' && init?.method === 'DELETE') return json({ ok: true });
      return json({ ok: true });
    });
    const { user } = renderWishlist();

    expect(await screen.findByText('Beta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: 'Select Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Select Beta' }));
    await user.click(screen.getByRole('button', { name: 'Remove from VNDB wishlist' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(await screen.findByText('Failed on 1 VN(s) - check the console.')).toBeInTheDocument();
    expect(consoleSpy).toHaveBeenCalled();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
  });

  it('renders pagination and writes the next page param', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0');
    const rows = Array.from({ length: 61 }, (_, index) => item(`v9${String(index + 1).padStart(4, '0')}`, `VN ${index + 1}`));
    installFetch(state(rows));
    const { user } = renderWishlist();

    expect(await screen.findByText('Items 1 to 60 of 61')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&page=2', { scroll: false });
  });

  it('navigates from page three to page two via Previous', async () => {
    nav.searchParams = new URLSearchParams('hideOwned=0&page=3');
    const rows = Array.from({ length: 121 }, (_, index) => item(`v9${String(index + 1).padStart(4, '0')}`, `VN ${index + 1}`));
    installFetch(state(rows));
    const { user } = renderWishlist();

    expect(await screen.findByText('Items 121 to 121 of 121')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(nav.replace).toHaveBeenLastCalledWith('/wishlist?hideOwned=0&page=2', { scroll: false });
  });
});
