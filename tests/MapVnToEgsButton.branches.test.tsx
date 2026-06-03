// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor, fireEvent } from '@testing-library/react';
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

const RICH_CANDIDATES = {
  candidates: [
    { id: 11111, gamename: 'Candidate One', gamename_furigana: null, median: 80, count: 42, sellday: '2017-01-01' },
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

describe('MapVnToEgsButton branches', () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json(RICH_CANDIDATES);
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState(null, null));
      return json({ ok: true });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders an automatic (non-manual) current mapping with no reset button', async () => {
    // `extlink` is a non-manual provenance label; the dialog renders it as
    // "(automatic)" and omits the reset affordance.
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState('extlink', 44444));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('EGS #44444')).toBeInTheDocument();
    // "(automatic)" source label is shown next to the link.
    expect(within(dialog).getByText('(automatic)')).toBeInTheDocument();
    // No "Back to automatic" reset for an auto-sourced link.
    expect(within(dialog).queryByRole('button', { name: 'Back to automatic' })).toBeNull();
  });

  it('renders candidate metadata (sellday, score, votes)', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    // EGS id badge.
    expect(within(dialog).getByText('EGS #11111')).toBeInTheDocument();
    // Median score "80/100".
    expect(within(dialog).getByText('80/100')).toBeInTheDocument();
    // Vote count chip includes the localized "votes" label.
    expect(within(dialog).getByText(/42/)).toBeInTheDocument();
  });

  it('closes via the header close button', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('resets a manual-none pin via DELETE mode=clear-manual', async () => {
    let resetUrl: string | null = null;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).startsWith('/api/egs/search')) return json({ candidates: [] });
      if (String(url).includes('mode=clear-manual') && init?.method === 'DELETE') {
        resetUrl = String(url);
        return json({ ok: true });
      }
      if (String(url).includes('/erogamescape?search=0')) return json(mappingState('manual-none', null));
      return json({ ok: true });
    });
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No EGS counterpart (confirmed)')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Back to automatic' }));
    await waitFor(() => expect(resetUrl).toBe('/api/vn/v90001/erogamescape?mode=clear-manual'));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('clears candidates when the search box is emptied (trimmed-empty path)', async () => {
    const { user } = renderWithProviders(<MapVnToEgsButton vnId="v90001" seedQuery="Seed Name" />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Map to EGS' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate One');
    const input = within(dialog).getByLabelText('Search EGS...') as HTMLInputElement;
    await user.clear(input);
    // Empty query -> setCandidates([]) -> the empty hint shows.
    expect(await within(dialog).findByText('No matches. Refine the search.')).toBeInTheDocument();
  });
});
