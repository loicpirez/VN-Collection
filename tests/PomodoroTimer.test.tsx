// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PomodoroTimer } from '@/components/PomodoroTimer';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
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

const t = dictionaries.en;
const oneMinuteLogLabel = `${t.pomodoro.logTo} (1${t.year.minutesUnit})`;

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

function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}

function startAndAdvance(ms = 61_000) {
  fireEvent.click(screen.getByRole('button', { name: t.pomodoro.start }));
  advance(ms);
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  navigationMocks.refresh.mockReset();
  toastMocks.error.mockReset();
  toastMocks.success.mockReset();
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PomodoroTimer', () => {
  it('renders idle state and clamps target edits to the supported range', () => {
    renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={10} />, { locale: 'en' });
    const input = screen.getByRole('spinbutton', { name: t.pomodoro.label });
    expect(input).toHaveValue(25);
    expect(screen.getByText('25:00')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: t.pomodoro.label })).toHaveAttribute('aria-valuenow', '0');

    fireEvent.change(input, { target: { value: '0' } });
    expect(input).toHaveValue(1);
    fireEvent.change(input, { target: { value: '121' } });
    expect(input).toHaveValue(120);
    fireEvent.change(input, { target: { value: '30' } });
    expect(input).toHaveValue(30);
  });

  it('runs, pauses, resumes, resets, and publishes elapsed whole minutes', () => {
    const onElapsedChange = vi.fn();
    renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={10} onElapsedChange={onElapsedChange} />, { locale: 'en' });
    startAndAdvance();
    expect(screen.getByText('23:59')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.pomodoro.pause })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: oneMinuteLogLabel })).toBeInTheDocument();
    expect(onElapsedChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole('spinbutton', { name: t.pomodoro.label })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: t.pomodoro.pause }));
    expect(screen.getByRole('button', { name: t.pomodoro.resume })).toBeInTheDocument();
    advance(60_000);
    expect(screen.getByText('23:59')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.pomodoro.resume }));
    advance(60_000);
    expect(screen.getByText('22:59')).toBeInTheDocument();
    expect(onElapsedChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: t.pomodoro.reset }));
    expect(screen.getByText('25:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.pomodoro.start })).toBeInTheDocument();
    expect(onElapsedChange).toHaveBeenLastCalledWith(0);
  });

  it('shows completion at the configured target', () => {
    renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={0} />, { locale: 'en' });
    fireEvent.change(screen.getByRole('spinbutton', { name: t.pomodoro.label }), { target: { value: '1' } });
    startAndAdvance(60_000);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: t.pomodoro.label })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('button', { name: oneMinuteLogLabel })).toBeInTheDocument();
  });

  it('cancels logging and suppresses duplicate confirmation while one is pending', async () => {
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValue(confirmation.promise);
    renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={10} />, { locale: 'en' });
    startAndAdvance();
    const log = screen.getByRole('button', { name: oneMinuteLogLabel });
    fireEvent.click(log);
    fireEvent.click(log);
    expect(confirmMocks.confirm).toHaveBeenCalledTimes(1);
    await act(async () => confirmation.resolve(false));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('adds elapsed time to playtime and resets after a successful save', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={10} />, { locale: 'en' });
    startAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: oneMinuteLogLabel }));

    await flushAsync();
    expect(toastMocks.success).toHaveBeenCalledWith(t.toast.saved);
    expect(fetch).toHaveBeenCalledWith('/api/collection/v1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ playtime_minutes: 11 }),
    }));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: t.pomodoro.start })).toBeInTheDocument();
  });

  it('reports HTTP and network save failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'save failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={10} />, { locale: 'en' });
    startAndAdvance();
    const log = screen.getByRole('button', { name: oneMinuteLogLabel });
    fireEvent.click(log);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledWith('save failed');
    fireEvent.click(log);
    await flushAsync();
    expect(toastMocks.error).toHaveBeenCalledWith('network failed');
  });

  it('ignores stale confirmation and successful save completions after the VN changes', async () => {
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    const first = renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={10} />, { locale: 'en' });
    startAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: oneMinuteLogLabel }));
    first.rerender(<PomodoroTimer vnId="v2" currentMinutes={20} />);
    await act(async () => confirmation.resolve(true));
    expect(fetch).not.toHaveBeenCalled();
    first.unmount();

    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    const second = renderWithProviders(<PomodoroTimer vnId="v3" currentMinutes={30} />, { locale: 'en' });
    startAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: oneMinuteLogLabel }));
    await act(async () => undefined);
    second.rerender(<PomodoroTimer vnId="v4" currentMinutes={40} />);
    await act(async () => mutation.resolve(jsonResponse()));
    expect(toastMocks.success).not.toHaveBeenCalled();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('ignores stale rejected save completions after teardown', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    const mounted = renderWithProviders(<PomodoroTimer vnId="v1" currentMinutes={10} />, { locale: 'en' });
    startAndAdvance();
    fireEvent.click(screen.getByRole('button', { name: oneMinuteLogLabel }));
    await act(async () => undefined);
    const request = vi.mocked(fetch).mock.calls[0]?.[1];
    mounted.unmount();
    expect(request?.signal?.aborted).toBe(true);
    await act(async () => mutation.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
