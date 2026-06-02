// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HeaderHeightVar } from '@/components/HeaderHeightVar';

const resizeObserverMocks = vi.hoisted(() => ({
  callback: null as ResizeObserverCallback | null,
  disconnect: vi.fn(),
  observe: vi.fn(),
}));

class TestResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizeObserverMocks.callback = callback;
  }

  observe = resizeObserverMocks.observe;
  disconnect = resizeObserverMocks.disconnect;
}

beforeEach(() => {
  resizeObserverMocks.callback = null;
  resizeObserverMocks.disconnect.mockReset();
  resizeObserverMocks.observe.mockReset();
  document.documentElement.style.removeProperty('--header-height');
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HeaderHeightVar', () => {
  it('publishes positive header heights after mount and resize events', () => {
    const header = document.createElement('header');
    header.setAttribute('aria-label', 'Primary navigation');
    let height = 63.6;
    vi.spyOn(header, 'getBoundingClientRect').mockImplementation(() => ({
      x: 0,
      y: 0,
      width: 100,
      height,
      top: 0,
      right: 100,
      bottom: height,
      left: 0,
      toJSON: () => ({}),
    }));
    document.body.append(header);

    const { unmount } = render(<HeaderHeightVar />);
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('64px');
    expect(resizeObserverMocks.observe).toHaveBeenCalledWith(header);

    height = 80.2;
    window.dispatchEvent(new Event('resize'));
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('80px');

    height = 0;
    resizeObserverMocks.callback?.([], {} as ResizeObserver);
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('80px');

    unmount();
    expect(resizeObserverMocks.disconnect).toHaveBeenCalledTimes(1);
    header.remove();
  });

  it('does nothing when the navigation header is absent', () => {
    render(<HeaderHeightVar />);
    expect(document.documentElement.style.getPropertyValue('--header-height')).toBe('');
    expect(resizeObserverMocks.observe).not.toHaveBeenCalled();
  });
});
