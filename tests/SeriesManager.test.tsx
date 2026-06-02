// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SeriesManager } from '@/components/SeriesManager';
import { dictionaries } from '@/lib/i18n/dictionaries';
import type { SeriesRow } from '@/lib/types';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const confirmMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}));

vi.mock('@/components/ConfirmDialog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ConfirmDialog')>();
  return {
    ...actual,
    useConfirm: () => confirmMocks,
  };
});

vi.mock('@/components/ErrorAlert', () => ({
  ErrorAlert: ({ children, title }: { children: React.ReactNode; title: string }) => <div>{`${title}: ${children}`}</div>,
}));

const t = dictionaries.en;

function series(overrides: Partial<SeriesRow> = {}): SeriesRow {
  return {
    id: 1,
    name: 'Series',
    description: null,
    cover_path: null,
    banner_path: null,
    created_at: 1,
    updated_at: 2,
    ...overrides,
  };
}

function jsonResponse(payload: unknown = { ok: true }, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: Error) => void } {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason?: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SeriesManager', () => {
  it('renders the empty state and ignores a blank create action', () => {
    renderWithProviders(<SeriesManager initial={[]} />, { locale: 'en' });
    expect(screen.getByText(t.series.empty)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.series.create }));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('creates a trimmed series, inserts it in name order, clears inputs, and refreshes', async () => {
    const created = series({ id: 2, name: 'Alpha', description: 'First' });
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ series: created }));
    renderWithProviders(<SeriesManager initial={[series({ id: 1, name: 'Beta', description: 'Second' })]} />, { locale: 'en' });
    const name = screen.getByRole('textbox', { name: t.series.newName });
    const description = screen.getByRole('textbox', { name: t.series.newDescription });
    fireEvent.change(name, { target: { value: '  Alpha  ' } });
    fireEvent.change(description, { target: { value: '  First  ' } });
    fireEvent.click(screen.getByRole('button', { name: t.series.create }));

    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/series', expect.objectContaining({
      body: JSON.stringify({ name: 'Alpha', description: 'First' }),
    }));
    expect(name).toHaveValue('');
    expect(description).toHaveValue('');
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['AlphaFirst', 'BetaSecond']);
  });

  it('submits an empty description as null and resynchronizes updated initial rows', async () => {
    const created = series({ id: 2, name: 'Gamma' });
    vi.mocked(fetch).mockResolvedValue(jsonResponse({ series: created }));
    const { rerender } = renderWithProviders(<SeriesManager initial={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.series.newName }), { target: { value: 'Gamma' } });
    fireEvent.click(screen.getByRole('button', { name: t.series.create }));

    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/series', expect.objectContaining({
      body: JSON.stringify({ name: 'Gamma', description: null }),
    }));

    rerender(<SeriesManager initial={[series({ id: 3, name: 'Delta' })]} />);
    expect(screen.getByRole('link', { name: 'Delta' })).toHaveAttribute('href', '/series/3');
  });

  it('reports HTTP and malformed create responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'create failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ series: { id: 'invalid' } }));
    renderWithProviders(<SeriesManager initial={[]} />, { locale: 'en' });
    const name = screen.getByRole('textbox', { name: t.series.newName });
    fireEvent.change(name, { target: { value: 'Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: t.series.create }));
    expect(await screen.findByText(`${t.common.error}: create failed`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.series.create }));
    expect(await screen.findByText(`${t.common.error}: ${t.common.error}`)).toBeInTheDocument();
  });

  it('suppresses duplicate creates and ignores stale create responses after unmount', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const mounted = renderWithProviders(<SeriesManager initial={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.series.newName }), { target: { value: 'Alpha' } });
    const create = screen.getByRole('button', { name: t.series.create });
    act(() => {
      fireEvent.click(create);
      fireEvent.click(create);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    mounted.unmount();
    await act(async () => pending.resolve(jsonResponse({ series: series({ name: 'Alpha' }) })));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores stale rejected creates after unmount', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const mounted = renderWithProviders(<SeriesManager initial={[]} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.series.newName }), { target: { value: 'Alpha' } });
    fireEvent.click(screen.getByRole('button', { name: t.series.create }));
    mounted.unmount();
    await act(async () => pending.reject(new Error('late failure')));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('cancels deletion without fetching', async () => {
    confirmMocks.confirm.mockResolvedValue(false);
    renderWithProviders(<SeriesManager initial={[series()]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.delete }));
    await waitFor(() => expect(confirmMocks.confirm).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
  });

  it('deletes a confirmed series locally and refreshes', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<SeriesManager initial={[series()]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.delete }));

    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/series/1', expect.objectContaining({ method: 'DELETE' }));
    expect(screen.getByText(t.series.empty)).toBeInTheDocument();
  });

  it('reports delete failures and suppresses duplicate deletion while busy', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    renderWithProviders(<SeriesManager initial={[series()]} />, { locale: 'en' });
    const remove = screen.getByRole('button', { name: t.series.delete });
    act(() => {
      fireEvent.click(remove);
      fireEvent.click(remove);
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => pending.resolve(jsonResponse({ error: 'delete failed' }, 500)));
    expect(screen.getByText(`${t.common.error}: delete failed`)).toBeInTheDocument();
  });

  it('ignores stale confirmation and delete completions after unmount', async () => {
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    const first = renderWithProviders(<SeriesManager initial={[series()]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.delete }));
    first.unmount();
    await act(async () => confirmation.resolve(true));
    expect(fetch).not.toHaveBeenCalled();

    const deletion = deferred<Response>();
    confirmMocks.confirm.mockResolvedValue(true);
    vi.mocked(fetch).mockReturnValue(deletion.promise);
    const second = renderWithProviders(<SeriesManager initial={[series()]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.delete }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    second.unmount();
    await act(async () => deletion.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores stale rejected deletions after unmount', async () => {
    const deletion = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(deletion.promise);
    const mounted = renderWithProviders(<SeriesManager initial={[series()]} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.delete }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    mounted.unmount();
    await act(async () => deletion.reject(new Error('late failure')));
    expect(within(document.body).queryByText(`${t.common.error}: late failure`)).toBeNull();
  });
});
