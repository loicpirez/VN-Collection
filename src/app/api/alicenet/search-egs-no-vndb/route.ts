import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { searchEgsForAliceNetNoVndb } from '@/lib/alicenet';
import { readJsonObject } from '@/lib/api-body';
import { parseAliceNetBatch, parseAliceNetBoolean, parseAliceNetRunStartedAt } from '@/lib/alicenet-route-input';
import { aliceNetApiError } from '@/lib/alicenet-api-error';

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
  const parsedBatch = parseAliceNetBatch(body.batch, 10, 50);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseAliceNetRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  const aggressive = parseAliceNetBoolean(body.aggressive, 'aggressive');
  if (!aggressive.ok) return NextResponse.json({ error: aggressive.error }, { status: 400 });
  try {
    const result = await searchEgsForAliceNetNoVndb(parsedBatch.value, aggressive.value, parsedRunStartedAt.value);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[alicenet/search-egs-no-vndb] failed', (e as Error).message);
    return aliceNetApiError(e, 'AliceNet EGS search failed.', 502);
  }
}
