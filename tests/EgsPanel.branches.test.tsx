// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { EgsPanel } from '@/components/EgsPanel';
import { dictionaries } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

const t = dictionaries.en;
const EGS_URL = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=31426';

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function panelGame(over: Partial<Parameters<typeof EgsPanel>[0]['initialGame']> = {}) {
  return {
    id: 31426,
    gamename: 'Game Y',
    brand_name: 'Studio X',
    brand_id: 123,
    model: 'PC',
    median: 80,
    average: 78.5,
    dispersion: 12,
    count: 42,
    sellday: '2024-01-26',
    playtime_median_minutes: 600,
    url: EGS_URL,
    ...over,
  };
}

function renderPanel(props: Partial<Parameters<typeof EgsPanel>[0]> = {}) {
  return renderWithProviders(
    <EgsPanel
      vnId="v90001"
      vndbRating={82}
      vndbVoteCount={120}
      vndbLengthMinutes={720}
      myPlaytimeMinutes={180}
      searchSeed="Seed"
      initialGame={panelGame()}
      initialSource="search"
      {...props}
    />,
    { locale: 'en' },
  );
}

describe('EgsPanel branches', () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    global.fetch = vi.fn(async () => json({ game: null, source: null }));
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the brand search chip, the year deep-link, and the "View on EGS" link', () => {
    renderPanel({ initialSource: 'manual' });
    expect(screen.getByText(t.egs.manualMatch)).toBeInTheDocument();
    const brandChip = screen.getByText('Studio X').closest('a');
    expect(brandChip).toHaveAttribute('href', '/search?q=Studio%20X');
    const yearChip = screen.getByText('2024').closest('a');
    expect(yearChip).toHaveAttribute('href', '/?yearMin=2024&yearMax=2024');
    const egsLink = screen.getByText(t.egs.openOnEgs).closest('a');
    expect(egsLink).toHaveAttribute('href', EGS_URL);
  });

  it('falls back to plain-text date when the sellday is not a parseable year', () => {
    renderPanel({ initialGame: panelGame({ sellday: 'unknown', brand_name: null }), initialSource: 'search' });
    // No year link, but the raw sellday is rendered as text.
    expect(screen.queryByRole('link', { name: '2024' })).toBeNull();
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('shows the combined score when only the EGS median is present (no VNDB rating)', () => {
    renderPanel({ vndbRating: null, vndbVoteCount: null, initialGame: panelGame({ median: 60 }) });
    // combinedScore(null, 60) === 60.
    expect(screen.getByText(t.egs.combined)).toBeInTheDocument();
    expect(screen.getAllByText('60 / 100').length).toBeGreaterThan(0);
  });

  it('omits the rating block entirely when both VNDB rating and EGS median are absent', () => {
    renderPanel({ vndbRating: null, vndbVoteCount: null, initialGame: panelGame({ median: null }) });
    // combinedScore(null, null) === null and vndbRating null -> block hidden.
    expect(screen.queryByText(t.egs.combined)).toBeNull();
    expect(screen.queryByText(t.egs.vndbRating)).toBeNull();
  });

  it('keeps the combined score equal to the VNDB rating when the EGS median is null', () => {
    renderPanel({ vndbRating: 90, vndbVoteCount: 10, initialGame: panelGame({ median: null }) });
    // combinedScore(90, null) === 90.
    expect(screen.getByText('90 / 100')).toBeInTheDocument();
  });

  it('hides the playtime total chip when neither side has any playtime', () => {
    renderPanel({
      myPlaytimeMinutes: 0,
      vndbLengthMinutes: null,
      initialGame: panelGame({ playtime_median_minutes: null }),
    });
    expect(screen.queryByText(t.egs.playtimeTitle)).toBeNull();
  });

  it('renders dash placeholders for the missing EGS metrics', () => {
    renderPanel({
      initialGame: panelGame({ median: null, average: null, count: null, playtime_median_minutes: null }),
    });
    // Median / Average / Votes / Median-playtime all collapse to "-".
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
  });

  it('opens the change-link picker seeded with the matched game name and closes it', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: t.egs.changeLink }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(t.egs.searchPlaceholder) as HTMLInputElement;
    // searchSeed prop wins over the game name as the initial query.
    expect(input.value).toBe('Seed');
    // Close the matched-state picker (covers its onClose callback).
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('falls back to the matched game name in the picker when no searchSeed is given', async () => {
    renderPanel({ searchSeed: null });
    fireEvent.click(screen.getByRole('button', { name: t.egs.changeLink }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(t.egs.searchPlaceholder) as HTMLInputElement;
    // initialQuery = searchSeed ?? game.gamename -> the game name.
    expect(input.value).toBe('Game Y');
  });

  it('toasts when the unlink request fails after confirmation', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'DELETE') return json({ error: 'unlink boom' }, 500);
      return json({ game: null, source: null });
    });
    renderPanel({ initialSource: 'manual' });
    const unlinkBtn = document.querySelector(`button[title="${t.egs.unlink}"]`) as HTMLButtonElement;
    fireEvent.click(unlinkBtn);
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.confirm }));
    expect(await screen.findByText('unlink boom')).toBeInTheDocument();
    // The matched game stays rendered since the unlink did not succeed.
    expect(screen.getByText('Game Y')).toBeInTheDocument();
  });

  it('shows the top-20 notice when the picker returns a full page of candidates', async () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      id: 1000 + i,
      gamename: `Candidate ${i}`,
      gamename_furigana: null,
      median: 70,
      count: 10,
      sellday: '2024-01-01',
    }));
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/egs/search')) return json({ candidates });
      return json({ game: null, source: null });
    });
    renderPanel({ initialGame: null, initialSource: 'manual-none', searchSeed: 'many' });
    fireEvent.click(screen.getByRole('button', { name: t.egs.searchEgs }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText(t.egs.top20Notice)).toBeInTheDocument();
  });

  it('refreshes the empty state and does not toast when the reload fails', async () => {
    const listener = vi.fn();
    window.addEventListener('vn:egs-changed', listener);
    let call = 0;
    global.fetch = vi.fn(async () => {
      call += 1;
      // First mount load succeeds (empty), the explicit refresh fails.
      if (call === 1) return json({ game: null, source: null });
      return json({ error: 'refresh down' }, 500);
    });
    renderPanel({ initialGame: null, initialSource: null });
    await screen.findByText(t.egs.noMatch);
    const refreshBtn = document.querySelector(`button[title="${t.egs.refresh}"]`) as HTMLButtonElement;
    fireEvent.click(refreshBtn);
    // The refresh error is surfaced via the inline error band, not a toast.
    expect(await screen.findByText('refresh down')).toBeInTheDocument();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener('vn:egs-changed', listener);
  });

  it('clears the picker candidate list when the query is emptied and re-submitted', async () => {
    const candidates = [
      { id: 1001, gamename: 'Candidate A', gamename_furigana: null, median: 70, count: 10, sellday: '2024-01-01' },
    ];
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/egs/search')) return json({ candidates });
      return json({ game: null, source: null });
    });
    renderPanel({ initialGame: null, initialSource: 'manual-none', searchSeed: 'seed-term' });
    fireEvent.click(screen.getByRole('button', { name: t.egs.searchEgs }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText('Candidate A');
    const input = within(dialog).getByLabelText(t.egs.searchPlaceholder);
    fireEvent.change(input, { target: { value: '   ' } });
    const form = input.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    // Empty/whitespace query resets candidates without a fetch.
    await waitFor(() => expect(within(dialog).queryByText('Candidate A')).toBeNull());
  });

  it('swallows an aborted picker search rejection without toasting', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/api/egs/search')) {
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      return json({ game: null, source: null });
    });
    renderPanel({ initialGame: null, initialSource: 'manual-none', searchSeed: 'seed-term' });
    fireEvent.click(screen.getByRole('button', { name: t.egs.searchEgs }));
    const dialog = await screen.findByRole('dialog');
    // The aborted search takes the silent return; the picker stays open with no error toast.
    expect(within(dialog).getByLabelText(t.egs.searchPlaceholder)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('surfaces the generic error when a refresh returns an undecodable snapshot', async () => {
    let call = 0;
    global.fetch = vi.fn(async () => {
      call += 1;
      if (call === 1) return json({ game: null, source: null });
      // Invalid `source` makes decodeVnEgsGameSnapshot return null.
      return json({ game: null, source: 'not-a-source' });
    });
    renderPanel({ initialGame: null, initialSource: null });
    await screen.findByText(t.egs.noMatch);
    const refreshBtn = document.querySelector(`button[title="${t.egs.refresh}"]`) as HTMLButtonElement;
    fireEvent.click(refreshBtn);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.common.error);
  });

  it('closes the picker from its X button', async () => {
    renderPanel({ initialGame: null, initialSource: 'manual-none', searchSeed: '' });
    fireEvent.click(screen.getByRole('button', { name: t.egs.searchEgs }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: t.common.close }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('renders the playtime breakdown rows for VNDB / EGS / mine and the sum chip', () => {
    renderPanel({
      vndbLengthMinutes: 720,
      myPlaytimeMinutes: 180,
      initialGame: panelGame({ playtime_median_minutes: 600 }),
    });
    expect(screen.getByText(t.egs.playtimeTitle)).toBeInTheDocument();
    expect(screen.getByText(t.egs.playtimeVndb)).toBeInTheDocument();
    expect(screen.getByText(t.egs.playtimeEgs)).toBeInTheDocument();
    expect(screen.getByText(t.egs.playtimeMine)).toBeInTheDocument();
    // myPlaytime + egs both > 0 -> the accent sum chip renders.
    expect(screen.getByText(t.egs.playtimeSum, { exact: false })).toBeInTheDocument();
  });
});
