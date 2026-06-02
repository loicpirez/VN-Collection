// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListCardActions } from '@/components/ListCardActions';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

const confirmMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  prompt: vi.fn(),
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

function list(overrides: Partial<{ id: number; name: string; pinned: number }> = {}) {
  return {
    id: 1,
    name: 'Favorites',
    pinned: 0,
    ...overrides,
  };
}

function openMenu() {
  fireEvent.click(screen.getByRole('button', { name: t.nav.openMenu }));
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  confirmMocks.confirm.mockReset();
  confirmMocks.prompt.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  confirmMocks.prompt.mockResolvedValue(null);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ListCardActions', () => {
  it('toggles its menu and supports keyboard navigation', () => {
    renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });
    const trigger = screen.getByRole('button', { name: t.nav.openMenu });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    openMenu();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu');
    const items = screen.getAllByRole('menuitem');
    items[0]?.focus();

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'End' });
    expect(items[2]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Tab' });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    openMenu();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('pins and unpins a list while locking repeated mutations', async () => {
    const pin = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(pin.promise)
      .mockResolvedValueOnce(jsonResponse());
    const rendered = renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });
    openMenu();
    const pinButton = screen.getByRole('menuitem', { name: t.lists.pin });
    act(() => {
      pinButton.click();
      pinButton.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/lists/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ pinned: true }),
    }));
    await act(async () => pin.resolve(jsonResponse()));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    rendered.rerender(<ListCardActions list={list({ pinned: 1 })} />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.unpin }));
    await flushAsync();
    expect(fetch).toHaveBeenLastCalledWith('/api/lists/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ pinned: false }),
    }));
  });

  it('validates rename prompts and skips cancelled, empty, and unchanged names', async () => {
    confirmMocks.prompt
      .mockImplementationOnce(async ({ validate }: { validate: (value: string) => string | null }) => {
        expect(validate(' ')).toBe(t.lists.renameRequired);
        expect(validate('Renamed')).toBeNull();
        return null;
      })
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('Favorites')
      .mockResolvedValueOnce('Renamed');
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });

    for (let index = 0; index < 4; index += 1) {
      openMenu();
      fireEvent.click(screen.getByRole('menuitem', { name: t.lists.rename }));
      await flushAsync();
    }

    expect(confirmMocks.prompt).toHaveBeenCalledWith({
      title: t.lists.rename,
      initial: 'Favorites',
      validate: expect.any(Function),
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('/api/lists/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed' }),
    }));
  });

  it('locks repeated rename and delete events while their dialogs are pending', async () => {
    const prompt = deferred<string | null>();
    const confirmation = deferred<boolean>();
    confirmMocks.prompt.mockReturnValueOnce(prompt.promise);
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });

    openMenu();
    const rename = screen.getByRole('menuitem', { name: t.lists.rename });
    act(() => {
      rename.click();
      rename.click();
    });
    expect(confirmMocks.prompt).toHaveBeenCalledTimes(1);
    await act(async () => prompt.resolve(null));

    openMenu();
    const destroy = screen.getByRole('menuitem', { name: t.lists.delete });
    act(() => {
      destroy.click();
      destroy.click();
    });
    expect(confirmMocks.confirm).toHaveBeenCalledTimes(1);
    await act(async () => confirmation.resolve(false));
  });

  it('cancels or confirms deletion and reports patch plus delete failures', async () => {
    confirmMocks.confirm
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'patch failed' }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: 'delete failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.pin }));
    expect(await screen.findByText('patch failed')).toBeInTheDocument();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.delete }));
    await flushAsync();
    expect(fetch).toHaveBeenCalledTimes(1);

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.delete }));
    expect(await screen.findByText('delete failed')).toBeInTheDocument();

    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.delete }));
    expect(await screen.findByText('network failed')).toBeInTheDocument();
  });

  it('deletes a list and refreshes the route after confirmation', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.delete }));
    await flushAsync();

    expect(confirmMocks.confirm).toHaveBeenCalledWith({ message: t.lists.deleteConfirm, tone: 'danger' });
    expect(fetch).toHaveBeenCalledWith('/api/lists/1', expect.objectContaining({ method: 'DELETE' }));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('aborts obsolete prompt, patch, and delete work after identity changes or teardown', async () => {
    const prompt = deferred<string | null>();
    confirmMocks.prompt.mockReturnValueOnce(prompt.promise);
    const first = renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.rename }));
    first.rerender(<ListCardActions list={list({ id: 2 })} />);
    await act(async () => prompt.resolve('Renamed'));
    expect(fetch).not.toHaveBeenCalled();

    const patch = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(patch.promise);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.pin }));
    const patchSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    first.rerender(<ListCardActions list={list({ id: 3 })} />);
    expect(patchSignal?.aborted).toBe(true);
    await act(async () => patch.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();

    const rejectedPatch = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(rejectedPatch.promise);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.pin }));
    first.rerender(<ListCardActions list={list({ id: 4 })} />);
    await act(async () => rejectedPatch.reject(new Error('late patch')));
    expect(screen.queryByText('late patch')).not.toBeInTheDocument();

    const deletion = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(deletion.promise);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.delete }));
    await flushAsync();
    const deleteSignal = vi.mocked(fetch).mock.calls[2]?.[1]?.signal;
    first.unmount();
    expect(deleteSignal?.aborted).toBe(true);
    await act(async () => deletion.reject(new Error('late delete')));
    expect(screen.queryByText('late delete')).not.toBeInTheDocument();

    vi.mocked(fetch).mockReset();
    const successfulDeletion = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(successfulDeletion.promise);
    const second = renderWithProviders(<ListCardActions list={list()} />, { locale: 'en' });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.lists.delete }));
    await flushAsync();
    second.unmount();
    await act(async () => successfulDeletion.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });
});
