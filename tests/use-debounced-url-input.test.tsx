// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { replaceSearchQueryInHistory, useDebouncedUrlInput } from '@/lib/use-debounced-url-input';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { cleanup(); expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); });

describe('debounced URL draft', () => {
  it('writes a query locally while preserving filters and resetting result pagination', () => {
    replaceSearchQueryInHistory('/wishlist', 'lang=ja&page=4', 'motto');
    expect(window.location.pathname + window.location.search).toBe('/wishlist?lang=ja&q=motto');
    replaceSearchQueryInHistory('/traits', 'page=2&q=motto', '');
    expect(window.location.pathname + window.location.search).toBe('/traits');
  });
  it('ignores reordered acknowledgements without losing newer typing and accepts external resets', async () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useDebouncedUrlInput(value, commit, 300), { initialProps: { value: '' } });
    act(() => result.current[1]('mot'));
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => result.current[1]('motto'));
    await act(() => vi.advanceTimersByTimeAsync(300));
    rerender({ value: 'motto' });
    rerender({ value: 'mot' });
    expect(result.current[0]).toBe('motto');
    rerender({ value: 'external' });
    expect(result.current[0]).toBe('external');
    rerender({ value: '' });
    expect(result.current[0]).toBe('');
    expect(commit.mock.calls).toEqual([['mot'], ['motto']]);
  });

  it('trims commits once, suppresses duplicate pending commits, and cancels timers on unmount', async () => {
    const commit = vi.fn();
    const view = renderHook(({ value }) => useDebouncedUrlInput(value, commit, 300), { initialProps: { value: '' } });
    act(() => view.result.current[1]('  motto  '));
    await act(() => vi.advanceTimersByTimeAsync(300));
    act(() => view.result.current[1]('motto '));
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(commit).toHaveBeenCalledExactlyOnceWith('motto');
    view.rerender({ value: 'motto' });
    expect(view.result.current[0]).toBe('motto ');
    act(() => view.result.current[1]('pending'));
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
