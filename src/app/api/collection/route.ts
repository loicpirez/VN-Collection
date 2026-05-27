import { NextRequest, NextResponse } from 'next/server';
import {
  countListMembershipsByVn,
  db,
  getReadingQueueVnIds,
  getStats,
  isValidEditionType,
  isValidStatus,
  listCollection,
  listCollectionForCards,
  materializeAspectForCollectionVns,
  materializeReleaseAspectsForCollectionVns,
  materializeReleaseMetaForCollectionVns,
  type ListOptions,
} from '@/lib/db';
import { isAspectKey } from '@/lib/aspect-ratio';

import { isVndbVnId } from '@/lib/vn-id-shape';
export const dynamic = 'force-dynamic';

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

// intentionally public — single-user self-hosted app; the library view
// carries the user's own collection metadata only. Mutating handlers
// (POST/PATCH/DELETE per VN) remain gated via requireLocalhostOrToken.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? '';
  // Cap user-supplied string filters. The route is unauthed (single-
  // user self-host posture) but a LAN caller could still send a
  // megabyte string per filter to waste planner work on `LIKE`
  // patterns. 300 chars matches the cap on `/api/search/textual`
  // and the longest reasonable advanced-search payloads.
  const FILTER_MAX = 300;
  const clip = (v: string): string => v.slice(0, FILTER_MAX);
  const q = clip(sp.get('q') ?? '');
  const producer = clip(sp.get('producer') ?? '');
  const publisher = clip(sp.get('publisher') ?? '');
  const tag = clip(sp.get('tag') ?? '');
  const place = clip(sp.get('place') ?? '');
  const edition = clip(sp.get('edition') ?? '');
  const seriesRaw = sp.get('series');
  const yearMinRaw = sp.get('yearMin');
  const yearMaxRaw = sp.get('yearMax');
  const sortRaw = sp.get('sort') ?? 'updated_at';
  const orderRaw = sp.get('order') ?? 'desc';
  const dumpedRaw = sp.get('dumped');
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
      const allVnIds = (
        db.prepare('SELECT vn_id FROM collection').all() as Array<{ vn_id: string }>
      ).map((r) => r.vn_id);
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

    // R5-144: default to the slim card projection so the library
    // grid doesn't pay for ~30-80 MB of JSON.parse work per
    // request on a 1000+ VN library. Callers that need the full
    // payload pass `?detail=full` (used by export / debug
    // tooling). The slim projection keeps `developers`,
    // `publishers`, `tags`, and `relations` (LibraryClient reads
    // those) and drops `description` / `aliases` / `staff` /
    // `va` / `titles` / `editions` / `extlinks` / `screenshots` /
    // `release_images` / `raw` / `languages` / `platforms` etc.
    const wantsFullDetail = sp.get('detail') === 'full';
    const collectionFetcher = wantsFullDetail ? listCollection : listCollectionForCards;
    const raw = collectionFetcher({
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
      // Multi-select aspect filter — `aspect` stays for back-compat
      // (first item from the list), `aspects` carries the full set
      // when the user picks more than one.
      aspect: aspectValid.length === 1 ? aspectValid[0] : undefined,
      aspects: aspectValid.length > 1 ? aspectValid : undefined,
      sort,
      order,
    });
    // Annotate each row with its list-membership count once, here, so
    // the library grid renders the ListsPicker badge correctly on first
    // paint without needing a popover open per card.
    const listCounts = countListMembershipsByVn();
    const queueIds = getReadingQueueVnIds();
    const items = raw.map((it) => ({
      ...it,
      list_count: listCounts.get(it.id) ?? 0,
      in_reading_queue: queueIds.has(it.id),
    }));
    return NextResponse.json({ items, stats: getStats() });
  } catch (err) {
    console.error('[collection] DB error:', (err as Error).message);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
