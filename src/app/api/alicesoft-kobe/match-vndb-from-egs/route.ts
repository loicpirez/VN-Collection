import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { matchVndbFromEgsForKobe } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Walks kobe items that have an EGS match but no VNDB id, reading the EGS
 * gamelist `vndb` column to recover a VN id when EGS curators have filled
 * it in. Stateless per-batch — call repeatedly until `remaining` is 0.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number' ? body.batch : 10;
  const runStartedAt = typeof body.run_started_at === 'number' ? body.run_started_at : undefined;
  const result = await matchVndbFromEgsForKobe(batch, runStartedAt);
  return NextResponse.json(result);
}
