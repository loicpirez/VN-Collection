// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNearViewport } from '@/lib/use-near-viewport';

const observerMocks = vi.hoisted(() => ({
  callback: null as (() => void) | null,
  cleanup: vi.fn(),
  observe: vi.fn(),
}));

vi.mock('@/lib/intersection-observer-pool', () => ({
  observeIntersectionOnce: (
    element: Element,
    callback: () => void,
    options: { rootMargin: string; threshold: number },
  ) => {
    observerMocks.callback = callback;
    observerMocks.observe(element, options);
    return observerMocks.cleanup;
  },
}));

function Probe({ host = true, rootMargin }: { host?: boolean; rootMargin?: string }) {
  const activation = useNearViewport<HTMLDivElement>(rootMargin);
  if (!host) return <span>{String(activation.active)}</span>;
  return <div ref={activation.ref}>{String(activation.active)}</div>;
}

beforeEach(() => {
  observerMocks.callback = null;
  observerMocks.cleanup.mockReset();
  observerMocks.observe.mockReset();
});

afterEach(() => cleanup());

describe('useNearViewport', () => {
  it('stays inactive until intersection, then keeps activation sticky', () => {
    const { rerender } = render(<Probe />);
    expect(screen.getByText('false')).toBeTruthy();
    expect(observerMocks.observe).toHaveBeenCalledWith(
      expect.any(HTMLDivElement),
      { rootMargin: '600px 0px', threshold: 0.01 },
    );

    act(() => observerMocks.callback?.());
    expect(screen.getByText('true')).toBeTruthy();
    expect(observerMocks.cleanup).toHaveBeenCalledTimes(1);

    rerender(<Probe rootMargin="100px 0px" />);
    expect(screen.getByText('true')).toBeTruthy();
    expect(observerMocks.observe).toHaveBeenCalledTimes(1);
  });

  it('does not create an observer until a host element exists', () => {
    const { rerender } = render(<Probe host={false} />);
    expect(observerMocks.observe).not.toHaveBeenCalled();
    rerender(<Probe />);
    expect(observerMocks.observe).toHaveBeenCalledTimes(1);
  });
});
