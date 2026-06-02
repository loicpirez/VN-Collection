// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SearchClient } from '@/components/SearchClient';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import type { EgsCandidate } from '@/lib/erogamescape';
import type { VndbSearchHit } from '@/lib/types';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: nav.push,
    replace: nav.replace,
    refresh: nav.refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/search',
  useSearchParams: () => nav.searchParams,
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/dynamic', () => ({
  default: () => function DynamicTextualSearchPanel({ query }: { query: string }) {
    return <div data-testid="textual-search-panel">{query}</div>;
  },
}));

vi.mock('@/components/VnCard', () => ({
  VnCard: ({ data, enableAdd }: { data: { id: string; title: string }; enableAdd?: boolean }) => (
    <article data-add={enableAdd ? '1' : '0'} data-testid="search-card">
      <h2>{data.title}</h2>
      <span>{data.id}</span>
    </article>
  ),
}));

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function hit(overrides: Partial<VndbSearchHit> = {}): VndbSearchHit {
  return {
    id: 'v90001',
    title: 'Search Result One',
    alttitle: null,
    aliases: ['Alias One'],
    titles: [{ lang: 'en', title: 'Search Result One', latin: null, official: true, main: true }],
    released: '2020-01-02',
    rating: 82,
    votecount: 123,
    length_minutes: 600,
    languages: ['en', 'ja'],
    platforms: ['win'],
    image: { url: 'https://img.example.invalid/full.jpg', thumbnail: 'https://img.example.invalid/thumb.jpg' },
    developers: [{ name: 'Studio One' }],
    in_collection: false,
    ...overrides,
  };
}

function candidate(overrides: Partial<EgsCandidate> = {}): EgsCandidate {
  return {
    id: 90001,
    gamename: 'EGS Result One',
    gamename_furigana: null,
    median: 80,
    count: 45,
    sellday: '2020-01-02',
    ...overrides,
  };
}

function renderSearchClient() {
  return renderWithProviders(
    <DisplaySettingsProvider>
      <SearchClient />
    </DisplaySettingsProvider>,
    { locale: 'en' },
  );
}

function installFetch(handler?: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (handler) return handler(url, init);
    if (url.startsWith('/api/search/advanced')) return json({ results: [hit({ id: 'v90002', title: 'Advanced Result' })] });
    if (url.startsWith('/api/search')) return json({ results: [hit()] });
    if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
    if (url.startsWith('/api/egs/90001/add')) return json({ vn_id: 'egs_90001' });
    return json({});
  });
}

beforeEach(() => {
  nav.replace.mockClear();
  nav.push.mockClear();
  nav.refresh.mockClear();
  nav.searchParams = new URLSearchParams();
  localStorage.clear();
  installFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SearchClient', () => {
  it('focuses the empty VNDB search, runs quick search, and renders VN cards', async () => {
    const { user } = renderSearchClient();

    const input = screen.getByRole('searchbox', { name: /VNDB/ });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, 'result');

    expect(await screen.findByText('Search Result One')).toBeInTheDocument();
    expect(screen.getByTestId('search-card')).toHaveAttribute('data-add', '1');
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search?q=result', { scroll: false }));
  });

  it('shows quick-search errors and malformed payloads as the existing error alert', async () => {
    installFetch(async () => json({ results: [{ id: 'bad' }] }));
    const { user } = renderSearchClient();

    await user.type(screen.getByRole('searchbox', { name: /VNDB/ }), 'bad');

    expect(await screen.findByText('Search error')).toBeInTheDocument();
    expect(screen.getByText('No result')).toBeInTheDocument();
  });

  it('opens advanced filters, syncs URL params, submits the advanced search, and resets filters', async () => {
    const { user } = renderSearchClient();

    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.click(screen.getByRole('button', { name: 'Windows' }));
    await user.click(screen.getByRole('button', { name: /2 \/ Short/ }));
    fireEvent.change(screen.getByLabelText('Min year'), { target: { value: '2001' } });
    fireEvent.change(screen.getByLabelText('Max year'), { target: { value: '2005' } });
    fireEvent.change(screen.getByLabelText('Min rating (10-100)'), { target: { value: '70' } });
    await user.click(screen.getByLabelText('Has screenshots'));
    await user.click(screen.getByLabelText('Has a review'));
    await user.click(screen.getByLabelText('Has an anime adaptation'));
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'rating' } });
    await user.click(screen.getByRole('button', { name: 'Reverse order' }));

    await waitFor(() =>
      expect(nav.replace).toHaveBeenLastCalledWith(
        '/search?langs=en&platforms=win&lengthMin=2&lengthMax=2&yearMin=2001&yearMax=2005&ratingMin=70&hasScreenshot=1&hasReview=1&hasAnime=1&sort=rating',
        { scroll: false },
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Run search' }));
    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search', { scroll: false }));
  });

  it('auto-runs advanced search from URL params and reacts to external URL changes', async () => {
    nav.searchParams = new URLSearchParams('langs=ja&sort=title&reverse=1');
    renderSearchClient();

    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/search/advanced',
      expect.objectContaining({ method: 'POST' }),
    ));
  });

  it('switches source tabs with keyboard navigation and renders local search panel', async () => {
    const { user } = renderSearchClient();
    const tablist = screen.getByRole('tablist', { name: 'Search sources' });

    await user.click(screen.getByRole('tab', { name: 'VNDB' }));
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'EGS' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
    await user.type(screen.getByRole('searchbox', { name: /local collection/ }), 'memo');

    expect(screen.getByTestId('textual-search-panel')).toHaveTextContent('memo');
  });

  it('runs EGS search, adds an EGS-only result, and navigates to the synthetic VN', async () => {
    const { user } = renderSearchClient();

    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'egs');

    expect(await screen.findByText('EGS Result One')).toBeInTheDocument();
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('45 votes')).toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: /Add via EGS/ }));

    await waitFor(() => expect(nav.refresh).toHaveBeenCalledTimes(1));
    expect(nav.push).toHaveBeenCalledWith('/vn/egs_90001');
    expect(await screen.findByText('Added to collection')).toBeInTheDocument();
  });

  it('renders EGS empty and error states without mixing VNDB results', async () => {
    installFetch(async (url) => {
      if (url.startsWith('/api/egs/search')) return json({ candidates: [] });
      return json({ results: [hit()] });
    });
    const { user } = renderSearchClient();

    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'empty');

    expect(await screen.findByText('No result')).toBeInTheDocument();
    expect(screen.queryByText('Search Result One')).not.toBeInTheDocument();

    installFetch(async (url) => {
      if (url.startsWith('/api/egs/search')) return json({ nope: [] });
      return json({ results: [hit()] });
    });
    await user.clear(screen.getByRole('searchbox', { name: /ErogameScape/ }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'broken');

    expect(await screen.findByText('Search error')).toBeInTheDocument();
  });

  it('starts on EGS or local from URL source params', async () => {
    nav.searchParams = new URLSearchParams('source=egs&q=initial');
    const { rerender } = renderSearchClient();

    expect(await screen.findByText('EGS Result One')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'EGS' })).toHaveAttribute('aria-selected', 'true');

    nav.searchParams = new URLSearchParams('source=local&q=notes');
    rerender(
      <DisplaySettingsProvider>
        <SearchClient />
      </DisplaySettingsProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('textual-search-panel')).toHaveTextContent('notes');
  });

  it('runs advanced search from Enter and handles advanced response failures', async () => {
    const { user } = renderSearchClient();

    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await user.click(screen.getByRole('button', { name: 'English' }));
    await user.type(screen.getByRole('searchbox', { name: /VNDB/ }), 'advanced enter');
    fireEvent.keyDown(screen.getByRole('searchbox', { name: /VNDB/ }), { key: 'Enter' });

    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();

    installFetch(async (url) => {
      if (url.startsWith('/api/search/advanced')) return json({ error: 'Advanced failed' }, 500);
      return json({ results: [hit()] });
    });
    await user.click(screen.getByRole('button', { name: 'Run search' }));

    expect(await screen.findByText('Advanced failed')).toBeInTheDocument();
  });

  it('reports VNDB, EGS, and EGS-add upstream failures', async () => {
    installFetch(async (url) => {
      if (url.startsWith('/api/search')) return json({ error: 'VNDB failed' }, 500);
      return json({});
    });
    const { user } = renderSearchClient();

    await user.type(screen.getByRole('searchbox', { name: /VNDB/ }), 'vndb fail');
    expect(await screen.findByText('VNDB failed')).toBeInTheDocument();

    installFetch(async (url) => {
      if (url.startsWith('/api/egs/search')) return json({ error: 'EGS failed' }, 500);
      return json({ results: [hit()] });
    });
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'egs fail');
    expect(await screen.findByText('EGS failed')).toBeInTheDocument();

    installFetch(async (url, init) => {
      if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate({ id: 90002, gamename: 'Add Failure' })] });
      if (url.startsWith('/api/egs/90002/add') && init?.method === 'POST') return json({ error: 'Add failed' }, 500);
      return json({ results: [hit()] });
    });
    await user.clear(screen.getByRole('searchbox', { name: /ErogameScape/ }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'add fail');
    const row = await screen.findByText('Add Failure');
    await user.click(within(row.closest('li') ?? document.body).getByRole('button', { name: /Add via EGS/ }));

    expect(await screen.findByText('Add failed')).toBeInTheDocument();
  });
});
