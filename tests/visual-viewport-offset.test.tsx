// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateVisualViewportBottomOffset,
  VisualViewportOffset,
} from '@/components/VisualViewportOffset';

const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  document.documentElement.style.removeProperty('--visual-viewport-bottom-offset');
});

afterEach(() => {
  cleanup();
  restoreProperty(window, 'innerHeight', originalInnerHeight);
  restoreProperty(window, 'visualViewport', originalVisualViewport);
  restoreProperty(document, 'visibilityState', originalVisibilityState);
  vi.restoreAllMocks();
});

describe('visual viewport bottom offset', () => {
  it('calculates positive, negative, rounded, absent, and invalid offsets', () => {
    expect(calculateVisualViewportBottomOffset(500, { offsetTop: 100, height: 700 })).toBe(300);
    expect(calculateVisualViewportBottomOffset(800, { offsetTop: 10, height: 500 })).toBe(-290);
    expect(calculateVisualViewportBottomOffset(500, { offsetTop: 0.123, height: 500.456 })).toBe(0.58);
    expect(calculateVisualViewportBottomOffset(500, null)).toBe(0);
    expect(calculateVisualViewportBottomOffset(Number.POSITIVE_INFINITY, { offsetTop: 0, height: 500 })).toBe(0);
  });

  it('tracks viewport changes, coalesces frames, resumes visibly, and cleans up', () => {
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 700, writable: true },
      offsetTop: { configurable: true, value: 100, writable: true },
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500, writable: true });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible', writable: true });

    let nextFrame = 1;
    const frames = new Map<number, FrameRequestCallback>();
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const view = render(<VisualViewportOffset />);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-offset')).toBe('300px');

    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    expect(requestFrame).toHaveBeenCalledTimes(2);
    expect(cancelFrame).toHaveBeenCalledTimes(1);
    const pending = [...frames.values()][0];
    expect(pending).toBeDefined();
    Object.defineProperty(viewport, 'height', { configurable: true, value: 500, writable: true });
    act(() => pending?.(0));
    frames.clear();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-offset')).toBe('100px');

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1);

    view.unmount();
    expect(cancelFrame).toHaveBeenCalledTimes(2);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-offset')).toBe('');
    viewport.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));
    window.dispatchEvent(new Event('pageshow'));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestFrame).toHaveBeenCalledTimes(3);
  });

  it('publishes the zero fallback without VisualViewport and clears a completed frame', () => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 500 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    let callback: FrameRequestCallback | null = null;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((next) => {
      callback = next;
      return 1;
    });
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');

    const view = render(<VisualViewportOffset />);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-bottom-offset')).toBe('0px');
    window.dispatchEvent(new Event('pageshow'));
    act(() => callback?.(0));
    view.unmount();
    expect(cancelFrame).not.toHaveBeenCalled();
  });
});
