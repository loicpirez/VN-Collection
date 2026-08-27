// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateVisualViewportAnchorShift,
  VisualViewportAnchor,
} from '@/components/VisualViewportAnchor';

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  document.documentElement.style.removeProperty('--visual-viewport-anchor-shift');
});

afterEach(() => {
  cleanup();
  restoreProperty(window, 'visualViewport', originalVisualViewport);
  restoreProperty(document, 'visibilityState', originalVisibilityState);
  vi.restoreAllMocks();
});

describe('visual viewport anchor', () => {
  it('calculates measured shifts and rejects transient invalid geometry', () => {
    expect(calculateVisualViewportAnchorShift({ offsetTop: 20, height: 700 }, 900, 0)).toBe(-180);
    expect(calculateVisualViewportAnchorShift({ offsetTop: 20, height: 700 }, 720, -180)).toBe(-180);
    expect(calculateVisualViewportAnchorShift({ offsetTop: 0.123, height: 500.456 }, 500, 0)).toBe(0.58);
    expect(calculateVisualViewportAnchorShift(null, 900, 0)).toBe(0);
    expect(calculateVisualViewportAnchorShift({ offsetTop: 0, height: 0 }, 900, 0)).toBeNull();
    expect(calculateVisualViewportAnchorShift({ offsetTop: 0, height: 700 }, Number.NaN, 0)).toBeNull();
    expect(calculateVisualViewportAnchorShift({ offsetTop: Number.POSITIVE_INFINITY, height: 700 }, 900, 0)).toBeNull();
  });

  it('tracks measured viewport changes, coalesces frames, and cleans up', () => {
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 700, writable: true },
      offsetTop: { configurable: true, value: 20, writable: true },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible', writable: true });

    let renderedBottom = 900;
    const anchor = document.createElement('div');
    anchor.dataset.visualViewportAnchor = '';
    vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      width: 100,
      height: 48,
      top: 0,
      right: 100,
      bottom: renderedBottom,
      left: 0,
      toJSON: () => ({}),
    }));
    document.body.append(anchor);

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

    const view = render(<VisualViewportAnchor />);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-180px');

    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('scroll'));
    expect(requestFrame).toHaveBeenCalledTimes(3);
    expect(cancelFrame).toHaveBeenCalledTimes(2);

    renderedBottom = 720;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 760, writable: true });
    const pending = [...frames.values()][0];
    act(() => pending?.(0));
    frames.clear();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-120px');

    renderedBottom = 780;
    viewport.dispatchEvent(new Event('scroll'));
    act(() => [...frames.values()][0]?.(0));
    frames.clear();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-120px');

    Object.defineProperty(viewport, 'height', { configurable: true, value: 0, writable: true });
    window.dispatchEvent(new Event('resize'));
    act(() => [...frames.values()][0]?.(0));
    frames.clear();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-120px');

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1);

    view.unmount();
    expect(cancelFrame).toHaveBeenCalledTimes(3);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('');
    anchor.remove();
  });

  it('keeps the native fixed fallback when no visual viewport or anchor exists', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    const view = render(<VisualViewportAnchor />);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('');
    view.unmount();
  });
});
