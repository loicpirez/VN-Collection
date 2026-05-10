import { NextRequest, NextResponse } from 'next/server';
import { createSeries, listSeries } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ series: listSeries() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; description?: string };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: 'missing name' }, { status: 400 });
  try {
    const created = createSeries(name, body.description ?? null);
    return NextResponse.json({ series: created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
