// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { cleanup, screen, within, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { AddMissingVnButton } from '@/components/AddMissingVnButton';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

function okResponse(body: unknown = { ok: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

describe('AddMissingVnButton', () => {
  beforeEach(() => {
    refresh.mockClear();
    global.fetch = vi.fn().mockResolvedValue(okResponse());
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the add affordance with the Plus icon', () => {
    const { container } = renderWithProviders(<AddMissingVnButton vnId="v90001" />, { locale: 'en' });
    const btn = within(container).getByRole('button', { name: 'Add to the collection' });
    expect(btn).toBeTruthy();
    expect(btn).not.toBeDisabled();
    expect(container.querySelector('svg.lucide-plus')).not.toBeNull();
  });

  it('POSTs status=planning, toasts success, refreshes, then shows the done check', async () => {
    const { user, container } = renderWithProviders(<AddMissingVnButton vnId="v90001" />, { locale: 'en' });
    const btn = within(container).getByRole('button');
    await user.click(btn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/collection/v90001');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ status: 'planning' });

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.querySelector('svg.lucide-check')).not.toBeNull());
    expect(within(container).getByRole('button')).toBeDisabled();
    expect(await screen.findByText('Added to collection')).toBeTruthy();
  });

  it('ignores a second click once the add is done', async () => {
    const { user, container } = renderWithProviders(<AddMissingVnButton vnId="v90001" />, { locale: 'en' });
    await user.click(within(container).getByRole('button'));
    await waitFor(() => expect(within(container).getByRole('button')).toBeDisabled());

    // Disabled button: a forced second click must not fire another request.
    await user.click(within(container).getByRole('button'));
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores same-frame duplicate click events while adding', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const { container } = renderWithProviders(<AddMissingVnButton vnId="v90003" />, { locale: 'en' });
    const button = within(container).getByRole('button');
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    resolveFetch(okResponse());
    await waitFor(() => expect(container.querySelector('svg.lucide-check')).not.toBeNull());
  });

  it('surfaces an error toast when the request fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'boom' }), { status: 500, headers: { 'content-type': 'application/json' } }),
    );
    const { user, container } = renderWithProviders(<AddMissingVnButton vnId="v90001" />, { locale: 'en' });
    await user.click(within(container).getByRole('button'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('boom');
    // Failure leaves the button re-enabled (no done state).
    expect(within(container).getByRole('button')).not.toBeDisabled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('suppresses stale success and failure completions after the VN changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const { user, container, rerender } = renderWithProviders(<AddMissingVnButton vnId="v90004" />, { locale: 'en' });
    await user.click(within(container).getByRole('button'));
    rerender(<AddMissingVnButton vnId="v90005" />);
    resolveFetch(okResponse());
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('Added to collection')).toBeNull();

    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn(() => new Promise<Response>((_resolve, reject) => { rejectFetch = reject; }));
    rerender(<AddMissingVnButton vnId="v90006" />);
    await user.click(within(container).getByRole('button'));
    rerender(<AddMissingVnButton vnId="v90007" />);
    rejectFetch(new Error('stale add error'));
    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText('stale add error')).toBeNull();
  });

  it('resets internal state when the vnId prop changes', async () => {
    const { user, container, rerender } = renderWithProviders(<AddMissingVnButton vnId="v90001" />, { locale: 'en' });
    await user.click(within(container).getByRole('button'));
    await waitFor(() => expect(within(container).getByRole('button')).toBeDisabled());

    rerender(<AddMissingVnButton vnId="v90002" />);
    // New identity re-enables the control and clears the done check.
    await waitFor(() => expect(within(container).getByRole('button')).not.toBeDisabled());
    expect(container.querySelector('svg.lucide-plus')).not.toBeNull();
  });
});
