// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadingGoalCard } from '@/components/ReadingGoalCard';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const toastMocks = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
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

const t = dictionaries.en;

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function goalResponse(target: number | null, finished = 0, year = 2026): Response {
  return jsonResponse({
    year,
    goal: target == null ? null : { year, target, updated_at: 1 },
    finished,
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
  toastMocks.success.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ReadingGoalCard', () => {
  it('shows skeletons while loading and the empty prompt after an unset goal resolves', async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(pending.promise);
    const { container } = renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    expect(container.querySelectorAll('[aria-hidden="true"].animate-pulse')).toHaveLength(2);

    await act(async () => pending.resolve(goalResponse(null)));
    expect(screen.getByText(t.readingGoal.placeholder)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.readingGoal.setCta })).toBeInTheDocument();
  });

  it('renders a clamped progress value for a loaded goal', async () => {
    vi.mocked(fetch).mockResolvedValue(goalResponse(5, 10));
    renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });

    expect(await screen.findByText('10/5')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: t.readingGoal.label })).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('button', { name: t.common.edit })).toBeInTheDocument();
  });

  it('supports edit cancellation by keyboard and button', async () => {
    vi.mocked(fetch).mockResolvedValue(goalResponse(8, 2));
    renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    await screen.findByText('2/8');

    fireEvent.click(screen.getByRole('button', { name: t.common.edit }));
    const input = screen.getByRole('textbox', { name: t.readingGoal.label });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.getByText('2/8')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: t.common.edit }));
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    expect(screen.getByText('2/8')).toBeInTheDocument();
  });

  it.each(['-1', '1001', '1.5'])('rejects invalid draft %s without posting', async (draft) => {
    vi.mocked(fetch).mockResolvedValue(goalResponse(null));
    renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingGoal.setCta }));
    const input = screen.getByRole('textbox', { name: t.readingGoal.label });
    fireEvent.change(input, { target: { value: draft } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(toastMocks.error).toHaveBeenCalledWith(t.common.error);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('saves a valid zero target by keyboard and refreshes the route', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(goalResponse(null))
      .mockResolvedValueOnce(jsonResponse({ goal: { year: 2026, target: 0, updated_at: 2 } }));
    renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingGoal.setCta }));
    const input = screen.getByRole('textbox', { name: t.readingGoal.label });
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(t.toast.saved));
    expect(fetch).toHaveBeenLastCalledWith('/api/reading-goal', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ year: 2026, target: 0 }),
    }));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText('0/0')).toBeInTheDocument();
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('reports HTTP and malformed save responses', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(goalResponse(null))
      .mockResolvedValueOnce(jsonResponse({ error: 'save failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ goal: { target: 'invalid' } }));
    renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingGoal.setCta }));
    const input = screen.getByRole('textbox', { name: t.readingGoal.label });
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith('save failed'));

    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await waitFor(() => expect(toastMocks.error).toHaveBeenCalledWith(t.common.error));
  });

  it('suppresses duplicate saves while a request is pending', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(goalResponse(null))
      .mockReturnValueOnce(mutation.promise);
    renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingGoal.setCta }));
    fireEvent.change(screen.getByRole('textbox', { name: t.readingGoal.label }), { target: { value: '12' } });
    const save = screen.getByRole('button', { name: t.common.save });
    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    await act(async () => mutation.resolve(jsonResponse({ goal: { year: 2026, target: 12, updated_at: 2 } })));
    expect(screen.getByText('0/12')).toBeInTheDocument();
  });

  it('falls back to the empty prompt after failed and malformed initial requests', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'load failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ year: 'invalid' }));
    const first = renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    expect(await screen.findByText(t.readingGoal.placeholder)).toBeInTheDocument();
    first.unmount();

    renderWithProviders(<ReadingGoalCard year={2027} />, { locale: 'en' });
    expect(await screen.findByText(t.readingGoal.placeholder)).toBeInTheDocument();
  });

  it('ignores stale initial reads after a year change', async () => {
    const first = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(goalResponse(7, 3, 2027));
    const { rerender } = renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    rerender(<ReadingGoalCard year={2027} />);
    expect(await screen.findByText('3/7')).toBeInTheDocument();

    await act(async () => first.resolve(goalResponse(99, 99, 2026)));
    expect(screen.getByText('3/7')).toBeInTheDocument();
    expect(screen.queryByText('99/99')).not.toBeInTheDocument();
  });

  it('ignores stale save success and rejection after a year change', async () => {
    const staleSuccess = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(goalResponse(null))
      .mockReturnValueOnce(staleSuccess.promise)
      .mockResolvedValueOnce(goalResponse(4, 1, 2027));
    const first = renderWithProviders(<ReadingGoalCard year={2026} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingGoal.setCta }));
    fireEvent.change(screen.getByRole('textbox', { name: t.readingGoal.label }), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    first.rerender(<ReadingGoalCard year={2027} />);
    await screen.findByText('1/4');
    await act(async () => staleSuccess.resolve(jsonResponse({ goal: { year: 2026, target: 12, updated_at: 2 } })));
    expect(toastMocks.success).not.toHaveBeenCalled();
    first.unmount();

    const staleFailure = deferred<Response>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(goalResponse(null, 0, 2028))
      .mockReturnValueOnce(staleFailure.promise)
      .mockResolvedValueOnce(goalResponse(6, 2, 2029));
    const second = renderWithProviders(<ReadingGoalCard year={2028} />, { locale: 'en' });
    fireEvent.click(await screen.findByRole('button', { name: t.readingGoal.setCta }));
    fireEvent.change(screen.getByRole('textbox', { name: t.readingGoal.label }), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    second.rerender(<ReadingGoalCard year={2029} />);
    await screen.findByText('2/6');
    await act(async () => staleFailure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
