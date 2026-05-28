import { NextRequest, NextResponse } from 'next/server';
import { countFinishedInYear, getReadingGoal, setReadingGoal } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';

const YEAR_MIN = 1900;
const YEAR_MAX = 2200;

function clampYear(raw: unknown): number {
  const n = typeof raw === 'number' && Number.isInteger(raw) ? raw : new Date().getFullYear();
  if (n < YEAR_MIN || n > YEAR_MAX) return new Date().getFullYear();
  return n;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const rawYear = Number(req.nextUrl.searchParams.get('year'));
  const year = Number.isInteger(rawYear) && rawYear >= YEAR_MIN && rawYear <= YEAR_MAX
    ? rawYear
    : new Date().getFullYear();
  return NextResponse.json({
    year,
    goal: getReadingGoal(year),
    finished: countFinishedInYear(year),
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const body = (await readJsonObject(req)) as { year?: unknown; target?: unknown };
  const year = clampYear(body.year);
  const rawTarget = typeof body.target === 'number' ? body.target : NaN;
  if (!Number.isFinite(rawTarget)) return NextResponse.json({ error: 'target required' }, { status: 400 });
  const target = Math.min(Math.max(0, Math.floor(rawTarget)), 10_000);
  const goal = setReadingGoal(year, target);
  try {
    recordActivity({
      kind: 'reading-goal.set',
      entity: 'reading-goal',
      entityId: String(year),
      label: `Set ${year} reading goal`,
      payload: { year, target },
    });
  } catch (e) {
    console.error('[reading-goal] activity log failed:', (e as Error).message);
  }
  return NextResponse.json({ goal });
}
