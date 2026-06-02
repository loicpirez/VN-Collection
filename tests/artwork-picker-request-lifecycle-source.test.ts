import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const BANNER_PICKER = readFileSync('src/components/BannerSourcePicker.tsx', 'utf8');
const GALLERY = readFileSync('src/components/MediaGallery.tsx', 'utf8');

function countOccurrences(body: string, needle: string): number {
  return body.split(needle).length - 1;
}

describe('banner picker and gallery promotion request lifecycle', () => {
  it('serializes and aborts banner-source mutations', () => {
    expect(BANNER_PICKER).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(BANNER_PICKER).toContain('const mutationInFlightRef = useRef(false)');
    expect(BANNER_PICKER).toContain('mutationAbortRef.current?.abort()');
    expect(countOccurrences(BANNER_PICKER, 'const controller = beginMutation();')).toBe(3);
    expect(countOccurrences(BANNER_PICKER, 'signal: controller.signal')).toBe(3);
    expect(countOccurrences(BANNER_PICKER, 'if (!ownsMutation(ownerVnId, controller)) return')).toBe(6);
  });

  it('owns gallery tile promotion requests across teardown', () => {
    expect(GALLERY).toContain('const mutationAbortRef = useRef<AbortController | null>(null)');
    expect(GALLERY).toContain('const mutationInFlightRef = useRef(false)');
    expect(GALLERY).toContain('mutationAbortRef.current?.abort()');
    expect(GALLERY).toContain('signal: controller.signal');
    expect(GALLERY).toContain('mutationAbortRef.current !== controller');
    expect(GALLERY).toContain('controller.signal.aborted');
  });

  it('uses ASCII shared metadata separators and URL placeholders', () => {
    expect(BANNER_PICKER).toContain("label: `${localizedType} / ${img.release_title}`");
    expect(BANNER_PICKER).toContain('placeholder={t.coverPicker.urlPlaceholder}');
    expect(BANNER_PICKER).toContain('{t.coverPicker.galleryLabel} / {galleryItems.length}');
    expect(BANNER_PICKER).toContain('aria-pressed={isCurrent}');
    expect(GALLERY).toContain("alt: `${localizedType} / ${img.release_title}`");
    expect(GALLERY).toContain("{visible[active].dims![0]}x{visible[active].dims![1]}");
    expect(GALLERY).toContain("{visible[active].caption && ` / ${visible[active].caption}`}");
  });
});
