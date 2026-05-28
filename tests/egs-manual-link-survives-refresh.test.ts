/**
 * Regression test for the operator's question:
 *   "Are you SURE erogescape the url(s) are saved so when I refresh
 *    it doesnt lose the match?"
 *
 * The contract: a manual VN→EGS pin persists across every cache
 * bust we expose to the operator:
 *   - clearVnStockCache(vnId) (stock provider snapshot wipe)
 *   - invalidateVnCache(vnId) (VNDB cache wipe)
 *   - vndb_cache row deletion via prefix bust
 *
 * The override lives in the `vn_egs_link` table, which is NEVER
 * touched by any cache invalidation path. This test pins that
 * promise so a future cleanup doesn't accidentally regress it.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  clearVnEgsLink,
  clearVnStockCache,
  getVnEgsLink,
  setVnEgsLink,
  upsertVn,
} from '@/lib/db';
import { invalidateVnCache } from '@/lib/vndb';

describe('EGS manual link survives refresh', () => {
  const VN = 'v95004';
  const EGS = 4242;

  // FK constraint: `vn_egs_link.vn_id` references `vn.id`, so the
  // VN row must exist before the link can be created. Seed once
  // (idempotent via INSERT OR REPLACE).
  beforeAll(() => {
    upsertVn({ id: VN, title: 'Placeholder' });
  });

  it('survives clearVnStockCache', () => {
    setVnEgsLink(VN, EGS);
    expect(getVnEgsLink(VN)?.egs_id).toBe(EGS);
    clearVnStockCache(VN);
    expect(getVnEgsLink(VN)?.egs_id).toBe(EGS);
    clearVnEgsLink(VN); // cleanup
  });

  it('survives invalidateVnCache (VNDB cache wipe)', () => {
    setVnEgsLink(VN, EGS);
    expect(getVnEgsLink(VN)?.egs_id).toBe(EGS);
    invalidateVnCache(VN);
    expect(getVnEgsLink(VN)?.egs_id).toBe(EGS);
    clearVnEgsLink(VN);
  });

  it('manual `no counterpart` (egs_id = NULL) also survives', () => {
    setVnEgsLink(VN, null);
    const before = getVnEgsLink(VN);
    expect(before).not.toBeNull();
    expect(before?.egs_id).toBeNull();
    clearVnStockCache(VN);
    invalidateVnCache(VN);
    const after = getVnEgsLink(VN);
    expect(after).not.toBeNull();
    expect(after?.egs_id).toBeNull();
    clearVnEgsLink(VN);
  });
});
