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
  // Audit S-067: clamp at the route layer — the downstream helper
  // already clamps, but defence-in-depth makes the contract obvious.
  const batch = typeof body.batch === 'number'
    ? Math.min(20, Math.max(1, Math.floor(body.batch)))
    : 5;
  const retryNone = body.retry_none === true;
  const runStartedAt = typeof body.run_started_at === 'number' ? body.run_started_at : undefined;
  const result = await matchNextKobeItems(batch, retryNone, runStartedAt);
  return NextResponse.json(result);
}
