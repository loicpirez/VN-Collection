import { afterAll } from 'vitest';
import { db } from '@/lib/db';
import { getVnAssetRepository } from '@/lib/db/repositories/vn-assets';
import {
  registerVnAssetRepositoryContract,
  VN_ASSET_CONTRACT_IDS,
  type VnAssetContractSnapshot,
} from './vn-assets.contract';

function reset(): void {
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ASSET_CONTRACT_IDS.vn);
}

registerVnAssetRepositoryContract('SQLite', {
  async withRepository(run) {
    reset();
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, 1)')
      .run(VN_ASSET_CONTRACT_IDS.vn, 'Asset Contract VN');
    try {
      await run(getVnAssetRepository(), async () => {
        const row = db.prepare(`
          SELECT custom_cover AS customCover, cover_rotation AS coverRotation,
            banner_image AS bannerImage, banner_position AS bannerPosition,
            banner_rotation AS bannerRotation, local_image AS localImage,
            local_image_thumb AS localImageThumb, screenshots, release_images AS releaseImages,
            publishers
          FROM vn WHERE id = ?
        `).get(VN_ASSET_CONTRACT_IDS.vn) as Omit<VnAssetContractSnapshot, 'publisherIds'>;
        const publisherIds = db.prepare(`
          SELECT producer_id FROM vn_publisher_index WHERE vn_id = ? ORDER BY producer_id
        `).all(VN_ASSET_CONTRACT_IDS.vn).map((entry) => (entry as { producer_id: string }).producer_id);
        return { ...row, publisherIds };
      });
    } finally {
      reset();
    }
  },
});

afterAll(reset);
