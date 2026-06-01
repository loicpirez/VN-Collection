import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PICKER = readFileSync('src/components/ListsPickerButton.tsx', 'utf8');

describe('list-membership picker mutation lifecycle', () => {
  it('owns lazy reads and resets the live membership snapshot per VN', () => {
    expect(PICKER).toContain('const identityRef = useRef<string | null>(vnId)');
    expect(PICKER).toContain('const membershipsRef = useRef<Set<number> | null>(null)');
    expect(PICKER).toContain('identityRef.current !== ownerVnId || loadAbortRef.current !== controller');
    expect(PICKER).toContain('membershipsRef.current = null');
  });

  it('locks toggles per list and rolls back only the failed membership', () => {
    expect(PICKER).toContain('const toggleInFlightRef = useRef(new Set<number>())');
    expect(PICKER).toContain('const toggleAbortRefs = useRef(new Map<number, AbortController>())');
    expect(PICKER).toContain('toggleInFlightRef.current.has(list.id)');
    expect(PICKER).toContain('toggleAbortRefs.current.get(list.id)?.abort()');
    expect(PICKER).toContain('toggleAbortRefs.current.get(list.id) !== controller || controller.signal.aborted');
    expect(PICKER).toContain('signal: controller.signal');
    expect(PICKER).toContain('const rollback = new Set(live)');
    expect(PICKER).toContain('if (isMember) rollback.add(list.id)');
    expect(PICKER).toContain('else rollback.delete(list.id)');
  });

  it('locks create-then-add work and rejects stale completion', () => {
    expect(PICKER).toContain('const createInFlightRef = useRef(false)');
    expect(PICKER).toContain('const createAbortRef = useRef<AbortController | null>(null)');
    expect(PICKER).toContain('if (!trimmed || createInFlightRef.current) return');
    expect(PICKER).toContain('createAbortRef.current?.abort()');
    expect(PICKER).toContain('createAbortRef.current !== controller || controller.signal.aborted');
    expect(PICKER).toContain('await toggle(list)');
  });

  it('uses the localized filter label and hides touched decorative glyphs', () => {
    expect(PICKER).toContain('aria-label={t.lists.filterPlaceholder}');
    expect(PICKER).toContain('<Check className="h-3 w-3" aria-hidden />');
    expect(PICKER).toContain('<Plus className="h-3 w-3" aria-hidden />');
  });
});
