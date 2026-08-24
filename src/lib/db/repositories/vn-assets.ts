import type { QueryResultRow } from 'pg';
import type { ReleaseImage, Screenshot } from '@/lib/types';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery, withPostgresTransaction, type PostgresParameter } from '../postgres';

/** Artwork fields changed together by cover and banner controls. */
export interface VnArtworkPatch {
  customCover?: string | null;
  coverRotation?: number;
  bannerImage?: string | null;
  bannerPosition?: string | null;
  bannerRotation?: number;
}

/** Persistence boundary for mirrored and user-selected VN artwork. */
export interface VnAssetRepository {
  /** Patch cover and banner state in one write. */
  patchArtwork(vnId: string, patch: VnArtworkPatch): Promise<void>;
  /** Persist mirrored poster paths. */
  setLocalImages(vnId: string, full: string | null, thumb: string | null): Promise<void>;
  /** Replace persisted screenshots. */
  setScreenshots(vnId: string, screenshots: readonly Screenshot[]): Promise<void>;
  /** Replace persisted release artwork. */
  setReleaseImages(vnId: string, images: readonly ReleaseImage[]): Promise<void>;
  /** Replace publishers and their normalized lookup index atomically. */
  setPublishers(vnId: string, publishers: readonly { id: string; name: string }[]): Promise<void>;
}

/** Normalize arbitrary degree values to supported clockwise quarter turns. */
export function normalizeArtworkRotation(raw: number | null | undefined): 0 | 90 | 180 | 270 {
  const rounded = typeof raw === 'number' ? Math.round(raw) : 0;
  const normalized = ((rounded % 360) + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

function normalizedPublishers(publishers: readonly { id: string; name: string }[]): Array<{ id: string; name: string }> {
  const unique = new Map<string, { id: string; name: string }>();
  for (const publisher of publishers) {
    if (publisher.id && publisher.name && !unique.has(publisher.id)) {
      unique.set(publisher.id, { id: publisher.id, name: publisher.name });
    }
  }
  return [...unique.values()];
}

/** Create the PostgreSQL-backed VN asset repository. */
export function createPostgresVnAssetRepository(): VnAssetRepository {
  return {
    async patchArtwork(vnId, patch) {
      const updates: Array<{ column: string; value: PostgresParameter }> = [];
      if (patch.customCover !== undefined) updates.push({ column: 'custom_cover', value: patch.customCover });
      if (patch.coverRotation !== undefined) updates.push({ column: 'cover_rotation', value: normalizeArtworkRotation(patch.coverRotation) });
      if (patch.bannerImage !== undefined) updates.push({ column: 'banner_image', value: patch.bannerImage });
      if (patch.bannerPosition !== undefined) updates.push({ column: 'banner_position', value: patch.bannerPosition });
      if (patch.bannerRotation !== undefined) updates.push({ column: 'banner_rotation', value: normalizeArtworkRotation(patch.bannerRotation) });
      if (updates.length === 0) return;
      await postgresQuery(
        `UPDATE vn SET ${updates.map((update, index) => `${update.column} = $${index + 1}`).join(', ')} WHERE id = $${updates.length + 1}`,
        [...updates.map((update) => update.value), vnId],
      );
    },
    async setLocalImages(vnId, full, thumb) {
      await postgresQuery('UPDATE vn SET local_image = $1, local_image_thumb = $2 WHERE id = $3', [full, thumb, vnId]);
    },
    async setScreenshots(vnId, screenshots) {
      await postgresQuery('UPDATE vn SET screenshots = $1 WHERE id = $2', [JSON.stringify(screenshots), vnId]);
    },
    async setReleaseImages(vnId, images) {
      await postgresQuery('UPDATE vn SET release_images = $1 WHERE id = $2', [JSON.stringify(images), vnId]);
    },
    async setPublishers(vnId, publishers) {
      const normalized = normalizedPublishers(publishers);
      await withPostgresTransaction(async (client) => {
        await client.query('UPDATE vn SET publishers = $1 WHERE id = $2', [JSON.stringify(normalized), vnId]);
        await client.query('DELETE FROM vn_publisher_index WHERE vn_id = $1', [vnId]);
        for (const publisher of normalized) {
          await client.query(
            'INSERT INTO vn_publisher_index (vn_id, producer_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [vnId, publisher.id],
          );
        }
      });
    },
  };
}

const sqliteRepository: VnAssetRepository = {
  async patchArtwork(vnId, patch) {
    const legacy = await import('@/lib/db');
    legacy.db.transaction(() => {
      if (patch.customCover !== undefined) legacy.setCustomCover(vnId, patch.customCover);
      if (patch.coverRotation !== undefined) legacy.setCoverRotation(vnId, patch.coverRotation);
      if (patch.bannerImage !== undefined) legacy.setBanner(vnId, patch.bannerImage);
      if (patch.bannerPosition !== undefined) legacy.setBannerPosition(vnId, patch.bannerPosition);
      if (patch.bannerRotation !== undefined) legacy.setBannerRotation(vnId, patch.bannerRotation);
    })();
  },
  async setLocalImages(vnId, full, thumb) {
    (await import('@/lib/db')).setLocalImagePaths(vnId, full, thumb);
  },
  async setScreenshots(vnId, screenshots) {
    (await import('@/lib/db')).setLocalScreenshots(vnId, [...screenshots]);
  },
  async setReleaseImages(vnId, images) {
    (await import('@/lib/db')).setReleaseImages(vnId, [...images]);
  },
  async setPublishers(vnId, publishers) {
    (await import('@/lib/db')).setVnPublishers(vnId, [...publishers]);
  },
};

let postgresRepository: VnAssetRepository | null = null;

/** Return the VN asset repository selected by the configured backend. */
export function getVnAssetRepository(): VnAssetRepository {
  if (readDatabaseConfig().backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresVnAssetRepository();
  return postgresRepository;
}
