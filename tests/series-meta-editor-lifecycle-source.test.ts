import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EDITOR = readFileSync('src/components/SeriesMetaEditor.tsx', 'utf8');

describe('series metadata editor mutation lifecycle', () => {
  it('owns uploads and saves with one abortable synchronous lock', () => {
    expect(EDITOR).toContain('const identityRef = useRef<number | null>(seriesId)');
    expect(EDITOR).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(EDITOR).toContain('const mutationInFlightRef = useRef(false)');
    expect(EDITOR).toContain('if (mutationInFlightRef.current) return null');
    expect(EDITOR).toContain('mutationAbortRef.current?.abort()');
    expect(EDITOR).toContain('mutationAbortRef.current === controller');
    expect(EDITOR).toContain('!controller.signal.aborted');
    expect(EDITOR).toContain('signal: controller.signal');
  });

  it('aborts obsolete series work on identity replacement and teardown', () => {
    expect(EDITOR).toContain('identityRef.current = seriesId');
    expect(EDITOR).toContain('identityRef.current = null');
    expect(EDITOR).toContain('finishMutation(controller)');
  });

  it('disables competing editor controls while persistence is active', () => {
    expect(EDITOR).toContain('disabled={saving || uploadingKind !== null}');
    expect(EDITOR).toContain('disabled={!dirty || saving || uploadingKind !== null || !name.trim()}');
  });

  it('hides decorative action glyphs from assistive technology', () => {
    expect(EDITOR).toContain('<Upload className="h-3 w-3" aria-hidden />');
    expect(EDITOR).toContain('<Trash2 className="h-3 w-3" aria-hidden />');
    expect(EDITOR).toContain('<X className="h-3 w-3" aria-hidden />');
    expect(EDITOR).toContain('<Save className="h-3 w-3" aria-hidden />');
  });
});
