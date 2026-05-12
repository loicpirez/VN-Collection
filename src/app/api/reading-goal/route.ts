import { NextRequest, NextResponse } from 'next/server';
import { countFinishedInYear, getReadingGoal, setReadingGoal } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const year = Number(req.nextUrl.searchParams.get('year')) || new Date().getFullYear();
  return NextResponse.json({
    year,
    goal: getReadingGoal(year),
    finished: countFinishedInYear(year),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { year?: unknown; target?: unknown };
  const year = typeof body.year === 'number' && Number.isInteger(body.year) ? body.year : new Date().getFullYear();
  const target = typeof body.target === 'number' ? body.target : NaN;
  if (!Number.isFinite(target)) return NextResponse.json({ error: 'target required' }, { status: 400 });
  return NextResponse.json({ goal: setReadingGoal(year, target) });
}
