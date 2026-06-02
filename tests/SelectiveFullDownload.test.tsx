// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { SelectiveFullDownload } from '@/components/SelectiveFullDownload';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

interface RowSeed {
  id: string;
  title: string;
  released?: string | null;
  added_at?: number | null;
  rating?: number | null;
}

function row(seed: RowSeed) {
  return {
    id: seed.id,
    title: seed.title,
    alttitle: null,
    released: seed.released ?? null,
    status: null,
    rating: seed.rating ?? null,
    user_rating: null,
    playtime_minutes: null,
    added_at: seed.added_at ?? null,
    updated_at: null,
  };
}

/** One non-paginated /api/collection page (has_more=false). */
function collectionPage(items: ReturnType<typeof row>[]) {
  return json({
    items,
    pagination: { page: 1, page_size: 500, returned: items.length, has_more: false },
  });
}

const THREE = [
  row({ id: 'v90001', title: 'Title Alpha', released: '2020-01-01', added_at: 100 }),
  row({ id: 'v90002', title: 'Title Beta', released: '2022-05-05', added_at: 300 }),
  row({ id: 'v90003', title: 'Title Gamma', released: '2021-03-03', added_at: 200 }),
];

describe('SelectiveFullDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the loading copy before the collection resolves', async () => {
    let resolveFetch: (r: Response) => void = () => {};
    global.fetch = vi.fn().mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve; }),
    );
    renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    expect(screen.getByText('Loading...')).not.toBeNull();
    resolveFetch(collectionPage(THREE));
    await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  });

  it('renders every VNDB row and the picked/total counter', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    expect(await screen.findByText('Title Alpha')).not.toBeNull();
    expect(screen.getByText('Title Beta')).not.toBeNull();
    expect(screen.getByText('Title Gamma')).not.toBeNull();
    expect(screen.getByText('0 / 3')).not.toBeNull();
  });

  it('drops synthetic egs_* rows that are not VNDB ids', async () => {
    const mixed = [...THREE, row({ id: 'egs_555', title: 'EGS Only Title' })];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(mixed));
    renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    expect(screen.queryByText('EGS Only Title')).toBeNull();
    expect(screen.getByText('0 / 3')).not.toBeNull();
  });

  it('shows the empty state when no row matches the filter', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    await user.type(screen.getByLabelText('Filter by title...'), 'no-such-title');
    expect(await screen.findByText('No VN matches.')).not.toBeNull();
  });

  it('selects all filtered rows then clears them', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(screen.getByText('3 / 3')).not.toBeNull();
    // With everything selected, the run button reflects the count.
    expect(screen.getByRole('button', { name: 'Run (3)' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('0 / 3')).not.toBeNull();
  });

  it('inverts the current selection', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: /^Title Alpha/ }));
    expect(screen.getByText('1 / 3')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Invert' }));
    // Alpha was on, the other two flip on -> 2 selected.
    expect(screen.getByText('2 / 3')).not.toBeNull();
  });

  it('toggles a single row off again on a second click', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    const rowBtn = screen.getByRole('button', { name: /^Title Beta/ });
    await user.click(rowBtn);
    expect(screen.getByText('1 / 3')).not.toBeNull();
    await user.click(rowBtn);
    expect(screen.getByText('0 / 3')).not.toBeNull();
  });

  it('shows the "all visible selected" hint when a filter is applied and all match', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    await user.type(screen.getByLabelText('Filter by title...'), 'Beta');
    await user.click(screen.getByRole('button', { name: 'Select all' }));
    expect(await screen.findByText('All visible VNs are selected.')).not.toBeNull();
  });

  it('toggles the sort direction icon when the order button is pressed', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { container, user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    // Default order is ascending -> ArrowUp icon present.
    expect(container.querySelector('.lucide-arrow-up')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ascending' }));
    expect(container.querySelector('.lucide-arrow-down')).not.toBeNull();
  });

  it('changes the sort key via the select dropdown', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    const select = screen.getByLabelText('Sort') as HTMLSelectElement;
    await user.selectOptions(select, 'added_at');
    expect(select.value).toBe('added_at');
  });

  it('sorts by a numeric key with nulls pushed last regardless of direction', async () => {
    const rows = [
      row({ id: 'v90001', title: 'Rated Low', rating: 10 }),
      row({ id: 'v90002', title: 'No Rating', rating: null }),
      row({ id: 'v90003', title: 'Rated High', rating: 90 }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { container, user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Rated Low');
    await user.selectOptions(screen.getByLabelText('Sort'), 'rating');
    // rating defaults to descending; the comparator's direction flip also moves
    // the null row, so descending lands it first, then High (90), then Low (10).
    const titlesDesc = [...container.querySelectorAll('li button .font-bold')].map((n) => n.textContent);
    expect(titlesDesc).toEqual(['No Rating', 'Rated High', 'Rated Low']);
    // Flip to ascending: Low (10), High (90), null pinned last.
    await user.click(screen.getByRole('button', { name: 'Descending' }));
    const titlesAsc = [...container.querySelectorAll('li button .font-bold')].map((n) => n.textContent);
    expect(titlesAsc).toEqual(['Rated Low', 'Rated High', 'No Rating']);
  });

  it('sorts by a string key (released) with a title tie-break', async () => {
    const rows = [
      row({ id: 'v90001', title: 'Title Beta', released: '2022-01-01' }),
      row({ id: 'v90002', title: 'Title Alpha', released: '2020-01-01' }),
      row({ id: 'v90003', title: 'Title Gamma', released: '2020-01-01' }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { container, user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Beta');
    await user.selectOptions(screen.getByLabelText('Sort'), 'released');
    // released defaults to descending: 2022 first; the two 2020s tie and fall to
    // the title tie-break, which the descending flip reverses (Gamma before Alpha).
    const titles = [...container.querySelectorAll('li button .font-bold')].map((n) => n.textContent);
    expect(titles).toEqual(['Title Beta', 'Title Gamma', 'Title Alpha']);
  });

  it('re-toggles the same sort key direction when picked twice', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    const { container, user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Title Alpha');
    // Title sorts ascending by default; re-selecting title flips to descending.
    await user.selectOptions(screen.getByLabelText('Sort'), 'title');
    const titles = [...container.querySelectorAll('li button .font-bold')].map((n) => n.textContent);
    expect(titles).toEqual(['Title Gamma', 'Title Beta', 'Title Alpha']);
  });

  it('forwards defaultFilters into the collection query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(collectionPage(THREE));
    global.fetch = fetchMock;
    renderWithProviders(
      <SelectiveFullDownload defaultFilters={{ status: 'playing', tag: 'g90' }} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain('status=playing');
    expect(calledUrl).toContain('tag=g90');
  });

  it('pre-checks defaultSelected rows on open', async () => {
    global.fetch = vi.fn().mockResolvedValue(collectionPage(THREE));
    renderWithProviders(
      <SelectiveFullDownload defaultSelected={new Set(['v90001', 'v90002'])} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    expect(screen.getByText('2 / 3')).not.toBeNull();
  });

  it('submits the picked ids, toasts success and fires onSubmitDone', async () => {
    const onSubmitDone = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(collectionPage(THREE))
      .mockResolvedValueOnce(json({ queued: 2 }));
    global.fetch = fetchMock;
    const { user } = renderWithProviders(
      <SelectiveFullDownload defaultSelected={new Set(['v90001', 'v90003'])} onSubmitDone={onSubmitDone} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: 'Run (2)' }));

    await waitFor(() => expect(onSubmitDone).toHaveBeenCalledWith(2));
    const submitCall = fetchMock.mock.calls.find((c) => String(c[0]) === '/api/collection/full-download');
    expect(submitCall).not.toBeUndefined();
    expect(submitCall![1].method).toBe('POST');
    expect(JSON.parse(submitCall![1].body as string)).toEqual({ vn_ids: ['v90001', 'v90003'] });
    expect(await screen.findByText(/Queued 2 VN/)).not.toBeNull();
    // Selection resets to empty after a successful submit.
    expect(screen.getByText('0 / 3')).not.toBeNull();
  });

  it('toasts an error when the submit response is not ok', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(collectionPage(THREE))
      .mockResolvedValueOnce(json({ error: 'queue refused' }, 500));
    global.fetch = fetchMock;
    const { user } = renderWithProviders(
      <SelectiveFullDownload defaultSelected={new Set(['v90001'])} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    await user.click(screen.getByRole('button', { name: 'Run (1)' }));
    expect(await screen.findByText('queue refused')).not.toBeNull();
  });

  it('toasts an error when the initial collection load fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(json({ error: 'collection down' }, 500));
    renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    expect(await screen.findByText('collection down')).not.toBeNull();
  });
});
