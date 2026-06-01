import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const WISHLIST = readFileSync('src/components/WishlistClient.tsx', 'utf8');

describe('wishlist request ownership', () => {
  it('owns reads with one abort controller', () => {
    expect(WISHLIST).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(WISHLIST).toContain('loadAbortRef.current?.abort()');
    expect(WISHLIST).toContain('signal: controller.signal');
    expect(WISHLIST).toContain('loadAbortRef.current !== controller');
  });

  it('invalidates reads before deleting rows', () => {
    expect(WISHLIST).toContain('loadAbortRef.current?.abort()');
    const removeOne = WISHLIST.indexOf('const removeOne');
    const invalidateRead = WISHLIST.indexOf('loadAbortRef.current?.abort()', removeOne);
    const showRemoving = WISHLIST.indexOf('setRemovingId(id)', removeOne);
    expect(invalidateRead).toBeGreaterThan(removeOne);
    expect(showRemoving).toBeGreaterThan(invalidateRead);
  });

  it('owns deletion writes and binds bulk confirmation to the live selection', () => {
    expect(WISHLIST).toContain('const mountedRef = useRef(true)');
    expect(WISHLIST).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(WISHLIST).toContain('const mutationInFlightRef = useRef(false)');
    expect(WISHLIST).toContain('const ownerSelectionKey = selectionKey(list)');
    expect(WISHLIST).toContain('selectionKey(selectedRef.current) !== ownerSelectionKey');
    expect(WISHLIST).toContain("fetch(`/api/wishlist/${id}`, { method: 'DELETE', signal: controller.signal })");
    expect(WISHLIST).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(WISHLIST).toContain('mutationAbortRef.current?.abort()');
  });

  it('reserves bulk deletion ownership before awaiting confirmation', () => {
    const deleteStart = WISHLIST.indexOf('async function deleteSelected()');
    const body = WISHLIST.slice(deleteStart);
    expect(body.indexOf('mutationAbortRef.current = controller')).toBeLessThan(body.indexOf('await confirm('));
    expect(body.indexOf('mutationInFlightRef.current = true')).toBeLessThan(body.indexOf('await confirm('));
  });

  it('keeps the manual refresh spinner owned by the latest refresh', () => {
    expect(WISHLIST).toContain('const manualRefreshIdRef = useRef(0)');
    expect(WISHLIST).toContain('if (mountedRef.current && manualRefreshIdRef.current === refreshId) setRefreshing(false)');
  });

  it('uses ASCII separators in wishlist metadata', () => {
    expect(WISHLIST).toContain("{' / '}");
    expect(WISHLIST).toContain('/ {g.items.length}');
    expect(WISHLIST).not.toContain("{' · '}");
    expect(WISHLIST).not.toContain('>· {g.items.length}');
    expect(WISHLIST).not.toContain('>–</span>');
  });
});
