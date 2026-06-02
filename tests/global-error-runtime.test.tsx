// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GlobalError from '@/app/global-error';

function clearLocaleCookie() {
  document.cookie = 'locale=; Max-Age=0; path=/';
}

afterEach(() => {
  cleanup();
  clearLocaleCookie();
  vi.restoreAllMocks();
});

describe('global root-layout error boundary', () => {
  it('renders the initial English fallback, exposes a digest, and retries', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reset = vi.fn();
    render(<GlobalError error={Object.assign(new Error('boom'), { digest: 'trace-123' })} reset={reset} />);
    expect(screen.getByText('Something broke.')).toBeInTheDocument();
    expect(document.body.textContent).toContain('trace-123');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('uses a supported locale cookie before the browser preference', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    document.cookie = 'locale=ja; path=/';
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);
    expect(await screen.findByRole('button', { name: '再試行' })).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('trace-123');
  });

  it('falls back from an invalid cookie to the first supported browser language', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    document.cookie = 'locale=unsupported; path=/';
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['de-DE', 'fr-FR']);
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('uses navigator.language when navigator.languages is empty', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue([]);
    vi.spyOn(window.navigator, 'language', 'get').mockReturnValue('ja-JP');
    render(<GlobalError error={new Error('boom')} reset={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('button', { name: '再試行' })).toBeInTheDocument());
  });
});
