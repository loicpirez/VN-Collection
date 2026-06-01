import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENTS = [
  'src/components/BulkActionBar.tsx',
  'src/components/CoverRotationButtons.tsx',
  'src/components/HeroBanner.tsx',
  'src/components/MediaGallery.tsx',
  'src/components/ProducerLogoUpload.tsx',
  'src/components/EditForm.tsx',
  'src/components/SeriesAddVnForm.tsx',
  'src/components/SetBannerButton.tsx',
  'src/components/NotInCollectionBanner.tsx',
  'src/components/BannerControls.tsx',
  'src/components/CoverUploader.tsx',
  'src/components/VnCard.tsx',
];

describe('client mutation error-reader coverage', () => {
  it('routes targeted non-2xx handlers through the safe reader', () => {
    for (const path of COMPONENTS) {
      const source = readFileSync(path, 'utf8');
      expect(source).toContain('readApiError');
      expect(source).not.toContain('.json().catch(() => ({}))');
    }
  });
});
