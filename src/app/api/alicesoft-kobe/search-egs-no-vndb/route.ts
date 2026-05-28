import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { searchEgsForKobeNoVndb } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Fresh EGS title search for "No VNDB result" items that also lack an EGS
 * match. Pass `aggressive: true` to apply the same edition-suffix stripping
 * used by the aggressive VNDB retry, plus a whitespace-collapsed fallback.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number'
    ? Math.min(50, Math.max(1, Math.floor(body.batch)))
    : 10;
  const aggressive = body.aggressive === true;
  const runStartedAt = typeof body.run_started_at === 'number' ? body.run_started_at : undefined;
  const result = await searchEgsForKobeNoVndb(batch, aggressive, runStartedAt);
  return NextResponse.json(result);
}
