// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { EGS_CHANGED_EVENT, EgsPanel } from '@/components/EgsPanel';
import { dictionaries, DEFAULT_LOCALE } from '@/lib/i18n/dictionaries';

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}));

const t = dictionaries[DEFAULT_LOCALE];
const egsUrl = 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=31426';

function panelGame(overrides: Partial<Parameters<typeof EgsPanel>[0]['initialGame']> = {}) {
  return {
    id: 31426,
    gamename: 'Sample EGS Game',
    brand_name: 'Sample Brand',
    brand_id: 123,
    model: 'PC',
    median: 80,
    average: 78.5,
    dispersion: 12,
    count: 42,
    sellday: '2024-01-26',
    playtime_median_minutes: 600,
    url: egsUrl,
    ...overrides,
  };
}

function apiGame(overrides: Record<string, unknown> = {}) {
  return {
    ...panelGame(),
    gamename_furigana: null,
    description: null,
    image_url: null,
    okazu: null,
    erogame: true,
    raw: { id: '31426' },
    ...overrides,
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function renderPanel(props: Partial<Parameters<typeof EgsPanel>[0]> = {}) {
  return renderWithProviders(
    <EgsPanel
      vnId="v90001"
      vndbRating={82}
      vndbVoteCount={120}
      vndbLengthMinutes={720}
      myPlaytimeMinutes={180}
      searchSeed="Sample"
      initialGame={panelGame()}
      initialSource="search"
      {...props}
    />,
  );
}

describe('EgsPanel', () => {
  beforeEach(() => {
    mocks.refresh.mockReset();
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/egs/search')) {
        return json({
          candidates: [
            { id: 31426, gamename: 'Sample EGS Game', gamename_furigana: null, median: 80, count: 42, sellday: '2024-01-26' },
          ],
        });
      }
      if (u === '/api/vn/v90001/erogamescape' && init?.method === 'POST') {
        return json({ game: apiGame({ gamename: 'Linked EGS Game' }), source: 'manual' });
      }
      if (u === '/api/vn/v90001/erogamescape' && init?.method === 'DELETE') {
        return json({ ok: true });
      }
      if (u === '/api/vn/v90001/erogamescape?refresh=1') {
        return json({ game: apiGame({ gamename: 'Refreshed EGS Game' }), source: 'manual' });
      }
      if (u === '/api/vn/v90001/erogamescape') {
        return json({ game: null, source: null });
      }
      return json({});
    });
  });

  it('renders a matched EGS game and refreshes the linked snapshot', async () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(EGS_CHANGED_EVENT, listener);
    renderPanel();
    expect(screen.getByText('Sample EGS Game')).toBeTruthy();
    expect(screen.getByText(t.egs.fuzzyMatch as string)).toBeTruthy();
    expect(screen.getAllByText('80 / 100').length).toBeGreaterThan(0);
    expect(screen.getByText(t.egs.playtimeSum as string, { exact: false })).toBeTruthy();

    const refreshButton = document.querySelector(`button[title="${t.egs.refresh}"]`);
    expect(refreshButton).toBeTruthy();
    fireEvent.click(refreshButton as HTMLButtonElement);
    await waitFor(() => expect(screen.getByText('Refreshed EGS Game')).toBeTruthy());
    await waitFor(() => expect(listener).toHaveBeenCalled());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    window.removeEventListener(EGS_CHANGED_EVENT, listener);
  });

  it('loads the empty state on mount when no initial snapshot exists', async () => {
    renderPanel({ initialGame: null, initialSource: null });
    await waitFor(() => expect(screen.getByText(t.egs.noMatch as string)).toBeTruthy());
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.some((call) => String(call[0]) === '/api/vn/v90001/erogamescape')).toBe(true);
  });

  it('shows a load error while keeping manual search available', async () => {
    global.fetch = vi.fn(async () => json({ error: 'load failed' }, 500));
    renderPanel({ initialGame: null, initialSource: null });
    await waitFor(() => expect(screen.getByText('load failed')).toBeTruthy());
    expect(screen.getByRole('button', { name: t.egs.searchEgs as string })).toBeTruthy();
  });

  it('searches EGS candidates and links a picked game', async () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(EGS_CHANGED_EVENT, listener);
    renderPanel({ initialGame: null, initialSource: 'manual-none' });
    fireEvent.click(screen.getByRole('button', { name: t.egs.searchEgs as string }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Sample EGS Game')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: t.egs.linkAction as string }));
    await waitFor(() => expect(screen.getByText('Linked EGS Game')).toBeTruthy());
    await waitFor(() => expect(listener).toHaveBeenCalled());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    window.removeEventListener(EGS_CHANGED_EVENT, listener);
  });

  it('shows no results in the picker and closes from the backdrop', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/api/egs/search')) return json({ candidates: [] });
      return json({ game: null, source: null });
    });
    renderPanel({ initialGame: null, initialSource: 'manual-none', searchSeed: '' });
    fireEvent.click(screen.getByRole('button', { name: t.egs.searchEgs as string }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText(t.egs.searchPlaceholder as string);
    fireEvent.change(input, { target: { value: 'Missing title' } });
    const form = input.closest('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form as HTMLFormElement);
    await waitFor(() => expect(within(dialog).getByText(t.egs.noResults as string)).toBeTruthy());
    const backdrop = dialog.parentElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop as HTMLElement);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('shows picker link errors without replacing the current empty state', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/api/egs/search')) {
        return json({
          candidates: [
            { id: 31426, gamename: 'Sample EGS Game', gamename_furigana: null, median: 80, count: 42, sellday: '2024-01-26' },
          ],
        });
      }
      if (u === '/api/vn/v90001/erogamescape' && init?.method === 'POST') return json({ error: 'link failed' }, 500);
      return json({ game: null, source: null });
    });
    renderPanel({ initialGame: null, initialSource: 'manual-none' });
    fireEvent.click(screen.getByRole('button', { name: t.egs.searchEgs as string }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(within(dialog).getByText('Sample EGS Game')).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: t.egs.linkAction as string }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('link failed'));
    expect(screen.getByText(t.egs.noMatch as string)).toBeTruthy();
  });

  it('unlinks a matched game after confirmation', async () => {
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener(EGS_CHANGED_EVENT, listener);
    renderPanel({ initialSource: 'manual' });
    expect(screen.getByText(t.egs.manualMatch as string)).toBeTruthy();
    const unlinkButton = document.querySelector(`button[title="${t.egs.unlink}"]`);
    expect(unlinkButton).toBeTruthy();
    fireEvent.click(unlinkButton as HTMLButtonElement);
    const confirmDialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: t.common.confirm as string }));
    await waitFor(() => expect(screen.getByText(t.egs.noMatch as string)).toBeTruthy());
    await waitFor(() => expect(listener).toHaveBeenCalled());
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    window.removeEventListener(EGS_CHANGED_EVENT, listener);
  });
});
