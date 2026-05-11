import { NextRequest, NextResponse } from 'next/server';
import { searchEgsCandidates } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') ?? '').trim();
  const limitRaw = req.nextUrl.searchParams.get('limit');
  const limit = limitRaw ? Math.min(50, Math.max(1, Number(limitRaw) || 20)) : 20;
  if (!q) {
    return NextResponse.json({ candidates: [] });
  }
  try {
    const candidates = await searchEgsCandidates(q, limit);
    return NextResponse.json({ candidates });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
