// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ListMetaEditor } from '@/components/ListMetaEditor';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
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

function list(overrides: Partial<{
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  pinned: number;
}> = {}) {
  return {
    id: 1,
    name: 'Favorites',
    description: null,
    color: null,
    pinned: 0,
    ...overrides,
  };
}

function openEditor() {
  fireEvent.click(screen.getByRole('button', { name: t.lists.rename }));
}

async function flushAsync() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  navigationMocks.push.mockReset();
  navigationMocks.refresh.mockReset();
  confirmMocks.confirm.mockReset();
  confirmMocks.confirm.mockResolvedValue(true);
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ListMetaEditor', () => {
  it('opens, edits, colors, and cancels the metadata draft', () => {
    renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });
    expect(screen.getByRole('button', { name: t.lists.pin })).toBeInTheDocument();
    openEditor();

    const name = screen.getByRole('textbox', { name: t.series.nameField });
    const description = screen.getByRole('textbox', { name: t.series.descriptionField });
    expect(name).toHaveValue('Favorites');
    expect(description).toHaveValue('');
    expect(screen.getByRole('button', { name: t.lists.noColor })).toHaveClass('ring-2');

    fireEvent.click(screen.getByRole('button', { name: 'Red' }));
    expect(screen.getByRole('button', { name: 'Red' })).toHaveClass('ring-2');
    fireEvent.click(screen.getByRole('button', { name: t.lists.noColor }));
    expect(screen.getByRole('button', { name: t.lists.noColor })).toHaveClass('ring-2');
    fireEvent.change(name, { target: { value: '' } });
    expect(screen.getByRole('button', { name: t.common.save })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: t.common.cancel }));
    expect(screen.getByRole('button', { name: t.lists.rename })).toBeInTheDocument();
  });

  it('saves trimmed metadata, refreshes the route, and closes the editor', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });
    openEditor();
    fireEvent.change(screen.getByRole('textbox', { name: t.series.nameField }), { target: { value: '  Renamed  ' } });
    fireEvent.change(screen.getByRole('textbox', { name: t.series.descriptionField }), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Blue' }));
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await flushAsync();

    expect(fetch).toHaveBeenCalledWith('/api/lists/1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ name: 'Renamed', description: null, color: '#3b82f6' }),
    }));
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: t.lists.rename })).toBeInTheDocument();
  });

  it('preserves non-empty descriptions and supports pin plus unpin actions', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse());
    const rendered = renderWithProviders(<ListMetaEditor list={list({ description: 'Initial' })} />, { locale: 'en' });
    openEditor();
    fireEvent.change(screen.getByRole('textbox', { name: t.series.descriptionField }), { target: { value: '  Detail  ' } });
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    await flushAsync();
    expect(fetch).toHaveBeenLastCalledWith('/api/lists/1', expect.objectContaining({
      body: JSON.stringify({ name: 'Favorites', description: 'Detail', color: null }),
    }));

    fireEvent.click(screen.getByRole('button', { name: t.lists.pin }));
    await flushAsync();
    expect(fetch).toHaveBeenLastCalledWith('/api/lists/1', expect.objectContaining({
      body: JSON.stringify({ pinned: true }),
    }));

    rendered.rerender(<ListMetaEditor list={list({ pinned: 1 })} />);
    fireEvent.click(screen.getByRole('button', { name: t.lists.unpin }));
    await flushAsync();
    expect(fetch).toHaveBeenLastCalledWith('/api/lists/1', expect.objectContaining({
      body: JSON.stringify({ pinned: false }),
    }));
  });

  it('reports patch HTTP and network failures', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ error: 'patch failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });

    fireEvent.click(screen.getByRole('button', { name: t.lists.pin }));
    expect(await screen.findByText('patch failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.lists.pin }));
    expect(await screen.findByText('network failed')).toBeInTheDocument();
  });

  it('keeps the editor open when saving metadata fails', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'save failed' }, 500));
    renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: t.common.save }));
    expect(await screen.findByText('save failed')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: t.series.nameField })).toBeInTheDocument();
  });

  it('cancels or confirms deletion, navigates after success, and reports failures', async () => {
    confirmMocks.confirm
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse())
      .mockResolvedValueOnce(jsonResponse({ error: 'delete failed' }, 500))
      .mockRejectedValueOnce(new Error('network failed'));
    renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });

    fireEvent.click(screen.getByRole('button', { name: t.lists.delete }));
    await flushAsync();
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.lists.delete }));
    await flushAsync();
    expect(navigationMocks.push).toHaveBeenCalledWith('/lists');

    fireEvent.click(screen.getByRole('button', { name: t.lists.delete }));
    expect(await screen.findByText('delete failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.lists.delete }));
    expect(await screen.findByText('network failed')).toBeInTheDocument();
  });

  it('locks repeated delete events while confirmation is pending', async () => {
    const confirmation = deferred<boolean>();
    confirmMocks.confirm.mockReturnValueOnce(confirmation.promise);
    renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });
    const destroy = screen.getByRole('button', { name: t.lists.delete });
    act(() => {
      destroy.click();
      destroy.click();
    });
    expect(confirmMocks.confirm).toHaveBeenCalledTimes(1);
    await act(async () => confirmation.resolve(false));
  });

  it('locks repeated mutations and aborts obsolete writes after identity changes or teardown', async () => {
    const firstPatch = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(firstPatch.promise);
    const rendered = renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });
    const pin = screen.getByRole('button', { name: t.lists.pin });
    act(() => {
      pin.click();
      pin.click();
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal;
    rendered.rerender(<ListMetaEditor list={list({ id: 2 })} />);
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => firstPatch.resolve(jsonResponse()));
    expect(navigationMocks.refresh).not.toHaveBeenCalled();

    const rejectedPatch = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(rejectedPatch.promise);
    fireEvent.click(screen.getByRole('button', { name: t.lists.pin }));
    rendered.rerender(<ListMetaEditor list={list({ id: 3 })} />);
    await act(async () => rejectedPatch.reject(new Error('late patch')));
    expect(screen.queryByText('late patch')).not.toBeInTheDocument();

    const deletion = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(deletion.promise);
    fireEvent.click(screen.getByRole('button', { name: t.lists.delete }));
    await flushAsync();
    rendered.unmount();
    await act(async () => deletion.resolve(jsonResponse()));
    expect(navigationMocks.push).not.toHaveBeenCalled();

    vi.mocked(fetch).mockReset();
    const rejectedDeletion = deferred<Response>();
    vi.mocked(fetch).mockReturnValueOnce(rejectedDeletion.promise);
    const second = renderWithProviders(<ListMetaEditor list={list()} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.lists.delete }));
    await flushAsync();
    second.unmount();
    await act(async () => rejectedDeletion.reject(new Error('late delete')));
    expect(screen.queryByText('late delete')).not.toBeInTheDocument();
  });
});
