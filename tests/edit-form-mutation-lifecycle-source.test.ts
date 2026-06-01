import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const EDIT_FORM = readFileSync('src/components/EditForm.tsx', 'utf8');

describe('VN edit-form mutation lifecycle', () => {
  it('owns collection autosave and membership actions through separate mutation generations', () => {
    expect(EDIT_FORM).toContain('const collectionAbortRef = useRef<AbortController | null>(null)');
    expect(EDIT_FORM).toContain("const collectionMutationKindRef = useRef<'autosave' | 'action' | null>(null)");
    expect(EDIT_FORM).toContain('function beginAutosave(ownerVnId: string): AbortController | null');
    expect(EDIT_FORM).toContain('function beginCollectionAction(ownerVnId: string): AbortController | null');
    expect(EDIT_FORM).toContain('collectionAbortRef.current?.abort()');
    expect(EDIT_FORM).toContain('keepalive: detached');
    expect(EDIT_FORM).toContain('signal: controller?.signal');
    expect(EDIT_FORM).toContain("() => call('DELETE', undefined, { signal: controller.signal })");
  });

  it('acquires the destructive collection owner before awaiting confirmation', () => {
    const removeStart = EDIT_FORM.indexOf('async function handleRemove()');
    const removeBody = EDIT_FORM.slice(removeStart, EDIT_FORM.indexOf('async function addSeries', removeStart));
    expect(removeBody.indexOf('const controller = beginCollectionAction(ownerVnId)'))
      .toBeLessThan(removeBody.indexOf('await confirm('));
    expect(removeBody).toContain('clearPendingAutosave()');
  });

  it('owns one series mutation channel and cancels obsolete work', () => {
    expect(EDIT_FORM).toContain('const seriesAbortRef = useRef<AbortController | null>(null)');
    expect(EDIT_FORM).toContain('function beginSeriesMutation(ownerVnId: string): AbortController | null');
    expect(EDIT_FORM).toContain('seriesAbortRef.current?.abort()');
    expect(EDIT_FORM).toContain('signal: controller.signal');
    expect(EDIT_FORM).toContain('if (!ownsSeriesMutation(ownerVnId, controller)) return');
  });

  it('uses hidden Lucide glyphs and a touch-sized series removal control', () => {
    expect(EDIT_FORM).not.toContain('<span aria-hidden>×</span>');
    expect(EDIT_FORM).toContain('<X className="h-3 w-3" aria-hidden />');
    expect(EDIT_FORM).toContain('min-h-11 min-w-11');
    expect(EDIT_FORM).toContain('<Plus className="h-4 w-4" aria-hidden />');
    expect(EDIT_FORM).toContain('<Bookmark className="h-4 w-4" aria-hidden />');
  });
});
