// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeIntersectionOnce } from '@/lib/intersection-observer-pool';

const observers: MockIntersectionObserver[] = [];

class MockIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds: readonly number[];
  readonly callback: IntersectionObserverCallback;
  observe = vi.fn<(target: Element) => void>();
  unobserve = vi.fn<(target: Element) => void>();
  disconnect = vi.fn<() => void>();
  takeRecords = (): IntersectionObserverEntry[] => [];

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? '0px';
    const threshold = options?.threshold ?? 0;
    this.thresholds = typeof threshold === 'number' ? [threshold] : threshold;
    observers.push(this);
  }

  trigger(target: Element, isIntersecting: boolean): void {
    const rect = new DOMRectReadOnly();
    this.callback([
      {
        boundingClientRect: rect,
        intersectionRatio: isIntersecting ? 1 : 0,
        intersectionRect: rect,
        isIntersecting,
        rootBounds: null,
        target,
        time: 0,
      },
    ], this);
  }
}

const options = { rootMargin: '500px 0px', threshold: 0.01 } as const;

beforeEach(() => {
  observers.length = 0;
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('intersection observer pool', () => {
  it('runs immediately when IntersectionObserver is unavailable', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    const listener = vi.fn<() => void>();
    const stop = observeIntersectionOnce(document.createElement('div'), listener, options);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(stop()).toBeUndefined();
  });

  it('shares observers and releases subscriptions exactly once', () => {
    const target = document.createElement('div');
    const otherTarget = document.createElement('div');
    const staleTarget = document.createElement('div');
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    const other = vi.fn<() => void>();

    const stopFirst = observeIntersectionOnce(target, first, options);
    const stopSecond = observeIntersectionOnce(target, second, options);
    const stopOther = observeIntersectionOnce(otherTarget, other, options);

    expect(observers).toHaveLength(1);
    const observer = observers[0];
    expect(observer.rootMargin).toBe(options.rootMargin);
    expect(observer.thresholds).toEqual([options.threshold]);
    expect(observer.observe).toHaveBeenCalledTimes(2);

    stopFirst();
    stopFirst();
    expect(observer.unobserve).not.toHaveBeenCalled();

    observer.trigger(staleTarget, true);
    observer.trigger(target, false);
    expect(second).not.toHaveBeenCalled();

    observer.trigger(target, true);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(observer.unobserve).toHaveBeenCalledWith(target);
    expect(observer.disconnect).not.toHaveBeenCalled();

    stopSecond();
    stopOther();
    expect(observer.unobserve).toHaveBeenCalledWith(otherTarget);
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });
});
