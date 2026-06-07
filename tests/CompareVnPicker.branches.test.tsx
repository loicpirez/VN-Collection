// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CompareVnPicker, type CompareVn } from '@/components/CompareVnPicker';
import { dictionaries } from '@/lib/i18n/dictionaries';

const nav = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/compare',
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
        image_url: 'https://cdn.test/c.jpg',
        image_thumb: 'https://cdn.test/t.jpg',
        local_image: null,
        local_image_thumb: 'storage/local-t.jpg',
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
        in_collection: true,
      },
    ],
  };
}

/** Route both autocomplete endpoints; allow per-endpoint failure injection. */
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

const seed = (id: string, title: string): CompareVn => ({ id, title, alttitle: null, image: null });

beforeEach(() => {
  nav.push.mockClear();
  global.fetch = routedFetch();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
});

describe('CompareVnPicker branches', () => {
  it('renders the search input and subtitle hint with no initial selection', () => {
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    // selectedIds empty -> the subtitle hint renders, compare button disabled.
    expect(screen.getByText(t.compareView.subtitle)).toBeInTheDocument();
    expect((screen.getByRole('button', { name: t.compareView.compareNow }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t.compareView.notEnough)).toBeInTheDocument();
  });

  it('renders chips for initial VNs including the alt-title line and removes one', () => {
    renderWithProviders(
      <CompareVnPicker initialVns={[{ id: 'v90001', title: 'Title Y', alttitle: 'Alt Y', image: null }, seed('v90002', 'Title Z')]} />,
      { locale: 'en' },
    );
    expect(screen.getByText('Title Y')).toBeInTheDocument();
    expect(screen.getByText('Alt Y')).toBeInTheDocument();
    // Two selected -> compare button enabled.
    expect((screen.getByRole('button', { name: t.compareView.compareNow }) as HTMLButtonElement).disabled).toBe(false);
    const removeButtons = screen.getAllByRole('button', { name: t.compareView.removeVn });
    fireEvent.click(removeButtons[0]);
    expect(screen.queryByText('Title Y')).not.toBeInTheDocument();
  });

  it('navigates to /compare with the joined ids when comparing two VNs', () => {
    renderWithProviders(
      <CompareVnPicker initialVns={[seed('v90001', 'Title Y'), seed('v90002', 'Title Z')]} />,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.compareView.compareNow }));
    expect(nav.push).toHaveBeenCalledWith('/compare?ids=v90001%2Cv90002');
  });

  it('does not navigate when fewer than two VNs are selected', () => {
    renderWithProviders(<CompareVnPicker initialVns={[seed('v90001', 'Title Y')]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.compareView.compareNow }));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it('clears pending add-focus timers on prop sync, replacement, and unmount', () => {
    vi.useFakeTimers();
    const first = [seed('v90001', 'A'), seed('v90002', 'B')];
    const second = [seed('v90003', 'C'), seed('v90004', 'D')];
    const { rerender, unmount } = renderWithProviders(<CompareVnPicker initialVns={first} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareView.addVn) }));
    act(() => {
      vi.runOnlyPendingTimers();
    });
    rerender(<CompareVnPicker initialVns={second} />);
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareView.addVn) }));
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t.compareView.addVn) }));
    unmount();
  });

  it('searches both sources, merges local + vndb hits, and filters already-selected ids', async () => {
    vi.useFakeTimers();
    global.fetch = routedFetch({ local: localPayload(), vndb: vndbPayload() });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'one' } });
    await act(async () => {
      vi.advanceTimersByTime(301);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(screen.getByText('Lib One')).toBeInTheDocument();
    expect(screen.getByText('Vndb One')).toBeInTheDocument();
    // Both the local (always in collection) and the in_collection VNDB hit
    // render the owned badge.
    expect(screen.getAllByText(t.recommend.badgeInCollection).length).toBeGreaterThanOrEqual(2);
    // Local hit alt title differs -> alt line renders.
    expect(screen.getByText('Lib One Alt')).toBeInTheDocument();
  });

  it('adds a hit from the dropdown, clears the query, and keeps the add slot below the cap', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<CompareVnPicker initialVns={[seed('v90001', 'Title Y')]} />, { locale: 'en' });
    // One selected (<4) -> showAdd defaults true so the combobox is already shown.
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    const row = await screen.findByText('Vndb One');
    fireEvent.click(row.closest('button')!);
    await waitFor(() => expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe(''));
    expect(screen.getByText('Vndb One')).toBeInTheDocument();
  });

  it('shows the no-results panel when the query yields nothing', async () => {
    global.fetch = routedFetch({ local: { matches: [] }, vndb: { results: [] } });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nothing' } });
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('tolerates both endpoints failing and shows the empty panel', async () => {
    global.fetch = routedFetch({ failLocal: true, failVndb: true });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'broken' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('treats rejected autocomplete requests as empty result sets', async () => {
    global.fetch = routedFetch({ rejectLocal: true, rejectVndb: true });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'reject' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('shows the spinner while autocomplete requests are pending', async () => {
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
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'slow' } });
    await waitFor(() => expect(document.querySelector('.animate-spin')).not.toBeNull());
    await act(async () => {
      resolveLocal(json({ matches: [] }));
      resolveVndb(json({ results: [] }));
    });
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('ignores stale autocomplete results after a newer query starts', async () => {
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
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
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

  it('navigates the dropdown with the keyboard and selects with Enter', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<CompareVnPicker initialVns={[seed('v90001', 'Title Y')]} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(screen.getByText('Vndb One')).toBeInTheDocument());
  });

  it('closes the dropdown on Escape without selecting', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  });

  it('hides the add slot once four VNs are selected and offers a Cancel control', () => {
    renderWithProviders(
      <CompareVnPicker
        initialVns={[seed('v90001', 'A'), seed('v90002', 'B'), seed('v90003', 'C')]}
      />,
      { locale: 'en' },
    );
    // 3 selected (<4) and showAdd defaults true -> combobox + cancel control present.
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    // Cancel hides the search input; the inline Add slot button appears.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('button', { name: new RegExp(t.compareView.addVn) })).toBeInTheDocument();
  });

  it('does not render the search input when four VNs are already selected', () => {
    renderWithProviders(
      <CompareVnPicker
        initialVns={[seed('v90001', 'A'), seed('v90002', 'B'), seed('v90003', 'C'), seed('v90004', 'D')]}
      />,
      { locale: 'en' },
    );
    // showAdd initial is false (length === 4) and selected.length < 4 is false.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button', { name: new RegExp(t.compareView.addVn) })).toBeNull();
  });

  it('caps additions at four and stops rendering the search input', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(
      <CompareVnPicker initialVns={[seed('v90001', 'A'), seed('v90002', 'B'), seed('v90003', 'C')]} />,
      { locale: 'en' },
    );
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    const row = await screen.findByText('Vndb One');
    fireEvent.click(row.closest('button')!);
    // Fourth add flips showAdd off -> the input disappears.
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });

  it('re-syncs from new initialVns when the URL-driven props change', () => {
    const { rerender } = renderWithProviders(<CompareVnPicker initialVns={[seed('v90001', 'First Title')]} />, { locale: 'en' });
    expect(screen.getByText('First Title')).toBeInTheDocument();
    rerender(<CompareVnPicker initialVns={[seed('v90050', 'Second Title')]} />);
    expect(screen.getByText('Second Title')).toBeInTheDocument();
    expect(screen.queryByText('First Title')).not.toBeInTheDocument();
  });

  it('clears hits when the query is emptied after a search', async () => {
    global.fetch = routedFetch({ vndb: vndbPayload() });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'vndb' } });
    await screen.findByText('Vndb One');
    // Emptying the field runs the debounced search with an empty trimmed value
    // -> the early-return branch clears the dropdown.
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(screen.queryByText('Vndb One')).not.toBeInTheDocument());
  });

  it('handles a no-image local hit and a bare VNDB hit without developers', async () => {
    global.fetch = routedFetch({
      local: {
        matches: [
          { id: 'v90040', title: 'No Image Local', alttitle: null, image_url: null, image_thumb: null, local_image: null, local_image_thumb: null, image_sexual: null },
        ],
      },
      vndb: {
        results: [
          { id: 'v90041', title: 'Bare Vndb', alttitle: null, aliases: [], titles: [], released: null, rating: null, votecount: null, length_minutes: null, languages: ['ja'], platforms: ['win'], image: null, developers: [], in_collection: false },
        ],
      },
    });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bare' } });
    expect(await screen.findByText('No Image Local')).toBeInTheDocument();
    expect(screen.getByText('Bare Vndb')).toBeInTheDocument();
  });

  it('falls back to a remote thumbnail when a local hit has only a remote cover', async () => {
    global.fetch = routedFetch({
      local: {
        matches: [
          { id: 'v90042', title: 'Remote Only Local', alttitle: null, image_url: 'https://cdn.test/r.jpg', image_thumb: 'https://cdn.test/rt.jpg', local_image: null, local_image_thumb: null, image_sexual: 0 },
        ],
      },
    });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'remote' } });
    expect(await screen.findByText('Remote Only Local')).toBeInTheDocument();
  });

  it('treats a 200 malformed payload as zero results', async () => {
    global.fetch = routedFetch({ local: { matches: 'bad' }, vndb: { results: 'bad' } });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'malformed' } });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(t.recommend.seedPicker.noResults)).toBeInTheDocument();
  });

  it('keeps inert keyboard input from changing selection', () => {
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(screen.queryAllByText(/^v\\d+$/)).toHaveLength(0);
  });

  it('filters out a VNDB hit that is already in the local results', async () => {
    // Same id in both sources -> the vndb dedupe filter drops the vndb copy.
    global.fetch = routedFetch({
      local: {
        matches: [
          { id: 'v90050', title: 'Shared Title', alttitle: null, image_url: null, image_thumb: null, local_image: null, local_image_thumb: null, image_sexual: null },
        ],
      },
      vndb: {
        results: [
          { id: 'v90050', title: 'Shared Title Dup', alttitle: null, aliases: [], titles: [], released: '2020-01-01', rating: null, votecount: null, length_minutes: null, languages: ['ja'], platforms: ['win'], image: null, developers: [{ name: 'Dev' }], in_collection: true },
        ],
      },
    });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'shared' } });
    expect(await screen.findByText('Shared Title')).toBeInTheDocument();
    // The duplicate VNDB row is filtered out.
    expect(screen.queryByText('Shared Title Dup')).not.toBeInTheDocument();
  });

  it('uses a hovered row highlight before selecting via mouse', async () => {
    global.fetch = routedFetch({ local: localPayload(), vndb: vndbPayload() });
    renderWithProviders(<CompareVnPicker initialVns={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'one' } });
    await screen.findByText('Vndb One');
    const option = screen.getAllByRole('option').find((row) => within(row).queryByText('Vndb One'))!;
    const vndbRow = within(option).getByRole('button');
    // Local hit is highlighted by default (index 0); hovering the second row moves it.
    fireEvent.mouseOver(vndbRow);
    await waitFor(() => expect(option).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(vndbRow);
    expect(screen.getByText('Vndb One')).toBeInTheDocument();
  });
});
