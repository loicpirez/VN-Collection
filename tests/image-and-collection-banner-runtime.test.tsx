// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoadingImage } from '@/components/LoadingImage';
import { NotInCollectionBanner } from '@/components/NotInCollectionBanner';
import { dictionaries } from '@/lib/i18n/dictionaries';
import { renderWithProviders } from './helpers/render-component';

const navigationMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: navigationMocks.refresh }),
}));

const t = dictionaries.en;
const originalDecodeDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode');

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  navigationMocks.refresh.mockReset();
  global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (originalDecodeDescriptor) {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecodeDescriptor);
  } else {
    delete (HTMLImageElement.prototype as Partial<HTMLImageElement>).decode;
  }
});

describe('LoadingImage runtime lifecycle', () => {
  it('removes the skeleton after load and resets it when the source changes', () => {
    const { container, rerender } = renderWithProviders(<LoadingImage src="/one.jpg" alt="Cover" />);
    const first = screen.getByRole('img', { name: 'Cover' });
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeInTheDocument();
    fireEvent.load(first);
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull();
    expect(first).toHaveClass('opacity-100');

    rerender(<LoadingImage src="/two.jpg" alt="Cover" />);
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Cover' })).toHaveAttribute('src', '/two.jpg');
  });

  it('reveals an image that completed before hydration attached its load handler', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(320);
    const { container } = renderWithProviders(<LoadingImage src="/hydrated.jpg" alt="Hydrated image" />);
    await waitFor(() => expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull());
    expect(screen.getByRole('img', { name: 'Hydrated image' })).toHaveClass('opacity-100');
  });

  it('shows an error placeholder when the image failed before hydration', async () => {
    vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(0);
    renderWithProviders(<LoadingImage src="/hydration-error.jpg" alt="Hydration error" />);
    expect(await screen.findByRole('img', { name: 'Image indisponible: Hydration error' })).toBeInTheDocument();
  });

  it('hides the skeleton on load without waiting for image decode', async () => {
    let resolveDecode: () => void = () => {};
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(() => new Promise<void>((resolve) => { resolveDecode = resolve; })),
    });
    const { container } = renderWithProviders(<LoadingImage src="/decode.jpg" alt="Decoded cover" />);
    const img = screen.getByRole('img', { name: 'Decoded cover' });

    fireEvent.load(img);
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull();
    expect(img).toHaveClass('opacity-100');

    await act(async () => {
      resolveDecode();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull();
  });

  it('hides the skeleton when decode rejects after load', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(() => Promise.reject(new Error('decode failed'))),
    });
    const { container } = renderWithProviders(<LoadingImage src="/decode-reject.jpg" alt="Rejected decode cover" />);

    fireEvent.load(screen.getByRole('img', { name: 'Rejected decode cover' }));

    await waitFor(() => expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull());
    expect(screen.getByRole('img', { name: 'Rejected decode cover' })).toHaveClass('opacity-100');
  });

  it('resets the skeleton after a source change and reveals the current image', () => {
    const { container, rerender } = renderWithProviders(<LoadingImage src="/stale-one.jpg" alt="Stale cover" />);

    rerender(<LoadingImage src="/stale-two.jpg" alt="Stale cover" />);
    expect(screen.getByRole('img', { name: 'Stale cover' })).toHaveAttribute('src', '/stale-two.jpg');
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeInTheDocument();
    fireEvent.load(screen.getByRole('img', { name: 'Stale cover' }));
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull();
  });

  it('reveals a loaded image when decode throws synchronously', () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(() => { throw new Error('decode threw'); }),
    });
    const { container } = renderWithProviders(<LoadingImage src="/decode-throws.jpg" alt="Throwing decode" />);
    fireEvent.load(screen.getByRole('img', { name: 'Throwing decode' }));
    expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull();
  });

  it('remembers loaded URLs across remounts and evicts the oldest cached URL', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn(() => Promise.resolve()),
    });
    const prefix = `/cache-${Date.now()}-`;
    const { container, rerender, unmount } = renderWithProviders(<LoadingImage src={`${prefix}0.jpg`} alt="Cached cover" />);

    for (let i = 0; i <= 500; i += 1) {
      rerender(<LoadingImage src={`${prefix}${i}.jpg`} alt="Cached cover" />);
      fireEvent.load(screen.getByRole('img', { name: 'Cached cover' }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(container.querySelector('[data-loading-image-skeleton]')).toBeNull();
    }
    unmount();

    const old = renderWithProviders(<LoadingImage src={`${prefix}0.jpg`} alt="Cached cover" />);
    expect(old.container.querySelector('[data-loading-image-skeleton]')).toBeInTheDocument();
    old.unmount();

    const recent = renderWithProviders(<LoadingImage src={`${prefix}500.jpg`} alt="Cached cover" />);
    expect(recent.container.querySelector('[data-loading-image-skeleton]')).toBeNull();
    expect(screen.getByRole('img', { name: 'Cached cover' })).toHaveClass('opacity-100');
  });

  it('renders accessible or decorative error placeholders', () => {
    const { container, rerender } = renderWithProviders(<LoadingImage src="/broken.jpg" alt="Broken cover" />);
    fireEvent.error(screen.getByRole('img', { name: 'Broken cover' }));
    expect(screen.getByRole('img', { name: 'Image indisponible: Broken cover' })).toHaveAttribute('data-loading-image-error');
    expect(container.querySelector('img')).toBeNull();

    rerender(<LoadingImage src="/untitled.jpg" alt="" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(screen.getByRole('img', { name: 'Image indisponible' })).toHaveAttribute('data-loading-image-error');

    rerender(<LoadingImage src="/decorative.jpg" alt="" ariaHidden />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('[data-loading-image-error]')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('img')).toBeNull();
  });
});

describe('NotInCollectionBanner request lifecycle', () => {
  it('adds the VN, emits the collection event, and performs immediate and delayed refreshes', async () => {
    vi.useFakeTimers();
    const listener = vi.fn<(event: Event) => void>();
    window.addEventListener('vn:collection-changed', listener);
    renderWithProviders(<NotInCollectionBanner vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/collection/v90001', expect.objectContaining({
      method: 'POST',
      body: '{}',
    }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    expect((listener.mock.calls[0][0] as CustomEvent<{ vnId: string; inCollection: boolean }>).detail).toEqual({
      vnId: 'v90001',
      inCollection: true,
    });
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(2);
    window.removeEventListener('vn:collection-changed', listener);
  });

  it('suppresses duplicate clicks while a mutation is in flight', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    renderWithProviders(<NotInCollectionBanner vnId="v90001" />, { locale: 'en' });
    const button = screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta });
    act(() => {
      fireEvent.click(button);
      fireEvent.click(button);
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveFetch(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
  });

  it('stays resident and follows collection events in both directions', () => {
    renderWithProviders(<NotInCollectionBanner vnId="v90001" initialInCollection />, { locale: 'en' });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => {
      window.dispatchEvent(new CustomEvent('vn:collection-changed', {
        detail: { vnId: 'v90001', inCollection: false },
      }));
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent('vn:collection-changed', {
        detail: { vnId: 'v90001', inCollection: true },
      }));
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the server error and re-enables the button after a rejected add', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'add failed' }, 500));
    renderWithProviders(<NotInCollectionBanner vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta }));
    expect(await screen.findByRole('alert')).toHaveTextContent('add failed');
    expect(screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta })).not.toBeDisabled();
  });

  it('ignores the stale completion when the VN identity changes', async () => {
    let resolveFetch: (response: Response) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    }));
    const { rerender } = renderWithProviders(<NotInCollectionBanner vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta }));
    rerender(<NotInCollectionBanner vnId="v90002" />);
    await act(async () => {
      resolveFetch(jsonResponse({ ok: true }));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(navigationMocks.refresh).not.toHaveBeenCalled();
  });

  it('cancels a pending delayed refresh when the VN identity changes after success', async () => {
    vi.useFakeTimers();
    const { rerender } = renderWithProviders(<NotInCollectionBanner vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);

    rerender(<NotInCollectionBanner vnId="v90002" />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('guards the delayed refresh callback when a stale timer still fires', async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'clearTimeout').mockImplementation(() => undefined);
    const { rerender } = renderWithProviders(<NotInCollectionBanner vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta }));

    await act(async () => {
      await Promise.resolve();
    });
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);

    rerender(<NotInCollectionBanner vnId="v90002" />);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(navigationMocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores a late rejection after unmount', async () => {
    let rejectFetch: (error: Error) => void = () => {};
    global.fetch = vi.fn().mockReturnValue(new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    }));
    const { unmount } = renderWithProviders(<NotInCollectionBanner vnId="v90001" />, { locale: 'en' });
    fireEvent.click(screen.getByRole('button', { name: t.detail.notInLibraryBanner.cta }));
    unmount();
    await act(async () => {
      rejectFetch(new Error('late failure'));
      await Promise.resolve();
    });
  });
});
