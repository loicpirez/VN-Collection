// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { MapVnToEgsButton } from '@/components/MapVnToEgsButton';

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

const EGS_CANDIDATES = {
  candidates: [
    { id: 11111, gamename: 'Candidate One', gamename_furigana: null, median: 80, count: 42, sellday: '2017-01-01' },
    { id: 22222, gamename: 'Candidate Two', gamename_furigana: null, median: null, count: null, sellday: null },
  ],
};

/** Hydration shape accepted by decodeVnEgsMappingState. */
function mappingState(source: string | null, egsId: number | null) {
  return {
    game: egsId != null && source !== 'manual-none' ? { id: egsId } : null,
    manual: source === 'manual' ? { egs_id: egsId } : source === 'manual-none' ? { egs_id: null } : null,
    source,
  };
}

describe('MapVnToEgsButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json(EGS_CANDIDATES);
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the inline trigger with the map CTA', () => {
    renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    expect(screen.getByRole('button', { name: 'Map to EGS' })).toBeInTheDocument();
  });

  it('renders the compact trigger variant', () => {
    renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" variant="compact" />, { locale: 'en' });
    const btn = screen.getByRole('button', { name: /Map to EGS/ });
    expect(btn.className).toContain('icon-chip');
  });

  it('honours a custom trigger class and the keep-menu-open attribute', () => {
    renderWithProviders(
      <MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" triggerClassName="my-trigger" keepMenuOpen />,
      { locale: 'en' },
    );
    const btn = screen.getByRole('button', { name: 'Map to EGS' });
    expect(btn.className).toContain('my-trigger');
    expect(btn).toHaveAttribute('data-menu-keep-open');
  });

  it('opens the dialog and runs a debounced EGS search seeded from the query', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('Candidate One')).toBeInTheDocument();
    expect(within(dialog).getByText('Candidate Two')).toBeInTheDocument();
    expect(
      (global.fetch as ReturnType<typeof vi.fn>).mock.calls.some(([u]) => String(u).startsWith('/api/egs/search?q=')),
    ).toBe(true);
  });

  it('pins a chosen EGS id, toasts success, and refreshes', async () => {
    let mutationCall: { url: string; body: unknown } | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json(EGS_CANDIDATES);
      if (String(url).includes('/erogamescape') && init?.method === 'POST') {
        mutationCall = { url: String(url), body: JSON.parse(String(init.body)) };
        return json({ ok: true });
      }
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    await user.click(within(dialog).getAllByRole('button', { name: 'Use this' })[0]);

    await waitFor(() => expect(mutationCall).not.toBeNull());
    expect(mutationCall!.url).toBe('/api/vn/v90001/erogamescape');
    expect(mutationCall!.body).toEqual({ egs_id: 11111 });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Mapping saved')).toBeInTheDocument();
  });

  it('pins "no EGS counterpart" via DELETE mode=manual-none', async () => {
    let deleteUrl: string | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('/erogamescape') && init?.method === 'DELETE') {
        deleteUrl = String(url);
        return json({ ok: true });
      }
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'No EGS counterpart' }));
    await waitFor(() => expect(deleteUrl).toBe('/api/vn/v90001/erogamescape?mode=manual-none'));
  });

  it('shows the current manual mapping and resets via mode=clear-manual', async () => {
    let resetUrl: string | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('mode=clear-manual') && init?.method === 'DELETE') {
        resetUrl = String(url);
        return json({ ok: true });
      }
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState('manual', 33333));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(/Current mapping/)).toBeInTheDocument();
    expect(within(dialog).getByText('EGS #33333')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Back to automatic' }));
    await waitFor(() => expect(resetUrl).toBe('/api/vn/v90001/erogamescape?mode=clear-manual'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('renders the pinned-none status from the hydration state', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState('manual-none', null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No EGS counterpart (confirmed)')).toBeInTheDocument();
  });

  it('shows an error toast when the mutation fails', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json(EGS_CANDIDATES);
      if (String(url).includes('/erogamescape') && init?.method === 'POST') return json({ error: 'pin failed' }, 500);
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    await user.click(within(dialog).getAllByRole('button', { name: 'Use this' })[0]);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('pin failed');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('renders the empty hint when the EGS search returns nothing', async () => {
    // Hydration returns non-ok so no current-mapping panel renders; the only
    // "empty" copy on screen is the candidate-list placeholder.
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('/erogamescape?search=0')) return json({ error: 'nope' }, 404);
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    const list = within(dialog).getByRole('list');
    expect(await within(list).findByText('No matches. Refine the search.')).toBeInTheDocument();
  });
});
