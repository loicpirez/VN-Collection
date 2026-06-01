import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ROUTES = readFileSync('src/components/RoutesSection.tsx', 'utf8');

describe('route-section lifecycle', () => {
  it('resets VN-scoped route state and nested add drafts on identity changes', () => {
    expect(ROUTES).toContain('identityRef.current = vnId');
    expect(ROUTES).toContain('identityRef.current = null');
    expect(ROUTES).toContain('setRoutes([])');
    expect(ROUTES).toContain('setEditingId(null)');
    expect(ROUTES).toContain('setNotesOpen(null)');
    expect(ROUTES).toContain("setDraft('')");
    expect(ROUTES).toContain('}, [vnId])');
  });

  it('guards reconciliation reads and every asynchronous route mutation', () => {
    expect(ROUTES).toContain('signal?.aborted || identityRef.current !== ownerVnId');
    expect(ROUTES).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(ROUTES).toContain('const mutationInFlightRef = useRef(false)');
    expect(ROUTES).toContain('mutationAbortRef.current?.abort()');
    expect(ROUTES).toContain('if (mutationInFlightRef.current) return null');
    expect(ROUTES).toContain('mutationAbortRef.current === controller');
    expect(ROUTES).toContain('!controller.signal.aborted');
    expect(ROUTES).toContain('signal: controller.signal');
    expect(ROUTES).toContain('await reload(controller.signal)');
    expect(ROUTES).toContain('setRoutes(current)');
  });

  it('reserves route deletion before awaiting confirmation', () => {
    const removeStart = ROUTES.indexOf('const remove = useCallback(async (id: number)');
    const body = ROUTES.slice(removeStart, ROUTES.indexOf('const move = useCallback', removeStart));
    expect(body.indexOf('const controller = startMutation()')).toBeLessThan(body.indexOf('await confirm('));
    expect(body).toContain('if (!ok || !ownsMutation(ownerVnId, controller))');
  });

  it('suppresses obsolete character errors and nested editor completion work', () => {
    expect(ROUTES).toContain("ctrl.signal.aborted || identityRef.current !== vnId");
    expect(ROUTES).toContain('editingIdRef.current = null');
    expect(ROUTES).toContain('notesOpenRef.current = null');
  });

  it('uses a locale-neutral ASCII suggestion separator', () => {
    expect(ROUTES).toContain('`${c.name} / ${c.original}`');
    expect(ROUTES).not.toContain('`${c.name} · ${c.original}`');
  });
});
