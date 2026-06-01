import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('VN detail action lifecycle', () => {
  it('invalidates lightweight action owners on VN change and teardown', () => {
    for (const path of [
      'src/components/QueueButton.tsx',
      'src/components/NotInCollectionBanner.tsx',
      'src/components/SmartStatusHint.tsx',
      'src/components/CoverQuickActions.tsx',
      'src/components/VnListMemberships.tsx',
    ]) {
      const body = source(path);
      expect(body, path).toContain('identityRef.current = vnId');
      expect(body, path).toContain('identityRef.current = null');
      expect(body, path).toContain('identityRef.current !== ownerVnId');
    }
  });

  it('guards delayed queue reads and add-banner refresh timers', () => {
    const queue = source('src/components/QueueButton.tsx');
    const banner = source('src/components/NotInCollectionBanner.tsx');

    expect(queue).toContain('if (ac.signal.aborted || identityRef.current !== ownerVnId) return');
    expect(banner).toContain('if (identityRef.current === ownerVnId) router.refresh()');
    expect(banner).toContain("detail: { vnId: ownerVnId }");
  });

  it('reserves collection removal before awaiting confirmation', () => {
    const quickActions = source('src/components/CoverQuickActions.tsx');
    const removeStart = quickActions.indexOf('async function removeFromCollection()');
    const removeBody = quickActions.slice(removeStart, quickActions.indexOf('async function toggleVndbWishlist()', removeStart));
    expect(removeBody.indexOf('const controller = beginMutation()')).toBeLessThan(removeBody.indexOf('await confirm('));
    expect(removeBody).toContain('if (!ok || !ownsMutation(ownerVnId, controller))');
  });

  it.each([
    'src/components/CoverQuickActions.tsx',
    'src/components/FavoriteToggleButton.tsx',
    'src/components/QueueButton.tsx',
    'src/components/NotInCollectionBanner.tsx',
    'src/components/SmartStatusHint.tsx',
    'src/components/VnListMemberships.tsx',
  ])('%s aborts active writes and locks rapid submissions synchronously', (path) => {
    const body = source(path);
    expect(body).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain('mutationAbortRef.current?.abort()');
    expect(body).toContain('mutationInFlightRef.current');
    expect(body).toContain('signal: controller.signal');
  });

  it('hides touched decorative action icons', () => {
    const queue = source('src/components/QueueButton.tsx');
    const quickActions = source('src/components/CoverQuickActions.tsx');
    const contextMenu = source('src/components/CardContextMenu.tsx');
    expect(queue).toContain('<ListOrdered className="h-4 w-4" aria-hidden />');
    expect(queue).toContain('<Plus className="h-4 w-4" aria-hidden />');
    expect(quickActions).toContain('<Trash2 className="h-4 w-4" aria-hidden />');
    expect(quickActions).toContain("aria-hidden />");
    expect(contextMenu).toContain('<Check className="h-3 w-3" aria-hidden />');
  });
});
