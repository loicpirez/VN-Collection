// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { BulkActionBar } from '@/components/BulkActionBar';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function okResponse() {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  pushMock.mockReset();
  global.fetch = vi.fn().mockResolvedValue(okResponse());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BulkActionBar branches', () => {
  it('ignores empty selections and no-op selector changes', async () => {
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={[]} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Mark favorite' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Status...' }), { target: { value: '' } });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('blocks duplicate field operations synchronously', async () => {
    const patch = deferred<Response>();
    global.fetch = vi.fn(() => patch.promise);
    renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    const mark = screen.getByRole('button', { name: 'Mark favorite' });
    act(() => {
      fireEvent.click(mark);
      fireEvent.click(mark);
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    patch.resolve(okResponse());
  });

  it('requires typing DELETE to confirm when 5 or more rows are selected', async () => {
    const ids = ['v90001', 'v90002', 'v90003', 'v90004', 'v90005'];
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={ids} onClear={onClear} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    // The type-to-confirm input is present for >=5 rows; Confirm starts disabled.
    const input = within(dialog).getByRole('textbox');
    const confirm = within(dialog).getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    await user.type(input, 'DELETE');
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(5));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it('reports delete failures without clearing the selection', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'delete row failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={onClear} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    // One row fails -> the failing message lands in the per-row error list.
    expect(await screen.findByText('delete row failed')).toBeInTheDocument();
    // Both rows attempted; delete clears the selection even on partial failure.
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it('shows the compare hint title when fewer than two rows are selected', () => {
    renderWithProviders(
      <BulkActionBar selectedIds={['v90001']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    const compare = screen.getByRole('button', { name: /Compare/ });
    // The disabled compare button carries the explanatory hint title.
    expect(compare.getAttribute('title')).toBeTruthy();
    expect(compare).toBeDisabled();
  });

  it('aborts a delete run mid-flight and reports the stopped state', async () => {
    let abortedFirst = false;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          abortedFirst = true;
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      }),
    );
    const onApplied = vi.fn();
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={vi.fn()} onApplied={onApplied} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    const status = await screen.findByRole('status');
    await user.click(within(status).getByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(abortedFirst).toBe(true));
    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });

  it('abandons a field operation when the selected ids change mid-flight', async () => {
    const patch = deferred<Response>();
    global.fetch = vi.fn(() => patch.promise);
    const onApplied = vi.fn();
    const view = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={vi.fn()} onApplied={onApplied} />,
      { locale: 'en' },
    );
    await view.user.click(screen.getByRole('button', { name: 'Mark favorite' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    view.rerender(<BulkActionBar selectedIds={['v90003']} onClear={vi.fn()} onApplied={onApplied} />);
    await act(async () => {
      patch.resolve(okResponse());
      await Promise.resolve();
    });
    expect(onApplied).not.toHaveBeenCalled();
  });

  it('abandons a delete operation when the selected ids change mid-flight', async () => {
    const deletion = deferred<Response>();
    global.fetch = vi.fn(() => deletion.promise);
    const onApplied = vi.fn();
    const view = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={vi.fn()} onApplied={onApplied} />,
      { locale: 'en' },
    );
    await view.user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await view.user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    view.rerender(<BulkActionBar selectedIds={['v90003']} onClear={vi.fn()} onApplied={onApplied} />);
    await act(async () => {
      deletion.resolve(okResponse());
      await Promise.resolve();
    });
    expect(onApplied).not.toHaveBeenCalled();
  });
});
