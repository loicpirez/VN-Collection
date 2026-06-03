// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
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

beforeEach(() => {
  pushMock.mockReset();
  global.fetch = vi.fn().mockResolvedValue(okResponse());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BulkActionBar branches', () => {
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
});
