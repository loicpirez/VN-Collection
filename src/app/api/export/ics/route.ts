import { NextResponse } from 'next/server';
import { listCollection } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Escape a string for an ICS TEXT value. RFC 5545 only requires \, ;, ,
 * and newlines to be backslash-escaped; everything else passes through.
 */
function ics(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** YYYY-MM-DD → YYYYMMDD (ICS DTSTART;VALUE=DATE format). */
function compactDate(d: string | null): string | null {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return d.replace(/-/g, '');
}

/** UID component — stable across re-exports so calendar apps can de-dup. */
function uid(vnId: string, kind: 'start' | 'finish'): string {
  return `${vnId}-${kind}@vn-collection.local`;
}

function dtstamp(): string {
  const now = new Date();
  // YYYYMMDDTHHMMSSZ — required by VCALENDAR per RFC 5545
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Calendar export: one all-day event per started_date and per finished_date
 * the user has logged. Useful for plotting reading sessions on a personal
 * calendar without leaking the full library data.
 *
 * Limitations:
 *   - We only emit dates the user actually filled in. Status changes alone
 *     don't generate events because we don't capture the timestamp yet
 *     (that's the upcoming "Reading log" feature; once it lands we can
 *     widen this exporter to use the activity table for richer history).
 *   - All events are all-day. No way to capture "started at 21:00" in the
 *     current schema and a fake time would be worse than no time.
 */
export async function GET() {
  const items = listCollection({ sort: 'title' });
  const stamp = dtstamp();
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//vn-collection//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const it of items) {
    const start = compactDate(it.started_date ?? null);
    const finish = compactDate(it.finished_date ?? null);
    const title = it.title || it.id;
    if (start) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid(it.id, 'start')}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `SUMMARY:${ics(`▶ Started ${title}`)}`,
        `DESCRIPTION:${ics(`Visual novel started\\nStatus: ${it.status ?? '—'}\\n${it.id}`)}`,
        'END:VEVENT',
      );
    }
    if (finish) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${uid(it.id, 'finish')}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${finish}`,
        `SUMMARY:${ics(`✓ Finished ${title}`)}`,
        `DESCRIPTION:${ics(`Visual novel finished\\nRating: ${it.user_rating ?? '—'} / 100\\n${it.id}`)}`,
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="vn-collection-${today}.ics"`,
    },
  });
}
