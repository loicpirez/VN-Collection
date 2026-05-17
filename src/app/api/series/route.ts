import { NextRequest, NextResponse } from 'next/server';
import { createSeries, listSeries } from '@/lib/db';
import { recordActivity } from '@/lib/activity';

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
    try {
      recordActivity({
        kind: 'series.create',
        entity: 'series',
        entityId: String(created.id),
        label: created.name,
        payload: { hasDescription: !!body.description },
      });
    } catch (e) {
      console.error('[series:create] activity log failed:', (e as Error).message);
    }
    return NextResponse.json({ series: created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
