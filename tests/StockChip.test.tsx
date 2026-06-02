// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import type { StockSummaryEntry } from '@/lib/stock-summary-client';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * Control the lazy subscription: every render's `subscribeStockSummary`
 * call records the listener so the test can push a summary value into the
 * chip on demand, mirroring the real coalescing client without timers.
 */
const subscribeMock = vi.fn();
const unsubscribeMock = vi.fn();
vi.mock('@/lib/stock-summary-client', () => ({
  subscribeStockSummary: (vnId: string, cb: (entry: StockSummaryEntry | null) => void) => subscribeMock(vnId, cb),
}));

let observeFn: ReturnType<typeof vi.fn<(el: Element) => void>>;
let unobserveFn: ReturnType<typeof vi.fn<(el: Element) => void>>;
let disconnectFn: ReturnType<typeof vi.fn<() => void>>;
let lastObservedEl: Element | null = null;
let triggerIntersect: ((isIntersecting?: boolean) => void) | null = null;

class MockIntersectionObserver {
  constructor(private readonly cb: IntersectionObserverCallback) {
    triggerIntersect = (isIntersecting = true) => {
      this.cb(
        [{ isIntersecting, target: lastObservedEl } as unknown as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    };
  }
  observe(el: Element) {
    lastObservedEl = el;
    observeFn(el);
  }
  unobserve(el: Element) {
    unobserveFn(el);
  }
  disconnect() {
    disconnectFn();
  }
  takeRecords() {
    return [];
  }
  root = null;
  rootMargin = '';
  thresholds = [];
}

async function loadComponent() {
  const mod = await import('@/components/StockChip');
  return mod.StockChip;
}

/** The captured internal listener from the most recent subscribe call. */
function latestListener(): (e: StockSummaryEntry | null) => void {
  const calls = subscribeMock.mock.calls;
  return calls[calls.length - 1][1] as (e: StockSummaryEntry | null) => void;
}

describe('StockChip', () => {
  beforeEach(() => {
    subscribeMock.mockReset();
    subscribeMock.mockReturnValue(unsubscribeMock);
    unsubscribeMock.mockReset();
    observeFn = vi.fn();
    unobserveFn = vi.fn();
    disconnectFn = vi.fn();
    lastObservedEl = null;
    triggerIntersect = null;
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver as unknown as typeof IntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('renders an invisible placeholder and observes before intersecting', async () => {
    const StockChip = await loadComponent();
    const { container } = renderWithProviders(<StockChip vnId="v90001" />);
    const placeholder = container.querySelector('div[aria-hidden]') as HTMLElement;
    expect(placeholder).toBeTruthy();
    expect(placeholder.style.width).toBe('0px');
    expect(observeFn).toHaveBeenCalledTimes(1);
    // No subscription until the chip scrolls into view.
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('subscribes on first intersection and shows the yen price by default', async () => {
    const StockChip = await loadComponent();
    const { container } = renderWithProviders(<StockChip vnId="v90001" />);
    triggerIntersect?.(false);
    expect(subscribeMock).not.toHaveBeenCalled();
    triggerIntersect?.();
    expect(subscribeMock).toHaveBeenCalledWith('v90001', expect.any(Function));
    triggerIntersect?.();
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    // Stops observing once subscribed.
    expect(unobserveFn).toHaveBeenCalled();
    latestListener()({ available: 3, best_price: 1980 });
    // The populated chip exposes the cart icon plus a non-empty visible label.
    await waitFor(() => {
      const svg = container.querySelector('svg.lucide-shopping-cart');
      expect(svg).toBeTruthy();
    });
    const label = container.querySelector('span.truncate') as HTMLElement;
    expect(label.textContent && label.textContent.length > 0).toBe(true);
    // The hint (used as title + aria-label) carries the formatted price.
    expect(/980/.test(label.closest('[aria-label]')?.getAttribute('aria-label') ?? '')).toBe(true);
  });

  it('shows the availability count instead of the price when hidePrice is set', async () => {
    const StockChip = await loadComponent();
    const { container } = renderWithProviders(<StockChip vnId="v90002" hidePrice />);
    triggerIntersect?.();
    latestListener()({ available: 5, best_price: 4200 });
    await waitFor(() => {
      const label = container.querySelector('span.truncate') as HTMLElement | null;
      expect(label && label.textContent && label.textContent.includes('5')).toBe(true);
    });
  });

  it('uses the count label even without hidePrice when best_price is null', async () => {
    const StockChip = await loadComponent();
    const { container } = renderWithProviders(<StockChip vnId="v90003" />);
    triggerIntersect?.();
    latestListener()({ available: 2, best_price: null });
    await waitFor(() => {
      const label = container.querySelector('span.truncate') as HTMLElement | null;
      expect(label && label.textContent && label.textContent.includes('2')).toBe(true);
    });
  });

  it('renders nothing meaningful when the entry has zero availability', async () => {
    const StockChip = await loadComponent();
    const { container } = renderWithProviders(<StockChip vnId="v90004" />);
    triggerIntersect?.();
    latestListener()({ available: 0, best_price: null });
    await waitFor(() => {
      const placeholder = container.querySelector('div[aria-hidden]') as HTMLElement;
      expect(placeholder).toBeTruthy();
      expect(placeholder.style.height).toBe('0px');
    });
    // No shopping-cart chip rendered for a zero-availability entry.
    expect(container.querySelector('svg.lucide-shopping-cart')).toBeNull();
  });

  it('unsubscribes and disconnects the observer on unmount', async () => {
    const StockChip = await loadComponent();
    const { unmount } = renderWithProviders(<StockChip vnId="v90005" />);
    triggerIntersect?.();
    expect(subscribeMock).toHaveBeenCalled();
    const listener = latestListener();
    unmount();
    expect(disconnectFn).toHaveBeenCalled();
    expect(unsubscribeMock).toHaveBeenCalled();
    listener({ available: 1, best_price: 100 });
  });
});
