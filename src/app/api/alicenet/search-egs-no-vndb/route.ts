import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { searchEgsForKobeNoVndb } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';
import { parseKobeBatch, parseKobeBoolean, parseKobeRunStartedAt } from '@/lib/kobe-route-input';

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
  const parsedBatch = parseKobeBatch(body.batch, 10, 50);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseKobeRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  const aggressive = parseKobeBoolean(body.aggressive, 'aggressive');
  if (!aggressive.ok) return NextResponse.json({ error: aggressive.error }, { status: 400 });
  const result = await searchEgsForKobeNoVndb(parsedBatch.value, aggressive.value, parsedRunStartedAt.value);
  return NextResponse.json(result);
}
