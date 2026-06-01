import { NextRequest, NextResponse } from 'next/server';
import {
  countListMembershipsByVn,
  db,
  getReadingQueueVnIds,
  getStats,
  isValidEditionType,
  isValidStatus,
  listCollectionForCards,
  materializeAspectForCollectionVns,
  materializeReleaseAspectsForCollectionVns,
  materializeReleaseMetaForCollectionVns,
  type ListOptions,
} from '@/lib/db';
import { isAspectKey } from '@/lib/aspect-ratio';
import { clampQuery } from '@/lib/api-query';
import type { CollectionCardApiItem } from '@/lib/types';

import { isVndbVnId } from '@/lib/vn-id-shape';

export { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const VALID_SORTS: Array<NonNullable<ListOptions['sort']>> = [
  'updated_at',
  'added_at',
  'title',
  'rating',
  'user_rating',
  'playtime',
  'length_minutes',
  'egs_playtime',
  'combined_playtime',
  'released',
  'producer',
  'publisher',
  'egs_rating',
  'combined_rating',
  'custom',
];
const DEFAULT_COLLECTION_PAGE_SIZE = 240;
const MAX_COLLECTION_PAGE_SIZE = 500;
const MAX_COLLECTION_PAGE = 20_000;

function parsePositiveInteger(raw: string | null, fallback: number, max: number): number | null {
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
  return Math.min(parsed, max);
}

function parseOptionalNumber(raw: string | null, min: number, max: number): number | undefined | null {
  if (raw == null || raw === '') return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function parseOptionalBoolean(raw: string | null): boolean | undefined | null {
  if (raw == null || raw === '') return undefined;
  if (raw === '1') return true;
  if (raw === '0') return false;
  return null;
}

/**
 * 30-second in-process cache for the full-collection `vn_id` scan that
 * feeds aspect materialization. The scan result is the complete set of
 * collection VN ids and does not vary by request parameters, so a
 * keyless TTL is sufficient; the materialize helpers below are
 * idempotent and short-circuit per VN, so a slightly stale id list at
 * most defers a freshly added VN's aspect backfill by one TTL window.
 * Mirrors the `getAggregateStats` cache shape in `@/lib/db`.
 */
let collectionVnIdsCache: { at: number; data: string[] } | null = null;
const COLLECTION_VN_IDS_TTL_MS = 30_000;

function getCachedCollectionVnIds(): string[] {
  if (collectionVnIdsCache && Date.now() - collectionVnIdsCache.at < COLLECTION_VN_IDS_TTL_MS) {
    return collectionVnIdsCache.data;
  }
  const data = (
    db.prepare('SELECT vn_id FROM collection').all() as Array<{ vn_id: string }>
  ).map((r) => r.vn_id);
  collectionVnIdsCache = { at: Date.now(), data };
  return data;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? '';
  // Cap user-supplied string filters. The route is unauthed (single-
  // user self-host posture) but a LAN caller could still send a
  // megabyte string per filter to waste planner work on `LIKE`
  // patterns. 300 chars matches the cap on `/api/search/textual`
  // and the longest reasonable advanced-search payloads.
  const FILTER_MAX = 300;
  const q = clampQuery(sp.get('q'), FILTER_MAX);
  const producer = clampQuery(sp.get('producer'), FILTER_MAX);
  const publisher = clampQuery(sp.get('publisher'), FILTER_MAX);
  const tag = clampQuery(sp.get('tag'), FILTER_MAX);
  const place = clampQuery(sp.get('place'), FILTER_MAX);
  const edition = clampQuery(sp.get('edition'), FILTER_MAX);
  const seriesRaw = sp.get('series');
  const yearMinRaw = sp.get('yearMin');
  const yearMaxRaw = sp.get('yearMax');
  const sortRaw = sp.get('sort') ?? 'updated_at';
  const orderRaw = sp.get('order') ?? 'desc';
  const dumpedRaw = sp.get('dumped');
  const page = parsePositiveInteger(sp.get('page'), 1, MAX_COLLECTION_PAGE);
  const pageSize = parsePositiveInteger(
    sp.get('limit'),
    DEFAULT_COLLECTION_PAGE_SIZE,
    MAX_COLLECTION_PAGE_SIZE,
  );
  const ratingMin = parseOptionalNumber(sp.get('ratingMin'), 0, 100);
  const ratingMax = parseOptionalNumber(sp.get('ratingMax'), 0, 100);
  const playtimeMinHours = parseOptionalNumber(sp.get('playtimeMin'), 0, 100_000);
  const playtimeMaxHours = parseOptionalNumber(sp.get('playtimeMax'), 0, 100_000);
  const nsfwThreshold = parseOptionalNumber(sp.get('nsfwThreshold'), 0, 2);
  const booleanFilters = {
    onlyEgsOnly: parseOptionalBoolean(sp.get('only_egs_only')),
    matchVndb: parseOptionalBoolean(sp.get('match_vndb')),
    matchEgs: parseOptionalBoolean(sp.get('match_egs')),
    fanDisc: parseOptionalBoolean(sp.get('fan_disc')),
    hasNotes: parseOptionalBoolean(sp.get('has_notes')),
    hasCustomCover: parseOptionalBoolean(sp.get('has_custom_cover')),
    hasBanner: parseOptionalBoolean(sp.get('has_banner')),
    isFavorite: parseOptionalBoolean(sp.get('is_favorite')),
    hasReleased: parseOptionalBoolean(sp.get('has_released')),
    isNsfw: parseOptionalBoolean(sp.get('is_nsfw')),
    isNukige: parseOptionalBoolean(sp.get('is_nukige')),
    inReadingQueue: parseOptionalBoolean(sp.get('in_reading_queue')),
    inList: parseOptionalBoolean(sp.get('in_list')),
    excludeNsfw: parseOptionalBoolean(sp.get('exclude_nsfw')),
  };
  // ?aspect supports comma-separated multi-select (e.g.
  // ?aspect=4:3,16:9). Repeated params (sp.getAll) are also
  // honoured so URL builders can choose either convention.
  const aspectRawList = sp
    .getAll('aspect')
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  // Legacy single-value form (back-compat with bookmarks).
  const aspectRaw = aspectRawList[0] ?? null;
  const aspectValid = aspectRawList.filter(isAspectKey);
  const aspectInvalid = aspectRawList.filter((v) => !isAspectKey(v));

  if (status && !isValidStatus(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  if (edition && !isValidEditionType(edition)) {
    return NextResponse.json({ error: 'invalid edition' }, { status: 400 });
  }
  if (aspectInvalid.length > 0) {
    return NextResponse.json(
      { error: `invalid aspect: ${aspectInvalid.join(', ')}` },
      { status: 400 },
    );
  }
  if (page == null || pageSize == null) {
    return NextResponse.json({ error: 'invalid pagination' }, { status: 400 });
  }
  if (
    ratingMin === null ||
    ratingMax === null ||
    playtimeMinHours === null ||
    playtimeMaxHours === null ||
    nsfwThreshold === null ||
    Object.values(booleanFilters).some((value) => value === null)
  ) {
    return NextResponse.json({ error: 'invalid filter' }, { status: 400 });
  }
  const sort = (VALID_SORTS as string[]).includes(sortRaw)
    ? (sortRaw as ListOptions['sort'])
    : 'updated_at';
  const order: 'asc' | 'desc' = orderRaw === 'asc' ? 'asc' : 'desc';
  const series = seriesRaw ? Number(seriesRaw) : undefined;

  const yearMin = yearMinRaw ? Number(yearMinRaw) : undefined;
  const yearMax = yearMaxRaw ? Number(yearMaxRaw) : undefined;

  // Aspect-ratio filtering/grouping needs every collection VN to
  // carry SOME aspect signal — the SQL filter EXISTS chain in
  // listCollection cannot reach into vn.screenshots JSON. Materialize
  // the screenshots-fallback aspect into release_resolution_cache as
  // synthetic rows so the filter / group / card-chip surfaces agree.
  // This is a no-op for VNs that already have a manual override / an
  // owned-release cached resolution / a vn-bound rc row. Runs once
  // per /api/collection call only when the user is actively
  // filtering/grouping by aspect (cheap full-collection scan + a
  // small INSERT batch on first run). For non-aspect requests we
  // skip the work entirely.
  try {
    const requestsAspect = aspectValid.length > 0 || sp.get('group') === 'aspect';
    if (requestsAspect) {
      const allVnIds = getCachedCollectionVnIds();
      // STEP 1: pull aspect from cached VNDB release payloads (per
      // VN, idempotent + short-circuits). The Library was the
      // surface where the user observed VNs with 800x600 (→ 4:3)
      // and 1280x720 (→ 16:9) releases sitting in the Unknown
      // bucket — release_resolution_cache was empty because
      // /api/vn/[id]/releases had never been invoked for those
      // VNs from the Library page. Materializing here makes the
      // Library agree with the VN detail page.
      const vndbIds = allVnIds.filter(isVndbVnId);
      // STEP 1a: batch-materialize aspect from cached VNDB release payloads.
      // Single-pass over vndb_cache; skips VNs that already have a
      // non-unknown signal. Replaces the previous per-VN loop (DBA-001).
      materializeReleaseAspectsForCollectionVns(vndbIds);
      // STEP 1b: pull platform / media metadata from release cache
      // using the batch helper — replaces the previous per-VN loop
      // that called materializeReleaseMetaForVn individually (AUD-DB-001).
      materializeReleaseMetaForCollectionVns(vndbIds);
      // STEP 2: screenshots fallback for VNs that still have no
      // signal after step 1.
      materializeAspectForCollectionVns(allVnIds);
    }

    const raw = listCollectionForCards({
      status: status as ListOptions['status'],
      q,
      producer: producer || undefined,
      publisher: publisher || undefined,
      series: series && Number.isFinite(series) ? series : undefined,
      tag: tag || undefined,
      place: place || undefined,
      edition: edition && isValidEditionType(edition) ? edition : undefined,
      yearMin: yearMin && Number.isFinite(yearMin) ? yearMin : undefined,
      yearMax: yearMax && Number.isFinite(yearMax) ? yearMax : undefined,
      dumped: dumpedRaw === '1' ? true : dumpedRaw === '0' ? false : undefined,
      ratingMin,
      ratingMax,
      playtimeMinHours,
      playtimeMaxHours,
      onlyEgsOnly: booleanFilters.onlyEgsOnly ?? undefined,
      matchVndb: booleanFilters.matchVndb ?? undefined,
      matchEgs: booleanFilters.matchEgs ?? undefined,
      fanDisc: booleanFilters.fanDisc ?? undefined,
      hasNotes: booleanFilters.hasNotes ?? undefined,
      hasCustomCover: booleanFilters.hasCustomCover ?? undefined,
      hasBanner: booleanFilters.hasBanner ?? undefined,
      isFavorite: booleanFilters.isFavorite ?? undefined,
      hasReleased: booleanFilters.hasReleased ?? undefined,
      isNsfw: booleanFilters.isNsfw ?? undefined,
      isNukige: booleanFilters.isNukige ?? undefined,
      inReadingQueue: booleanFilters.inReadingQueue ?? undefined,
      inList: booleanFilters.inList ?? undefined,
      excludeNsfw: booleanFilters.excludeNsfw ?? undefined,
      nsfwThreshold: nsfwThreshold ?? undefined,
      // Multi-select aspect filter — `aspect` stays for back-compat
      // (first item from the list), `aspects` carries the full set
      // when the user picks more than one.
      aspect: aspectValid.length === 1 ? aspectValid[0] : undefined,
      aspects: aspectValid.length > 1 ? aspectValid : undefined,
      sort,
      order,
      limit: pageSize + 1,
      offset: (page - 1) * pageSize,
    });
    const hasMore = raw.length > pageSize;
    const pageItems = hasMore ? raw.slice(0, pageSize) : raw;
    // Annotate each row with its list-membership count once, here, so
    // the library grid renders the ListsPicker badge correctly on first
    // paint without needing a popover open per card.
    const listCounts = countListMembershipsByVn();
    const queueIds = getReadingQueueVnIds();
    const items: CollectionCardApiItem[] = pageItems.map((it) => {
      const {
        notes,
        started_date,
        finished_date,
        location,
        edition_label,
        box_type,
        download_url,
        custom_description,
        ...libraryItem
      } = it;
      return {
        ...libraryItem,
        has_notes: !!notes?.trim(),
        list_count: listCounts.get(it.id) ?? 0,
        in_reading_queue: queueIds.has(it.id),
      };
    });
    return NextResponse.json({
      items,
      stats: getStats(),
      pagination: {
        page,
        page_size: pageSize,
        returned: items.length,
        has_more: hasMore,
      },
    });
  } catch (err) {
    console.error('[collection] DB error:', (err as Error).message);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
