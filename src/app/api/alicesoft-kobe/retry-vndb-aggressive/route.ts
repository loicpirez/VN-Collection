import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { retryVndbForKobeAggressive } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';

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
  const batch = typeof body.batch === 'number' ? body.batch : 4;
  const runStartedAt = typeof body.run_started_at === 'number' ? body.run_started_at : undefined;
  const result = await retryVndbForKobeAggressive(batch, runStartedAt);
  return NextResponse.json(result);
}
