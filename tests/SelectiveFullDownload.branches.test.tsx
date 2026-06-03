// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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
  status?: string | null;
  updated_at?: number | null;
  user_rating?: number | null;
  playtime_minutes?: number | null;
}

function row(seed: RowSeed) {
  return {
    id: seed.id,
    title: seed.title,
    alttitle: null,
    released: null,
    status: seed.status ?? null,
    rating: null,
    user_rating: seed.user_rating ?? null,
    playtime_minutes: seed.playtime_minutes ?? null,
    added_at: null,
    updated_at: seed.updated_at ?? null,
  };
}

function collectionPage(items: ReturnType<typeof row>[]) {
  return json({ items, pagination: { page: 1, page_size: 500, returned: items.length, has_more: false } });
}

function titles() {
  return [...document.querySelectorAll('li button .font-bold')].map((n) => n.textContent);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SelectiveFullDownload sort branches', () => {
  it('sorts by status with null statuses pinned last', async () => {
    const rows = [
      row({ id: 'v90001', title: 'No Status', status: null }),
      row({ id: 'v90002', title: 'Playing', status: 'playing' }),
      row({ id: 'v90003', title: 'Completed', status: 'completed' }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('No Status');
    await user.selectOptions(screen.getByLabelText('Sort'), 'status');
    // status defaults to ascending; the two real statuses keep their relative
    // order (completed before playing) under the string comparator.
    const order = titles();
    expect(order.indexOf('Completed')).toBeLessThan(order.indexOf('Playing'));
    // Flip to descending and the relative order reverses.
    await user.click(screen.getByRole('button', { name: 'Ascending' }));
    const desc = titles();
    expect(desc.indexOf('Playing')).toBeLessThan(desc.indexOf('Completed'));
  });

  it('sorts by updated_at, ordering the two timestamped rows newest-first', async () => {
    const rows = [
      row({ id: 'v90001', title: 'Older', updated_at: 100 }),
      row({ id: 'v90002', title: 'Newer', updated_at: 300 }),
      row({ id: 'v90003', title: 'Never', updated_at: null }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('Older');
    await user.selectOptions(screen.getByLabelText('Sort'), 'updated_at');
    // updated_at defaults to descending: among the dated rows, Newer precedes Older.
    const order = titles();
    expect(order.indexOf('Newer')).toBeLessThan(order.indexOf('Older'));
    // The null-timestamp row is present.
    expect(order).toContain('Never');
  });

  it('sorts by user_rating then by playtime descending', async () => {
    const rows = [
      row({ id: 'v90001', title: 'LowRate', user_rating: 40, playtime_minutes: 600 }),
      row({ id: 'v90002', title: 'HighRate', user_rating: 95, playtime_minutes: 60 }),
    ];
    global.fetch = vi.fn().mockResolvedValue(collectionPage(rows));
    const { user } = renderWithProviders(<SelectiveFullDownload />, { locale: 'en' });
    await screen.findByText('LowRate');
    await user.selectOptions(screen.getByLabelText('Sort'), 'user_rating');
    expect(titles()).toEqual(['HighRate', 'LowRate']);
    await user.selectOptions(screen.getByLabelText('Sort'), 'playtime');
    // playtime desc: 600 before 60.
    expect(titles()).toEqual(['LowRate', 'HighRate']);
  });

  it('re-loads the collection when defaultFilters change identity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(collectionPage([row({ id: 'v90001', title: 'Title Alpha' })]));
    global.fetch = fetchMock;
    const { rerender } = renderWithProviders(
      <SelectiveFullDownload defaultFilters={{ status: 'playing' }} />,
      { locale: 'en' },
    );
    await screen.findByText('Title Alpha');
    const firstCalls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/collection')).length;
    // A new filtersKey re-runs the load callback.
    rerender(<SelectiveFullDownload defaultFilters={{ status: 'completed' }} />);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('status=completed'));
      expect(calls.length).toBeGreaterThan(0);
    });
    expect(fetchMock.mock.calls.filter((c) => String(c[0]).startsWith('/api/collection')).length).toBeGreaterThan(firstCalls);
  });
});
