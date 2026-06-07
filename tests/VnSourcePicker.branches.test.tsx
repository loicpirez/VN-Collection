// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within, cleanup } from '@testing-library/react';
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

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src?: string | null; alt: string }) => <img src={src ?? ''} alt={alt} />,
}));

const t = dictionaries[DEFAULT_LOCALE];

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function vndbPayload() {
  return {
    results: [
      {
        id: 'v90002',
        title: 'Vndb Title',
        alttitle: null,
        released: '2021-05-01',
        rating: null,
        votecount: null,
        length_minutes: null,
        languages: ['ja'],
        platforms: ['win'],
        image: { url: 'https://cdn.test/c.jpg', thumbnail: 'https://cdn.test/t.jpg' },
        developers: [{ name: 'Studio X' }],
        in_collection: false,
      },
    ],
  };
}

function egsPayload() {
  return { candidates: [{ id: 5551, gamename: 'Egs Title', gamename_furigana: null, median: null, count: null, sellday: '2019-12-31' }] };
}

function routedFetch(opts: { library?: unknown; vndb?: unknown; egs?: unknown; fail?: 'library' | 'egs' } = {}) {
  return vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.startsWith('/api/collection/find')) {
      if (opts.fail === 'library') return new Response('err', { status: 500 });
      return json(opts.library ?? { matches: [] });
    }
    if (u.startsWith('/api/search?')) return json(opts.vndb ?? { results: [] });
    if (u.startsWith('/api/egs/search')) {
      if (opts.fail === 'egs') return new Response('err', { status: 500 });
      return json(opts.egs ?? { candidates: [] });
    }
    return json({});
  });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason?: Error) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('VnSourcePicker branches', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('surfaces an error when the library search request fails', async () => {
    global.fetch = routedFetch({ fail: 'library' });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} sources={['library']} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('surfaces an error when the EGS search request fails', async () => {
    global.fetch = routedFetch({ fail: 'egs' });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} sources={['egs']} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });

  it('renders the release-date suffix and the add icon on a VNDB row', async () => {
    const onPick = vi.fn<(hit: VnPickerHit) => void>();
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<VnSourcePicker onPick={onPick} sources={['vndb']} showAddIcon />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    const row = await screen.findByRole('button', { name: /Vndb Title/ });
    // released present -> the " / 2021-05-01" suffix renders (line 210 branch).
    expect(within(row).getByText(/2021-05-01/)).toBeInTheDocument();
    fireEvent.click(row);
    expect(onPick.mock.calls[0][0]).toMatchObject({ id: 'v90002', source: 'vndb', released: '2021-05-01' });
  });

  it('disables every result row when the picker is disabled', async () => {
    global.fetch = routedFetch({ egs: egsPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} sources={['egs']} disabled />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    const row = await screen.findByRole('button', { name: /Egs Title/ });
    expect((row as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the all-sources tab active across multiple sources', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload(), egs: egsPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} sources={['vndb', 'egs']} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByText('Vndb Title')).toBeInTheDocument());
    const tabGroup = screen.getByRole('group', { name: t.stock.batchSourceFilter as string });
    const allTab = within(tabGroup).getByRole('button', { name: `${t.stock.batchSourceAll as string} (2)` });
    expect(allTab.getAttribute('aria-pressed')).toBe('true');
    // Both group headers render under the all view.
    expect(screen.getByText('Egs Title')).toBeInTheDocument();
  });

  it('restores the all-sources view after a source tab was selected', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload(), egs: egsPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} sources={['vndb', 'egs']} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(screen.getByText('Vndb Title')).toBeInTheDocument());
    const tabGroup = screen.getByRole('group', { name: t.stock.batchSourceFilter as string });
    fireEvent.click(within(tabGroup).getByRole('button', { name: `${t.stock.batchSourceLabels.vndb} (1)` }));
    expect(screen.queryByText('Egs Title')).not.toBeInTheDocument();
    fireEvent.click(within(tabGroup).getByRole('button', { name: `${t.stock.batchSourceAll as string} (2)` }));
    expect(screen.getByText('Egs Title')).toBeInTheDocument();
  });

  it('treats invalid decoded payloads as empty source results', async () => {
    global.fetch = routedFetch({ library: { bogus: true }, vndb: { bogus: true }, egs: { bogus: true } });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(t.search.noResults as string)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces a pending debounce when the query changes quickly', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} sources={['vndb']} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'first' } });
    fireEvent.change(input, { target: { value: 'second' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(String((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0])).toContain('second');
  });

  it('ignores abort errors from every source', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    global.fetch = vi.fn(() => Promise.reject(abortError));
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'sample' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getByText(t.search.noResults as string)).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores successful stale responses after the query changes', async () => {
    const staleLibrary = deferredResponse();
    const staleVndb = deferredResponse();
    const staleEgs = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('old')) {
        if (u.startsWith('/api/collection/find')) return staleLibrary.promise;
        if (u.startsWith('/api/search?')) return staleVndb.promise;
        if (u.startsWith('/api/egs/search')) return staleEgs.promise;
      }
      if (u.startsWith('/api/collection/find')) return Promise.resolve(json({ matches: [] }));
      if (u.startsWith('/api/search?')) return Promise.resolve(json({ results: [] }));
      if (u.startsWith('/api/egs/search')) return Promise.resolve(json({ candidates: [] }));
      return Promise.resolve(json({}));
    });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'old' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(6));
    await act(async () => {
      staleLibrary.resolve(json({ matches: [{ id: 'v90100', title: 'Stale Library', image_thumb: null, local_image_thumb: null }] }));
      staleVndb.resolve(json(vndbPayload()));
      staleEgs.resolve(json(egsPayload()));
    });
    expect(screen.queryByText('Stale Library')).not.toBeInTheDocument();
    expect(screen.queryByText('Vndb Title')).not.toBeInTheDocument();
    expect(screen.queryByText('Egs Title')).not.toBeInTheDocument();
  });

  it('ignores failed stale responses after the query changes', async () => {
    const staleLibrary = deferredResponse();
    const staleVndb = deferredResponse();
    const staleEgs = deferredResponse();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('old')) {
        if (u.startsWith('/api/collection/find')) return staleLibrary.promise;
        if (u.startsWith('/api/search?')) return staleVndb.promise;
        if (u.startsWith('/api/egs/search')) return staleEgs.promise;
      }
      if (u.startsWith('/api/collection/find')) return Promise.resolve(json({ matches: [] }));
      if (u.startsWith('/api/search?')) return Promise.resolve(json({ results: [] }));
      if (u.startsWith('/api/egs/search')) return Promise.resolve(json({ candidates: [] }));
      return Promise.resolve(json({}));
    });
    renderWithProviders(<VnSourcePicker onPick={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'old' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(3));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'new' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(6));
    await act(async () => {
      staleLibrary.reject(new Error('stale library'));
      staleVndb.reject(new Error('stale vndb'));
      staleEgs.reject(new Error('stale egs'));
    });
    expect(screen.getByText(t.search.noResults as string)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
