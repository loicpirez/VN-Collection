import { NextRequest, NextResponse } from 'next/server';
import { getCharacterImages } from '@/lib/db';
import { getQuotesForVn } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^(v\d+|egs_\d+)$/i.test(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  try {
    const quotes = await getQuotesForVn(id);
    // Enrich each quote with the locally-mirrored character portrait
    // (when downloaded). Single batched lookup against
    // `character_image` keeps this O(1) regardless of quote count.
    const charIds = quotes
      .map((q) => q.character?.id)
      .filter((cid): cid is string => typeof cid === 'string');
    const imageMap = getCharacterImages(charIds);
    const enriched = quotes.map((q) => {
      if (!q.character?.id) return q;
      const img = imageMap.get(q.character.id);
      if (!img?.local_path) return q;
      return {
        ...q,
        character: {
          ...q.character,
          image: { local_path: img.local_path },
        },
      };
    });
    return NextResponse.json({ quotes: enriched });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
