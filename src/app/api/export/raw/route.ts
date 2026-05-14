import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Stream the entire VNDB raw cache as one JSON blob. Every byte VNDB has
 * returned for any entity (VN / producer / character / staff / release /
 * tag / trait / quote / full-fan-out payload) is keyed in `vndb_cache`,
 * so this single dump covers everything that has ever been fetched.
 *
 * Output shape:
 *   {
 *     exported_at: <unix ms>,
 *     entries: [
 *       { cache_key, body: <parsed JSON>, fetched_at, expires_at }, ...
 *     ]
 *   }
 *
 * The user can drop the file into any JSON tool to inspect or grep
 * across every field VNDB ever sent.
 */
export async function GET() {
  const rows = db
    .prepare(`SELECT cache_key, body, etag, last_modified, fetched_at, expires_at FROM vndb_cache ORDER BY cache_key`)
    .all() as Array<{
      cache_key: string;
      body: string;
      etag: string | null;
      last_modified: string | null;
      fetched_at: number;
      expires_at: number;
    }>;

  const entries = rows.map((r) => {
    let body: unknown;
    try {
      body = JSON.parse(r.body);
    } catch {
      body = r.body;
    }
    return {
      cache_key: r.cache_key,
      etag: r.etag,
      last_modified: r.last_modified,
      fetched_at: r.fetched_at,
      expires_at: r.expires_at,
      body,
    };
  });

  const payload = {
    exported_at: Date.now(),
    entry_count: entries.length,
    entries,
  };

  const filename = `vndb-raw-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
