import { NextRequest, NextResponse } from 'next/server';
import {
  countListMembershipsByVn,
  db,
  getStats,
  isValidStatus,
  listCollection,
  materializeAspectForCollectionVns,
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
  const aspectRaw = sp.get('aspect');

  if (status && !isValidStatus(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  if (aspectRaw && !isAspectKey(aspectRaw)) {
    return NextResponse.json({ error: 'invalid aspect' }, { status: 400 });
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
  const requestsAspect = isAspectKey(aspectRaw) || sp.get('group') === 'aspect';
  if (requestsAspect) {
    const allVnIds = (
      db.prepare('SELECT vn_id FROM collection').all() as Array<{ vn_id: string }>
    ).map((r) => r.vn_id);
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
    aspect: isAspectKey(aspectRaw) ? aspectRaw : undefined,
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
