import { NextRequest, NextResponse } from 'next/server';
import { db, getCollectionItem, materializeReleaseMetaForVn, upsertVn } from '@/lib/db';
import { ensureLocalImagesForVn } from '@/lib/assets';
import { EgsUnreachable, resolveEgsForVn } from '@/lib/erogamescape';
import { getVn, refreshVn } from '@/lib/vndb';
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
import { recordActivity } from '@/lib/activity';
import { validateVnIdOr400 } from '@/lib/vn-id';

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
  const bad = validateVnIdOr400(id);
  if (bad) return bad;

  // Data / metadata operations are intentionally NOT gated on
  // collection membership. The assets endpoint refreshes the VNDB
  // metadata cache, the EGS mapping, the on-disk images, and the
  // materialised `release_meta_cache` — every one of those is a
  // per-VN concern, not a per-collection-row concern. Forcing the
  // operator to add a VN to the collection just to refresh its
  // cached data is a UX trap that surfaced on `/vn/<id>` links
  // arriving from EGS top-ranked, search hits, and anticipated
  // rows. Collection-only fields (status, owned editions, shelf
  // placement, personal tracking) remain gated by their own routes.
  //
  // What we still require: a row in the `vn` table. If the VN
  // page was reached via a deep-link and the `vn` row doesn't yet
  // exist locally, hydrate it from VNDB so the rest of the pipeline
  // has something to mirror. EGS-only synthetic ids skip the
  // upstream fetch (the `egs_*` prefix never resolves on VNDB).
  const vnExistsRow = db
    .prepare('SELECT id FROM vn WHERE id = ?')
    .get(id) as { id: string } | undefined;
  if (!vnExistsRow) {
    const isEgsOnlyId = id.startsWith('egs_');
    if (isEgsOnlyId) {
      // Synthetic id with no local row — there's no upstream to
      // fall back to. Return a clean 404 so the UI surfaces the
      // missing-row state instead of cascading downstream failures.
      return NextResponse.json(
        { error: 'synthetic VN with no local row; nothing to refresh' },
        { status: 404 },
      );
    }
    try {
      const fresh = await getVn(id);
      if (!fresh) {
        return NextResponse.json({ error: 'VN not found on VNDB' }, { status: 404 });
      }
      upsertVn(fresh);
    } catch (e) {
      return NextResponse.json(
        { error: `failed to hydrate VN from VNDB: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  }

  const refresh = req.nextUrl.searchParams.get('refresh') === 'true';
  const isEgsOnly = id.startsWith('egs_');
  let egsWarning: EgsWarning | null = null;

  try {
    if (refresh && !isEgsOnly) {
      const fresh = await refreshVn(id);
      if (fresh) upsertVn(fresh);
    }
    // Bulk "Download all" path — also re-pull staff/VA profiles so the
    // staff and character pages are fully populated. When the caller
    // passes `?refresh=true` we forward `force: true` to every fan-out
    // so they bypass the 30-day per-entity freshness cache and actually
    // re-download. Without this, a "Full re-download" pass would only
    // show one fan-out kind running (the one without a stale check)
    // because everything else short-circuits as "already cached".
    if (!isEgsOnly) {
      const fopts = { force: refresh };
      void downloadFullStaffForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] staff fan-out failed:`, (e as Error).message);
      });
      void downloadFullCharForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] character fan-out failed:`, (e as Error).message);
      });
      void downloadFullProducerForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] producer fan-out failed:`, (e as Error).message);
      });
      void downloadFullReleasesForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] release fan-out failed:`, (e as Error).message);
      });
      void downloadFullTagsForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] tag fan-out failed:`, (e as Error).message);
      });
      void downloadFullTraitsForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] trait fan-out failed:`, (e as Error).message);
      });
      void downloadScreenshotReleasesForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] screenshot-release fan-out failed:`, (e as Error).message);
      });
      void downloadFullRelationsForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] relations fan-out failed:`, (e as Error).message);
      });
      void scrapeProducersForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] producer-scrape fan-out failed:`, (e as Error).message);
      });
      void scrapeTagDagForVn(id, fopts).catch((e) => {
        console.error(`[assets:${id}] tag-DAG scrape fan-out failed:`, (e as Error).message);
      });
      void scrapeCharactersForVn(id, fopts).catch((e) => {
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
    // Re-populate release_meta_cache from the freshly-fetched release
    // payloads so the shelf popover / owned-editions surfaces stop
    // showing "Unknown platform" once the user clicks Refresh. The
    // materializer is idempotent + no-ops for synthetic / egs-only ids
    // (the regex check happens inside the helper).
    try {
      materializeReleaseMetaForVn(id);
    } catch (e) {
      console.error(`[assets:${id}] release-meta materialize failed:`, (e as Error).message);
    }
    if (refresh) {
      try {
        recordActivity({
          kind: 'download.refresh',
          entity: 'vn',
          entityId: id,
          label: 'Refreshed VN assets',
          payload: {
            screenshot_count: result.screenshots.length,
            release_image_count: result.releaseImages.length,
            egs_warning: egsWarning?.kind ?? null,
          },
        });
      } catch (e) {
        console.error(`[assets:${id}] activity log failed:`, (e as Error).message);
      }
    }
    return NextResponse.json({
      ok: true,
      poster: result.poster,
      poster_thumb: result.posterThumb,
      screenshot_count: result.screenshots.length,
      release_image_count: result.releaseImages.length,
      // `item` is null for VNs not in the local collection — the
      // route runs the metadata/asset refresh either way, and the
      // collection row stays untouched. Callers that care about
      // tracking state read `getCollectionItem(id)` themselves.
      item: getCollectionItem(id),
      egs_warning: egsWarning,
    });
  } catch (err) {
    // 500 for local disk / DB / unexpected errors; 502 only when the
    // failure is clearly an upstream issue (EgsUnreachable already
    // captured into `egs_warning` above). The catch here covers DB
    // writes, filesystem errors, schema bugs — none of which should
    // be reported as "VNDB is down".
    return NextResponse.json(
      { error: (err as Error).message, egs_warning: egsWarning },
      { status: 500 },
    );
  }
}
