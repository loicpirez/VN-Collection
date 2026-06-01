import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { matchVndbFromEgsForKobe } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';
import { parseKobeBatch, parseKobeRunStartedAt } from '@/lib/kobe-route-input';

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
  const parsedBatch = parseKobeBatch(body.batch, 10, 50);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseKobeRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  const result = await matchVndbFromEgsForKobe(parsedBatch.value, parsedRunStartedAt.value);
  return NextResponse.json(result);
}
