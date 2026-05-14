import 'server-only';
import { downloadToBucket, fileExists } from './files';
import {
  getCharacterImages,
  getCollectionItem,
  getEgsForVn,
  setEgsLocalImage,
  setLocalImagePaths,
  setLocalScreenshots,
  setQuotesForVn,
  setReleaseImages,
  setVnPublishers,
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

  // Screenshots: download up to 4 in parallel. VNDB's CDN is happy
  // to serve concurrent requests, and a VN with 30 screenshots used
  // to be the dominant latency on import because each fileExists +
  // downloadToBucket pair awaited the previous one sequentially.
  const shots = item.screenshots ?? [];
  const CONCURRENCY = 4;
  let mutated = false;
  const next: Screenshot[] = new Array(shots.length);
  async function workOne(i: number): Promise<void> {
    const s = shots[i];
    let local = s.local ?? null;
    let localThumb = s.local_thumb ?? null;
    if (s.url && (!local || !(await fileExists(local)))) {
      try {
        local = await downloadToBucket(s.url, 'vnScreenshot', `${vnId}-sc-${i}`);
        mutated = true;
      } catch {
        // ignore individual failure
      }
    }
    if (s.thumbnail && (!localThumb || !(await fileExists(localThumb)))) {
      try {
        localThumb = await downloadToBucket(s.thumbnail, 'vnScreenshot', `${vnId}-sc-${i}-thumb`);
        mutated = true;
      } catch {
        // ignore individual failure
      }
    }
    next[i] = { ...s, local, local_thumb: localThumb };
  }
  let cursor = 0;
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(CONCURRENCY, shots.length); w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = cursor++;
          if (idx >= shots.length) return;
          await workOne(idx);
        }
      })(),
    );
  }
  await Promise.all(workers);
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
    const quotes = await getQuotesForVn(vnId);
    setQuotesForVn(vnId, quotes);
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
  // Track release-fetch success/failure separately from "releases exist".
  // We only want to overwrite the persisted `vn.publishers` column when
  // the upstream call actually succeeded — a network failure used to
  // wipe the previous publisher list to [] because the aggregation
  // loop ran unconditionally with an empty array.
  let releases: Awaited<ReturnType<typeof getReleasesForVn>> | null = null;
  try {
    releases = await getReleasesForVn(vnId);
  } catch {
    releases = null;
  }
  if (!releases) return [];

  const existing = getCollectionItem(vnId)?.release_images ?? [];
  const existingByKey = new Map(existing.map((img) => [`${img.release_id}:${img.id ?? img.url}`, img]));

  // Aggregate publishers across every release of this VN. VNDB only
  // exposes producer roles at the release level (`release.producers[]`
  // with `developer / publisher / distributor` flags), so this loop is
  // the cheapest place to fold them into a per-VN `vn.publishers`
  // column — we're already walking the same releases for image
  // mirroring. Only runs when the release fetch returned (above guard).
  const publishers: { id: string; name: string }[] = [];
  const seenPub = new Set<string>();
  for (const release of releases) {
    if (release.vns.findIndex((v) => v.id === vnId) === -1) continue;
    for (const p of release.producers ?? []) {
      if (!p.publisher || !p.id || !p.name) continue;
      if (seenPub.has(p.id)) continue;
      seenPub.add(p.id);
      publishers.push({ id: p.id, name: p.name });
    }
  }
  setVnPublishers(vnId, publishers);

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
