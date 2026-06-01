import { NextRequest, NextResponse } from 'next/server';
import { countFinishedInYear, getReadingGoal, setReadingGoal } from '@/lib/db';
import { recordActivity } from '@/lib/activity';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { validateSafeInt } from '@/lib/input-validators';
import { READING_GOAL_TARGET_MAX } from '@/lib/tracking-client-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const YEAR_MIN = 1900;
const YEAR_MAX = 2200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const deny = requireLocalhostOrToken(req);
  if (deny) return deny;
  const rawYear = Number(req.nextUrl.searchParams.get('year'));
  const year = Number.isSafeInteger(rawYear) && rawYear >= YEAR_MIN && rawYear <= YEAR_MAX
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
  const yearResult = validateSafeInt(body.year, { field: 'year', min: YEAR_MIN, max: YEAR_MAX });
  if (!yearResult.ok) return NextResponse.json({ error: yearResult.error }, { status: 400 });
  if (body.target == null) return NextResponse.json({ error: 'target required' }, { status: 400 });
  const targetResult = validateSafeInt(body.target, { field: 'target', min: 0, max: READING_GOAL_TARGET_MAX });
  if (!targetResult.ok) return NextResponse.json({ error: targetResult.error }, { status: 400 });
  const year = yearResult.value;
  const target = targetResult.value;
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
