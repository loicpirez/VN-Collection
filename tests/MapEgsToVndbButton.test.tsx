// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
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
    { id: 'v90001', title: 'Result One', released: '2017-01-01', developers: [{ id: 'p90001', name: 'Studio X' }] },
    { id: 'v90002', title: 'Result Two', released: null },
  ],
};

describe('MapEgsToVndbButton', () => {
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

  it('renders the inline trigger with the unmapped CTA when no vndbId is known', () => {
    renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Map to VNDB' })).toBeInTheDocument();
  });

  it('renders the edit CTA when a vndbId already exists', () => {
    renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90001" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Edit mapping' })).toBeInTheDocument();
  });

  it('renders the compact trigger variant', () => {
    renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} variant="compact" />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: /Map to VNDB/ });
    expect(btn.className).toContain('icon-chip');
  });

  it('opens the dialog and runs a debounced VNDB search seeded from the game name', async () => {
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));

    const dialog = await screen.findByRole('dialog');
    // Result rows appear once the debounced search resolves.
    expect(await within(dialog).findByText('Result One')).toBeInTheDocument();
    expect(within(dialog).getByText('Result Two')).toBeInTheDocument();
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).startsWith('/api/search?q=')),
    ).toBe(true);
  });

  it('pins a chosen VNDB id, toasts success, and refreshes the route', async () => {
    let mutationCall: { url: string; body: unknown } | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/vndb') && init?.method === 'POST') {
        mutationCall = { url: String(url), body: JSON.parse(String(init.body)) };
        return json({ ok: true });
      }
      return json({ link: null });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');

    const useButtons = within(dialog).getAllByRole('button', { name: 'Use this' });
    await user.click(useButtons[0]);

    await waitFor(() => expect(mutationCall).not.toBeNull());
    expect(mutationCall!.url).toBe('/api/egs/123/vndb');
    expect(mutationCall!.body).toEqual({ vndb_id: 'v90001' });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Mapping saved')).toBeInTheDocument();
  });

  it('pins "no VNDB counterpart" by sending a null vndb_id', async () => {
    let body: unknown = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      if (String(url).includes('/vndb') && init?.method === 'POST') {
        body = JSON.parse(String(init.body));
        return json({ ok: true });
      }
      return json({ link: null });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'No VNDB counterpart' }));
    await waitFor(() => expect(body).toEqual({ vndb_id: null }));
  });

  it('shows the existing-mapping panel and resets it via DELETE', async () => {
    let deleteCalled = false;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      if (String(url).includes('/vndb') && init?.method === 'DELETE') {
        deleteCalled = true;
        return json({ ok: true });
      }
      // Hydration: an existing manual link to v90005.
      return json({ link: { egs_id: 123, vn_id: 'v90005', note: null, updated_at: 1700000000 } });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId="v90005" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Edit mapping' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Current mapping/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'v90005' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Reset' }));
    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('renders the pinned-none status when the manual link has no vn', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ link: { egs_id: 123, vn_id: null, note: null, updated_at: 1700000000 } });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No VNDB counterpart (confirmed)')).toBeInTheDocument();
  });

  it('shows an error toast when the mutation fails', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/search')) return json(SEARCH_RESULTS);
      if (String(url).includes('/vndb') && init?.method === 'POST') return json({ error: 'link failed' }, 500);
      return json({ link: null });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Result One');
    await user.click(within(dialog).getAllByRole('button', { name: 'Use this' })[0]);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('link failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders the empty hint when the search returns nothing', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/search')) return json({ results: [] });
      return json({ link: null });
    });
    const { user } = renderWithProviders(<MapEgsToVndbButton egsId={123} gamename="Seed Name" vndbId={null} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to VNDB' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No matches. Refine the search.')).toBeInTheDocument();
  });
});
