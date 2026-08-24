import { describe, expect, it } from 'vitest';
import type { VnAssetRepository } from '@/lib/db/repositories/vn-assets';

/** Stable identifiers shared by the VN-asset parity contract. */
export const VN_ASSET_CONTRACT_IDS = {
  vn: 'v995101',
  publisher: 'p995101',
} as const;

/** Persisted VN asset fields inspected across database engines. */
export interface VnAssetContractSnapshot {
  customCover: string | null;
  coverRotation: number;
  bannerImage: string | null;
  bannerPosition: string | null;
  bannerRotation: number;
  localImage: string | null;
  localImageThumb: string | null;
  screenshots: string | null;
  releaseImages: string | null;
  publishers: string | null;
  publisherIds: string[];
}

/** Harness that supplies a reset VN-asset repository and inspection boundary. */
export interface VnAssetContractHarness {
  /** Run one assertion against a reset database. */
  withRepository(run: (
    repository: VnAssetRepository,
    inspect: () => Promise<VnAssetContractSnapshot>,
  ) => Promise<void>): Promise<void>;
}

/** Register mirrored artwork, transform, and publisher-index parity tests. */
export function registerVnAssetRepositoryContract(
  label: string,
  harness: VnAssetContractHarness,
): void {
  describe(`${label} VN asset repository contract`, () => {
    it('persists artwork and rebuilds the deduplicated publisher index', async () => {
      await harness.withRepository(async (repository, inspect) => {
        await repository.patchArtwork(VN_ASSET_CONTRACT_IDS.vn, {
          customCover: 'cover/custom.jpg',
          coverRotation: 450,
          bannerImage: 'cover/banner.jpg',
          bannerPosition: '25% 75%',
          bannerRotation: -90,
        });
        await repository.setLocalImages(VN_ASSET_CONTRACT_IDS.vn, 'vn/full.jpg', 'vn/thumb.jpg');
        await repository.setScreenshots(VN_ASSET_CONTRACT_IDS.vn, []);
        await repository.setReleaseImages(VN_ASSET_CONTRACT_IDS.vn, []);
        await repository.setPublishers(VN_ASSET_CONTRACT_IDS.vn, [
          { id: VN_ASSET_CONTRACT_IDS.publisher, name: 'Publisher Contract' },
          { id: VN_ASSET_CONTRACT_IDS.publisher, name: 'Duplicate Contract' },
          { id: '', name: 'Invalid Contract' },
        ]);

        await expect(inspect()).resolves.toEqual({
          customCover: 'cover/custom.jpg',
          coverRotation: 90,
          bannerImage: 'cover/banner.jpg',
          bannerPosition: '25% 75%',
          bannerRotation: 270,
          localImage: 'vn/full.jpg',
          localImageThumb: 'vn/thumb.jpg',
          screenshots: '[]',
          releaseImages: '[]',
          publishers: JSON.stringify([{ id: VN_ASSET_CONTRACT_IDS.publisher, name: 'Publisher Contract' }]),
          publisherIds: [VN_ASSET_CONTRACT_IDS.publisher],
        });
      });
    });
  });
}
