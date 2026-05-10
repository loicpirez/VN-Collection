import { NextResponse } from 'next/server';
import { getRandomQuote } from '@/lib/vndb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const quote = await getRandomQuote();
    return NextResponse.json({ quote });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
