import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PANEL = readFileSync('src/components/StockPanel.tsx', 'utf8');

describe('stock panel request ownership', () => {
  it('owns initial reads and aborts them before refresh writes', () => {
    expect(PANEL).toContain('const loadAbortRef = useRef<AbortController | null>(null)');
    expect(PANEL).toContain('loadAbortRef.current?.abort()');
    expect(PANEL).toContain('loadAbortRef.current !== controller');
    expect(PANEL).toContain('signal: controller.signal');
  });

  it('commits provider refresh completion only from the active owner', () => {
    expect(PANEL).toContain('if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) break');
    expect(PANEL).toContain('if (!ownsSnapshotMutation(ownerVnId, abortRef, ctrl)) return');
    expect(PANEL).toContain('if (!r.ok) throw new Error(await readApiError(r, t.common.error))');
  });

  it('aborts every stock channel during teardown', () => {
    expect(PANEL).toContain('abortRef.current?.abort()');
    expect(PANEL).toContain('loadAbortRef.current?.abort()');
    expect(PANEL).toContain('aliasAbortRef.current?.abort()');
    expect(PANEL).toContain('sourceAbortRef.current?.abort()');
    expect(PANEL).toContain('clearCacheAbortRef.current?.abort()');
    expect(PANEL).toContain('abortRef.current = null');
    expect(PANEL).toContain('loadAbortRef.current = null');
  });

  it('resets VN-scoped stock state when the detail identity changes', () => {
    expect(PANEL).toContain('setSnapshot(initialSnapshot ?? null)');
    expect(PANEL).toContain('setSelectedProviders(null)');
    expect(PANEL).toContain('setProgress(null)');
    expect(PANEL).toContain('setAliases([])');
    expect(PANEL).toContain('aliasMutationInFlightRef.current = false');
    expect(PANEL).toContain('snapshotMutationInFlightRef.current = false');
    expect(PANEL).toContain('}, [vnId, initialSnapshot])');
  });

  it('clears visible refresh state immediately when the operator stops the batch', () => {
    expect(PANEL).toContain('setCurrentProvider(null)');
    expect(PANEL).toContain('setLoading(false)');
  });

  it('serializes snapshot writers and owns alias mutations separately', () => {
    expect(PANEL).toContain('if (snapshotMutationInFlightRef.current) return null');
    expect(PANEL).toContain('if (aliasMutationInFlightRef.current) return null');
    expect(PANEL).toContain('ownsSnapshotMutation(ownerVnId, sourceAbortRef, controller)');
    expect(PANEL).toContain('ownsSnapshotMutation(ownerVnId, clearCacheAbortRef, controller)');
    expect(PANEL).toContain('ownsAliasMutation(ownerVnId, controller)');
  });

  it('routes suggested aliases through the canonical guarded action', () => {
    expect(PANEL).toContain('onClick={() => { void handleAddAlias(s); }}');
    expect(PANEL).not.toContain("body: JSON.stringify({ term: s, action: 'add' })");
  });

  it.each([
    ['alias removal', 'async function removeAlias(term: string)', 'const controller = beginAliasMutation()'],
    ['source removal', 'async function removeSource(id: number)', 'const controller = beginSnapshotMutation(sourceAbortRef)'],
  ])('reserves the %s owner before awaiting confirmation', (_label, start, acquire) => {
    const body = PANEL.slice(PANEL.indexOf(start));
    expect(body.indexOf(acquire)).toBeLessThan(body.indexOf('await confirm('));
  });
});
