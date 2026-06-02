// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateListForm } from '@/components/CreateListForm';
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
  toastMocks.success.mockReset();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CreateListForm', () => {
  it('does not submit a blank list name', () => {
    renderWithProviders(<CreateListForm />, { locale: 'en' });
    fireEvent.keyDown(screen.getByRole('textbox', { name: t.lists.createPrompt }), { key: 'Enter' });
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: t.lists.create })).toBeDisabled();
  });

  it('creates a trimmed list with a selected color and clears the form', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<CreateListForm />, { locale: 'en' });
    const name = screen.getByRole('textbox', { name: t.lists.createPrompt });
    const description = screen.getByRole('textbox', { name: t.lists.createHint });
    fireEvent.change(name, { target: { value: '  Favorites  ' } });
    fireEvent.change(description, { target: { value: '  Main shelf  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
    fireEvent.click(screen.getByRole('button', { name: t.lists.create }));

    await waitFor(() => expect(toastMocks.success).toHaveBeenCalledWith(t.lists.created));
    expect(fetch).toHaveBeenCalledWith('/api/lists', expect.objectContaining({
      body: JSON.stringify({ name: 'Favorites', description: 'Main shelf', color: '#3b82f6' }),
    }));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(name).toHaveValue('');
    expect(description).toHaveValue('');
  });

  it('submits an empty description and selected no-color state by keyboard', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<CreateListForm />, { locale: 'en' });
    const name = screen.getByRole('textbox', { name: t.lists.createPrompt });
    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    fireEvent.click(screen.getByRole('button', { name: t.lists.noColor }));
    fireEvent.change(name, { target: { value: 'Queue' } });
    fireEvent.keyDown(name, { key: 'Escape' });
    fireEvent.keyDown(name, { key: 'Enter' });

    await waitFor(() => expect(navigationMocks.refresh).toHaveBeenCalledTimes(1));
    expect(fetch).toHaveBeenCalledWith('/api/lists', expect.objectContaining({
      body: JSON.stringify({ name: 'Queue', description: null, color: null }),
    }));
  });

  it('reports server errors and suppresses duplicate submissions while busy', async () => {
    const mutation = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(mutation.promise);
    renderWithProviders(<CreateListForm />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.lists.createPrompt }), { target: { value: 'Favorites' } });
    const create = screen.getByRole('button', { name: t.lists.create });

    act(() => {
      fireEvent.click(create);
      fireEvent.click(create);
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => mutation.resolve(jsonResponse({ error: 'create failed' }, 500)));
    expect(toastMocks.error).toHaveBeenCalledWith('create failed');
  });

  it('ignores stale successful and rejected responses after unmount', async () => {
    const success = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(success.promise);
    const first = renderWithProviders(<CreateListForm />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.lists.createPrompt }), { target: { value: 'Favorites' } });
    fireEvent.click(screen.getByRole('button', { name: t.lists.create }));
    first.unmount();
    await act(async () => success.resolve(jsonResponse()));
    expect(toastMocks.success).not.toHaveBeenCalled();

    const failure = deferred<Response>();
    vi.mocked(fetch).mockReturnValue(failure.promise);
    const second = renderWithProviders(<CreateListForm />, { locale: 'en' });
    fireEvent.change(screen.getByRole('textbox', { name: t.lists.createPrompt }), { target: { value: 'Queue' } });
    fireEvent.click(screen.getByRole('button', { name: t.lists.create }));
    second.unmount();
    await act(async () => failure.reject(new Error('late failure')));
    expect(toastMocks.error).not.toHaveBeenCalled();
  });
});
