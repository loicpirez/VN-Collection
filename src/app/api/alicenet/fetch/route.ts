import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { setAppSetting } from '@/lib/db';
import { refreshAliceNetStock } from '@/lib/alicenet';
import { aliceNetApiError } from '@/lib/alicenet-api-error';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const result = await refreshAliceNetStock();
    setAppSetting('alicenet_last_fetch', String(result.fetched_at));
    return NextResponse.json(result);
  } catch (e) {
    console.error('[alicenet/fetch] failed', (e as Error).message);
    return aliceNetApiError(e, 'AliceNet stock refresh failed.', 502);
  }
}
