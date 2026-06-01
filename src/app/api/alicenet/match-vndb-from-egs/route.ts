import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { matchVndbFromEgsForAliceNet } from '@/lib/alicenet';
import { readJsonObject } from '@/lib/api-body';
import { parseAliceNetBatch, parseAliceNetRunStartedAt } from '@/lib/alicenet-route-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Walks alicenet items that have an EGS match but no VNDB id, reading the EGS
 * gamelist `vndb` column to recover a VN id when EGS curators have filled
 * it in. Stateless per-batch — call repeatedly until `remaining` is 0.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const parsedBatch = parseAliceNetBatch(body.batch, 10, 50);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseAliceNetRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  const result = await matchVndbFromEgsForAliceNet(parsedBatch.value, parsedRunStartedAt.value);
  return NextResponse.json(result);
}
