import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { db, getCachedTitleResolution, setCachedTitleResolution } from '@/lib/db';
import { searchVn } from '@/lib/vndb';
import { searchEgsByName } from '@/lib/erogamescape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TITLES = 50;

async function resolveTitle(trimmed: string): Promise<{ vnId: string; title: string } | null> {
  const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
  const hit = db
    .prepare(`SELECT id, title FROM vn WHERE title LIKE ? ESCAPE '\\' OR alttitle LIKE ? ESCAPE '\\' ORDER BY title COLLATE NOCASE LIMIT 1`)
    .get(like, like) as { id: string; title: string } | undefined;
  if (hit) return { vnId: hit.id, title: hit.title };

  const cached = getCachedTitleResolution(trimmed);
  if (cached) return cached;

  const [vndbResult, egsResult] = await Promise.all([
    searchVn(trimmed, { results: 1 }).catch(() => null),
    searchEgsByName(trimmed).catch(() => null),
  ]);

  if (vndbResult && vndbResult.results.length > 0) {
    const r = vndbResult.results[0];
    setCachedTitleResolution(trimmed, r.id, r.title);
    return { vnId: r.id, title: r.title };
  }

  if (egsResult) {
    const vnId = `egs_${egsResult.id}`;
    setCachedTitleResolution(trimmed, vnId, egsResult.gamename);
    return { vnId, title: egsResult.gamename };
  }

  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.getAll('q').slice(0, MAX_TITLES);
  if (raw.length === 0) return NextResponse.json({});

  const entries = await Promise.all(
    raw.map(async (q) => {
      const trimmed = q.trim();
      if (!trimmed) return [q, null] as [string, null];
      const resolved = await resolveTitle(trimmed);
      return [q, resolved] as [string, { vnId: string; title: string } | null];
    }),
  );

  return NextResponse.json(Object.fromEntries(entries));
}
