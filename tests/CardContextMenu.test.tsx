// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { CardContextMenu } from '@/components/CardContextMenu';

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: refreshMock, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function okResponse() {
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const BASE = {
  vnId: 'v90001',
  status: 'playing' as const,
  favorite: false,
  developer: null,
  publisher: null,
  anchor: { x: 100, y: 100 },
};

beforeEach(() => {
  pushMock.mockReset();
  refreshMock.mockReset();
  global.fetch = vi.fn().mockResolvedValue(okResponse());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('CardContextMenu', () => {
  it('renders the quick-actions menu with every status row and marks the active status', () => {
    renderWithProviders(<CardContextMenu {...BASE} onClose={vi.fn()} />, { locale: 'en' });
    const menu = screen.getByRole('menu', { name: 'Quick actions' });
    expect(menu).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Playing/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Completed/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Mark as favorite/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Open detail page' })).toBeInTheDocument();
  });

  it('PATCHes a status change, toasts, refreshes, and closes', async () => {
    const onClose = vi.fn();
    const onChange = vi.fn();
    const { user } = renderWithProviders(
      <CardContextMenu {...BASE} onClose={onClose} onChange={onChange} />,
      { locale: 'en' },
    );
    await user.click(screen.getByRole('menuitem', { name: /Completed/ }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      '/api/collection/v90001',
      expect.objectContaining({ method: 'PATCH' }),
    ));
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ status: 'completed' });
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(refreshMock).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('clears the active status when its row is clicked again', async () => {
    const { user } = renderWithProviders(<CardContextMenu {...BASE} onClose={vi.fn()} />, { locale: 'en' });
    await user.click(screen.getByRole('menuitem', { name: /Playing/ }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ status: null });
  });

  it('optimistically toggles favorite and sends the new value', async () => {
    const { user } = renderWithProviders(<CardContextMenu {...BASE} onClose={vi.fn()} />, { locale: 'en' });
    await user.click(screen.getByRole('menuitem', { name: /Mark as favorite/ }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body).toEqual({ favorite: true });
  });

  it('rolls back the optimistic favorite and surfaces an error toast on failure', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'patch boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    const onClose = vi.fn();
    const { user } = renderWithProviders(<CardContextMenu {...BASE} onClose={onClose} />, { locale: 'en' });
    await user.click(screen.getByRole('menuitem', { name: /Mark as favorite/ }));
    expect(await screen.findByText('patch boom')).toBeInTheDocument();
    // After rollback the label returns to "Favorite" (not "Remove favorite").
    expect(screen.getByRole('menuitem', { name: /Mark as favorite/ })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders developer and publisher navigation sections when ids are present', () => {
    renderWithProviders(
      <CardContextMenu
        {...BASE}
        developer={{ id: 'p90001', name: 'Studio X' }}
        publisher={{ id: 'p90002', name: 'Studio Y' }}
        onClose={vi.fn()}
      />,
      { locale: 'en' },
    );
    const openDev = screen.getByRole('menuitem', { name: 'Open developer' });
    expect(openDev).toHaveAttribute('href', '/producer/p90001');
    expect(screen.getByRole('menuitem', { name: 'Filter by this developer' })).toHaveAttribute('href', '/?producer=p90001');
    expect(screen.getByRole('menuitem', { name: 'Open publisher' })).toHaveAttribute('href', '/producer/p90002');
    expect(screen.getByRole('menuitem', { name: 'Filter by this publisher' })).toHaveAttribute('href', '/?publisher=p90002');
  });

  it('closes on Escape', async () => {
    const onClose = vi.fn();
    renderWithProviders(<CardContextMenu {...BASE} onClose={onClose} />, { locale: 'en' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('keeps ordinary keys in the menu and closes on outside pointer input', () => {
    const onClose = vi.fn();
    renderWithProviders(<CardContextMenu {...BASE} onClose={onClose} />, { locale: 'en' });
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes via the dedicated close button', async () => {
    const onClose = vi.fn();
    const { user } = renderWithProviders(<CardContextMenu {...BASE} onClose={onClose} />, { locale: 'en' });
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('moves focus across menu items with arrow keys', async () => {
    renderWithProviders(<CardContextMenu {...BASE} onClose={vi.fn()} />, { locale: 'en' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('role', 'menuitem'));
    fireEvent.keyDown(window, { key: 'End' });
    fireEvent.keyDown(window, { key: 'Home' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(document.activeElement).toHaveAttribute('role', 'menuitem');
  });

  it('skips focus restore when the previous active element has disappeared', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const view = renderWithProviders(<CardContextMenu {...BASE} onClose={vi.fn()} />, { locale: 'en' });
    trigger.remove();
    view.unmount();
    expect(document.activeElement).not.toBe(trigger);
  });

  it('ignores duplicate mutations while the first request is pending', () => {
    const pending = deferredResponse();
    global.fetch = vi.fn().mockReturnValue(pending.promise);
    renderWithProviders(<CardContextMenu {...BASE} onClose={vi.fn()} />, { locale: 'en' });
    const button = screen.getByRole('menuitem', { name: /Mark as favorite/ });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores a successful mutation that resolves after unmount', async () => {
    const pending = deferredResponse();
    global.fetch = vi.fn().mockReturnValue(pending.promise);
    const onClose = vi.fn();
    const onChange = vi.fn();
    const view = renderWithProviders(<CardContextMenu {...BASE} onClose={onClose} onChange={onChange} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Completed/ }));
    view.unmount();
    await act(async () => {
      pending.resolve(okResponse());
      await pending.promise;
    });
    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it('ignores a failed mutation that resolves after unmount', async () => {
    const pending = deferredResponse();
    global.fetch = vi.fn().mockReturnValue(pending.promise);
    const view = renderWithProviders(<CardContextMenu {...BASE} onClose={vi.fn()} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Mark as favorite/ }));
    view.unmount();
    await act(async () => {
      pending.resolve(new Response(JSON.stringify({ error: 'late boom' }), { status: 500, headers: { 'content-type': 'application/json' } }));
      await pending.promise;
    });
    expect(screen.queryByText('late boom')).toBeNull();
  });

  it('surfaces status mutation failures without closing', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'status boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    const onClose = vi.fn();
    renderWithProviders(<CardContextMenu {...BASE} onClose={onClose} />, { locale: 'en' });
    fireEvent.click(screen.getByRole('menuitem', { name: /Completed/ }));
    expect(await screen.findByText('status boom')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
