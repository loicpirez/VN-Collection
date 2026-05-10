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
];

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? '';
  const q = sp.get('q') ?? '';
  const producer = sp.get('producer') ?? '';
  const tag = sp.get('tag') ?? '';
  const place = sp.get('place') ?? '';
  const seriesRaw = sp.get('series');
  const sortRaw = sp.get('sort') ?? 'updated_at';
  const orderRaw = sp.get('order') ?? 'desc';

  if (status && !isValidStatus(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }
  const sort = (VALID_SORTS as string[]).includes(sortRaw)
    ? (sortRaw as ListOptions['sort'])
    : 'updated_at';
  const order: 'asc' | 'desc' = orderRaw === 'asc' ? 'asc' : 'desc';
  const series = seriesRaw ? Number(seriesRaw) : undefined;

  const items = listCollection({
    status: status as ListOptions['status'],
    q,
    producer: producer || undefined,
    series: series && Number.isFinite(series) ? series : undefined,
    tag: tag || undefined,
    place: place || undefined,
    sort,
    order,
  });
  return NextResponse.json({ items, stats: getStats() });
}
