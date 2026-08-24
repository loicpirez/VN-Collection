import { NextRequest, NextResponse } from 'next/server';
import type { ListOptions } from '@/lib/db';
import { isAspectKey } from '@/lib/aspect-ratio';
import { clampQuery } from '@/lib/api-query';
import type { CollectionCardApiItem } from '@/lib/types';
import { EDITION_TYPES, STATUSES } from '@/lib/types';
import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';

import { PUBLIC_READ_ROUTE } from '@/lib/api-route-meta';
import { getCachedCollectionVnIds } from '@/lib/collection-vn-ids-cache';
import { apiErrorBody } from '@/lib/api-error-shape';
import {
  parseOptionalQueryBoolean,
  parseOptionalQueryInteger,
  parseOptionalQueryNumber,
} from '@/lib/query-params';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
void PUBLIC_READ_ROUTE;

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

function isValidStatus(value: string): value is NonNullable<ListOptions['status']> {
  return (STATUSES as readonly string[]).includes(value);
}

function isValidEditionType(value: string): value is NonNullable<ListOptions['edition']> {
  return (EDITION_TYPES as readonly string[]).includes(value);
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
  const parsedPage = parseOptionalQueryInteger(sp.get('page'), { minimum: 1, maximum: MAX_COLLECTION_PAGE });
  const parsedPageSize = parseOptionalQueryInteger(sp.get('limit'), { minimum: 1, maximum: MAX_COLLECTION_PAGE_SIZE });
  const page = parsedPage === undefined ? 1 : parsedPage;
  const pageSize = parsedPageSize === undefined ? DEFAULT_COLLECTION_PAGE_SIZE : parsedPageSize;
  const ratingMin = parseOptionalQueryNumber(sp.get('ratingMin'), { minimum: 0, maximum: 100 });
  const ratingMax = parseOptionalQueryNumber(sp.get('ratingMax'), { minimum: 0, maximum: 100 });
  const playtimeMinHours = parseOptionalQueryNumber(sp.get('playtimeMin'), { minimum: 0, maximum: 100_000 });
  const playtimeMaxHours = parseOptionalQueryNumber(sp.get('playtimeMax'), { minimum: 0, maximum: 100_000 });
  const nsfwThreshold = parseOptionalQueryNumber(sp.get('nsfwThreshold'), { minimum: 0, maximum: 2 });
  const series = parseOptionalQueryInteger(seriesRaw, { minimum: 1, maximum: 2_147_483_647, clampMaximum: false });
  const yearMin = parseOptionalQueryInteger(yearMinRaw, { minimum: 1, maximum: 9999, clampMaximum: false });
  const yearMax = parseOptionalQueryInteger(yearMaxRaw, { minimum: 1, maximum: 9999, clampMaximum: false });
  const dumped = parseOptionalQueryBoolean(dumpedRaw);
  const booleanFilters = {
    onlyEgsOnly: parseOptionalQueryBoolean(sp.get('only_egs_only')),
    matchVndb: parseOptionalQueryBoolean(sp.get('match_vndb')),
    matchEgs: parseOptionalQueryBoolean(sp.get('match_egs')),
    fanDisc: parseOptionalQueryBoolean(sp.get('fan_disc')),
    hasNotes: parseOptionalQueryBoolean(sp.get('has_notes')),
    hasCustomCover: parseOptionalQueryBoolean(sp.get('has_custom_cover')),
    hasBanner: parseOptionalQueryBoolean(sp.get('has_banner')),
    isFavorite: parseOptionalQueryBoolean(sp.get('is_favorite')),
    hasReleased: parseOptionalQueryBoolean(sp.get('has_released')),
    isNsfw: parseOptionalQueryBoolean(sp.get('is_nsfw')),
    isNukige: parseOptionalQueryBoolean(sp.get('is_nukige')),
    inReadingQueue: parseOptionalQueryBoolean(sp.get('in_reading_queue')),
    inList: parseOptionalQueryBoolean(sp.get('in_list')),
    excludeNsfw: parseOptionalQueryBoolean(sp.get('exclude_nsfw')),
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
    series === null ||
    yearMin === null ||
    yearMax === null ||
    dumped === null ||
    !VALID_SORTS.includes(sortRaw as NonNullable<ListOptions['sort']>) ||
    (orderRaw !== 'asc' && orderRaw !== 'desc') ||
    (ratingMin != null && ratingMax != null && ratingMin > ratingMax) ||
    (playtimeMinHours != null && playtimeMaxHours != null && playtimeMinHours > playtimeMaxHours) ||
    (yearMin != null && yearMax != null && yearMin > yearMax) ||
    Object.values(booleanFilters).some((value) => value === null)
  ) {
    return NextResponse.json({ error: 'invalid filter' }, { status: 400 });
  }
  const sort = sortRaw as ListOptions['sort'];
  const order: 'asc' | 'desc' = orderRaw;

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
    const repository = getCollectionListRepository();
    const requestsAspect = aspectValid.length > 0;
    if (requestsAspect) {
      const allVnIds = await getCachedCollectionVnIds();
      // STEP 1: pull aspect from cached VNDB release payloads (per
      // VN, idempotent + short-circuits). The Library was the
      // surface where the user observed VNs with 800x600 (→ 4:3)
      // and 1280x720 (→ 16:9) releases sitting in the Unknown
      // bucket — release_resolution_cache was empty because
      // /api/vn/[id]/releases had never been invoked for those
      // VNs from the Library page. Materializing here makes the
      // Library agree with the VN detail page.
      await repository.prepareAspectData(allVnIds);
    }

    const raw = await repository.listCards({
      status: status as ListOptions['status'],
      q,
      producer: producer || undefined,
      publisher: publisher || undefined,
      series,
      tag: tag || undefined,
      place: place || undefined,
      edition: edition && isValidEditionType(edition) ? edition : undefined,
      yearMin,
      yearMax,
      dumped,
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
    const [listCounts, queueIds, stats] = await Promise.all([
      repository.listMembershipCounts(),
      repository.readingQueueIds(),
      repository.stats(),
    ]);
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
      stats,
      pagination: {
        page,
        page_size: pageSize,
        returned: items.length,
        has_more: hasMore,
      },
    });
  } catch (err) {
    console.error('[collection] DB error:', (err as Error).message);
    return NextResponse.json(
      apiErrorBody('internal error', 'collection_unavailable', 'collection/list'),
      { status: 500 },
    );
  }
}
