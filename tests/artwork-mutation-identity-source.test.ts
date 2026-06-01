import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(path, 'utf8');

describe('VN artwork mutation ownership', () => {
  it('resets transient artwork state when a reusable detail island receives a new VN', () => {
    const bannerControls = source('src/components/BannerControls.tsx');
    const coverUploader = source('src/components/CoverUploader.tsx');
    const aspect = source('src/components/AspectOverrideControl.tsx');
    const hero = source('src/components/HeroBanner.tsx');
    const picker = source('src/components/CoverSourcePicker.tsx');
    const compare = source('src/components/CoverCompare.tsx');
    const rotation = source('src/components/CoverRotationButtons.tsx');
    const bannerPicker = source('src/components/BannerSourcePicker.tsx');
    const setBanner = source('src/components/SetBannerButton.tsx');
    const gallery = source('src/components/MediaGallery.tsx');

    for (const body of [
      bannerControls,
      coverUploader,
      aspect,
      hero,
      picker,
      compare,
      rotation,
      bannerPicker,
      setBanner,
      gallery,
    ]) {
      expect(body).toContain('identityRef.current = vnId');
      expect(body).toContain('identityRef.current = null');
    }
    expect(bannerControls).toContain('setError(null)');
    expect(coverUploader).toContain('setError(null)');
    expect(aspect).toContain('setOverride(initialOverride ?? null)');
    expect(hero).toContain('setDraftPosition(nextPosition)');
    expect(hero).toContain('setEditing(false)');
    expect(picker).toContain('setTab(initialTab(egsId, currentCustomCover))');
    expect(compare).toContain('setOptimistic(current)');
    expect(rotation).toContain('setRotation(initialRotation)');
    expect(bannerPicker).toContain("setTab('custom')");
    expect(setBanner).toContain('setDone(false)');

    const coverHero = source('src/components/CoverHero.tsx');
    expect(coverHero).toContain('}, [vnId, initialRemote, initialLocal, initialRotation])');
  });

  it('rejects stale success, error, and completion work for each asynchronous mutation', () => {
    const expectedGuards = [
      'src/components/BannerControls.tsx',
      'src/components/CoverUploader.tsx',
      'src/components/AspectOverrideControl.tsx',
      'src/components/HeroBanner.tsx',
      'src/components/CoverSourcePicker.tsx',
      'src/components/CoverCompare.tsx',
      'src/components/CoverRotationButtons.tsx',
      'src/components/BannerSourcePicker.tsx',
      'src/components/SetBannerButton.tsx',
      'src/components/MediaGallery.tsx',
    ] as const;

    for (const path of expectedGuards) {
      const body = source(path);
      expect(body).toContain('identityRef.current !== ownerVnId');
    }
  });

  it('dispatches optimistic artwork events with the captured mutation owner', () => {
    const hero = source('src/components/HeroBanner.tsx');
    const picker = source('src/components/CoverSourcePicker.tsx');
    const bannerPicker = source('src/components/BannerSourcePicker.tsx');
    const rotation = source('src/components/CoverRotationButtons.tsx');
    const gallery = source('src/components/MediaGallery.tsx');

    expect(hero).toContain('dispatchBannerChanged({ vnId: ownerVnId');
    expect(picker).toContain('vnId: ownerVnId');
    expect(picker).toContain('dispatchCoverChanged({ vnId: ownerVnId');
    expect(bannerPicker).toContain('dispatchBannerChanged({ vnId: ownerVnId');
    expect(rotation).toContain('dispatchCoverChanged({ vnId: ownerVnId');
    expect(gallery).toContain('dispatchCoverChanged({ vnId: ownerVnId');
    expect(gallery).toContain('dispatchBannerChanged({ vnId: ownerVnId');
  });
});
