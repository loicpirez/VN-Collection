// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateMasonryRowSpan,
  MasonryGridItem,
} from '@/components/MasonryGridItem';

const originalResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');

afterEach(() => {
  cleanup();
  if (originalResizeObserver) Object.defineProperty(globalThis, 'ResizeObserver', originalResizeObserver);
  else Reflect.deleteProperty(globalThis, 'ResizeObserver');
  vi.restoreAllMocks();
});

describe('MasonryGridItem', () => {
  it('calculates stable positive spans for valid and invalid measurements', () => {
    expect(calculateMasonryRowSpan(570)).toBe(570);
    expect(calculateMasonryRowSpan(0.4)).toBe(1);
    expect(calculateMasonryRowSpan(0)).toBe(1);
    expect(calculateMasonryRowSpan(Number.NaN)).toBe(1);
  });

  it('measures immediately, reacts to ResizeObserver, and preserves list semantics', () => {
    let resizeCallback: ResizeObserverCallback = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    class TestResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
      }
      observe = observe;
      disconnect = disconnect;
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });
    let height = 260;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      width: 180,
      height,
      top: 0,
      right: 180,
      bottom: height,
      left: 0,
      toJSON: () => ({}),
    }));
    const view = render(
      <MasonryGridItem gap={12} position={7} setSize={20}>
        <span>Card</span>
      </MasonryGridItem>,
    );
    const item = view.getByRole('listitem');
    expect(item).toHaveAttribute('aria-posinset', '7');
    expect(item).toHaveAttribute('aria-setsize', '20');
    expect(item).toHaveStyle({ gridRowEnd: 'span 260', paddingBottom: '12px' });
    expect(observe).toHaveBeenCalledWith(item);
    height = 390;
    act(() => resizeCallback([], {} as ResizeObserver));
    expect(item).toHaveStyle({ gridRowEnd: 'span 390' });
    view.rerender(
      <MasonryGridItem gap={16} position={7} setSize={20}>
        <span>Card</span>
      </MasonryGridItem>,
    );
    expect(disconnect).toHaveBeenCalled();
    expect(item).toHaveStyle({ gridRowEnd: 'span 390', paddingBottom: '16px' });
    view.unmount();
  });

  it('uses the resize fallback and removes it on unmount when ResizeObserver is unavailable', () => {
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: undefined });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 180,
      height: 130,
      top: 0,
      right: 180,
      bottom: 130,
      left: 0,
      toJSON: () => ({}),
    });
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const view = render(
      <MasonryGridItem gap={12} position={1} setSize={1}>
        <span>Card</span>
      </MasonryGridItem>,
    );
    expect(view.getByRole('listitem')).toHaveStyle({ gridRowEnd: 'span 130', paddingBottom: '12px' });
    const resizeHandler = add.mock.calls.find(([type]) => type === 'resize')?.[1];
    expect(resizeHandler).toBeTypeOf('function');
    act(() => window.dispatchEvent(new Event('resize')));
    view.unmount();
    expect(remove).toHaveBeenCalledWith('resize', resizeHandler);
  });
});
