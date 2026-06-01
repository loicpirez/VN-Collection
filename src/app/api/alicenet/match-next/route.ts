import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { matchNextAliceNetItems } from '@/lib/alicenet';
import { readJsonObject } from '@/lib/api-body';
import { parseAliceNetBatch, parseAliceNetBoolean, parseAliceNetRunStartedAt } from '@/lib/alicenet-route-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const parsedBatch = parseAliceNetBatch(body.batch, 5, 20);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseAliceNetRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  const retryNone = parseAliceNetBoolean(body.retry_none, 'retry_none');
  if (!retryNone.ok) return NextResponse.json({ error: retryNone.error }, { status: 400 });
  const result = await matchNextAliceNetItems(parsedBatch.value, retryNone.value, parsedRunStartedAt.value);
  return NextResponse.json(result);
}
