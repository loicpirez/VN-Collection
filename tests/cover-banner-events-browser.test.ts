// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  VN_COVER_CHANGED_EVENT,
  dispatchCoverChanged,
  getLatestCoverChange,
  type VnCoverChangedDetail,
} from '@/lib/cover-banner-events';

describe('cover mutation browser replay', () => {
  it('publishes a transient mutation without replacing the replay snapshot', () => {
    const listener = vi.fn();
    window.addEventListener(VN_COVER_CHANGED_EVENT, listener);
    const persistent: VnCoverChangedDetail = {
      vnId: 'v90018',
      newSrc: null,
      newLocal: null,
      rotation: 90,
    };
    dispatchCoverChanged(persistent);
    const transient = { ...persistent, rotation: 180 as const };
    dispatchCoverChanged(transient, false);
    expect(listener).toHaveBeenCalledTimes(2);
    expect((listener.mock.calls[1][0] as CustomEvent<VnCoverChangedDetail>).detail).toEqual(transient);
    expect(getLatestCoverChange('v90018')).toEqual(persistent);
    window.removeEventListener(VN_COVER_CHANGED_EVENT, listener);
  });
});
