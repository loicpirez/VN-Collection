import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const AUTO_SUGGEST = readFileSync('src/components/SeriesAutoSuggest.tsx', 'utf8');
const ADD_FORM = readFileSync('src/components/SeriesAddVnForm.tsx', 'utf8');
const REMOVE_BUTTON = readFileSync('src/components/SeriesRemoveVn.tsx', 'utf8');

describe('series helper identity lifecycle', () => {
  it('resets VN-scoped suggestion state and rejects obsolete completion work', () => {
    expect(AUTO_SUGGEST).toContain('const identityRef = useRef<string | null>(vnId)');
    expect(AUTO_SUGGEST).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(AUTO_SUGGEST).toContain('const mutationInFlightRef = useRef(false)');
    expect(AUTO_SUGGEST).toContain('setDismissed(false)');
    expect(AUTO_SUGGEST).toContain('const ownerVnId = vnId');
    expect(AUTO_SUGGEST).toContain('mutationAbortRef.current?.abort()');
    expect(AUTO_SUGGEST).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(AUTO_SUGGEST).toContain('signal: controller.signal');
    expect(AUTO_SUGGEST).toContain('identityRef.current === ownerVnId && mutationAbortRef.current === controller');
    expect(AUTO_SUGGEST).toContain('identityRef.current = null');
    expect(AUTO_SUGGEST).toContain(".join(' / ')");
    expect(AUTO_SUGGEST).toContain('<X className="h-3 w-3" aria-hidden />');
  });

  it('resets series add drafts and owns late link completions', () => {
    expect(ADD_FORM).toContain('const identityRef = useRef<number | null>(seriesId)');
    expect(ADD_FORM).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(ADD_FORM).toContain('const inFlightRef = useRef(false)');
    expect(ADD_FORM).toContain("setVnId('')");
    expect(ADD_FORM).toContain('const ownerSeriesId = seriesId');
    expect(ADD_FORM).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(ADD_FORM).toContain('signal: controller.signal');
    expect(ADD_FORM).toContain('identityRef.current = null');
  });

  it('rejects obsolete remove work before and after confirmation', () => {
    expect(REMOVE_BUTTON).toContain('const ownerKey = `${seriesId}|${vnId}`');
    expect(REMOVE_BUTTON).toContain('const identityRef = useRef<string | null>(ownerKey)');
    expect(REMOVE_BUTTON).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(REMOVE_BUTTON).toContain('const inFlightRef = useRef(false)');
    expect(REMOVE_BUTTON).toContain('if (!ok || identityRef.current !== owner || mutationAbortRef.current !== controller || controller.signal.aborted) {');
    expect(REMOVE_BUTTON).toContain('mutationAbortRef.current !== controller || controller.signal.aborted');
    expect(REMOVE_BUTTON).toContain('signal: controller.signal');
    expect(REMOVE_BUTTON).toContain('identityRef.current = null');
  });

  it('reserves series removal ownership before awaiting confirmation', () => {
    const clickStart = REMOVE_BUTTON.indexOf('onClick={async (e) =>');
    const body = REMOVE_BUTTON.slice(clickStart);
    expect(body.indexOf('mutationAbortRef.current = controller')).toBeLessThan(body.indexOf('await confirm('));
  });
});
