import { describe, expect, it } from 'vitest';
import {
  isVndbReleaseListStatus,
  VNDB_RELEASE_LIST_STATUSES,
} from '@/lib/vndb-release-list-shape';

describe('VNDB release-list state shape', () => {
  it('accepts every documented state', () => {
    expect(VNDB_RELEASE_LIST_STATUSES).toEqual([0, 1, 2, 3, 4]);
    for (const status of VNDB_RELEASE_LIST_STATUSES) {
      expect(isVndbReleaseListStatus(status)).toBe(true);
    }
  });

  it('rejects values outside the documented states', () => {
    expect(isVndbReleaseListStatus(-1)).toBe(false);
    expect(isVndbReleaseListStatus(5)).toBe(false);
    expect(isVndbReleaseListStatus('2')).toBe(false);
    expect(isVndbReleaseListStatus(null)).toBe(false);
  });
});
