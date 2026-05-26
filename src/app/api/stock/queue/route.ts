import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { db } from '@/lib/db';

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
export async function GET(req: NextRequest) {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const scope = req.nextUrl.searchParams.get('scope') ?? 'collection';
  if (scope === 'collection') {
    const rows = db.prepare(`SELECT vn_id FROM collection ORDER BY updated_at DESC, added_at DESC`).all() as { vn_id: string }[];
    return NextResponse.json({ scope, ids: rows.map((r) => r.vn_id) });
  }
  if (scope === 'reading_queue') {
    const rows = db.prepare(`SELECT vn_id FROM reading_queue ORDER BY position ASC`).all() as { vn_id: string }[];
    return NextResponse.json({ scope, ids: rows.map((r) => r.vn_id) });
  }
  if (scope === 'recent_stock') {
    // VNs whose stock was checked at least once, ordered by most-stale first
    // (oldest fetched_at). Useful for "refresh oldest" batch operations.
    const rows = db.prepare(`
      SELECT vn_id, MIN(fetched_at) AS oldest
      FROM vn_stock_provider_status
      GROUP BY vn_id
      ORDER BY oldest ASC
    `).all() as { vn_id: string; oldest: number }[];
    return NextResponse.json({ scope, ids: rows.map((r) => r.vn_id) });
  }
  return NextResponse.json({ error: 'unknown scope' }, { status: 400 });
}
