import { NextRequest, NextResponse } from 'next/server';
import { readJsonObject } from '@/lib/api-body';
import { upstreamError } from '@/lib/api-error';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { recommendVns } from '@/lib/recommend';
import { DEFAULT_RECOMMEND_MODE, RECOMMEND_MODES, type RecommendMode } from '@/lib/recommend-types';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function invalid(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

/**
 * Hydrate the VNDB snapshots used by one recommendation result set.
 *
 * @param req Authenticated request containing bounded recommendation filters.
 * @returns A sanitized completion summary for the background loader.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const rawMode = body.mode;
  if (rawMode !== undefined && (typeof rawMode !== 'string' || !(RECOMMEND_MODES as readonly string[]).includes(rawMode))) {
    return invalid('invalid recommendation mode');
  }
  const mode = (rawMode ?? DEFAULT_RECOMMEND_MODE) as RecommendMode;
  for (const key of ['includeEro', 'includeOwned', 'includeWishlist'] as const) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') {
      return invalid(`invalid ${key}`);
    }
  }
  const rawTags = body.customTagIds;
  if (
    rawTags !== undefined
    && (!Array.isArray(rawTags)
      || rawTags.length > 20
      || rawTags.some((tag) => typeof tag !== 'string' || !/^g\d+$/i.test(tag)))
  ) {
    return invalid('invalid recommendation tags');
  }
  const customTagIds = Array.isArray(rawTags)
    ? Array.from(new Set(rawTags.map((tag) => String(tag).toLowerCase())))
    : undefined;
  const rawSeed = body.seedVnId;
  if (rawSeed !== undefined && (typeof rawSeed !== 'string' || !isValidVnId(rawSeed))) {
    return invalid('invalid recommendation seed');
  }
  const seedVnId = typeof rawSeed === 'string' ? normalizeVnId(rawSeed) : undefined;
  if (mode === 'similar-to-vn' && !seedVnId) {
    return invalid('recommendation seed required');
  }

  try {
    const result = await recommendVns({
      mode,
      includeEro: body.includeEro === true,
      includeOwned: body.includeOwned === true,
      includeWishlist: body.includeWishlist === true,
      customTagIds,
      seedVnId,
    });
    return NextResponse.json({
      ok: true,
      complete: result.cacheComplete !== false,
      results: result.results.length,
    });
  } catch (error) {
    return upstreamError('recommendations/hydrate', error);
  }
}
