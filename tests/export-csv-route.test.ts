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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/export/csv/route';
import { addToCollection, db, upsertVn } from '@/lib/db';
import * as dbModule from '@/lib/db';
import type { CollectionItem } from '@/lib/types';

const HYPERLINK_ID = 'v980012';
const SUM_ID = 'v980013';
const RFC_ID = 'v980014';
const IDS = [HYPERLINK_ID, SUM_ID, RFC_ID];

function cleanup(): void {
  db.prepare(`DELETE FROM vn_developer_index WHERE vn_id IN (?, ?, ?)`).run(...IDS);
  db.prepare(`DELETE FROM vn_tag_index WHERE vn_id IN (?, ?, ?)`).run(...IDS);
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
    upsertVn({
      id: RFC_ID,
      title: 'a,b"c\nd',
      alttitle: '+alternate',
      released: '2024-05-06',
      languages: ['ja', 'en'],
      platforms: ['win', 'lin'],
      length_minutes: 180,
      rating: 74,
      developers: [{ id: 'p980014', name: 'Developer A' }],
      tags: [{ id: 'g980014', name: 'CSV Tag', rating: 3, spoiler: 0, category: 'cont' }],
    });
    for (const id of IDS) addToCollection(id, { status: 'planning' });
    addToCollection(RFC_ID, {
      status: 'completed',
      user_rating: 91,
      playtime_minutes: 240,
      started_date: '2024-05-07',
      finished_date: '2024-05-08',
      favorite: true,
      location: 'jp',
      edition_type: 'physical',
      edition_label: 'First press',
      physical_location: ['Main shelf', 'Box 2'],
      box_type: 'dvd_case',
      download_url: 'nas://visual-novels/rfc',
      dumped: true,
    });
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
    expect(row).toContain(`,'+alternate,`);
    expect(row).toContain(',completed,91,74,240,180,2024-05-06,ja; en,win; lin,');
    expect(row).toContain('Developer A');
    expect(row).toContain('CSV Tag');
    expect(row).toContain(',1,2024-05-07,2024-05-08,jp,physical,First press,dvd_case,Box 2; Main shelf,nas://visual-novels/rfc,1,');
  });

  it('exports an empty physical-location cell when an older row shape omits the field', async () => {
    const seeded = dbModule
      .listCollection({ sort: 'title', _projection: 'full-no-raw' })
      .find((item) => item.id === RFC_ID);
    if (!seeded) throw new Error('expected seeded CSV row');
    const rowWithoutPhysicalLocation: CollectionItem = { ...seeded, physical_location: undefined };
    const listSpy = vi.spyOn(dbModule, 'listCollection').mockReturnValueOnce([rowWithoutPhysicalLocation]);
    try {
      const res = await GET(new NextRequest('http://127.0.0.1/api/export/csv'));
      expect(res.status).toBe(200);
      const body = await res.text();
      const row = splitCsvRows(body).find((r) => r.startsWith(`${RFC_ID},`));
      expect(row).toBeDefined();
      expect(row).toContain(',dvd_case,,nas://visual-novels/rfc,1,');
    } finally {
      listSpy.mockRestore();
    }
  });
});

describe('GET /api/export/csv — auth gate (TESTA-012)', () => {
  it('denies a non-local request with 403 and the localhost error body', async () => {
    const res = await GET(new NextRequest('http://93.184.216.34/api/export/csv'));
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain('restricted to localhost');
  });

  it('returns a sanitized 500 when collection listing fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listCollection').mockImplementation(() => {
      throw new Error('private csv failure');
    });
    const res = await GET(new NextRequest('http://127.0.0.1/api/export/csv'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:export.csv.GET] private csv failure');
    listSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
