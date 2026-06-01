import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const LIBRARY = readFileSync('src/components/LibraryClient.tsx', 'utf8');
const SORTABLE = readFileSync('src/components/SortableGrid.tsx', 'utf8');

describe('library custom-order lifecycle', () => {
  it('owns reset and reorder writes with one abortable synchronous lock', () => {
    expect(LIBRARY).toContain('const orderMutationAbortRef = useRef<AbortController | null>(null)');
    expect(LIBRARY).toContain('const orderMutationInFlightRef = useRef(false)');
    expect(LIBRARY).toContain('if (orderMutationInFlightRef.current) return null');
    expect(LIBRARY).toContain('orderMutationAbortRef.current?.abort()');
    expect(LIBRARY).toContain('orderMutationAbortRef.current === controller');
    expect(LIBRARY).toContain('!controller.signal.aborted');
    expect(LIBRARY).toContain("fetch('/api/collection/order', { method: 'DELETE', signal: controller.signal })");
    expect(LIBRARY).toContain('signal: controller.signal');
    expect(LIBRARY).toContain('if (!response.ok) throw new Error(await readApiError(response, t.common.error))');
  });

  it('reserves custom-order reset before awaiting confirmation', () => {
    const resetStart = LIBRARY.indexOf('const resetCustomOrder = useCallback(async () =>');
    const body = LIBRARY.slice(resetStart, LIBRARY.indexOf('const persistCustomOrder', resetStart));
    expect(body.indexOf('const controller = startOrderMutation()')).toBeLessThan(body.indexOf('await confirm('));
    expect(body).toContain('!ownsOrderMutation(controller)');
  });

  it('preserves hidden rows and rolls back owned reorder failures', () => {
    expect(LIBRARY).toContain('const previous = itemsRef.current');
    expect(LIBRARY).toContain('orderedIdSet.has(row.id) ? orderedRows[cursor++] ?? row : row');
    expect(LIBRARY).toContain('itemsRef.current = previous');
    expect(LIBRARY).toContain('setItems(previous)');
  });

  it('disables drag interactions while persistence is active', () => {
    expect(LIBRARY).toContain('disabled={savingOrder}');
    expect(SORTABLE).toContain('disabled?: boolean');
    expect(SORTABLE).toContain('disabled = false');
    expect(SORTABLE).toContain('disabled,');
    expect(SORTABLE).toContain("disabled ? 'cursor-not-allowed opacity-70' : 'cursor-grab active:cursor-grabbing'");
  });

  it('uses ASCII range and comparison tokens in library metadata', () => {
    expect(LIBRARY).toContain('`${urlYearMin}-${urlYearMax}`');
    expect(LIBRARY).toContain('`>= ${urlYearMin}`');
    expect(LIBRARY).toContain('`<= ${urlYearMax}`');
    expect(LIBRARY).not.toContain('`${urlYearMin}–${urlYearMax}`');
    expect(LIBRARY).not.toContain('>–</span>');
  });
});
