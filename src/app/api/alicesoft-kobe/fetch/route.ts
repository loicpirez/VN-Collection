import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { setAppSetting } from '@/lib/db';
import { refreshKobeStock } from '@/lib/alicesoft-kobe';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  try {
    const result = await refreshKobeStock();
    setAppSetting('alicesoft_kobe_last_fetch', String(result.fetched_at));
    return NextResponse.json(result);
  } catch (e) {
    console.error('[alicesoft-kobe/fetch] failed', (e as Error).message);
    return NextResponse.json({ error: 'kobe stock refresh failed' }, { status: 500 });
  }
}
