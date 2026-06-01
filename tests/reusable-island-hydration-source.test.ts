import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('reusable client-island hydration', () => {
  it('rehydrates compare and brand-overlap URL-driven controls', () => {
    const compare = source('src/components/CompareVnPicker.tsx');
    const overlap = source('src/components/BrandOverlapPicker.tsx');

    expect(compare).toContain('setSelected(initialVns)');
    expect(compare).toContain('setShowAdd(initialVns.length < 4)');
    expect(compare).toContain('}, [initialVns])');
    expect(overlap).toContain("setA(initialA ?? '')");
    expect(overlap).toContain("setB(initialB ?? '')");
    expect(overlap).toContain('}, [initialA, initialB])');
  });

  it('rehydrates cover-picker and shelf display controls', () => {
    const cover = source('src/components/CoverSourcePicker.tsx');
    const shelf = source('src/components/ShelfReadOnlyControls.tsx');

    expect(cover).toContain('setTab(initialTab(egsId, currentCustomCover))');
    expect(cover).toContain('setRotationState(currentRotation)');
    expect(cover).toContain('}, [vnId, egsId, currentCustomCover, currentRotation])');
    expect(shelf).toContain('const next = initialOverrides ?? { global: initialPrefs, shelves: {} }');
    expect(shelf).toContain('setOverrides(next)');
    expect(shelf).toContain("setScope('global')");
    expect(shelf).toContain('}, [activeShelfId, initialOverrides, initialPrefs])');
  });

  it('rehydrates series metadata and generic detail layouts', () => {
    const series = source('src/components/SeriesMetaEditor.tsx');
    const layout = source('src/components/DetailReorderLayout.tsx');

    expect(series).toContain('identityRef.current = seriesId');
    expect(series).toContain('setName(initialName)');
    expect(series).toContain('setBannerPath(initialBannerPath)');
    expect(series).toContain('}, [seriesId, initialName, initialDescription, initialCoverPath, initialBannerPath])');
    expect(layout).toContain('setLayout(initialLayout)');
    expect(layout).toContain('if (!editing) setDraft(initialLayout)');
    expect(layout).toContain('}, [initialLayout, editing])');
  });
});
