import { NextRequest, NextResponse } from 'next/server';
import { getCollectionItem, upsertVn } from '@/lib/db';
import { ensureLocalImagesForVn } from '@/lib/assets';
import { EgsUnreachable, resolveEgsForVn } from '@/lib/erogamescape';
import { refreshVn } from '@/lib/vndb';
import { downloadFullStaffForVn } from '@/lib/staff-full';
import { downloadFullCharForVn } from '@/lib/character-full';
import { downloadFullProducerForVn } from '@/lib/producer-full';
import { downloadFullReleasesForVn, downloadScreenshotReleasesForVn } from '@/lib/release-full';
import { downloadFullTagsForVn } from '@/lib/tag-full';
import { downloadFullTraitsForVn } from '@/lib/trait-full';
import { downloadFullRelationsForVn } from '@/lib/relations-full';
import { scrapeProducersForVn } from '@/lib/scrape-producer-relations';
import { scrapeTagDagForVn } from '@/lib/scrape-tag-dag';
import { scrapeCharactersForVn } from '@/lib/scrape-character-instances';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 600;

interface EgsWarning {
  kind: 'network' | 'server' | 'throttled' | 'blocked';
  message: string;
  status: number | null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!getCollectionItem(id)) return NextResponse.json({ error: 'not in collection' }, { status: 404 });

  const refresh = req.nextUrl.searchParams.get('refresh') === 'true';
  const isEgsOnly = id.startsWith('egs_');
  let egsWarning: EgsWarning | null = null;

  try {
    if (refresh && !isEgsOnly) {
      const fresh = await refreshVn(id);
      if (fresh) upsertVn(fresh);
    }
    // Bulk "Download all" path — also re-pull staff/VA profiles so the
    // staff and character pages are fully populated. `refresh` already
    // implies the user wants a thorough refetch.
    if (!isEgsOnly) {
      void downloadFullStaffForVn(id).catch((e) => {
        console.error(`[assets:${id}] staff fan-out failed:`, (e as Error).message);
      });
      void downloadFullCharForVn(id).catch((e) => {
        console.error(`[assets:${id}] character fan-out failed:`, (e as Error).message);
      });
      void downloadFullProducerForVn(id).catch((e) => {
        console.error(`[assets:${id}] producer fan-out failed:`, (e as Error).message);
      });
      void downloadFullReleasesForVn(id).catch((e) => {
        console.error(`[assets:${id}] release fan-out failed:`, (e as Error).message);
      });
      void downloadFullTagsForVn(id).catch((e) => {
        console.error(`[assets:${id}] tag fan-out failed:`, (e as Error).message);
      });
      void downloadFullTraitsForVn(id).catch((e) => {
        console.error(`[assets:${id}] trait fan-out failed:`, (e as Error).message);
      });
      void downloadScreenshotReleasesForVn(id).catch((e) => {
        console.error(`[assets:${id}] screenshot-release fan-out failed:`, (e as Error).message);
      });
      void downloadFullRelationsForVn(id).catch((e) => {
        console.error(`[assets:${id}] relations fan-out failed:`, (e as Error).message);
      });
      void scrapeProducersForVn(id).catch((e) => {
        console.error(`[assets:${id}] producer-scrape fan-out failed:`, (e as Error).message);
      });
      void scrapeTagDagForVn(id).catch((e) => {
        console.error(`[assets:${id}] tag-DAG scrape fan-out failed:`, (e as Error).message);
      });
      void scrapeCharactersForVn(id).catch((e) => {
        console.error(`[assets:${id}] character-scrape fan-out failed:`, (e as Error).message);
      });
    }
    // Force-refresh the EGS payload too — pulls every gamelist column, refreshes the
    // description / brand / median / playtime / image URL, and re-mirrors the cover
    // locally inside ensureLocalImagesForVn. EGS failures don't fail the whole
    // request (VNDB-side assets still succeed), but we report what happened so the
    // bulk UI can flag "N items couldn't reach EGS".
    try {
      await resolveEgsForVn(id, { force: refresh, allowSearch: true });
    } catch (e) {
      if (e instanceof EgsUnreachable) {
        egsWarning = { kind: e.kind, message: e.message, status: e.status };
      } else {
        egsWarning = { kind: 'server', message: (e as Error).message, status: null };
      }
    }
    const result = await ensureLocalImagesForVn(id);
    return NextResponse.json({
      ok: true,
      poster: result.poster,
      poster_thumb: result.posterThumb,
      screenshot_count: result.screenshots.length,
      release_image_count: result.releaseImages.length,
      item: getCollectionItem(id),
      egs_warning: egsWarning,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, egs_warning: egsWarning }, { status: 502 });
  }
}
