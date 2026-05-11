import { NextResponse } from 'next/server';
import { getAppSetting, getRandomLocalQuote } from '@/lib/db';
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
              ? { id: row.character_id, name: row.character_name ?? '', original: null }
              : null,
          },
          source: 'mine' as const,
        });
      }
    }
    const quote = await getRandomQuote();
    return NextResponse.json({ quote, source: 'all' as const });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
