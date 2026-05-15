import { NextResponse } from 'next/server';
import { listCollection } from '@/lib/db';
import { requireLocalhostOrToken } from '@/lib/auth-gate';

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

/**
 * RFC 5545 §3.1 requires content lines to wrap at 75 octets, with
 * continuation lines starting with a single space (CRLF + SPACE).
 * Calendar apps that strictly validate (Outlook, some iOS imports)
 * silently drop events whose lines exceed the limit. Long VN titles
 * + UTF-8 multi-byte chars hit that threshold easily.
 */
function fold(line: string): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  // Walk by character, count bytes, emit CRLF + " " when we'd
  // exceed 75 octets on the current segment. Continuation
  // segments allow 74 octets to keep room for the leading space.
  const out: string[] = [];
  let segStart = 0;
  let segBytes = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const chBytes = enc.encode(ch).length;
    if (segBytes + chBytes > 75) {
      out.push(line.slice(segStart, i));
      segStart = i;
      segBytes = 1 /* leading space */ + chBytes;
    } else {
      segBytes += chBytes;
    }
  }
  out.push(line.slice(segStart));
  return out.join('\r\n ');
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
export async function GET(req: Request) {
  // ICS reveals reading dates per VN — PII. Gate.
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
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
        `SUMMARY:${ics(`Finished: ${title}`)}`,
        `DESCRIPTION:${ics(`Visual novel finished\\nRating: ${it.user_rating ?? '—'} / 100\\n${it.id}`)}`,
        'END:VEVENT',
      );
    }
  }

  lines.push('END:VCALENDAR');
  const today = new Date().toISOString().slice(0, 10);
  // Apply RFC 5545 line folding to every line before joining.
  return new NextResponse(lines.map(fold).join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="vn-collection-${today}.ics"`,
    },
  });
}
