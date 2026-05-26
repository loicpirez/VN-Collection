import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { matchNextKobeItems } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number' ? body.batch : 5;
  const retryNone = body.retry_none === true;
  const runStartedAt = typeof body.run_started_at === 'number' ? body.run_started_at : undefined;
  const result = await matchNextKobeItems(batch, retryNone, runStartedAt);
  return NextResponse.json(result);
}
