// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor, fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { MapEgsToVndbButton } from '@/components/MapEgsToVndbButton';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const SEARCH_RESULTS = {
  results: [
    { id: 'v90001', title: 'Result One', released: '2017-01-01', developers: [{ id: 'p90001', name: 'Studio X' }, { id: 'p90002', name: 'Studio Y' }] },
  ],
};

describe('MapEgsToVndbButton branches', () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/vndb') && (!init?.method || init.method === 'GET')) return json({ link: null });
      return json({ ok: true });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('compact variant with an existing vndbId shows the edit CTA', () => {
    renderWithProviders(
      <MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90005" variant="compact" />,
      { locale: 'en' },
    );
    const btn = screen.getByRole('button', { name: 'Edit mapping' });
    expect(btn.className).toContain('icon-chip');
  });

  it('renders the released date and the first two developer chips on a hit', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    expect(within(dialog).getByText('Studio X')).toBeInTheDocument();
    expect(within(dialog).getByText('Studio Y')).toBeInTheDocument();
    expect(within(dialog).getByText('v90001')).toBeInTheDocument();
  });

  it('closes the dialog via the header close button', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('clears the hit list when the query is emptied (trimmed-empty branch)', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    const input = within(dialog).getByLabelText('Search VNDB...') as HTMLInputElement;
    await user.clear(input);
    expect(await within(dialog).findByText('No matches. Refine the search.')).toBeInTheDocument();
  });

  it('shows the current-mapping link to the local VN page for a manual link', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ link: { egs_id: 123, vn_id: 'v90009', note: null, updated_at: 1700000000 } });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90009" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Edit mapping' }));
    const dialog = await screen.findByRole('dialog');
    const link = await within(dialog).findByRole('link', { name: 'v90009' });
    expect(link.getAttribute('href')).toBe('/vn/v90009');
  });
});
