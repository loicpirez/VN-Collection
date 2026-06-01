import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { retryVndbForKobeAggressive } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';
import { parseKobeBatch, parseKobeRunStartedAt } from '@/lib/kobe-route-input';

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
  const parsedBatch = parseKobeBatch(body.batch, 4, 20);
  if (!parsedBatch.ok) return NextResponse.json({ error: parsedBatch.error }, { status: 400 });
  const parsedRunStartedAt = parseKobeRunStartedAt(body.run_started_at);
  if (!parsedRunStartedAt.ok) return NextResponse.json({ error: parsedRunStartedAt.error }, { status: 400 });
  const result = await retryVndbForKobeAggressive(parsedBatch.value, parsedRunStartedAt.value);
  return NextResponse.json(result);
}
