import 'server-only';
import { downloadToBucket, fileExists } from './files';
import {
  getCharacterImages,
  getCollectionItem,
  getEgsForVn,
  setEgsLocalImage,
  setLocalImagePaths,
  setLocalScreenshots,
  setReleaseImages,
  upsertCharacterImage,
} from './db';
import { getCharactersForVn, getQuotesForVn, getReleasesForVn } from './vndb';
import { resolveEgsForVn } from './erogamescape';
import type { ReleaseImage, Screenshot } from './types';
import type { VndbCharacter } from './vndb';

interface EnsureResult {
  poster: string | null;
  posterThumb: string | null;
  screenshots: Screenshot[];
  releaseImages: ReleaseImage[];
}

export async function ensureLocalImagesForVn(vnId: string): Promise<EnsureResult> {
  const item = getCollectionItem(vnId);
  if (!item) return { poster: null, posterThumb: null, screenshots: [], releaseImages: [] };

  let poster = item.local_image;
  let thumb = item.local_image_thumb;

  if (item.image_url && (!poster || !(await fileExists(poster)))) {
    try {
      poster = await downloadToBucket(item.image_url, 'vnImage', `${vnId}-cover`);
    } catch {
      poster = item.local_image;
    }
  }
  if (item.image_thumb && (!thumb || !(await fileExists(thumb)))) {
    try {
      thumb = await downloadToBucket(item.image_thumb, 'vnImage', `${vnId}-cover-thumb`);
    } catch {
      thumb = item.local_image_thumb;
    }
  }
  if (poster !== item.local_image || thumb !== item.local_image_thumb) {
    setLocalImagePaths(vnId, poster, thumb);
  }

  const shots = item.screenshots ?? [];
  const next: Screenshot[] = [];
  let mutated = false;
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    let local = s.local ?? null;
    let localThumb = s.local_thumb ?? null;
    if (s.url && (!local || !(await fileExists(local)))) {
      try {
        local = await downloadToBucket(s.url, 'vnScreenshot', `${vnId}-sc-${i}`);
        mutated = true;
      } catch {
        // ignore
      }
    }
    if (s.thumbnail && (!localThumb || !(await fileExists(localThumb)))) {
      try {
        localThumb = await downloadToBucket(s.thumbnail, 'vnScreenshot', `${vnId}-sc-${i}-thumb`);
        mutated = true;
      } catch {
        // ignore
      }
    }
    next.push({ ...s, local, local_thumb: localThumb });
  }
  if (mutated) setLocalScreenshots(vnId, next);

  // Release / package images (pkgfront, pkgback, pkgcontent, pkgside, pkgmed, dig)
  const releaseImages = await fetchAndDownloadReleaseImages(vnId);

  // Pre-fetch + locally cache character images, then warm quote cache.
  let characters: VndbCharacter[] = [];
  try {
    characters = await getCharactersForVn(vnId);
    await downloadCharacterImages(characters);
  } catch {
    // ignore — character payload may be unavailable
  }
  try {
    await getQuotesForVn(vnId);
  } catch {
    // ignore — quotes may be unavailable
  }

  // Resolve & persist ErogameScape match (VNDB extlink first, then fuzzy name search).
  try {
    await resolveEgsForVn(vnId, { force: false, allowSearch: true });
  } catch {
    // ignore — EGS may be down or game unknown
  }

  // Mirror the EGS cover locally so it survives offline / EGS being down.
  try {
    const egs = getEgsForVn(vnId);
    if (egs?.egs_id && egs.image_url && (!egs.local_image || !(await fileExists(egs.local_image)))) {
      try {
        const path = await downloadToBucket(egs.image_url, 'vnImage', `${vnId}-egs-cover`);
        setEgsLocalImage(vnId, path);
      } catch {
        // EGS doesn't always have a cover — silently skip
      }
    }
  } catch {
    // ignore — defensive
  }

  return { poster, posterThumb: thumb, screenshots: next, releaseImages };
}

async function downloadCharacterImages(characters: VndbCharacter[]): Promise<void> {
  if (characters.length === 0) return;
  const ids = characters.map((c) => c.id);
  const existing = getCharacterImages(ids);
  for (const c of characters) {
    if (!c.image?.url) continue;
    const prev = existing.get(c.id);
    if (prev?.local_path && prev.url === c.image.url && (await fileExists(prev.local_path))) continue;
    try {
      const local = await downloadToBucket(c.image.url, 'character', c.id);
      upsertCharacterImage(c.id, c.image.url, local);
    } catch {
      // ignore — image may be unavailable
    }
  }
}

async function fetchAndDownloadReleaseImages(vnId: string): Promise<ReleaseImage[]> {
  let releases;
  try {
    releases = await getReleasesForVn(vnId);
  } catch {
    return [];
  }

  const existing = getCollectionItem(vnId)?.release_images ?? [];
  const existingByKey = new Map(existing.map((img) => [`${img.release_id}:${img.id ?? img.url}`, img]));

  const out: ReleaseImage[] = [];
  let idx = 0;
  for (const release of releases) {
    if (release.vns.findIndex((v) => v.id === vnId) === -1) continue;
    for (const img of release.images ?? []) {
      const key = `${release.id}:${img.id ?? img.url}`;
      const prev = existingByKey.get(key);
      const base: ReleaseImage = {
        id: img.id,
        release_id: release.id,
        release_title: release.title,
        type: img.type,
        url: img.url,
        thumbnail: img.thumbnail ?? null,
        dims: img.dims ?? null,
        sexual: img.sexual,
        violence: img.violence,
        languages: img.languages ?? null,
        photo: img.photo,
        local: prev?.local ?? null,
        local_thumb: prev?.local_thumb ?? null,
      };
      const safeIdx = idx++;
      if (img.url && (!base.local || !(await fileExists(base.local)))) {
        try {
          base.local = await downloadToBucket(img.url, 'vnScreenshot', `${vnId}-rel-${img.type}-${safeIdx}`);
        } catch {
          // ignore individual failure
        }
      }
      if (img.thumbnail && (!base.local_thumb || !(await fileExists(base.local_thumb)))) {
        try {
          base.local_thumb = await downloadToBucket(img.thumbnail, 'vnScreenshot', `${vnId}-rel-${img.type}-${safeIdx}-thumb`);
        } catch {
          // ignore
        }
      }
      out.push(base);
    }
  }
  setReleaseImages(vnId, out);
  return out;
}
