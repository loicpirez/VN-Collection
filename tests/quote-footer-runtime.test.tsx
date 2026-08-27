// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteFooter } from '@/components/QuoteFooter';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

vi.mock('@/components/QuoteAvatar', () => ({
  QuoteAvatar: () => <span data-testid="avatar" />,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
}));

vi.mock('@/components/PageSpaceFrame', () => ({
  PageSpaceFrame: ({ children }: { children: ReactNode }) => (
    <div className="page-space-frame" data-page-space-scope="library">{children}</div>
  ),
}));

const t = dictionaries.en;

function quoteResponse(character: { id: string; name: string; original: string | null } | null = { id: 'c90001', name: 'Heroine', original: null }): Response {
  return new Response(JSON.stringify({
    source: 'all',
    quote: {
      id: 'q90001',
      quote: 'Quoted line',
      score: 1,
      character,
      vn: { id: 'v90001', title: 'Visual novel' },
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue(quoteResponse());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('QuoteFooter hover loader', () => {
  it('loads only after interaction and renders linked character and VN attribution', async () => {
    const { container } = renderWithProviders(<QuoteFooter />, { locale: 'en' });
    const footer = container.firstElementChild as HTMLElement;
    expect(footer).toHaveClass('visual-viewport-anchor-bottom', 'z-layer-footer', 'pointer-events-none');
    expect(footer).not.toHaveClass('fixed', 'bg-bg', 'bg-bg/95', 'backdrop-blur');
    expect(footer).toHaveAttribute('data-visual-viewport-anchor');
    const frame = footer.querySelector<HTMLElement>('.page-space-frame');
    const surface = footer.querySelector<HTMLElement>('[data-quote-footer-surface]');
    const panel = footer.querySelector<HTMLElement>('[data-quote-footer-panel]');
    expect(frame).toHaveAttribute('data-page-space-scope', 'library');
    expect(surface).toHaveClass('pointer-events-auto', 'bg-bg');
    expect(surface).toHaveStyle({ paddingBottom: 'env(safe-area-inset-bottom)' });
    expect(panel).toHaveClass('bg-bg');
    expect(panel).not.toHaveClass('bg-bg/95');
    const toggle = screen.getByRole('button', { name: t.quotes.expand });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveClass('min-h-[44px]', 'can-hover:sm:min-h-0');
    const refresh = screen.getByRole('button', { name: t.quotes.shuffle });
    expect(refresh).toHaveClass('min-h-[44px]', 'min-w-[44px]', 'opacity-100');
    expect(refresh).toHaveClass('can-hover:sm:min-h-0', 'can-hover:sm:min-w-0', 'can-hover:sm:opacity-0');
    expect(footer.querySelector('.max-h-12')).toBeInTheDocument();
    expect(screen.getByText(t.quotes.hoverHint)).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.pointerEnter(footer, { pointerType: 'mouse' });
    expect(refresh).toHaveClass('min-h-[44px]', 'min-w-[44px]');
    expect(refresh).not.toHaveClass('can-hover:sm:min-h-0', 'can-hover:sm:min-w-0');
    expect(screen.getByRole('button', { name: t.quotes.collapse })).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByText(/Quoted line/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Heroine/ })).toHaveAttribute('href', '/character/c90001');
    expect(screen.getByRole('link', { name: 'Visual novel' })).toHaveAttribute('href', '/vn/v90001');
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    fireEvent.pointerLeave(footer, { pointerType: 'mouse' });
    fireEvent.focus(toggle);
    fireEvent.touchStart(footer);
    expect(footer).not.toHaveClass('is-open');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('ignores touch hover emulation and closes from the focused mobile toggle', () => {
    const { container } = renderWithProviders(<QuoteFooter />, { locale: 'en' });
    const footer = container.firstElementChild as HTMLElement;
    const toggle = screen.getByRole('button', { name: t.quotes.expand });
    fireEvent.touchStart(footer);
    fireEvent.pointerEnter(footer, { pointerType: 'touch' });
    fireEvent.pointerLeave(footer, { pointerType: 'touch' });
    expect(footer).not.toHaveClass('is-open');
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    expect(footer).toHaveClass('is-open');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveAccessibleName(t.quotes.collapse);
    toggle.focus();
    fireEvent.click(toggle);
    expect(footer).not.toHaveClass('is-open');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName(t.quotes.expand);
    expect(toggle).toHaveFocus();
    expect(document.getElementById('quote-footer-content')).not.toBeVisible();
  });

  it('renders the loading skeleton and replaces it with a VN-only attribution', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { container } = renderWithProviders(<QuoteFooter />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.quotes.expand }));
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(3);
    await act(async () => {
      resolveFetch(quoteResponse(null));
      await Promise.resolve();
    });
    expect(screen.queryByTestId('avatar')).toBeNull();
    expect(screen.getByRole('link', { name: 'Visual novel' })).toHaveAttribute('href', '/vn/v90001');
  });

  it('renders a localized failure when the API rejects or returns malformed data', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'quote failed' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ malformed: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }));
    const { container } = renderWithProviders(<QuoteFooter />, { locale: 'en' });
    const footer = container.firstElementChild as HTMLElement;
    fireEvent.pointerEnter(footer, { pointerType: 'mouse' });
    expect(await screen.findByText('quote failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.quotes.shuffle }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(t.common.error));
  });

  it('disables refresh while loading and aborts the active request on unmount', async () => {
    const signals: AbortSignal[] = [];
    global.fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise<Response>(() => {});
    });
    const { container, unmount } = renderWithProviders(<QuoteFooter />, { locale: 'en' });
    fireEvent.pointerEnter(container.firstElementChild as HTMLElement, { pointerType: 'mouse' });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: t.quotes.shuffle })).toBeDisabled();
    unmount();
    expect(signals[0]?.aborted).toBe(true);
  });

  it('ignores stale successful and rejected requests from a same-tick refresh burst', async () => {
    const pending: Array<{
      reject: (reason: Error) => void;
      resolve: (response: Response) => void;
    }> = [];
    global.fetch = vi.fn().mockImplementation(() => new Promise<Response>((resolve, reject) => {
      pending.push({ reject, resolve });
    }));
    renderWithProviders(<QuoteFooter />, { locale: 'en' });
    const button = screen.getByRole('button', { name: t.quotes.shuffle });
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(pending).toHaveLength(3);
    await act(async () => {
      pending[0].resolve(quoteResponse());
      await Promise.resolve();
    });
    expect(screen.queryByText(/Quoted line/)).toBeNull();

    await act(async () => {
      pending[1].reject(new Error('stale rejection'));
      await Promise.resolve();
    });
    expect(screen.queryByText('stale rejection')).toBeNull();

    await act(async () => {
      pending[2].resolve(quoteResponse());
      await Promise.resolve();
    });
    expect(await screen.findByText(/Quoted line/)).toBeInTheDocument();
  });
});
