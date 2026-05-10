import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem, upsertVn } from '@/lib/db';
import { ensureLocalImagesForVn } from '@/lib/assets';
import { refreshVn } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 600;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getCollectionItem(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });

  const refresh = req.nextUrl.searchParams.get('refresh') === 'true';

  try {
    if (refresh) {
      const fresh = await refreshVn(id);
      if (fresh) upsertVn(fresh);
    }
    const result = await ensureLocalImagesForVn(id);
    return NextResponse.json({
      ok: true,
      poster: result.poster,
      poster_thumb: result.posterThumb,
      screenshot_count: result.screenshots.length,
      release_image_count: result.releaseImages.length,
      item: getCollectionItem(id),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
