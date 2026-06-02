/**
 * TESTA-012 — /api/export/csv formula-injection + RFC-4180 + auth gate.
 *
 * The CSV exporter ships a formula-injection defense (`csvEscape`) that
 * prefixes a single quote when a cell begins with one of `= + - @ \t \r`,
 * and RFC-4180-quotes any cell containing a comma, double quote, or
 * newline. These tests seed a VN whose title is a spreadsheet formula,
 * read the rendered CSV body, and assert the dangerous cell is neutralized.
 * The auth gate is exercised from a non-loopback origin (one exact status
 * plus the expected error body).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/export/csv/route';
import { addToCollection, db, upsertVn } from '@/lib/db';

const HYPERLINK_ID = 'v980012';
const SUM_ID = 'v980013';
const RFC_ID = 'v980014';
const IDS = [HYPERLINK_ID, SUM_ID, RFC_ID];

function cleanup(): void {
  db.prepare(`DELETE FROM collection WHERE vn_id IN (?, ?, ?)`).run(...IDS);
  db.prepare(`DELETE FROM vn WHERE id IN (?, ?, ?)`).run(...IDS);
}

/** Split a CSV body into logical rows, honouring RFC-4180 quoted newlines. */
function splitCsvRows(body: string): string[] {
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
      continue;
    }
    if (!inQuotes && ch === '\r' && body[i + 1] === '\n') {
      rows.push(current);
      current = '';
      i++;
      continue;
    }
    current += ch;
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

describe('GET /api/export/csv — formula-injection defense (TESTA-012)', () => {
  beforeEach(() => {
    cleanup();
    upsertVn({ id: HYPERLINK_ID, title: '=HYPERLINK("http://evil","x")' });
    upsertVn({ id: SUM_ID, title: '@SUM(1)' });
    upsertVn({ id: RFC_ID, title: 'a,b"c\nd' });
    for (const id of IDS) addToCollection(id, { status: 'planning' });
  });

  afterEach(() => {
    cleanup();
  });

  it('prefixes a =HYPERLINK title cell with a single quote', async () => {
    const res = await GET(new NextRequest('http://127.0.0.1/api/export/csv'));
    expect(res.status).toBe(200);
    const body = await res.text();
    const row = splitCsvRows(body).find((r) => r.startsWith(`${HYPERLINK_ID},`));
    expect(row).toBeDefined();
    expect(row).toContain(`,"'=HYPERLINK(""http://evil"",""x"")",`);
  });

  it('prefixes a @SUM title cell with a single quote', async () => {
    const res = await GET(new NextRequest('http://127.0.0.1/api/export/csv'));
    expect(res.status).toBe(200);
    const body = await res.text();
    const row = splitCsvRows(body).find((r) => r.startsWith(`${SUM_ID},`));
    expect(row).toBeDefined();
    expect(row).toContain(`,'@SUM(1),`);
  });

  it('RFC-4180-quotes a field containing a comma, double quote, and newline', async () => {
    const res = await GET(new NextRequest('http://127.0.0.1/api/export/csv'));
    expect(res.status).toBe(200);
    const body = await res.text();
    const row = splitCsvRows(body).find((r) => r.startsWith(`${RFC_ID},`));
    expect(row).toBeDefined();
    expect(row).toContain(`,"a,b""c\nd",`);
  });
});

describe('GET /api/export/csv — auth gate (TESTA-012)', () => {
  it('denies a non-local request with 403 and the localhost error body', async () => {
    const res = await GET(new NextRequest('http://93.184.216.34/api/export/csv'));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('restricted to localhost');
  });
});
