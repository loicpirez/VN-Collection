import { NextResponse } from 'next/server';
import { getAppSetting, getCharacterImage, getRandomLocalQuote } from '@/lib/db';
import { getRandomQuote } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const source = getAppSetting('random_quote_source') ?? 'all';
    if (source === 'mine') {
      // 100% local: pull from the vn_quote table populated by ensureLocalImagesForVn
      // (no VNDB call). Falls back to global random only when the table is empty
      // (e.g. brand-new install with no synced VNs).
      const row = getRandomLocalQuote();
      if (row) {
        return NextResponse.json({
          quote: {
            id: row.quote_id,
            quote: row.quote,
            score: row.score,
            vn: { id: row.vn_id, title: row.vn_title },
            character: row.character_id
              ? {
                  id: row.character_id,
                  name: row.character_name ?? '',
                  original: null,
                  // Surface the locally-mirrored portrait so the
                  // QuoteFooter can render the 32×32 avatar without
                  // a follow-up fetch.
                  image: row.character_local_image
                    ? { local_path: row.character_local_image }
                    : null,
                }
              : null,
          },
          source: 'mine' as const,
        });
      }
    }
    const quote = await getRandomQuote();
    // Enrich the VNDB-sourced random quote with our local mirror of
    // the character portrait when available. VNDB never returns
    // local paths — but the table is keyed on the same `cNNNN` id, so
    // a single lookup is enough.
    if (quote?.character?.id) {
      const img = getCharacterImage(quote.character.id);
      if (img?.local_path) {
        // Mutate a shallow copy so the response shape stays a
        // superset of `VndbQuote` rather than mutating the cached
        // object the cache layer might still hold a reference to.
        return NextResponse.json({
          quote: {
            ...quote,
            character: {
              ...quote.character,
              image: { local_path: img.local_path },
            },
          },
          source: 'all' as const,
        });
      }
    }
    return NextResponse.json({ quote, source: 'all' as const });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
