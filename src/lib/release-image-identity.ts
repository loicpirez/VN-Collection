import type { ReleaseImage } from './types';

/**
 * Build the stable identity shared by release-art galleries and artwork pickers.
 *
 * @param image Release artwork whose source identity is required.
 * @returns A stable key that distinguishes release, media type, source id, and URL.
 */
export function releaseImageIdentity(
  image: Pick<ReleaseImage, 'release_id' | 'type' | 'id' | 'url'>,
): string {
  return `${image.release_id}:${image.type}:${image.id ?? ''}:${image.url}`;
}

/**
 * Remove repeated release-art rows without collapsing distinct package faces.
 *
 * @param images Release artwork in upstream order.
 * @returns The first occurrence of every stable release-image identity.
 */
export function uniqueReleaseImages(images: readonly ReleaseImage[]): ReleaseImage[] {
  const seen = new Set<string>();
  return images.filter((image) => {
    const identity = releaseImageIdentity(image);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
