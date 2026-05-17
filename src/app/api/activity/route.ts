import { NextRequest, NextResponse } from 'next/server';
import { listUserActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function num(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  return NextResponse.json({
    activity: listUserActivity({
      limit: num(sp.get('limit')) ?? 100,
      kind: sp.get('kind'),
      entity: sp.get('entity'),
      q: sp.get('q'),
      from: num(sp.get('from')),
      to: num(sp.get('to')),
    }),
  });
}

