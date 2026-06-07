// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SimilarSeedPicker, type SimilarSeedData } from '@/components/SimilarSeedPicker';
import { dictionaries } from '@/lib/i18n/dictionaries';

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/similar',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('@/components/SafeImage', () => ({
  SafeImage: ({ src, alt }: { src?: string | null; alt: string }) => <img src={src ?? ''} alt={alt} />,
}));

const t = dictionaries.en;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function localPayload() {
  return {
    matches: [
      {
        id: 'v90010',
        title: 'Lib One',
        alttitle: 'Lib One Alt',
        image_url: null,
        image_thumb: null,
        local_image: 'storage/local.jpg',
        local_image_thumb: 'storage/local-t.jpg',
        image_sexual: 1,
      },
    ],
  };
}

function vndbPayload() {
  return {
    results: [
      {
        id: 'v90011',
        title: 'Vndb One',
        alttitle: 'Vndb One',
        aliases: [],
        titles: [],
        released: '2022-03-04',
        rating: 70,
        votecount: 10,
        length_minutes: null,
        languages: ['ja'],
        platforms: ['win'],
        image: { url: 'https://cdn.test/v.jpg', thumbnail: 'https://cdn.test/vt.jpg' },
        developers: [{ name: 'Studio X' }],
        in_collection: false,
      },
    ],
  };
}

function routedFetch(opts: { local?: unknown; vndb?: unknown; failLocal?: boolean; failVndb?: boolean; rejectLocal?: boolean; rejectVndb?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.startsWith('/api/collection/find')) {
      if (opts.rejectLocal) throw new Error('local rejected');
      if (opts.failLocal) return new Response('err', { status: 500 });
      return json(opts.local ?? { matches: [] });
    }
    if (u.startsWith('/api/search?')) {
      if (opts.rejectVndb) throw new Error('vndb rejected');
      if (opts.failVndb) return new Response('err', { status: 500 });
      return json(opts.vndb ?? { results: [] });
    }
    return json({});
  });
}

const seed: SimilarSeedData = { id: 'v90001', title: 'Seed Title', alttitle: 'Seed Alt', image: { url: 'https://cdn.test/s.jpg', thumbnail: 'https://cdn.test/st.jpg', sexual: 0 } };

beforeEach(() => {
  nav.push.mockClear();
  global.fetch = routedFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('SimilarSeedPicker branches', () => {
  it('renders the search input when no seed is set', () => {
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(t.similar.pickSeedLabel)).toBeInTheDocument();
  });

  it('renders the current seed chip with its alt title and no search input', () => {
    renderWithProviders(<SimilarSeedPicker currentSeed={seed} />, { locale: 'en' });
    expect(screen.getByText('Seed Title')).toBeInTheDocument();
    expect(screen.getByText('Seed Alt')).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('clears the seed via the clear button and navigates to /similar', () => {
    renderWithProviders(<SimilarSeedPicker currentSeed={seed} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.recommend.seedPicker.clear }));
    expect(nav.push).toHaveBeenCalledWith('/similar');
    // Clearing flips to edit mode -> the search input appears.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('switches into edit mode when Change is clicked', () => {
    renderWithProviders(<SimilarSeedPicker currentSeed={seed} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.similar.changeSeed) }));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('searches both sources and merges local + vndb hits', async () => {
    global.fetch = routedFetch({ local: localPayload(), vndb: vndbPayload() });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } });
    expect(await screen.findByText('Lib One')).toBeInTheDocument();
    expect(screen.getByText('Vndb One')).toBeInTheDocument();
    expect(screen.getByText('Lib One Alt')).toBeInTheDocument();
    // The local hit always carries the owned badge.
    expect(screen.getAllByText(t.recommend.badgeInCollection).length).toBeGreaterThanOrEqual(1);
  });

  it('navigates to /similar?vn=ID when a result is clicked', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vndb' } });
    const row = await screen.findByText('Vndb One');
    fireEvent.click(row.closest('button')!);
    expect(nav.push).toHaveBeenCalledWith('/similar?vn=v90011');
  });

  it('shows the no-results panel for an empty search', async () => {
    global.fetch = routedFetch({ local: { matches: [] }, vndb: { results: [] } });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nothing' } });
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('tolerates both endpoints failing', async () => {
    global.fetch = routedFetch({ failLocal: true, failVndb: true });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'broken' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('selects a row with the keyboard via ArrowDown then Enter', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} autoFocus />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(nav.push).toHaveBeenCalledWith('/similar?vn=v90011');
  });

  it('closes the dropdown on Escape without navigating', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('auto-focuses the input when autoFocus is set and there is no seed', async () => {
    renderWithProviders(<SimilarSeedPicker currentSeed={null} autoFocus />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  });

  it('hovering a row updates the keyboard highlight', async () => {
    global.fetch = routedFetch({ local: localPayload(), vndb: vndbPayload() });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } });
    const vndbRow = (await screen.findByText('Vndb One')).closest('button')!;
    const option = vndbRow.closest('[role="option"]')!;
    await act(async () => {
      fireEvent.mouseOver(vndbRow);
    });
    await waitFor(() => expect(option.getAttribute('aria-selected')).toBe('true'), { timeout: 5000 });
  });

  it('clears hits when the query is emptied after a search', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.change(input, { target: { value: '   ' } });
    await waitFor(() => expect(screen.queryByText('Vndb One')).not.toBeInTheDocument());
  });

  it('handles a local hit without images and a VNDB hit lacking developers or cover', async () => {
    global.fetch = routedFetch({
      local: {
        matches: [
          {
            id: 'v90040',
            title: 'No Image Local',
            alttitle: null,
            image_url: null,
            image_thumb: null,
            local_image: null,
            local_image_thumb: null,
            image_sexual: null,
          },
        ],
      },
      vndb: {
        results: [
          {
            id: 'v90041',
            title: 'Bare Vndb',
            alttitle: null,
            aliases: [],
            titles: [],
            released: null,
            rating: null,
            votecount: null,
            length_minutes: null,
            languages: ['ja'],
            platforms: ['win'],
            image: null,
            developers: [],
            in_collection: false,
          },
        ],
      },
    });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bare' } });
    // No-image local hit -> image is null; bare vndb hit -> no dev/year line, no badge.
    expect(await screen.findByText('No Image Local')).toBeInTheDocument();
    expect(screen.getByText('Bare Vndb')).toBeInTheDocument();
  });

  it('falls back to remote thumbnails when only a remote cover exists on a local hit', async () => {
    global.fetch = routedFetch({
      local: {
        matches: [
          {
            id: 'v90042',
            title: 'Remote Only Local',
            alttitle: null,
            image_url: 'https://cdn.test/remote.jpg',
            image_thumb: 'https://cdn.test/remote-t.jpg',
            local_image: null,
            local_image_thumb: null,
            image_sexual: 0,
          },
        ],
      },
    });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remote' } });
    // localThumb null -> remoteThumb branch builds the image url.
    expect(await screen.findByText('Remote Only Local')).toBeInTheDocument();
  });

  it('treats a 200 malformed payload as zero results', async () => {
    global.fetch = routedFetch({ local: { matches: 'bad' }, vndb: { results: 'bad' } });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'malformed' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('treats rejected local and VNDB searches as empty result sets', async () => {
    global.fetch = routedFetch({ rejectLocal: true, rejectVndb: true });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'reject' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('shows the spinner while both searches are pending', async () => {
    let resolveLocal: (response: Response) => void = () => undefined;
    let resolveVndb: (response: Response) => void = () => undefined;
    const localResponse = new Promise<Response>((resolve) => {
      resolveLocal = resolve;
    });
    const vndbResponse = new Promise<Response>((resolve) => {
      resolveVndb = resolve;
    });
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.startsWith('/api/collection/find')) return localResponse;
      if (u.startsWith('/api/search?')) return vndbResponse;
      return Promise.resolve(json({}));
    });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slow' } });
    await waitFor(() => expect(document.querySelector('.animate-spin')).not.toBeNull());
    await act(async () => {
      resolveLocal(json({ matches: [] }));
      resolveVndb(json({ results: [] }));
    });
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('ignores results from a stale search request', async () => {
    let resolveOldLocal: (response: Response) => void = () => undefined;
    let resolveOldVndb: (response: Response) => void = () => undefined;
    const oldLocalResponse = new Promise<Response>((resolve) => {
      resolveOldLocal = resolve;
    });
    const oldVndbResponse = new Promise<Response>((resolve) => {
      resolveOldVndb = resolve;
    });
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const u = String(input);
      if (u.includes('old')) {
        if (u.startsWith('/api/collection/find')) return oldLocalResponse;
        if (u.startsWith('/api/search?')) return oldVndbResponse;
      }
      if (u.startsWith('/api/collection/find')) return Promise.resolve(json({ matches: [] }));
      if (u.startsWith('/api/search?')) return Promise.resolve(json(vndbPayload()));
      return Promise.resolve(json({}));
    });
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'old' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    fireEvent.change(input, { target: { value: 'new' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(4));
    await act(async () => {
      resolveOldLocal(json({ matches: [{ id: 'v90060', title: 'Old Local', alttitle: null, image_url: null, image_thumb: null, local_image: null, local_image_thumb: null, image_sexual: null }] }));
      resolveOldVndb(json({ results: [{ id: 'v90061', title: 'Old Vndb', alttitle: null, aliases: [], titles: [], released: null, rating: null, votecount: null, length_minutes: null, languages: ['ja'], platforms: ['win'], image: null, developers: [], in_collection: false }] }));
    });
    expect(await screen.findByText('Vndb One')).toBeInTheDocument();
    expect(screen.queryByText('Old Local')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Vndb')).not.toBeInTheDocument();
  });

  it('keeps keyboard input inert when no result is highlighted', () => {
    renderWithProviders(<SimilarSeedPicker currentSeed={null} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('renders seed chip covers from full URLs and empty image data', () => {
    renderWithProviders(<SimilarSeedPicker currentSeed={{ id: 'v90070', title: 'URL Seed', image: { url: 'https://cdn.test/full.jpg', thumbnail: '', sexual: 0 } }} />, { locale: 'en' });
    expect(screen.getByAltText('URL Seed')).toHaveAttribute('src', 'https://cdn.test/full.jpg');
    cleanup();
    renderWithProviders(<SimilarSeedPicker currentSeed={{ id: 'v90071', title: 'Empty Seed' }} />, { locale: 'en' });
    expect(screen.getByAltText('Empty Seed')).not.toHaveAttribute('src');
  });

  it('re-syncs to edit mode when the seed id changes', () => {
    const { rerender } = renderWithProviders(<SimilarSeedPicker currentSeed={seed} />, { locale: 'en' });
    expect(screen.getByText('Seed Title')).toBeInTheDocument();
    rerender(<SimilarSeedPicker currentSeed={null} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });
});
