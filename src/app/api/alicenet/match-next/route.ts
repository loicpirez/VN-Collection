import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { matchNextKobeItems } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';
import { parseKobeBatch, parseKobeBoolean, parseKobeRunStartedAt } from '@/lib/kobe-route-input';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const parsedBatch = parseKobeBatch(body.batch, 5, 20);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseKobeRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  const retryNone = parseKobeBoolean(body.retry_none, 'retry_none');
  if (!retryNone.ok) return NextResponse.json({ error: retryNone.error }, { status: 400 });
  const result = await matchNextKobeItems(parsedBatch.value, retryNone.value, parsedRunStartedAt.value);
  return NextResponse.json(result);
}
