/**
 * TESTA-013 — /api/export/ics line folding + TEXT escaping.
 *
 * The iCal exporter wraps content lines at 75 octets with a CRLF + single
 * space continuation (RFC 5545 3.1) and backslash-escapes `\ ; , ` plus
 * newlines in TEXT values (`ics()`). A folding or escaping regression
 * silently drops events in strict calendar clients. These tests seed a VN
 * whose title is a >75-octet multibyte string carrying every escaped
 * metacharacter, render the calendar via `GET`, and assert the produced
 * SUMMARY both folds and escapes correctly.
 *
 * BUGA-120 — folding iterates by code point, so a 75-octet split never
 * falls between a surrogate pair. A dedicated case feeds astral
 * characters and asserts no U+FFFD replacement char appears.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/export/ics/route';
import { addToCollection, db, upsertVn } from '@/lib/db';

const MULTIBYTE_ID = 'v970021';
const ASTRAL_ID = 'v970022';
const IDS = [MULTIBYTE_ID, ASTRAL_ID];

const MULTIBYTE_TITLE = `${'あ'.repeat(40)};,\\\n${'い'.repeat(40)}`;
const ASTRAL_TITLE = '\u{1F600}'.repeat(40);

function cleanup(): void {
  db.prepare(`DELETE FROM collection WHERE vn_id IN (?, ?)`).run(...IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (?, ?)`).run(...IDS);
}

/**
 * Pull a single logical content line out of a folded ICS body by joining
 * its physical continuation lines (CRLF + single leading space) back
 * together. Returns the unfolded line whose unfolded form starts with
 * `prefix`.
 */
function unfoldLine(body: string, prefix: string): string | undefined {
  const physical = body.split('\r\n');
  const logical: string[] = [];
  for (const part of physical) {
    if (part.startsWith(' ') && logical.length > 0) {
      logical[logical.length - 1] += part.slice(1);
    } else {
      logical.push(part);
    }
  }
  return logical.find((l) => l.startsWith(prefix));
}

describe('GET /api/export/ics — folding and escaping (TESTA-013)', () => {
  beforeEach(() => {
    cleanup();
    upsertVn({ id: MULTIBYTE_ID, title: MULTIBYTE_TITLE });
    upsertVn({ id: ASTRAL_ID, title: ASTRAL_TITLE });
    addToCollection(MULTIBYTE_ID, { status: 'completed', started_date: '2024-01-02' });
    addToCollection(ASTRAL_ID, { status: 'completed', started_date: '2024-03-04' });
  });

  afterEach(() => {
    cleanup();
  });

  it('emits a CRLF + space continuation for a >75-octet SUMMARY', async () => {
    const res = await GET(new NextRequest('http://127.0.0.1/api/export/ics'));
    expect(res.status).toBe(200);
    const body = await res.text();
    const summaryStart = body.indexOf(`SUMMARY:▶ Started あ`);
    expect(summaryStart).toBeGreaterThanOrEqual(0);
    const afterSummary = body.slice(summaryStart);
    expect(afterSummary).toContain('\r\n ');
    const folded = afterSummary.slice(0, afterSummary.indexOf('\r\nDESCRIPTION:'));
    for (const physical of folded.split('\r\n')) {
      const octets = new TextEncoder().encode(physical).length;
      expect(octets).toBeLessThanOrEqual(75);
    }
  });

  it('backslash-escapes \\; \\, \\\\ and \\n in the SUMMARY TEXT value', async () => {
    const res = await GET(new NextRequest('http://127.0.0.1/api/export/ics'));
    expect(res.status).toBe(200);
    const body = await res.text();
    const summary = unfoldLine(body, `SUMMARY:▶ Started あ`);
    expect(summary).toBeDefined();
    expect(summary).toContain('\\;');
    expect(summary).toContain('\\,');
    expect(summary).toContain('\\\\');
    expect(summary).toContain('\\n');
  });

  it('does not emit U+FFFD when folding astral (surrogate-pair) characters', async () => {
    const res = await GET(new NextRequest('http://127.0.0.1/api/export/ics'));
    expect(res.status).toBe(200);
    const body = await res.text();
    const summary = unfoldLine(body, 'SUMMARY:▶ Started \u{1F600}');
    expect(summary).toBeDefined();
    expect(summary).not.toContain('�');
    expect(summary).toContain(ASTRAL_TITLE);
  });
});

describe('GET /api/export/ics — auth gate (TESTA-013)', () => {
  it('denies a non-local request with 403 and the localhost error body', async () => {
    const res = await GET(new NextRequest('http://93.184.216.34/api/export/ics'));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('restricted to localhost');
  });
});
