import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { parseBoundedQueryInteger } from '@/lib/api-query';
import { upstreamError } from '@/lib/api-error';
import { fetchTopVnsByTag, getTag } from '@/lib/vndb';
import { getVndbTagWebDetail } from '@/lib/vndb-tag-web-cache';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type HydrationPart = 'tag' | 'hierarchy' | 'results';

/**
 * Populate the cache snapshots used by one tag page after its shell paints.
 *
 * @param req Authenticated request containing bounded `mode` and `page` query values.
 * @param ctx Dynamic route context containing the VNDB tag identifier.
 * @returns Completion summary without exposing upstream error bodies.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const { id: rawId } = await ctx.params;
  if (!/^g\d+$/i.test(rawId)) {
    return NextResponse.json({ error: 'invalid tag id' }, { status: 400 });
  }
  const tagId = rawId.toLowerCase();
  const mode = req.nextUrl.searchParams.get('mode') ?? 'local';
  if (mode !== 'local' && mode !== 'vndb') {
    return NextResponse.json({ error: 'invalid tag mode' }, { status: 400 });
  }
  const page = parseBoundedQueryInteger(req.nextUrl.searchParams.get('page'), {
    fallback: 1,
    min: 1,
    max: 10_000,
  });
  const tasks: Array<{ part: HydrationPart; promise: Promise<object | null> }> = [
    { part: 'tag', promise: getTag(tagId) },
  ];
  if (mode === 'vndb') {
    tasks.push(
      { part: 'hierarchy', promise: getVndbTagWebDetail(tagId) },
      { part: 'results', promise: fetchTopVnsByTag(tagId, { results: 24, page }) },
    );
  }
  const settled = await Promise.allSettled(tasks.map((task) => task.promise));
  const refreshed: HydrationPart[] = [];
  const failed: HydrationPart[] = [];
  let upstreamFailure: object = new Error('tag hydration failed');
  settled.forEach((result, index) => {
    const part = tasks[index].part;
    if (result.status === 'fulfilled') refreshed.push(part);
    else {
      failed.push(part);
      upstreamFailure = result.reason instanceof Error ? result.reason : new Error('tag hydration failed');
    }
  });
  if (refreshed.length === 0) {
    return upstreamError('tags/hydrate', upstreamFailure);
  }
  if (failed.length > 0) {
    console.error('[upstream:tags/hydrate] partial failure', { tagId, failed });
  }
  return NextResponse.json({
    ok: true,
    complete: failed.length === 0,
    refreshed,
    failed,
  });
}
