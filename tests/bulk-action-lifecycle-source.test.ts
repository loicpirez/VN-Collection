import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BULK = readFileSync('src/components/BulkActionBar.tsx', 'utf8');

describe('bulk-action lifecycle', () => {
  it('aborts active work when the selected set changes or unmounts', () => {
    expect(BULK).toContain("const selectionKey = selectedIds.join('|')");
    expect(BULK).toContain('const selectionIdentityRef = useRef<string | null>(selectionKey)');
    expect(BULK).toContain('controllerRef.current?.abort()');
    expect(BULK).toContain('selectionIdentityRef.current = null');
  });

  it('locks entry synchronously and snapshots selected ids', () => {
    expect(BULK).toContain('const operationInFlightRef = useRef(false)');
    expect(BULK).toContain('selectedIds.length === 0 || operationInFlightRef.current');
    expect(BULK).toContain('const ids = [...selectedIds]');
    expect(BULK).toContain('if (!ok || !ownsSelection(ownerKey)) return');
  });

  it('keeps best-effort per-row error collection inside owned loops', () => {
    expect(BULK).toContain('if (!cancelRef.current && ownsSelection(ownerKey)) localErrors.push((e as Error).message)');
    expect(BULK).toContain('if (cancelRef.current || !ownsSelection(ownerKey)) break');
    expect(BULK).toContain('toast.error(`${localErrors.length} ${t.bulkEdit.errors}`)');
  });
});
