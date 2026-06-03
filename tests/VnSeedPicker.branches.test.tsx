// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { VnSeedPicker, type SeedChipData } from '@/components/VnSeedPicker';
import { dictionaries } from '@/lib/i18n/dictionaries';

const nav = vi.hoisted(() => ({ replace: vi.fn(), searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/recommendations',
  useSearchParams: () => nav.searchParams,
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
        image_url: 'https://cdn.test/c.jpg',
        image_thumb: 'https://cdn.test/t.jpg',
        local_image: null,
        local_image_thumb: null,
        image_sexual: 0,
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
        alttitle: 'Vndb Alt',
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
        in_collection: true,
      },
    ],
  };
}

function routedFetch(opts: { local?: unknown; vndb?: unknown; failLocal?: boolean; failVndb?: boolean } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const u = String(input);
    if (u.startsWith('/api/collection/find')) {
      if (opts.failLocal) return new Response('err', { status: 500 });
      return json(opts.local ?? { matches: [] });
    }
    if (u.startsWith('/api/search?')) {
      if (opts.failVndb) return new Response('err', { status: 500 });
      return json(opts.vndb ?? { results: [] });
    }
    return json({});
  });
}

const chip: SeedChipData = { id: 'v90001', title: 'Seed Title', alttitle: 'Seed Alt', image: { url: 'https://cdn.test/s.jpg', thumbnail: 'https://cdn.test/st.jpg', sexual: 0 } };

beforeEach(() => {
  nav.replace.mockClear();
  nav.searchParams = new URLSearchParams();
  global.fetch = routedFetch();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VnSeedPicker branches', () => {
  it('renders the search input when no seed chip is provided', () => {
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText(t.recommend.seedPicker.label)).toBeInTheDocument();
  });

  it('renders the seed chip with the current-seed caption and alt title', () => {
    renderWithProviders(<VnSeedPicker initialSeed={chip} />, { locale: 'en' });
    expect(screen.getByText('Seed Title')).toBeInTheDocument();
    expect(screen.getByText('Seed Alt')).toBeInTheDocument();
    expect(screen.getByText(t.recommend.seedPicker.currentSeed)).toBeInTheDocument();
    // Chip mode + valid seed -> no search input.
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('renders the invalid chip with an alert AND the replacement search input', () => {
    renderWithProviders(<VnSeedPicker initialSeed={chip} invalid />, { locale: 'en' });
    expect(screen.getByRole('alert')).toHaveTextContent(t.recommend.seedPicker.invalidSeed);
    // Invalid seeds keep the chip visible plus the search input so the id can be replaced.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('switches to edit mode via the Change button', () => {
    renderWithProviders(<VnSeedPicker initialSeed={chip} />, { locale: 'en' });
    fireEvent.click(screen.getByTestId('vn-seed-change'));
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('clears the seed via the Clear button and replaces the URL', async () => {
    nav.searchParams = new URLSearchParams('seed=v90001&mode=similar-to-vn');
    renderWithProviders(<VnSeedPicker initialSeed={chip} />, { locale: 'en' });
    fireEvent.click(screen.getByTestId('vn-seed-clear'));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).not.toContain('seed=v90001');
    expect(url).toContain('mode=similar-to-vn');
  });

  it('searches local-first then merges VNDB results and renders the badge', async () => {
    global.fetch = routedFetch({ local: localPayload(), vndb: vndbPayload() });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } });
    expect(await screen.findByText('Lib One')).toBeInTheDocument();
    expect(await screen.findByText('Vndb One')).toBeInTheDocument();
    expect(screen.getByText('Vndb Alt')).toBeInTheDocument();
    expect(screen.getAllByText(t.recommend.badgeInCollection).length).toBeGreaterThanOrEqual(1);
  });

  it('replaces the URL with the seed when a row is selected', async () => {
    nav.searchParams = new URLSearchParams('mode=similar-to-vn');
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'vndb' } });
    const row = await screen.findByText('Vndb One');
    fireEvent.click(row.closest('button')!);
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const url = nav.replace.mock.calls.at(-1)![0] as string;
    expect(url).toContain('seed=v90011');
  });

  it('shows the no-results panel for an empty query result', async () => {
    global.fetch = routedFetch({ local: { matches: [] }, vndb: { results: [] } });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nope' } });
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('tolerates both endpoints rejecting', async () => {
    global.fetch = routedFetch({ failLocal: true, failVndb: true });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'broken' } });
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('navigates the dropdown by keyboard and selects with Enter', async () => {
    nav.searchParams = new URLSearchParams();
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<VnSeedPicker initialSeed={null} autoFocusInput />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
  });

  it('closes the dropdown on Escape', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('auto-focuses the input when autoFocusInput is set', async () => {
    renderWithProviders(<VnSeedPicker initialSeed={null} autoFocusInput />, { locale: 'en' });
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  });

  it('announces the raw seed id when the URL has a seed but no chip data resolved', () => {
    nav.searchParams = new URLSearchParams('seed=v90099');
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    // seedId && !initialSeed && !invalid -> the polite announcement with the code renders.
    expect(screen.getByText('v90099')).toBeInTheDocument();
  });

  it('clears hits when the query is emptied after a search', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(screen.queryByText('Vndb One')).not.toBeInTheDocument());
  });

  it('renders local hits that resolve a local thumbnail path', async () => {
    global.fetch = routedFetch({
      local: {
        matches: [
          {
            id: 'v90030',
            title: 'Local Thumbnail Hit',
            alttitle: null,
            image_url: 'https://cdn.test/remote.jpg',
            image_thumb: 'https://cdn.test/remote-t.jpg',
            local_image: 'storage/local.jpg',
            local_image_thumb: 'storage/local-t.jpg',
            image_sexual: 0,
          },
        ],
      },
    });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'local' } });
    // local_image_thumb present -> the /api/files/ branch builds the image url.
    expect(await screen.findByText('Local Thumbnail Hit')).toBeInTheDocument();
  });

  it('handles a no-image local hit and a bare VNDB hit, deduping shared ids', async () => {
    global.fetch = routedFetch({
      local: {
        matches: [
          { id: 'v90050', title: 'Shared Local', alttitle: null, image_url: null, image_thumb: null, local_image: null, local_image_thumb: null, image_sexual: null },
        ],
      },
      vndb: {
        results: [
          // Same id as the local row -> filtered out by the localIds dedupe.
          { id: 'v90050', title: 'Shared Vndb Dup', alttitle: null, aliases: [], titles: [], released: null, rating: null, votecount: null, length_minutes: null, languages: ['ja'], platforms: ['win'], image: null, developers: [], in_collection: false },
          { id: 'v90051', title: 'Distinct Vndb', alttitle: null, aliases: [], titles: [], released: '2021-01-01', rating: null, votecount: null, length_minutes: null, languages: ['ja'], platforms: ['win'], image: null, developers: [], in_collection: false },
        ],
      },
    });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'shared' } });
    expect(await screen.findByText('Shared Local')).toBeInTheDocument();
    expect(await screen.findByText('Distinct Vndb')).toBeInTheDocument();
    expect(screen.queryByText('Shared Vndb Dup')).not.toBeInTheDocument();
  });

  it('treats a 200 malformed payload as zero results', async () => {
    global.fetch = routedFetch({ local: { matches: 'bad' }, vndb: { results: 'bad' } });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'malformed' } });
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('hovering a row updates the highlight', async () => {
    global.fetch = routedFetch({ local: localPayload(), vndb: vndbPayload() });
    renderWithProviders(<VnSeedPicker initialSeed={null} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } });
    const vndbRow = (await screen.findByText('Vndb One')).closest('button')!;
    const option = vndbRow.closest('[role="option"]')!;
    fireEvent.mouseEnter(vndbRow);
    await waitFor(() => expect(option.getAttribute('aria-selected')).toBe('true'));
  });
});
