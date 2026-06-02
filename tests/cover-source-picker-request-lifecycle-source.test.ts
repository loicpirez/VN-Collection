import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PICKER = readFileSync('src/components/CoverSourcePicker.tsx', 'utf8');
const ROTATION = readFileSync('src/components/CoverRotationButtons.tsx', 'utf8');

function countOccurrences(needle: string): number {
  return PICKER.split(needle).length - 1;
}

describe('cover source picker request lifecycle', () => {
  it('owns and aborts cover picker writes across identity replacement and teardown', () => {
    expect(PICKER).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(PICKER).toContain('const mutationInFlightRef = useRef(false)');
    expect(PICKER).toContain('mutationAbortRef.current?.abort()');
    expect(PICKER).toContain('mutationAbortRef.current !== controller');
    expect(PICKER).toContain('controller.signal.aborted');
  });

  it('serializes source selection, VNDB reset, EGS selection, rotation, and upload', () => {
    expect(countOccurrences('const controller = beginMutation();')).toBe(5);
    expect(countOccurrences('signal: controller.signal')).toBe(6);
    expect(countOccurrences('if (!ownsMutation(ownerVnId, controller)) return')).toBe(10);
  });

  it('threads the active signal through best-effort custom preference writes', () => {
    expect(PICKER).toContain('async function pinCustomPref(ownerVnId: string, signal: AbortSignal): Promise<void>');
    expect(countOccurrences('await pinCustomPref(ownerVnId, controller.signal)')).toBe(2);
  });

  it('uses ASCII shared metadata and degree labels', () => {
    expect(PICKER).toContain("label: `${mediaTypeLabel(img.type, t)} / ${img.release_title}`");
    expect(PICKER).toContain('placeholder={t.coverPicker.urlPlaceholder}');
    expect(PICKER).toContain('{t.coverPicker.galleryLabel} / {galleryItems.length}');
    expect(PICKER).toContain("t.coverActions.rotationDegrees.replace('{rotation}', String(rotation))");
    expect(ROTATION).toContain("t.coverActions.rotationDegrees.replace('{rotation}', String(rotation))");
  });

  it('keeps disabled EGS tabs out of keyboard navigation and exposes gallery selection semantics', () => {
    expect(PICKER).toContain("const tabs: Tab[] = egsTabDisabled ? ['custom', 'vndb'] : ['custom', 'vndb', 'egs']");
    expect(PICKER).toContain('aria-pressed={isCurrent}');
  });

  it('switches back to VNDB based on the active source preference rather than custom-cover presence', () => {
    expect(PICKER).toContain("disabled={busy || !vndbImage || currentImageSource === 'vndb'}");
    expect(PICKER).toContain("currentImageSource === 'vndb'");
  });
});
