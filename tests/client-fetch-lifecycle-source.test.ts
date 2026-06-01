import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(path, 'utf8');
}

describe('client fetch lifecycle ownership', () => {
  it('resets and aborts lazy list-membership state when VN identity changes', () => {
    const body = source('src/components/ListsPickerButton.tsx');
    expect(body).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(body).toContain("fetch('/api/lists', { cache: 'no-store', signal: controller.signal })");
    expect(body).toContain('setMemberships(null);');
    expect(body).toContain('setMemberCount(initialMemberCount ?? null);');
    expect(body).toContain('}, [vnId, initialMemberCount]);');
  });

  it('aborts provider-assignment hydration when the dialog closes', () => {
    const body = source('src/components/AssignProviderDialog.tsx');
    expect(body).toContain('const controller = new AbortController()');
    expect(body).toContain('refreshAbortRef.current?.abort()');
    expect(body).toContain('void refresh()');
    expect(body).toContain('refreshAbortRef.current?.abort()');
    expect(body).toContain("fetch('/api/places/unassigned', { cache: 'no-store', signal })");
  });

  it('aborts stock-batch settings hydration on unmount', () => {
    const body = source('src/components/StockBatchClient.tsx');
    expect(body).toContain("fetch('/api/settings', { cache: 'no-store', signal: controller.signal })");
    expect(body).toContain('if (!controller.signal.aborted)');
    expect(body).toContain('return () => controller.abort()');
  });

  it('owns stock-batch scope pagination requests and blocks duplicate scope loads', () => {
    const body = source('src/components/StockBatchClient.tsx');
    expect(body).toContain('const activeScopeControllersRef = useRef(new Set<AbortController>())');
    expect(body).toContain('const activeScopesRef = useRef(new Set<StockBatchScope>())');
    expect(body).toContain('if (activeScopesRef.current.has(scope)) return');
    expect(body).toContain('signal: controller.signal');
    expect(body).toContain('for (const controller of controllers) controller.abort()');
    expect(body).toContain('disabled={running || loadingScopes.has(scope)}');
  });
});
