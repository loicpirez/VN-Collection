// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateDocumentViewportAnchorTop,
  calculateVisualViewportAnchorShift,
  shouldUseDocumentViewportAnchor,
  VisualViewportAnchor,
} from '@/components/VisualViewportAnchor';

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport');
const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
const originalCss = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
const originalResizeObserver = Object.getOwnPropertyDescriptor(globalThis, 'ResizeObserver');
const originalScrollY = Object.getOwnPropertyDescriptor(window, 'scrollY');
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalScrollHeight = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight');

function restoreProperty(target: object, key: string, descriptor: PropertyDescriptor | undefined) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

beforeEach(() => {
  document.documentElement.style.removeProperty('--visual-viewport-anchor-shift');
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
  Object.defineProperty(globalThis, 'CSS', {
    configurable: true,
    value: { supports: vi.fn().mockReturnValue(false) },
  });
  Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: undefined });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  restoreProperty(window, 'visualViewport', originalVisualViewport);
  restoreProperty(document, 'visibilityState', originalVisibilityState);
  restoreProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
  restoreProperty(globalThis, 'CSS', originalCss);
  restoreProperty(globalThis, 'ResizeObserver', originalResizeObserver);
  restoreProperty(window, 'scrollY', originalScrollY);
  restoreProperty(window, 'innerHeight', originalInnerHeight);
  restoreProperty(document.documentElement, 'scrollHeight', originalScrollHeight);
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

  it('calculates bounded document coordinates and detects touch WebKit', () => {
    expect(calculateDocumentViewportAnchorTop(
      { offsetTop: 20, height: 700, pageTop: 100 },
      80,
      800,
      3000,
      48,
    )).toBe(752);
    expect(calculateDocumentViewportAnchorTop(
      { offsetTop: 20, height: 700 },
      80,
      800,
      3000,
      48,
    )).toBe(752);
    expect(calculateDocumentViewportAnchorTop(null, 100, 700, 3000, 48)).toBe(752);
    expect(calculateDocumentViewportAnchorTop(
      { offsetTop: 0, height: 700, pageTop: -50 },
      0,
      800,
      3000,
      48,
    )).toBe(652);
    expect(calculateDocumentViewportAnchorTop(
      { offsetTop: 0, height: 700, pageTop: 900 },
      0,
      800,
      1000,
      48,
    )).toBe(952);
    expect(calculateDocumentViewportAnchorTop(
      { offsetTop: 0, height: 500.456, pageTop: 100.123 },
      0,
      800,
      3000,
      48,
    )).toBe(552.58);
    expect(calculateDocumentViewportAnchorTop({ offsetTop: 0, height: 0 }, 0, 800, 3000, 48)).toBeNull();
    expect(calculateDocumentViewportAnchorTop(null, 0, 800, 0, 48)).toBeNull();
    expect(calculateDocumentViewportAnchorTop(null, 0, 800, 3000, -1)).toBeNull();
    expect(calculateDocumentViewportAnchorTop({ offsetTop: 0, height: Number.NaN }, 0, 800, 3000, 48)).toBeNull();
    expect(calculateDocumentViewportAnchorTop({ offsetTop: 0, height: 700, pageTop: Number.NaN }, Number.NaN, 800, 3000, 48)).toBeNull();
    expect(calculateDocumentViewportAnchorTop(null, 0, 800, Number.POSITIVE_INFINITY, 48)).toBeNull();
    expect(calculateDocumentViewportAnchorTop(null, 0, 800, 3000, Number.POSITIVE_INFINITY)).toBeNull();
    expect(shouldUseDocumentViewportAnchor(1, true, 'SyntheticBrowser/1')).toBe(true);
    expect(shouldUseDocumentViewportAnchor(1, false, 'AppleWebKit/617.1 Safari/617.1')).toBe(true);
    expect(shouldUseDocumentViewportAnchor(1, false, 'AppleWebKit/537.36 Chrome/140.0')).toBe(false);
    expect(shouldUseDocumentViewportAnchor(1, false, 'Gecko/20100101 Firefox/142.0')).toBe(false);
    expect(shouldUseDocumentViewportAnchor(0, true, 'AppleWebKit/617.1 Safari/617.1')).toBe(false);
  });

  it('settles delayed Safari viewport geometry, coalesces events, and cleans up', () => {
    vi.useFakeTimers();
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
    const runNextFrame = () => {
      const next = frames.entries().next();
      if (next.done) throw new Error('Expected a queued animation frame');
      const [id, callback] = next.value;
      frames.delete(id);
      act(() => callback(0));
    };

    const view = render(<VisualViewportAnchor />);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-180px');
    expect(frames.size).toBe(1);
    renderedBottom = 720;

    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    viewport.dispatchEvent(new Event('scrollend'));
    window.dispatchEvent(new Event('scroll'));
    expect(frames.size).toBe(1);
    expect(requestFrame).toHaveBeenCalledTimes(5);
    expect(cancelFrame).toHaveBeenCalledTimes(4);

    runNextFrame();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-180px');
    expect(frames.size).toBe(1);

    renderedBottom = 720;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 760, writable: true });
    act(() => vi.advanceTimersByTime(120));
    expect(frames.size).toBe(1);
    runNextFrame();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-120px');

    Object.defineProperty(viewport, 'height', { configurable: true, value: 780, writable: true });
    renderedBottom = 780;
    act(() => vi.advanceTimersByTime(240));
    runNextFrame();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-100px');

    renderedBottom = 800;
    window.dispatchEvent(new Event('scrollend'));
    runNextFrame();
    runNextFrame();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-100px');

    Object.defineProperty(viewport, 'height', { configurable: true, value: 0, writable: true });
    window.dispatchEvent(new Event('resize'));
    runNextFrame();
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('-100px');

    const requestsBeforeVisibility = requestFrame.mock.calls.length;
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestFrame).toHaveBeenCalledTimes(requestsBeforeVisibility);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(1);

    view.unmount();
    expect(cancelFrame).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('');
    const requestsAfterUnmount = requestFrame.mock.calls.length;
    viewport.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('pageshow'));
    expect(requestFrame).toHaveBeenCalledTimes(requestsAfterUnmount);
    anchor.remove();
  });

  it('keeps the native fixed fallback when no visual viewport or anchor exists', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: null });
    const view = render(<VisualViewportAnchor />);
    expect(document.documentElement.style.getPropertyValue('--visual-viewport-anchor-shift')).toBe('');
    view.unmount();
  });

  it('tracks touch WebKit in document coordinates while scrolling in both directions', () => {
    vi.useFakeTimers();
    const viewport = new EventTarget();
    Object.defineProperties(viewport, {
      height: { configurable: true, value: 700, writable: true },
      offsetTop: { configurable: true, value: 0, writable: true },
      pageTop: { configurable: true, value: 100, writable: true },
    });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 100, writable: true });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: { supports: vi.fn().mockReturnValue(true) },
    });

    let resizeCallback: ResizeObserverCallback = () => {};
    class TestResizeObserver implements ResizeObserver {
      static latest: TestResizeObserver | null = null;
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback;
        TestResizeObserver.latest = this;
      }
      disconnect = vi.fn();
      observe = vi.fn();
      unobserve = vi.fn();
    }
    Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: TestResizeObserver });

    let anchorHeight = 48;
    const anchor = document.createElement('div');
    anchor.dataset.visualViewportAnchor = '';
    vi.spyOn(anchor, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      width: 390,
      height: anchorHeight,
      top: 0,
      right: 390,
      bottom: anchorHeight,
      left: 0,
      toJSON: () => ({}),
    }));
    document.body.append(anchor);

    let nextFrame = 1;
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });

    const view = render(<VisualViewportAnchor />);
    expect(anchor.dataset.visualViewportMode).toBe('document');
    expect(anchor.style.position).toBe('absolute');
    expect(anchor.style.top).toBe('752px');
    expect(anchor.style.bottom).toBe('auto');
    expect(anchor.style.transform).toBe('none');
    const resizeObserver = TestResizeObserver.latest;
    if (!resizeObserver) throw new Error('Expected a resize observer');
    expect(resizeObserver.observe).toHaveBeenCalledWith(anchor);

    anchorHeight = 96;
    Object.defineProperty(viewport, 'height', { configurable: true, value: 650, writable: true });
    Object.defineProperty(viewport, 'pageTop', { configurable: true, value: 500, writable: true });
    act(() => viewport.dispatchEvent(new Event('scroll')));
    expect(anchor.style.top).toBe('1054px');

    Object.defineProperty(viewport, 'pageTop', { configurable: true, value: 200, writable: true });
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(anchor.style.top).toBe('754px');

    Object.defineProperty(viewport, 'height', { configurable: true, value: 0, writable: true });
    act(() => viewport.dispatchEvent(new Event('resize')));
    expect(anchor.style.top).toBe('754px');
    Object.defineProperty(viewport, 'height', { configurable: true, value: 650, writable: true });

    anchorHeight = 112;
    act(() => resizeCallback([], resizeObserver));
    expect(anchor.style.top).toBe('738px');

    view.unmount();
    expect(resizeObserver.disconnect).toHaveBeenCalled();
    expect(anchor.dataset.visualViewportMode).toBeUndefined();
    expect(anchor.style.position).toBe('');
    expect(anchor.style.top).toBe('');
    expect(anchor.style.bottom).toBe('');
    expect(anchor.style.transform).toBe('');
    expect(vi.getTimerCount()).toBe(0);
    anchor.remove();
  });
});
