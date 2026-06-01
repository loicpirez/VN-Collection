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

const DEFAULT_PAGE_SIZE = 500;
const MAX_PAGE_SIZE = 500;
const MAX_PAGE = 10_000;

function parsePositiveInt(raw: string | null, fallback: number, max: number): number | null {
  if (raw === null) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1 && value <= max ? value : null;
}

function queueResponse(scope: string, ids: string[], total: number, page: number, pageSize: number): NextResponse {
  const nextPage = page * pageSize < total ? page + 1 : null;
  return NextResponse.json({
    scope,
    ids,
    entries: buildEntries(ids),
    page,
    page_size: pageSize,
    total,
    next_page: nextPage,
  });
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
  const page = parsePositiveInt(req.nextUrl.searchParams.get('page'), 1, MAX_PAGE);
  const pageSize = parsePositiveInt(req.nextUrl.searchParams.get('page_size'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  if (page === null || pageSize === null) {
    return NextResponse.json({ error: 'invalid pagination' }, { status: 400 });
  }
  const offset = (page - 1) * pageSize;
  if (scope === 'collection') {
    const total = (db.prepare('SELECT COUNT(*) AS count FROM collection').get() as { count: number }).count;
    const rows = db.prepare(`SELECT vn_id FROM collection ORDER BY updated_at DESC, added_at DESC LIMIT ? OFFSET ?`).all(pageSize, offset) as { vn_id: string }[];
    const ids = rows.map((r) => r.vn_id);
    return queueResponse(scope, ids, total, page, pageSize);
  }
  if (scope === 'reading_queue') {
    const total = (db.prepare('SELECT COUNT(*) AS count FROM reading_queue').get() as { count: number }).count;
    const rows = db.prepare(`SELECT vn_id FROM reading_queue ORDER BY position ASC LIMIT ? OFFSET ?`).all(pageSize, offset) as { vn_id: string }[];
    const ids = rows.map((r) => r.vn_id);
    return queueResponse(scope, ids, total, page, pageSize);
  }
  if (scope === 'recent_stock') {
    const total = (db.prepare(`
      SELECT COUNT(*) AS count
      FROM (
        SELECT vn_id
        FROM vn_stock_provider_status
        GROUP BY vn_id
      )
    `).get() as { count: number }).count;
    const rows = db.prepare(`
      SELECT vn_id, MIN(fetched_at) AS oldest
      FROM vn_stock_provider_status
      GROUP BY vn_id
      ORDER BY oldest ASC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset) as { vn_id: string; oldest: number }[];
    const ids = rows.map((r) => r.vn_id);
    return queueResponse(scope, ids, total, page, pageSize);
  }
  if (scope === 'wishlist') {
    const result = await fetchAuthenticatedWishlist();
    if ('needsAuth' in result) {
      return NextResponse.json({ error: 'VNDB authentication required' }, { status: 401 });
    }
    const allIds = result.map((e) => e.id).filter(isVndbVnId);
    const ids = allIds.slice(offset, offset + pageSize);
    return queueResponse(scope, ids, allIds.length, page, pageSize);
  }
  return NextResponse.json({ error: 'unknown scope' }, { status: 400 });
}
