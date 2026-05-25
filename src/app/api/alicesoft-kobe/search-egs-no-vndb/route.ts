import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { searchEgsForKobeNoVndb } from '@/lib/alicesoft-kobe';
import { readJsonObject } from '@/lib/api-body';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Fresh EGS title search for "No VNDB result" items that also lack an EGS
 * match. Pass `aggressive: true` to apply the same edition-suffix stripping
 * used by the aggressive VNDB retry, plus a whitespace-collapsed fallback.
 */
export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = (await readJsonObject(req)) as Record<string, unknown>;
  const batch = typeof body.batch === 'number' ? body.batch : 50;
  const aggressive = body.aggressive === true;
  const result = await searchEgsForKobeNoVndb(batch, aggressive);
  return NextResponse.json(result);
}
