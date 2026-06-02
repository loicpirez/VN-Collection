// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListAddVnForm } from '@/components/ListAddVnForm';
import { SeriesAddVnForm } from '@/components/SeriesAddVnForm';
import { SeriesRemoveVn } from '@/components/SeriesRemoveVn';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
}));

const confirmMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => navigationMocks,
}));

vi.mock('@/components/ToastProvider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/ToastProvider')>();
  return {
    ...actual,
    useToast: () => toastMocks,
  };
});

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
  toastMocks.error.mockReset();
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ListAddVnForm', () => {
  it('validates blank and malformed ids before submitting', () => {
    renderWithProviders(<ListAddVnForm listId={7} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.series.addVn });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: ' invalid ' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: t.series.addVn }));
    expect(toastMocks.error).toHaveBeenCalledWith(t.series.invalidListVnId);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('adds canonical VNDB and EGS ids by keyboard or click', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    const { rerender } = renderWithProviders(<ListAddVnForm listId={7} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.series.addVn });
    fireEvent.change(input, { target: { value: ' V90001 ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenLastCalledWith('/api/lists/7/items', expect.objectContaining({
      body: JSON.stringify({ vn_id: 'v90001' }),
    }));

    rerender(<ListAddVnForm listId={8} />);
    const resetInput = screen.getByRole('textbox', { name: t.series.addVn });
    expect(resetInput).toHaveValue('');
    fireEvent.change(resetInput, { target: { value: ' EGS_123 ' } });
    fireEvent.click(screen.getByRole('button', { name: t.series.addVn }));
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(2));
    expect(fetch).toHaveBeenLastCalledWith('/api/lists/8/items', expect.objectContaining({
      body: JSON.stringify({ vn_id: 'egs_123' }),
    }));
  });

  it('reports errors and suppresses duplicate submissions while busy', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    renderWithProviders(<ListAddVnForm listId={7} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.series.addVn });
    fireEvent.change(input, { target: { value: 'v90001' } });
    const add = screen.getByRole('button', { name: t.series.addVn });

    act(() => {
      fireEvent.click(add);
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => mutation.resolve(jsonResponse({ error: 'list add failed' }, 500)));
    expect(toastMocks.error).toHaveBeenCalledWith('list add failed');
  });

  it('ignores stale successful and rejected completions', async () => {
    const success = deferred<Response>();
    const failure = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(success.promise)
      .mockReturnValueOnce(failure.promise);
    const { rerender } = renderWithProviders(<ListAddVnForm listId={7} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.series.addVn });
    fireEvent.change(input, { target: { value: 'v90001' } });
    fireEvent.click(screen.getByRole('button', { name: t.series.addVn }));
    rerender(<ListAddVnForm listId={8} />);
    await act(async () => success.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: t.series.addVn }), { target: { value: 'v90002' } });
    fireEvent.click(screen.getByRole('button', { name: t.series.addVn }));
    rerender(<ListAddVnForm listId={9} />);
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});

describe('SeriesAddVnForm', () => {
  it('validates ids and clears successful additions', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<SeriesAddVnForm seriesId={3} />, { locale: 'en' });
    const input = screen.getByRole('textbox', { name: t.series.addVn });
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.add }));
    expect(screen.getByText(`${t.common.error}: ${t.series.invalidVnId}`)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: ' V90001 ' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.add }));
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/series/3/vn/v90001', expect.objectContaining({ method: 'POST' }));
    expect(input).toHaveValue('');
  });

  it('reports request errors and suppresses duplicate additions', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    renderWithProviders(<SeriesAddVnForm seriesId={3} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.series.addVn }), { target: { value: 'v90001' } });
    const add = screen.getByRole('button', { name: t.common.add });
    act(() => {
      fireEvent.click(add);
      fireEvent.click(add);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => mutation.resolve(jsonResponse({ error: 'series add failed' }, 500)));
    expect(screen.getByText(`${t.common.error}: series add failed`)).toBeInTheDocument();
  });

  it('ignores stale successful and rejected additions after the series changes', async () => {
    const success = deferred<Response>();
    const failure = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(success.promise)
      .mockReturnValueOnce(failure.promise);
    const { rerender } = renderWithProviders(<SeriesAddVnForm seriesId={3} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.series.addVn }), { target: { value: 'v90001' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.add }));
    rerender(<SeriesAddVnForm seriesId={4} />);
    await act(async () => success.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: t.series.addVn }), { target: { value: 'v90002' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.add }));
    rerender(<SeriesAddVnForm seriesId={5} />);
    await act(async () => failure.reject(new Error('late failure')));
    expect(screen.queryByText(`${t.common.error}: late failure`)).toBeNull();
  });
});

describe('SeriesRemoveVn', () => {
  it('cancels removal without fetching and does not bubble the card click', async () => {
    const parentClick = vi.fn();
    confirmMocks.confirm.mockResolvedValue(false);
    renderWithProviders(
      <div onClick={parentClick}>
        <SeriesRemoveVn seriesId={3} vnId="v90001" />
      </div>,
      { locale: 'en' },
    );
    fireEvent.click(screen.getByRole('button', { name: t.series.removeFromSeries }));
    await waitFor(() => expect(confirmMocks.confirm).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });

  it('removes a confirmed VN and refreshes the series', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<SeriesRemoveVn seriesId={3} vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.removeFromSeries }));
    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/series/3/vn/v90001', expect.objectContaining({ method: 'DELETE' }));
  });

  it('reports request errors and suppresses duplicate removals', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    renderWithProviders(<SeriesRemoveVn seriesId={3} vnId="v90001" />, { locale: 'en' });
    const remove = screen.getByRole('button', { name: t.series.removeFromSeries });
    act(() => {
      fireEvent.click(remove);
      fireEvent.click(remove);
    });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await act(async () => mutation.resolve(jsonResponse({ error: 'series remove failed' }, 500)));
    expect(toastMocks.error).toHaveBeenCalledWith('series remove failed');
  });

  it('ignores stale confirm and request completions after the item changes', async () => {
    const confirm = deferred<boolean>();
    const mutation = deferred<Response>();
    confirmMocks.confirm.mockReturnValueOnce(confirm.promise).mockResolvedValueOnce(true);
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    const { rerender } = renderWithProviders(<SeriesRemoveVn seriesId={3} vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.removeFromSeries }));
    rerender(<SeriesRemoveVn seriesId={3} vnId="v90002" />);
    await act(async () => confirm.resolve(true));
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: t.series.removeFromSeries }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender(<SeriesRemoveVn seriesId={4} vnId="v90002" />);
    await act(async () => mutation.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores stale rejected removals after the item changes', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    const { rerender } = renderWithProviders(<SeriesRemoveVn seriesId={3} vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.series.removeFromSeries }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    rerender(<SeriesRemoveVn seriesId={4} vnId="v90001" />);
    await act(async () => mutation.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
