import { NextResponse, type NextRequest } from 'next/server';
import { searchLocalCharacters } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Local character search backing the `/characters` "Local" tab.
 *
 * Accepts `?q=<substring>` (matched against id / name / original /
 * aliases) and returns every cached `char_full:*` payload tied to a
 * VN in the operator's collection. The page-level filter cascade
 * (sex / role / blood / age / height / vaLang / hasVoice …) runs in
 * `filterCharacters` so this route stays a pure projection of the
 * underlying VNDB profile JSON.
 *
 * The route deliberately responds with results even when `q` is
 * empty so the page's "no query, only filters" path (the spec
 * requires `/characters?sex=f` to render results) works without a
 * second code path.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').trim();
  const limit = Number.parseInt(sp.get('limit') ?? '', 10);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  const rows = searchLocalCharacters({ q: q || undefined, limit: cap });
  const characters = rows.map((row) => ({
    ...(row.profile as Record<string, unknown>),
    voice_languages: row.voice_languages,
  }));
  return NextResponse.json({ characters });
}
