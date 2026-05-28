import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

const MAX_TITLES = 50;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.getAll('q').slice(0, MAX_TITLES);
  if (raw.length === 0) return NextResponse.json({});

  const result: Record<string, { vnId: string; title: string } | null> = {};
  for (const q of raw) {
    const trimmed = q.trim();
    if (!trimmed) { result[q] = null; continue; }
    const like = `%${trimmed.replace(/[%_]/g, '\\$&')}%`;
    const hit = db
      .prepare(`SELECT id, title FROM vn WHERE title LIKE ? ESCAPE '\\' OR alttitle LIKE ? ESCAPE '\\' ORDER BY title COLLATE NOCASE LIMIT 1`)
      .get(like, like) as { id: string; title: string } | undefined;
    result[q] = hit ? { vnId: hit.id, title: hit.title } : null;
  }

  return NextResponse.json(result);
}
