import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getVnReadRepository } from '@/lib/db/repositories/vn-read';
import { isAllowedHttpTarget } from '@/lib/url-allowlist';
import { MAX_GAME_ARTWORK, type GameArtworkImage } from '@/lib/game-artwork';
import { tooManyRequests } from '@/lib/rate-limit-response';
import { createRequestDeadline } from '@/lib/request-deadline';
import { isValidVnId, isVndbVnId, normalizeVnId } from '@/lib/vn-id-shape';
import { getReleasesForVn, getVn } from '@/lib/vndb';
import type { ReleaseImage, Screenshot } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STORAGE_IMAGE = /^(?:vn|vn-sc|cover)\/[a-z\d._-]+\.(?:avif|bmp|gif|jpe?g|png|webp)$/i;

function safeRemote(value: string | null | undefined): string | null {
  return value && isAllowedHttpTarget(value) ? value : null;
}

function safeLocal(value: string | null | undefined): string | null {
  return value && STORAGE_IMAGE.test(value) ? value : null;
}

function collectReleaseImages(releases: Awaited<ReturnType<typeof getReleasesForVn>>, id: string): ReleaseImage[] {
  return releases.flatMap((release) => release.vns.some((vn) => vn.id === id)
    ? release.images.map((image) => ({ ...image, release_id: release.id, release_title: release.title }))
    : []);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const id = normalizeVnId((await ctx.params).id);
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const limited = tooManyRequests(req, 'vn-artwork', { limit: 20, windowMs: 10_000 });
  if (limited) return limited;

  const deadline = createRequestDeadline(req.signal);
  try {
    const cached = await getVnReadRepository().getCollectionItem(id);
    const fromVndb = isVndbVnId(id);
    const upstream = !cached && fromVndb ? await getVn(id, deadline.signal) : null;
    if (!cached && !upstream) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const images: GameArtworkImage[] = [];
    const seen = new Set<string>();
    function add(
      kind: GameArtworkImage['kind'],
      source: Partial<Screenshot>,
      releaseType: GameArtworkImage['releaseType'] = null,
      label: string | null = null,
    ) {
      const remote = safeRemote(source.url);
      const local = safeLocal(source.local);
      const value = remote ?? local;
      if (!value || seen.has(value) || images.length >= MAX_GAME_ARTWORK) return;
      seen.add(value);
      images.push({
        kind, value, remote, local, releaseType, label,
        thumbnail: safeRemote(source.thumbnail),
        localThumbnail: safeLocal(source.local_thumb),
        sexual: source.sexual ?? null,
      });
    }

    add('cover', {
      url: cached?.image_url ?? upstream?.image?.url ?? undefined,
      local: cached?.local_image,
      thumbnail: cached?.image_thumb ?? upstream?.image?.thumbnail ?? undefined,
      local_thumb: cached?.local_image_thumb,
      sexual: cached?.image_sexual ?? upstream?.image?.sexual,
    });
    for (const override of [
      { kind: 'cover', value: cached?.custom_cover },
      { kind: 'banner', value: cached?.banner_image },
    ] as const) {
      if (override.value) add(override.kind, { url: override.value, local: override.value });
    }

    for (const screenshot of cached?.screenshots ?? upstream?.screenshots ?? []) {
      add('screenshot', screenshot);
    }
    let releaseImages = cached?.release_images ?? [];
    let releaseUnavailable = false;
    if (fromVndb && releaseImages.length === 0) {
      try {
        releaseImages = collectReleaseImages(await getReleasesForVn(id, 50, deadline.signal), id);
      } catch {
        releaseUnavailable = true;
      }
    }
    for (const image of releaseImages) {
      add('release', { ...image, thumbnail: image.thumbnail ?? undefined, dims: image.dims ?? undefined },
        image.type, image.release_title);
    }

    return NextResponse.json({ images, releaseUnavailable });
  } catch (error) {
    return upstreamError('vn/[id]/artwork', error);
  } finally {
    deadline.dispose();
  }
}
