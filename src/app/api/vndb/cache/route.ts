import { NextRequest, NextResponse } from 'next/server';
import { cacheStats, clearCache, deleteCacheByPathPrefix, pruneExpiredCache } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ stats: cacheStats() });
}

export async function DELETE(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const mode = sp.get('mode') ?? 'all';
  const prefix = sp.get('prefix');

  if (mode === 'expired') {
    const removed = pruneExpiredCache();
    return NextResponse.json({ ok: true, removed, mode });
  }
  if (mode === 'prefix' && prefix) {
    const removed = deleteCacheByPathPrefix(prefix);
    return NextResponse.json({ ok: true, removed, mode, prefix });
  }
  const removed = clearCache();
  return NextResponse.json({ ok: true, removed, mode: 'all' });
}
