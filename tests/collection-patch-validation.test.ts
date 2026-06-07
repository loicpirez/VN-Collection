import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type NextRequest } from 'next/server';
import { db } from '@/lib/db';

vi.mock('@/lib/vndb', () => ({
  getVn: vi.fn(),
}));

vi.mock('@/lib/assets', () => ({
  ensureLocalImagesForVn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/staff-full', () => ({
  downloadFullStaffForVn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/character-full', () => ({
  downloadFullCharForVn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/producer-full', () => ({
  downloadFullProducerForVn: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return {
    ...actual,
    maybePushStatusToVndb: vi.fn().mockResolvedValue(undefined),
  };
});

import { PATCH } from '@/app/api/collection/[id]/route';
import { PATCH as patchRoutes } from '@/app/api/collection/[id]/routes/route';

const VN_ID = 'v99999';
const NOW = Date.now();

function patchUrl(id = VN_ID) {
  return `http://localhost/api/collection/${id}`;
}

function patchReq(id: string, body: unknown): NextRequest {
  return new Request(patchUrl(id), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function ctx(id = VN_ID) {
  return { params: Promise.resolve({ id }) };
}

function ensureInCollection(): void {
  db.prepare(`INSERT INTO vn (id, title, fetched_at) VALUES (?, 'Test VN', ?) ON CONFLICT(id) DO NOTHING`)
    .run(VN_ID, NOW);
  db.prepare(
    `INSERT INTO collection (vn_id, status, added_at, updated_at, playtime_minutes)
     VALUES (?, 'playing', ?, ?, 0)
     ON CONFLICT(vn_id) DO NOTHING`,
  ).run(VN_ID, NOW, NOW);
}

function clearCollection(): void {
  db.exec(`DELETE FROM collection WHERE vn_id = '${VN_ID}'; DELETE FROM vn WHERE id = '${VN_ID}';`);
}

beforeEach(() => {
  clearCollection();
  vi.clearAllMocks();
  ensureInCollection();
});

describe('PATCH /api/collection/[id] — pickFields validation', () => {
  it('rejects float user_rating with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { user_rating: 12.5 }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/user_rating/);
  });

  it('rejects user_rating below 10 with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { user_rating: 5 }), ctx());
    expect(res.status).toBe(400);
  });

  it('rejects user_rating above 100 with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { user_rating: 101 }), ctx());
    expect(res.status).toBe(400);
  });

  it('accepts user_rating as integer 10-100', async () => {
    const res = await PATCH(patchReq(VN_ID, { user_rating: 75 }), ctx());
    expect(res.status).toBe(200);
  });

  it('accepts user_rating as null (clear)', async () => {
    const res = await PATCH(patchReq(VN_ID, { user_rating: null }), ctx());
    expect(res.status).toBe(200);
  });

  it('rejects negative playtime_minutes with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { playtime_minutes: -1 }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/playtime_minutes/);
  });

  it('rejects float playtime_minutes with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { playtime_minutes: 60.5 }), ctx());
    expect(res.status).toBe(400);
  });

  it('accepts valid playtime_minutes = 0', async () => {
    const res = await PATCH(patchReq(VN_ID, { playtime_minutes: 0 }), ctx());
    expect(res.status).toBe(200);
  });

  it('rejects malformed started_date with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { started_date: '2024/03/15' }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/started_date/);
  });

  it('rejects malformed finished_date with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { finished_date: 'not-a-date' }), ctx());
    expect(res.status).toBe(400);
  });

  it('accepts YYYY-MM-DD format for started_date', async () => {
    const res = await PATCH(patchReq(VN_ID, { started_date: '2024-03-15' }), ctx());
    expect(res.status).toBe(200);
  });

  it('accepts null to clear started_date', async () => {
    const res = await PATCH(patchReq(VN_ID, { started_date: null }), ctx());
    expect(res.status).toBe(200);
  });

  it('rejects invalid status with 400', async () => {
    const res = await PATCH(patchReq(VN_ID, { status: 'nonexistent_status' }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/status/);
  });

  it('rejects download_url that is too long with 400', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(2000);
    const res = await PATCH(patchReq(VN_ID, { download_url: longUrl }), ctx());
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/download_url/);
  });

  it('accepts valid download_url', async () => {
    const res = await PATCH(patchReq(VN_ID, { download_url: 'https://example.com/game.zip' }), ctx());
    expect(res.status).toBe(200);
  });

  it('trims blank download_url to null and rejects non-string download_url', async () => {
    const blank = await PATCH(patchReq(VN_ID, { download_url: '   ' }), ctx());
    expect(blank.status).toBe(200);
    expect(
      (db.prepare('SELECT download_url FROM collection WHERE vn_id = ?').get(VN_ID) as { download_url: string | null }).download_url,
    ).toBeNull();

    const malformed = await PATCH(patchReq(VN_ID, { download_url: 123 }), ctx());
    expect(malformed.status).toBe(400);
    expect((await malformed.json() as { error: string }).error).toBe('download_url must be string or null');
  });

  it('rejects malformed optional metadata fields', async () => {
    const cases: Array<{ body: Record<string, unknown>; error: string }> = [
      { body: { notes: 1 }, error: 'notes must be a string or null' },
      { body: { notes: 'x'.repeat(50_001) }, error: 'notes too long (max 50000)' },
      { body: { favorite: 'true' }, error: 'favorite must be boolean' },
      { body: { location: 'moon' }, error: 'invalid location' },
      { body: { edition_type: 'deluxe' }, error: 'invalid edition_type' },
      { body: { edition_label: 1 }, error: 'edition_label must be a string or null' },
      { body: { edition_label: 'x'.repeat(201) }, error: 'edition_label too long (max 200)' },
      { body: { box_type: 'crate' }, error: 'invalid box_type' },
      { body: { dumped: 'false' }, error: 'dumped must be boolean' },
      { body: { dumped_ignored: 0 }, error: 'dumped_ignored must be boolean' },
      { body: { physical_location: [1] }, error: 'physical_location entries must be strings' },
    ];

    for (const item of cases) {
      const res = await PATCH(patchReq(VN_ID, item.body), ctx());
      expect(res.status).toBe(400);
      expect((await res.json() as { error: string }).error).toBe(item.error);
    }
  });

  it('accepts and clears optional metadata fields', async () => {
    const setRes = await PATCH(
      patchReq(VN_ID, {
        finished_date: '2024-04-05',
        notes: 'note',
        favorite: true,
        location: 'jp',
        edition_type: 'limited',
        edition_label: 'Limited box',
        box_type: 'special_edition',
        dumped: true,
        dumped_ignored: true,
        physical_location: ['Shelf A', 'Drawer B'],
      }),
      ctx(),
    );
    expect(setRes.status).toBe(200);
    const setRow = db.prepare(`
      SELECT finished_date, notes, favorite, location, edition_type, edition_label, box_type, dumped, dumped_ignored, physical_location
      FROM collection WHERE vn_id = ?
    `).get(VN_ID) as {
      finished_date: string | null;
      notes: string | null;
      favorite: number;
      location: string | null;
      edition_type: string | null;
      edition_label: string | null;
      box_type: string | null;
      dumped: number;
      dumped_ignored: number;
      physical_location: string | null;
    };
    expect(setRow).toMatchObject({
      finished_date: '2024-04-05',
      notes: 'note',
      favorite: 1,
      location: 'jp',
      edition_type: 'limited',
      edition_label: 'Limited box',
      box_type: 'special_edition',
      dumped: 1,
      dumped_ignored: 1,
    });
    expect(JSON.parse(setRow.physical_location ?? '[]')).toEqual(['Shelf A', 'Drawer B']);

    const clearRes = await PATCH(
      patchReq(VN_ID, {
        finished_date: '',
        notes: '',
        edition_label: null,
        physical_location: null,
      }),
      ctx(),
    );
    expect(clearRes.status).toBe(200);
    const cleared = db.prepare('SELECT finished_date, notes, edition_label, physical_location FROM collection WHERE vn_id = ?')
      .get(VN_ID) as { finished_date: string | null; notes: string | null; edition_label: string | null; physical_location: string | null };
    expect(cleared).toEqual({ finished_date: null, notes: null, edition_label: null, physical_location: null });
  });

  it('rejects oversized physical-location arrays instead of silently truncating them', async () => {
    const physicalLocation = Array.from({ length: 33 }, (_, index) => `Shelf ${index}`);
    const res = await PATCH(patchReq(VN_ID, { physical_location: physicalLocation }), ctx());
    expect(res.status).toBe(400);
  });

  it('rejects oversized physical-location tags instead of silently truncating them', async () => {
    const res = await PATCH(patchReq(VN_ID, { physical_location: ['x'.repeat(201)] }), ctx());
    expect(res.status).toBe(400);
  });

  it('rejects duplicate route reorder ids', async () => {
    const res = await patchRoutes(patchReq(VN_ID, { ids: [1, 1] }), ctx());
    expect(res.status).toBe(400);
  });

  it('returns 404 when VN is not in collection', async () => {
    clearCollection();
    const res = await PATCH(patchReq(VN_ID, { playtime_minutes: 60 }), ctx());
    expect(res.status).toBe(404);
  });

  it('returns 400 for invalid VN id format', async () => {
    const res = await PATCH(patchReq('INVALID', { playtime_minutes: 60 }), ctx('INVALID'));
    expect(res.status).toBe(400);
  });
});
