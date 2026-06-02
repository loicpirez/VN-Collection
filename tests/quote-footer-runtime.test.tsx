// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuoteFooter } from '@/components/QuoteFooter';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

vi.mock('@/components/QuoteAvatar', () => ({
  QuoteAvatar: () => <span data-testid="avatar" />,
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
    expect(global.fetch).not.toHaveBeenCalled();
    fireEvent.mouseEnter(footer);
    expect(await screen.findByText(/Quoted line/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Heroine/ })).toHaveAttribute('href', '/character/c90001');
    expect(screen.getByRole('link', { name: 'Visual novel' })).toHaveAttribute('href', '/vn/v90001');
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
    fireEvent.mouseLeave(footer);
    fireEvent.focus(footer);
    fireEvent.touchStart(footer);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('renders the loading skeleton and replaces it with a VN-only attribution', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { container } = renderWithProviders(<QuoteFooter />, { locale: 'en' });
    fireEvent.touchStart(container.firstElementChild as HTMLElement);
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
    fireEvent.mouseEnter(footer);
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
    fireEvent.mouseEnter(container.firstElementChild as HTMLElement);
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
