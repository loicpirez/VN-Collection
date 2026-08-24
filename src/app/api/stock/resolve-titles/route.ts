import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { getStockRepository } from '@/lib/db/repositories/stock';
import { getVnReadRepository } from '@/lib/db/repositories/vn-read';
import { searchVn } from '@/lib/vndb';
import { searchEgsByName } from '@/lib/erogamescape';
import { clampQuery } from '@/lib/api-query';
import { tooManyRequests } from '@/lib/rate-limit-response';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_TITLES = 50;

async function resolveTitle(trimmed: string): Promise<{ vnId: string; title: string } | null> {
  const hit = await getVnReadRepository().findTitleMatch(trimmed);
  if (hit) return hit;

  const stockRepository = getStockRepository();
  const cached = await stockRepository.getCachedTitleResolution(trimmed);
  if (cached) return cached;

  const [vndbResult, egsResult] = await Promise.all([
    searchVn(trimmed, { results: 1 }).catch(() => null),
    searchEgsByName(trimmed).catch(() => null),
  ]);

  if (vndbResult && vndbResult.results.length > 0) {
    const r = vndbResult.results[0];
    await stockRepository.setCachedTitleResolution(trimmed, r.id, r.title);
    return { vnId: r.id, title: r.title };
  }

  if (egsResult) {
    const vnId = `egs_${egsResult.id}`;
    await stockRepository.setCachedTitleResolution(trimmed, vnId, egsResult.gamename);
    return { vnId, title: egsResult.gamename };
  }

  return null;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const limited = tooManyRequests(req, 'stock/resolve-titles', { limit: 30, windowMs: 10_000 });
  if (limited) return limited;

  const raw = req.nextUrl.searchParams.getAll('q').slice(0, MAX_TITLES);
  if (raw.length === 0) return NextResponse.json({});

  const entries = await Promise.all(
    raw.map(async (q) => {
      const trimmed = clampQuery(q, 200);
      if (!trimmed) return [q, null] as [string, null];
      const resolved = await resolveTitle(trimmed);
      return [q, resolved] as [string, { vnId: string; title: string } | null];
    }),
  );

  return NextResponse.json(Object.fromEntries(entries));
}
