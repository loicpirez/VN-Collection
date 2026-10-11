// @vitest-environment jsdom
import { act, cleanup, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { acknowledgeVnCollectionState, dispatchVnCollectionChanged, getPendingVnCollectionState } from '@/lib/vn-collection-events';
import { useVnCollectionState } from '@/lib/use-vn-collection-state';
import { NotInCollectionBanner } from '@/components/NotInCollectionBanner';
import { renderWithProviders } from './helpers/render-component';

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

beforeEach(() => router.refresh.mockReset());
afterEach(() => {
  cleanup();
  for (const id of ['v95081', 'v95082', 'v95083', 'v95084']) {
    acknowledgeVnCollectionState(id, true);
    acknowledgeVnCollectionState(id, false);
  }
});

describe('collection membership after navigation', () => {
  it('retains a successful add that happened before the detail components mounted', () => {
    dispatchVnCollectionChanged({ vnId: 'v95081', inCollection: true });
    const { result } = renderHook(() => useVnCollectionState('v95081', false));
    expect(result.current).toBe(true);
  });

  it('retains a successful remove before a stale owned detail mounts', () => {
    dispatchVnCollectionChanged({ vnId: 'v95082', inCollection: false });
    const { result } = renderHook(() => useVnCollectionState('v95082', true));
    expect(result.current).toBe(false);
  });

  it('refreshes stale detail props after search add, then acknowledges the server result', () => {
    dispatchVnCollectionChanged({ vnId: 'v95083', inCollection: true });
    const view = renderWithProviders(<NotInCollectionBanner vnId="v95083" />, { locale: 'en' });
    expect(screen.queryByText('Not in your library')).toBeNull();
    expect(router.refresh).toHaveBeenCalledTimes(1);
    expect(getPendingVnCollectionState('v95083')).toBe(true);
    view.rerender(<NotInCollectionBanner vnId="v95083" initialInCollection />);
    expect(getPendingVnCollectionState('v95083')).toBeUndefined();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh current props or erase a newer conflicting mutation', () => {
    dispatchVnCollectionChanged({ vnId: 'v95084', inCollection: false });
    acknowledgeVnCollectionState('v95084', true);
    expect(getPendingVnCollectionState('v95084')).toBe(false);
    renderWithProviders(<NotInCollectionBanner vnId="v95084" />, { locale: 'en' });
    expect(router.refresh).not.toHaveBeenCalled();
    expect(getPendingVnCollectionState('v95084')).toBeUndefined();
  });

  it('keeps unrelated pending mutations out of another VN and accepts subsequent server props', () => {
    dispatchVnCollectionChanged({ vnId: 'v95081', inCollection: true });
    const view = renderHook(({id,owned}) => useVnCollectionState(id, owned), {
      initialProps: {id:'v95082',owned:false},
    });
    expect(view.result.current).toBe(false);
    view.rerender({id:'v95081',owned:false});
    expect(view.result.current).toBe(true);
    act(() => acknowledgeVnCollectionState('v95081', true));
    view.rerender({id:'v95081',owned:true});
    expect(view.result.current).toBe(true);
    view.rerender({id:'v95081',owned:false});
    expect(view.result.current).toBe(false);
  });
});
