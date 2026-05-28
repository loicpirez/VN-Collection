import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { db } from '@/lib/db';
import { isVndbVnId } from '@/lib/vn-id-shape';
import { fetchAuthenticatedWishlist } from '@/lib/vndb';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Lightweight ID-only enumeration for batch stock refresh.
 *
 * `?scope=collection` returns every VN id the user has in the local
 * collection table (any status). Used by the "Refresh all" button on
 * /stock so the operator can walk their whole library without typing
 * IDs into a textarea.
 *
 * `?scope=wishlist` returns wishlist VNs that the operator has saved.
 */
interface QueueEntry {
  vn_id: string;
  title: string | null;
}

function titlesFor(ids: string[]): Map<string, string | null> {
  const map = new Map<string, string | null>();
  if (ids.length === 0) return map;
  // SQLite's SQLITE_MAX_VARIABLE_NUMBER cap is 999 by default; chunk at
  // 500 to stay safe and match the convention used elsewhere in db.ts
  // (`isInCollectionMany`, `getEgsForVns`, etc.). Without this guard a
  // collection of > 999 entries would crash this route at runtime.
  const CHUNK = 500;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => '?').join(',');
    const rows = db
      .prepare(`SELECT id, title FROM vn WHERE id IN (${placeholders})`)
      .all(...chunk) as { id: string; title: string }[];
    for (const r of rows) map.set(r.id, r.title);
  }
  for (const id of ids) if (!map.has(id)) map.set(id, null);
  return map;
}

function buildEntries(ids: string[]): QueueEntry[] {
  const titleMap = titlesFor(ids);
  return ids.map((vn_id) => ({ vn_id, title: titleMap.get(vn_id) ?? null }));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const scope = req.nextUrl.searchParams.get('scope') ?? 'collection';
  if (scope === 'collection') {
    const rows = db.prepare(`SELECT vn_id FROM collection ORDER BY updated_at DESC, added_at DESC`).all() as { vn_id: string }[];
    const ids = rows.map((r) => r.vn_id);
    return NextResponse.json({ scope, ids, entries: buildEntries(ids) });
  }
  if (scope === 'reading_queue') {
    const rows = db.prepare(`SELECT vn_id FROM reading_queue ORDER BY position ASC`).all() as { vn_id: string }[];
    const ids = rows.map((r) => r.vn_id);
    return NextResponse.json({ scope, ids, entries: buildEntries(ids) });
  }
  if (scope === 'recent_stock') {
    const rows = db.prepare(`
      SELECT vn_id, MIN(fetched_at) AS oldest
      FROM vn_stock_provider_status
      GROUP BY vn_id
      ORDER BY oldest ASC
    `).all() as { vn_id: string; oldest: number }[];
    const ids = rows.map((r) => r.vn_id);
    return NextResponse.json({ scope, ids, entries: buildEntries(ids) });
  }
  if (scope === 'wishlist') {
    const result = await fetchAuthenticatedWishlist();
    if ('needsAuth' in result) {
      return NextResponse.json({ error: 'VNDB authentication required' }, { status: 401 });
    }
    const ids = result.map((e) => e.id).filter(isVndbVnId);
    return NextResponse.json({ scope, ids, entries: buildEntries(ids) });
  }
  return NextResponse.json({ error: 'unknown scope' }, { status: 400 });
}
