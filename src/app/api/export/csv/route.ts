import { NextResponse } from 'next/server';
import { listCollection } from '@/lib/db';

export const dynamic = 'force-dynamic';

const COLUMNS = [
  'id',
  'title',
  'alttitle',
  'status',
  'user_rating',
  'rating',
  'playtime_minutes',
  'length_minutes',
  'released',
  'languages',
  'platforms',
  'developers',
  'tags',
  'favorite',
  'started_date',
  'finished_date',
  'location',
  'edition_type',
  'edition_label',
  'box_type',
  'physical_location',
  'download_url',
  'dumped',
  'added_at',
  'updated_at',
] as const;

function csvEscape(v: unknown): string {
  if (v == null) return '';
  const s = typeof v === 'string' ? v : Array.isArray(v) ? v.join('; ') : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * One row per VN. Arrays are joined with "; " inside a single cell so the
 * file stays spreadsheet-friendly. Datestamps stay as unix epoch ms — easy
 * to convert in any tool, lossless for re-import.
 *
 * Tags are flattened to a comma-separated list of names; not great for round-
 * tripping but matches what humans actually want to see in Excel. For
 * structured re-import use the JSON backup endpoint instead.
 */
export async function GET() {
  const items = listCollection({ sort: 'title' });
  const lines: string[] = [COLUMNS.join(',')];
  for (const it of items) {
    const row = [
      it.id,
      it.title,
      it.alttitle ?? '',
      it.status ?? '',
      it.user_rating ?? '',
      it.rating ?? '',
      it.playtime_minutes ?? 0,
      it.length_minutes ?? '',
      it.released ?? '',
      (it.languages ?? []).join('; '),
      (it.platforms ?? []).join('; '),
      (it.developers ?? []).map((d) => d.name).join('; '),
      (it.tags ?? []).map((t) => t.name).join('; '),
      it.favorite ? 1 : 0,
      it.started_date ?? '',
      it.finished_date ?? '',
      it.location ?? '',
      it.edition_type ?? '',
      it.edition_label ?? '',
      it.box_type ?? '',
      (it.physical_location ?? []).join('; '),
      it.download_url ?? '',
      it.dumped ? 1 : 0,
      it.added_at ?? '',
      it.updated_at ?? '',
    ];
    lines.push(row.map(csvEscape).join(','));
  }
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vn-collection-${today}.csv"`,
    },
  });
}
