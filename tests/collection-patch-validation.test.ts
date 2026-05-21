import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const VN_ID = 'v99999';
const NOW = Date.now();

function patchUrl(id = VN_ID) {
  return `http://localhost/api/collection/${id}`;
}

function patchReq(id: string, body: unknown): Request {
  return new Request(patchUrl(id), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
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
