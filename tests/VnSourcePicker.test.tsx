// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { VnSourcePicker, type VnPickerHit } from '@/components/VnSourcePicker';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/** SafeImage requires the DisplaySettings provider; render a plain img instead. */
vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src?: string | null; alt: string }) => <img src={src ?? ''} alt={alt} />,
}));

const t = dictionaries[DEFAULT_LOCALE];

function libraryPayload() {
  return {
    matches: [
      { id: 'v90001', title: 'Lib Title One', image_url: 'https://cdn.test/c1.jpg', image_thumb: 'https://cdn.test/t1.jpg', local_image: null, local_image_thumb: null },
    ],
  };
}

function vndbPayload() {
  return {
    results: [
      {
        id: 'v90002',
        title: 'Vndb Title Two',
        alttitle: null,
        released: '2021-05-01',
        rating: null,
        votecount: null,
        length_minutes: null,
        languages: ['ja'],
        platforms: ['win'],
        image: { url: 'https://cdn.test/c2.jpg', thumbnail: 'https://cdn.test/t2.jpg' },
        developers: [{ name: 'Studio X' }],
        in_collection: false,
      },
    ],
  };
}

function egsPayload() {
  return {
    candidates: [
      { id: 5551, gamename: 'Egs Title Three', gamename_furigana: null, median: null, count: null, sellday: '2019-12-31' },
    ],
  };
}

/** Route the global fetch to a per-endpoint payload. */
function routedFetch(opts: { library?: unknown; vndb?: unknown; egs?: unknown; fail?: 'library' | 'vndb' | 'egs' } = {}) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.startsWith('/api/collection/find')) {
      if (opts.fail === 'library') return new Response('err', { status: 500 });
      return json(opts.library ?? { matches: [] });
    }
    if (u.startsWith('/api/search?')) {
      if (opts.fail === 'vndb') return new Response('err', { status: 500 });
      return json(opts.vndb ?? { results: [] });
    }
    if (u.startsWith('/api/egs/search')) {
      if (opts.fail === 'egs') return new Response('err', { status: 500 });
      return json(opts.egs ?? { candidates: [] });
    }
    return json({});
  });
}

describe('VnSourcePicker', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders only the search input until a query is typed', () => {
    global.fetch = routedFetch();
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    expect(screen.getByRole('textbox')).toBeTruthy();
    // No source tabs before typing.
    expect(screen.queryByRole('group', { name: t.stock.batchSourceFilter as string })).toBeNull();
  });

  it('debounces, queries all three sources, and renders grouped hits', async () => {
    global.fetch = routedFetch({ library: libraryPayload(), vndb: vndbPayload(), egs: egsPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByText('Lib Title One')).toBeTruthy());
    expect(screen.getByText('Vndb Title Two')).toBeTruthy();
    expect(screen.getByText('Egs Title Three')).toBeTruthy();
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/api/collection/find'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/api/search?'))).toBe(true);
    expect(urls.some((u) => u.startsWith('/api/egs/search'))).toBe(true);
  });

  it('clears results when the query is emptied', async () => {
    global.fetch = routedFetch({ library: libraryPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByText('Lib Title One')).toBeTruthy());
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } });
    await waitFor(() => expect(screen.queryByText('Lib Title One')).toBeNull());
  });

  it('invokes onPick with the normalized hit when a result row is clicked', async () => {
    const onPick = vi.fn<(hit: VnPickerHit) => void>();
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<VnSourcePicker onPick={onPick} showAddIcon />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByText('Vndb Title Two')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Vndb Title Two/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: 'v90002', source: 'vndb', title: 'Vndb Title Two' });
  });

  it('filters to a single source via the source tabs', async () => {
    global.fetch = routedFetch({ library: libraryPayload(), vndb: vndbPayload(), egs: egsPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByText('Lib Title One')).toBeTruthy());
    const tabGroup = screen.getByRole('group', { name: t.stock.batchSourceFilter as string });
    const vndbTab = within(tabGroup).getByRole('button', { name: `${t.stock.batchSourceLabels.vndb} (1)` });
    fireEvent.click(vndbTab);
    expect(vndbTab.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Vndb Title Two')).toBeTruthy();
    expect(screen.queryByText('Lib Title One')).toBeNull();
    expect(screen.queryByText('Egs Title Three')).toBeNull();
  });

  it('shows the no-results copy when every source returns empty', async () => {
    global.fetch = routedFetch({ library: { matches: [] }, vndb: { results: [] }, egs: { candidates: [] } });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'nothingmatches' } });
    await waitFor(() => expect(screen.getByText(t.search.noResults as string)).toBeTruthy());
  });

  it('surfaces an error message when a source request fails', async () => {
    global.fetch = routedFetch({ fail: 'vndb', library: libraryPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
  });

  it('only queries the sources passed in the sources prop', async () => {
    global.fetch = routedFetch({ egs: egsPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} sources={['egs']} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByText('Egs Title Three')).toBeTruthy());
    const urls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.startsWith('/api/collection/find'))).toBe(false);
    expect(urls.some((u) => u.startsWith('/api/search?'))).toBe(false);
    // With a single source the source-filter tab row is suppressed.
    expect(screen.queryByRole('group', { name: t.stock.batchSourceFilter as string })).toBeNull();
  });
});
