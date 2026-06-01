import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SHELF = readFileSync('src/components/ShelfLayoutEditor.tsx', 'utf8');

describe('shelf editor reconciliation ownership', () => {
  it('owns all three reconciliation channels', () => {
    expect(SHELF).toContain('const refreshAbortRef = useRef<AbortController | null>(null)');
    expect(SHELF).toContain('const poolRefreshAbortRef = useRef<AbortController | null>(null)');
    expect(SHELF).toContain('const shelfMetaRefreshAbortRef = useRef<AbortController | null>(null)');
    expect(SHELF).toContain('refreshAbortRef.current !== ac');
    expect(SHELF).toContain('poolRefreshAbortRef.current !== ac');
    expect(SHELF).toContain('shelfMetaRefreshAbortRef.current !== ac');
  });

  it('aborts every channel during teardown', () => {
    expect(SHELF).toContain('refreshAbortRef.current?.abort()');
    expect(SHELF).toContain('poolRefreshAbortRef.current?.abort()');
    expect(SHELF).toContain('shelfMetaRefreshAbortRef.current?.abort()');
  });

  it('routes pool reconciliation through the owned helper', () => {
    expect(SHELF).not.toMatch(/const poolRes = await fetch\('\/api\/shelves\?pool=1'/);
    expect(SHELF.match(/await refreshPool\(\)/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('serializes shelf writes and rejects obsolete shelf completion work', () => {
    expect(SHELF).toContain('const mountedRef = useRef(true)');
    expect(SHELF).toContain('const activeIdRef = useRef(activeId)');
    expect(SHELF).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(SHELF).toContain('const mutationInFlightRef = useRef(false)');
    expect(SHELF).toContain('if (mutationInFlightRef.current) return null');
    expect(SHELF).toContain('mutationAbortRef.current?.abort()');
    expect(SHELF).toContain('mutationAbortRef.current === controller');
    expect(SHELF).toContain('!controller.signal.aborted');
    expect(SHELF).toContain('(shelfId === undefined || activeIdRef.current === shelfId)');
    expect(SHELF).toContain('signal: controller.signal');
    expect(SHELF).toContain('if (!next || !ownsMutation(controller, ownerShelfId))');
    expect(SHELF).toContain('if (!ok || !ownsMutation(controller, ownerShelfId))');
  });

  it.each([
    ['rename', 'async function handleRename()', 'await prompt('],
    ['delete', 'async function handleDelete()', 'await confirm('],
  ])('reserves shelf %s ownership before awaiting delayed input', (_label, start, delayed) => {
    const body = SHELF.slice(SHELF.indexOf(start));
    expect(body.indexOf('const controller = startMutation()')).toBeLessThan(body.indexOf(delayed));
  });

  it('locks shelf navigation and uses ASCII rendered metadata during writes', () => {
    expect(SHELF).toContain('disabled={busy || shelves.length < 2}');
    expect(SHELF).toContain('disabled={busy}');
    expect(SHELF).toContain('{activeShelf.cols} x {activeShelf.rows}');
    expect(SHELF).toContain('`${row + 1}/${col + 1}`');
    expect(SHELF).toContain('`${slot.vn_title} - ${label} / ${slot.position + 1}`');
    expect(SHELF).not.toContain('{activeShelf.cols} × {activeShelf.rows}');
  });
});
