import { describe, expect, it } from 'vitest';
import {
  VN_COLLECTION_CHANGED_EVENT,
  dispatchVnCollectionChanged,
  type VnCollectionChangedDetail,
} from '@/lib/vn-collection-events';

describe('vn-collection-events', () => {
  it('exports the stable contract and no-ops outside the browser', () => {
    expect(VN_COLLECTION_CHANGED_EVENT).toBe('vn:collection-changed');
    const detail: VnCollectionChangedDetail = { vnId: 'v90001', inCollection: true };
    expect(detail).toEqual({ vnId: 'v90001', inCollection: true });
    expect(() => dispatchVnCollectionChanged(detail)).not.toThrow();
  });
});
