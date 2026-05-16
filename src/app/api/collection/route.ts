import { NextRequest, NextResponse } from 'next/server';
import {
  countListMembershipsByVn,
  db,
  getStats,
  isValidStatus,
  listCollection,
  materializeAspectForCollectionVns,
  materializeReleaseAspectsForVn,
  type ListOptions,
} from '@/lib/db';
import { isAspectKey } from '@/lib/aspect-ratio';

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

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? '';
  const q = sp.get('q') ?? '';
  const producer = sp.get('producer') ?? '';
  const publisher = sp.get('publisher') ?? '';
  const tag = sp.get('tag') ?? '';
  const place = sp.get('place') ?? '';
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
  const requestsAspect = aspectValid.length > 0 || sp.get('group') === 'aspect';
  if (requestsAspect) {
    const allVnIds = (
      db.prepare('SELECT vn_id FROM collection').all() as Array<{ vn_id: string }>
    ).map((r) => r.vn_id);
    // STEP 1: pull aspect from cached VNDB release payloads (per
    // VN, idempotent + short-circuits). The Library was the
    // surface where the user observed Hajimete Doushi (800x600
    // → 4:3) and Gals Fiction (1280x720 → 16:9) sitting in the
    // Unknown bucket — release_resolution_cache was empty
    // because /api/vn/[id]/releases had never been invoked for
    // those VNs from the Library page. Materializing here makes
    // the Library agree with the VN detail page.
    for (const id of allVnIds) {
      if (/^v\d+$/.test(id)) materializeReleaseAspectsForVn(id);
    }
    // STEP 2: screenshots fallback for VNs that still have no
    // signal after step 1.
    materializeAspectForCollectionVns(allVnIds);
  }

  const raw = listCollection({
    status: status as ListOptions['status'],
    q,
    producer: producer || undefined,
    publisher: publisher || undefined,
    series: series && Number.isFinite(series) ? series : undefined,
    tag: tag || undefined,
    place: place || undefined,
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
  const items = raw.map((it) => ({ ...it, list_count: listCounts.get(it.id) ?? 0 }));
  return NextResponse.json({ items, stats: getStats() });
}
