import { NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { countKobeStock, getAppSetting, listKobeStock } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const items = listKobeStock();
  const stats = countKobeStock();
  const lastFetch = getAppSetting('alice_kobe_last_fetch');
  return NextResponse.json({ items, stats, last_fetch: lastFetch ? Number(lastFetch) : null });
}
