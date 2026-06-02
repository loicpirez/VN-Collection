// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScrollFadeRight } from '@/components/ScrollFadeRight';

const originalResizeObserver = globalThis.ResizeObserver;

afterEach(() => {
  cleanup();
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    writable: true,
    value: originalResizeObserver,
  });
});

describe('ScrollFadeRight runtime', () => {
  it('shows and hides the fade as horizontal overflow changes', () => {
    const { container } = render(
      <ScrollFadeRight aria-label="Timeline" className="extra" tabIndex={2}>
        <span>Body</span>
      </ScrollFadeRight>,
    );
    const viewport = screen.getByRole('group', { name: 'Timeline' });
    Object.defineProperties(viewport, {
      scrollWidth: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, writable: true, value: 0 },
    });
    fireEvent.scroll(viewport);
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(viewport).toHaveClass('extra');
    expect(viewport).toHaveAttribute('tabindex', '2');

    viewport.scrollLeft = 200;
    fireEvent.scroll(viewport);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('reacts to ResizeObserver updates and disconnects on unmount', () => {
    let update: () => void = () => {};
    const observe = vi.fn<(element: Element) => void>();
    const disconnect = vi.fn<() => void>();
    class MockResizeObserver implements ResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        update = () => callback([], this);
      }
      observe = observe;
      unobserve = vi.fn<(element: Element) => void>();
      disconnect = disconnect;
    }
    globalThis.ResizeObserver = MockResizeObserver;
    const { container, unmount } = render(<ScrollFadeRight>Body</ScrollFadeRight>);
    const viewport = screen.getByRole('group');
    Object.defineProperties(viewport, {
      scrollWidth: { configurable: true, value: 300 },
      clientWidth: { configurable: true, value: 100 },
      scrollLeft: { configurable: true, value: 0 },
    });
    act(() => {
      update();
    });
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(observe).toHaveBeenCalledWith(viewport);
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
    act(() => {
      update();
    });
  });

  it('works without ResizeObserver support', () => {
    Reflect.deleteProperty(globalThis, 'ResizeObserver');
    expect(() => render(<ScrollFadeRight>Body</ScrollFadeRight>)).not.toThrow();
  });
});
