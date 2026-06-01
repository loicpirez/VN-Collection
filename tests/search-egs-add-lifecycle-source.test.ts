import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SEARCH = readFileSync('src/components/SearchClient.tsx', 'utf8');

describe('SearchClient EGS-only add lifecycle', () => {
  it('aborts insertion when the search page unmounts', () => {
    expect(SEARCH).toContain('const egsAddAbortRef = useRef<AbortController | null>(null)');
    expect(SEARCH).toContain('mountedRef.current = false');
    expect(SEARCH).toContain('egsAddAbortRef.current?.abort()');
  });

  it('locks duplicate insertion before network work begins', () => {
    expect(SEARCH).toContain('if (egsAddInFlightRef.current) return');
    expect(SEARCH).toContain('egsAddInFlightRef.current = true');
    expect(SEARCH).toContain('signal: controller.signal');
    expect(SEARCH).toContain('disabled={addingEgsId != null || isAdded}');
  });

  it('suppresses obsolete state updates and navigation', () => {
    expect(SEARCH).toContain('controller.signal.aborted || !mountedRef.current || egsAddAbortRef.current !== controller');
    expect(SEARCH).toContain('if (egsAddAbortRef.current === controller)');
  });
});
