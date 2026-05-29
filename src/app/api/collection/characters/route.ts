import { NextResponse, type NextRequest } from 'next/server';
import { searchLocalCharacters } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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
/**
 * Length cap for the `q` substring before it flows into the in-memory
 * scan inside `searchLocalCharacters`. The scan parses every cached
 * `char_full:*` body and does `haystack.includes(needle)` — a multi-MB
 * needle would waste tens of MB of string-conversion work per row even
 * though zero matches are possible. 200 chars covers every realistic
 * search input.
 */
const Q_MAX = 200;

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') ?? '').slice(0, Q_MAX).trim();
  const limit = Number.parseInt(sp.get('limit') ?? '', 10);
  const cap = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 200;
  const rows = searchLocalCharacters({ q: q || undefined, limit: cap });
  const characters = rows.map((row) => ({
    ...(row.profile as Record<string, unknown>),
    voice_languages: row.voice_languages,
  }));
  return NextResponse.json({ characters });
}
