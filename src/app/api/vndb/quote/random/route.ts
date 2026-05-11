import { NextResponse } from 'next/server';
import { getAppSetting, listInCollectionVnIds } from '@/lib/db';
import { getRandomQuote, getRandomQuoteForVns } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const source = getAppSetting('random_quote_source') ?? 'all';
    if (source === 'mine') {
      const ids = listInCollectionVnIds();
      const quote = await getRandomQuoteForVns(ids);
      if (quote) return NextResponse.json({ quote, source: 'mine' as const });
      // Collection empty or no quotes for any of them — fall back to global.
    }
    const quote = await getRandomQuote();
    return NextResponse.json({ quote, source: 'all' as const });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
