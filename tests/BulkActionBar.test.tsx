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

describe('BulkActionBar', () => {
  it('shows the selected count and the bulk action controls', () => {
    renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark favorite' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Status...' })).toBeInTheDocument();
  });

  it('disables compare unless 2-4 VNs are selected', () => {
    const { rerender } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    expect(screen.getByRole('button', { name: /Compare/ })).toBeDisabled();
    rerender(<BulkActionBar selectedIds={['v90001', 'v90002', 'v90003']} onClear={vi.fn()} onApplied={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Compare/ })).toBeEnabled();
  });

  it('navigates to the compare view with the selected ids', async () => {
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: /Compare/ }));
    expect(pushMock).toHaveBeenCalledWith('/compare?ids=v90001%2Cv90002');
  });

  it('clears the selection via Cancel', async () => {
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={onClear} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('marks favorite across every selected id, then clears and reports applied', async () => {
    const onApplied = vi.fn();
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={onClear} onApplied={onApplied} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Mark favorite' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('/api/collection/v90001');
    expect(JSON.parse(calls[0][1].body)).toEqual({ favorite: true });
    expect(calls[1][0]).toBe('/api/collection/v90002');
    expect(await screen.findByText('2 VN updated')).toBeInTheDocument();
    await waitFor(() => expect(onClear).toHaveBeenCalled());
    expect(onApplied).toHaveBeenCalled();
  });

  it('collects per-id errors and surfaces them without clearing the selection', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(okResponse())
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'row failed' }), { status: 500, headers: { 'content-type': 'application/json' } }));
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={onClear} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Unmark favorite' }));
    expect(await screen.findByText('row failed')).toBeInTheDocument();
    expect(onClear).not.toHaveBeenCalled();
  });

  it('applies a status through the Status selector', async () => {
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Status...' }), 'completed');
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/collection/v90001', expect.objectContaining({ method: 'PATCH' })));
    expect(JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ status: 'completed' });
  });

  it('deletes every selected id after the confirm dialog is accepted', async () => {
    const onClear = vi.fn();
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={onClear} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][0]).toBe('/api/collection/v90001');
    expect(calls[0][1]).toMatchObject({ method: 'DELETE' });
    expect(await screen.findByText('2 VN deleted')).toBeInTheDocument();
    await waitFor(() => expect(onClear).toHaveBeenCalled());
  });

  it('does not delete when the confirm dialog is cancelled', async () => {
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001', 'v90002']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('applies a location through the Location selector', async () => {
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Location...' }), 'jp');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ location: 'jp' });
  });

  it('applies an edition type through the Edition selector', async () => {
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Edition...' }), 'limited');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ edition_type: 'limited' });
  });

  it('applies a box type through the Box selector', async () => {
    const { user } = renderWithProviders(
      <BulkActionBar selectedIds={['v90001']} onClear={vi.fn()} onApplied={vi.fn()} />,
      { locale: 'en' },
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Box type...' }), 'large');
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ box_type: 'large' });
  });

  it('shows a busy progress bar and aborts the run when Stop is clicked', async () => {
    let abortedFirst = false;
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        // First request hangs until aborted, exercising the stop path.
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
    await user.click(screen.getByRole('button', { name: 'Mark favorite' }));
    const status = await screen.findByRole('status');
    expect(within(status).getByText('0/2')).toBeInTheDocument();
    const stop = within(status).getByRole('button', { name: 'Stop' });
    await user.click(stop);
    await waitFor(() => expect(abortedFirst).toBe(true));
    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
  });
});
