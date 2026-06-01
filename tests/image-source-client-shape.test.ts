import { describe, expect, it } from 'vitest';
import {
  decodeEgsCoverCandidates,
  decodeUploadedBannerPath,
  decodeUploadedCoverPath,
} from '@/lib/image-source-client-shape';

describe('image source client response adapters', () => {
  it('decodes uploaded storage paths', () => {
    expect(decodeUploadedCoverPath({ cover: 'covers/fixture.jpg' })).toBe('covers/fixture.jpg');
    expect(decodeUploadedBannerPath({ banner: 'covers/banner.jpg' })).toBe('covers/banner.jpg');
  });

  it('decodes remote and local EGS cover candidates', () => {
    expect(decodeEgsCoverCandidates({
      candidates: [
        { source: 'image_php', url: 'https://example.test/image.jpg', label: 'Remote' },
        { source: 'vndb', url: '/api/files/covers/local.jpg', label: 'Local' },
      ],
    })).toHaveLength(2);
  });

  it('rejects malformed image payloads', () => {
    expect(decodeUploadedCoverPath({ cover: null })).toBeNull();
    expect(decodeUploadedBannerPath({ banner: 4 })).toBeNull();
    expect(decodeEgsCoverCandidates({
      candidates: [{ source: 'vndb', url: 'javascript:alert(1)', label: 'Bad' }],
    })).toBeNull();
    expect(decodeEgsCoverCandidates({
      candidates: [
        { source: 'vndb', url: '/api/files/one.jpg', label: 'One' },
        { source: 'vndb', url: '/api/files/two.jpg', label: 'Two' },
      ],
    })).toBeNull();
  });
});
