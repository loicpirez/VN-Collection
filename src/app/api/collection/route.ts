import { NextRequest, NextResponse } from 'next/server';
import { getStats, isValidStatus, listCollection, type ListOptions } from '@/lib/db';

export const dynamic = 'force-dynamic';

const VALID_SORTS: Array<NonNullable<ListOptions['sort']>> = [
  'updated_at',
  'added_at',
  'title',
  'rating',
  'user_rating',
  'playtime',
  'released',
  'producer',
  'egs_rating',
  'combined_rating',
];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? '';
  const q = sp.get('q') ?? '';
  const producer = sp.get('producer') ?? '';
  const tag = sp.get('tag') ?? '';
  const place = sp.get('place') ?? '';
  const seriesRaw = sp.get('series');
  const yearMinRaw = sp.get('yearMin');
  const yearMaxRaw = sp.get('yearMax');
  const sortRaw = sp.get('sort') ?? 'updated_at';
  const orderRaw = sp.get('order') ?? 'desc';
  const dumpedRaw = sp.get('dumped');

  if (status && !isValidStatus(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  const sort = (VALID_SORTS as string[]).includes(sortRaw)
    ? (sortRaw as ListOptions['sort'])
    : 'updated_at';
  const order: 'asc' | 'desc' = orderRaw === 'asc' ? 'asc' : 'desc';
  const series = seriesRaw ? Number(seriesRaw) : undefined;

  const yearMin = yearMinRaw ? Number(yearMinRaw) : undefined;
  const yearMax = yearMaxRaw ? Number(yearMaxRaw) : undefined;

  const items = listCollection({
    status: status as ListOptions['status'],
    q,
    producer: producer || undefined,
    series: series && Number.isFinite(series) ? series : undefined,
    tag: tag || undefined,
    place: place || undefined,
    yearMin: yearMin && Number.isFinite(yearMin) ? yearMin : undefined,
    yearMax: yearMax && Number.isFinite(yearMax) ? yearMax : undefined,
    dumped: dumpedRaw === '1' ? true : dumpedRaw === '0' ? false : undefined,
    sort,
    order,
  });
  return NextResponse.json({ items, stats: getStats() });
}
