import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const SAVED_FILTERS = readFileSync('src/components/SavedFilters.tsx', 'utf8');

describe('saved-filter lifecycle', () => {
  it('owns every reload and aborts the latest request on teardown', () => {
    expect(SAVED_FILTERS).toContain('const mountedRef = useRef(true)');
    expect(SAVED_FILTERS).toContain('loadAbortRef.current?.abort()');
    expect(SAVED_FILTERS).toContain('loadAbortRef.current !== controller');
    expect(SAVED_FILTERS).toContain('loadAbortRef.current?.abort();');
  });

  it('locks saved-filter mutations before React rerenders', () => {
    expect(SAVED_FILTERS).toContain('const mutationRef = useRef(false)');
    expect(SAVED_FILTERS).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(SAVED_FILTERS).toContain('if (mutationRef.current) return');
    expect(SAVED_FILTERS).toContain('mutationRef.current = true');
    expect(SAVED_FILTERS).toContain('mutationAbortRef.current?.abort()');
    expect(SAVED_FILTERS).toContain('signal: controller.signal');
    expect(SAVED_FILTERS).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(SAVED_FILTERS).toContain('if (mutationAbortRef.current === controller)');
    expect(SAVED_FILTERS).toContain('<BookmarkPlus className="h-3 w-3" aria-hidden />');
    expect(SAVED_FILTERS).toContain('<X className="h-3.5 w-3.5" aria-hidden />');
  });
});
