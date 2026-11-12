import { asJsonRecord } from './json-shape';
import type { ReleaseImageType } from './types';

export const GAME_ARTWORK_KINDS = ['cover', 'screenshot', 'release', 'banner'] as const;
export const MAX_GAME_ARTWORK = 240;

export interface GameArtworkImage {
  kind: typeof GAME_ARTWORK_KINDS[number];
  value: string;
  remote: string | null;
  local: string | null;
  thumbnail: string | null;
  localThumbnail: string | null;
  sexual: number | null;
  releaseType: ReleaseImageType | null;
  label: string | null;
}

export interface GameArtwork {
  images: GameArtworkImage[];
  releaseUnavailable: boolean;
}

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isReleaseType(value: unknown): value is ReleaseImageType {
  return value === 'pkgfront' || value === 'pkgback' || value === 'pkgcontent' ||
    value === 'pkgside' || value === 'pkgmed' || value === 'dig';
}

export function decodeGameArtwork(value: unknown): GameArtwork | null {
  const data = asJsonRecord(value);
  if (!data || !Array.isArray(data.images) || data.images.length > MAX_GAME_ARTWORK ||
    typeof data.releaseUnavailable !== 'boolean') return null;

  const images: GameArtworkImage[] = [];
  for (const input of data.images) {
    const image = asJsonRecord(input);
    if (!image) return null;
    const { kind, value, remote, local, thumbnail, localThumbnail, sexual, releaseType, label } = image;
    if ((kind !== 'cover' && kind !== 'screenshot' && kind !== 'release' && kind !== 'banner') ||
      typeof value !== 'string' || !value ||
      !nullableString(remote) || !nullableString(local) || (!remote && !local) ||
      !nullableString(thumbnail) || !nullableString(localThumbnail) ||
      (sexual !== null && (typeof sexual !== 'number' || !Number.isFinite(sexual))) ||
      (releaseType !== null && !isReleaseType(releaseType)) || !nullableString(label)) return null;
    images.push({ kind, value, remote, local, thumbnail, localThumbnail, sexual, releaseType, label });
  }
  return { images, releaseUnavailable: data.releaseUnavailable };
}
