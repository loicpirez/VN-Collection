import { NextRequest, NextResponse } from 'next/server';
import { upstreamError } from '@/lib/api-error';
import { getCharacterImages, getVnCover } from '@/lib/db';
import { getQuotesForVn } from '@/lib/vndb';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { isValidVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  const id = rawId.toLowerCase();
  if (!isValidVnId(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const quotes = await getQuotesForVn(id);
    // Enrich each quote with the locally-mirrored character portrait
    // (when downloaded). Single batched lookup against
    // `character_image` keeps this O(1) regardless of quote count.
    const charIds = quotes
      .map((q) => q.character?.id)
      .filter((cid): cid is string => typeof cid === 'string');
    const imageMap = getCharacterImages(charIds);
    // Single VN cover lookup — surfaces the cover fallback for the
    // QuoteAvatar component when no character portrait is available.
    const vnCover = getVnCover(id);
    const vnCoverPatch = vnCover
      ? {
          vn_image_url: vnCover.image_url,
          vn_local_image: vnCover.local_image,
          vn_local_image_thumb: vnCover.local_image_thumb,
        }
      : {};
    const enriched = quotes.map((q) => {
      if (!q.character?.id) return { ...q, ...vnCoverPatch };
      const img = imageMap.get(q.character.id);
      if (!img?.local_path) return { ...q, ...vnCoverPatch };
      return {
        ...q,
        ...vnCoverPatch,
        character: {
          ...q.character,
          image: { local_path: img.local_path },
        },
      };
    });
    return NextResponse.json({ quotes: enriched });
  } catch (err) {
    return upstreamError('vn/[id]/quotes', err);
  }
}
