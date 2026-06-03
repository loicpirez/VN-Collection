// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: nav.refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
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
  VnCard: ({ data }: { data: { id: string; title: string } }) => (
    <article data-testid="search-card"><h2>{data.title}</h2><span>{data.id}</span></article>
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
    aliases: [],
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
  return { id: 90001, gamename: 'EGS Result One', gamename_furigana: null, median: 80, count: 45, sellday: '2020-01-02', ...overrides };
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

describe('SearchClient branches', () => {
  it('ignores a non-numeric length param from the URL', async () => {
    // readAdvFromUrl num() returns null for a non-finite value -> the lengthMin/Max
    // fall back to null and advanced is still considered active via langs.
    nav.searchParams = new URLSearchParams('langs=en&lengthMin=abc&lengthMax=');
    renderSearchClient();
    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
  });

  it('deselects a language chip on a second click', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    const english = screen.getByRole('button', { name: 'English' });
    await user.click(english);
    expect(english.getAttribute('aria-pressed')).toBe('true');
    // Second click removes it (the toggle "includes" else branch).
    await user.click(english);
    expect(english.getAttribute('aria-pressed')).toBe('false');
  });

  it('selects then clears the length range via the inline cancel chip', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    await user.click(screen.getByRole('button', { name: /3 \/ / }));
    // The clear chip only renders once a length bound is set.
    const cancelChip = await screen.findByRole('button', { name: 'Cancel' });
    await user.click(cancelChip);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull());
  });

  it('navigates source tabs left with the keyboard, wrapping to Local', async () => {
    const { user } = renderSearchClient();
    const tablist = screen.getByRole('tablist', { name: 'Search sources' });
    await user.click(screen.getByRole('tab', { name: 'VNDB' }));
    // ArrowLeft from vndb wraps to the last tab (local).
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
    // A non-arrow key is a no-op.
    fireEvent.keyDown(tablist, { key: 'Enter' });
    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
  });

  it('clicks the Local tab directly and renders the standalone textual panel', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'Local' }));
    await user.type(screen.getByRole('searchbox', { name: /local collection/ }), 'memo text');
    expect(screen.getByTestId('textual-search-panel')).toHaveTextContent('memo text');
  });

  it('shows the EGS hero state before any query is typed on the EGS tab', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    // touched is false and no egs results -> the EGS hero renders.
    expect(screen.getByText(/.+/, { selector: 'h2' })).toBeInTheDocument();
  });

  it('clears VNDB results when the query is emptied', async () => {
    const { user } = renderSearchClient();
    const input = screen.getByRole('searchbox', { name: /VNDB/ });
    await user.type(input, 'result');
    expect(await screen.findByText('Search Result One')).toBeInTheDocument();
    await user.clear(input);
    // Empty query short-circuits the effect -> results reset to empty.
    await waitFor(() => expect(screen.queryByText('Search Result One')).not.toBeInTheDocument());
  });

  it('clears EGS results when the query is emptied on the EGS tab', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    const input = screen.getByRole('searchbox', { name: /ErogameScape/ });
    await user.type(input, 'egs');
    expect(await screen.findByText('EGS Result One')).toBeInTheDocument();
    await user.clear(input);
    await waitFor(() => expect(screen.queryByText('EGS Result One')).not.toBeInTheDocument());
  });

  it('marks an already-added EGS row as in collection after a successful add', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('tab', { name: 'EGS' }));
    await user.type(screen.getByRole('searchbox', { name: /ErogameScape/ }), 'egs');
    await screen.findByText('EGS Result One');
    installFetch((url) => {
      if (url.startsWith('/api/egs/90001/add')) return json({ vn_id: 'egs_90001' });
      if (url.startsWith('/api/egs/search')) return json({ candidates: [candidate()] });
      return json({ results: [hit()] });
    });
    await user.click(screen.getByRole('button', { name: /Add via EGS/ }));
    // After the add resolves the button flips to the in-collection label.
    expect(await screen.findByText('In collection')).toBeInTheDocument();
  });

  it('reacts to an external URL switch into the EGS source', async () => {
    const { rerender } = renderSearchClient();
    expect(screen.getByRole('tab', { name: 'VNDB' })).toHaveAttribute('aria-selected', 'true');
    nav.searchParams = new URLSearchParams('source=egs&q=switch');
    rerender(
      <DisplaySettingsProvider>
        <SearchClient />
      </DisplaySettingsProvider>,
    );
    expect(await screen.findByText('EGS Result One')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'EGS' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reacts to an external URL switch into the Local source', async () => {
    const { rerender } = renderSearchClient();
    nav.searchParams = new URLSearchParams('source=local&q=memo');
    rerender(
      <DisplaySettingsProvider>
        <SearchClient />
      </DisplaySettingsProvider>,
    );
    expect(screen.getByRole('tab', { name: 'Local' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('textual-search-panel')).toHaveTextContent('memo');
  });

  it('disables the reverse toggle until a sort field is chosen', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    // sort === '' by default -> the reverse chip is disabled.
    expect((screen.getByRole('button', { name: 'Reverse order' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a sort field and persists the reverse flag to the URL', async () => {
    const { user } = renderSearchClient();
    await user.click(screen.getByRole('button', { name: /Advanced filters/ }));
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'released' } });
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search?sort=released&reverse=1', { scroll: false }));
    // Toggling reverse off drops it from the URL.
    await user.click(screen.getByRole('button', { name: 'Reverse order' }));
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search?sort=released', { scroll: false }));
  });

  it('resets the sort select back to default and clears the reverse flag', async () => {
    nav.searchParams = new URLSearchParams('sort=rating&reverse=1');
    renderSearchClient();
    expect(await screen.findByText('Advanced Result')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: '' } });
    // sort === '' -> reverse forced false; the URL drops both params.
    await waitFor(() => expect(nav.replace).toHaveBeenLastCalledWith('/search', { scroll: false }));
  });
});
