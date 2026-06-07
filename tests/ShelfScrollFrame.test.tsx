// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent } from '@testing-library/react';
import { renderWithProviders } from './helpers/render-component';
import { ShelfScrollFrame } from '@/components/ShelfScrollFrame';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  notFound: vi.fn(),
  redirect: vi.fn(),
}));

/**
 * Drive the scroll-frame's edge detection by stubbing the geometry
 * getters (jsdom reports 0 for every layout box). Each test sets a
 * concrete `scrollWidth` / `clientWidth` / `scrollLeft` combination,
 * dispatches the scroll event the component listens for, and asserts
 * which fade gradient mounts.
 */
function setGeometry(
  el: HTMLElement,
  { scrollWidth, clientWidth, scrollLeft }: { scrollWidth: number; clientWidth: number; scrollLeft: number },
) {
  Object.defineProperty(el, 'scrollWidth', { configurable: true, value: scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, value: clientWidth });
  Object.defineProperty(el, 'scrollLeft', { configurable: true, writable: true, value: scrollLeft });
}

describe('ShelfScrollFrame', () => {
  const RealResizeObserver = globalThis.ResizeObserver;

  beforeEach(() => {
    class MockResizeObserver {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
    globalThis.ResizeObserver = MockResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = RealResizeObserver;
  });

  it('renders children inside the scroll viewport with no fades when not clipped', () => {
    const { container } = renderWithProviders(
      <ShelfScrollFrame>
        <div data-testid="row-stack">Title Y</div>
      </ShelfScrollFrame>,
    );
    const viewport = container.querySelector<HTMLElement>('[data-shelf-scroll-frame]');
    expect(viewport).not.toBeNull();
    expect(viewport?.textContent).toContain('Title Y');
    // Default jsdom geometry (all zero) means maxScroll - scrollLeft <= 1.
    expect(container.querySelector('[data-shelf-scroll-fade="right"]')).toBeNull();
    expect(container.querySelector('[data-shelf-scroll-fade="left"]')).toBeNull();
  });

  it('shows the right fade when content overflows past the right edge', () => {
    const { container } = renderWithProviders(
      <ShelfScrollFrame>
        <div>Title Y</div>
      </ShelfScrollFrame>,
    );
    const viewport = container.querySelector<HTMLElement>('[data-shelf-scroll-frame]')!;
    setGeometry(viewport, { scrollWidth: 1000, clientWidth: 300, scrollLeft: 0 });
    fireEvent.scroll(viewport);
    expect(container.querySelector('[data-shelf-scroll-fade="right"]')).not.toBeNull();
    expect(container.querySelector('[data-shelf-scroll-fade="left"]')).toBeNull();
  });

  it('shows both fades when scrolled to the middle', () => {
    const { container } = renderWithProviders(
      <ShelfScrollFrame>
        <div>Title Y</div>
      </ShelfScrollFrame>,
    );
    const viewport = container.querySelector<HTMLElement>('[data-shelf-scroll-frame]')!;
    setGeometry(viewport, { scrollWidth: 1000, clientWidth: 300, scrollLeft: 200 });
    fireEvent.scroll(viewport);
    expect(container.querySelector('[data-shelf-scroll-fade="left"]')).not.toBeNull();
    expect(container.querySelector('[data-shelf-scroll-fade="right"]')).not.toBeNull();
  });

  it('shows only the left fade when scrolled fully to the right end', () => {
    const { container } = renderWithProviders(
      <ShelfScrollFrame>
        <div>Title Y</div>
      </ShelfScrollFrame>,
    );
    const viewport = container.querySelector<HTMLElement>('[data-shelf-scroll-frame]')!;
    setGeometry(viewport, { scrollWidth: 1000, clientWidth: 300, scrollLeft: 700 });
    fireEvent.scroll(viewport);
    expect(container.querySelector('[data-shelf-scroll-fade="left"]')).not.toBeNull();
    expect(container.querySelector('[data-shelf-scroll-fade="right"]')).toBeNull();
  });

  it('recomputes edges on a window resize event', () => {
    const { container } = renderWithProviders(
      <ShelfScrollFrame>
        <div>Title Y</div>
      </ShelfScrollFrame>,
    );
    const viewport = container.querySelector<HTMLElement>('[data-shelf-scroll-frame]')!;
    setGeometry(viewport, { scrollWidth: 800, clientWidth: 200, scrollLeft: 0 });
    fireEvent(window, new Event('resize'));
    expect(container.querySelector('[data-shelf-scroll-fade="right"]')).not.toBeNull();
  });

  it('falls back to no ResizeObserver without throwing', () => {
    const saved = globalThis.ResizeObserver;
    // @ts-expect-error simulate an environment lacking ResizeObserver
    globalThis.ResizeObserver = undefined;
    expect(() =>
      renderWithProviders(
        <ShelfScrollFrame>
          <div>Title Y</div>
        </ShelfScrollFrame>,
      ),
    ).not.toThrow();
    globalThis.ResizeObserver = saved;
  });

  it('does not observe a child element when the frame has no child node', () => {
    const observers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
    class CountingResizeObserver {
      observe = vi.fn();
      disconnect = vi.fn();
      constructor() {
        observers.push(this);
      }
    }
    globalThis.ResizeObserver = CountingResizeObserver as unknown as typeof ResizeObserver;

    renderWithProviders(<ShelfScrollFrame>{null}</ShelfScrollFrame>);

    expect(observers).toHaveLength(1);
    expect(observers[0].observe).toHaveBeenCalledTimes(1);
  });
});
