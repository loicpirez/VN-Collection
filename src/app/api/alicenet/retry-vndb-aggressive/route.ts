import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { retryVndbForAliceNetAggressive } from '@/lib/alicenet';
import { readJsonObject } from '@/lib/api-body';
import { parseAliceNetBatch, parseAliceNetRunStartedAt } from '@/lib/alicenet-route-input';
import { aliceNetApiError } from '@/lib/alicenet-api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Retry VNDB title search for "No VNDB result" items after stripping edition /
 * packaging suffixes (e.g. 普及版, 完全限定生産版, アニバーサリーボックス). One-shot
 * batch — returns `remaining: 0` to make the UI loop exit after a single pass.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const parsedBatch = parseAliceNetBatch(body.batch, 4, 20);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseAliceNetRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  try {
    const result = await retryVndbForAliceNetAggressive(parsedBatch.value, parsedRunStartedAt.value);
    return NextResponse.json(result);
  } catch (e) {
    console.error('[alicenet/retry-vndb-aggressive] failed', (e as Error).message);
    return aliceNetApiError(e, 'AliceNet VNDB retry failed.', 502);
  }
}
