import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  DELETE,
  GET,
  PATCH,
  POST,
} from '@/app/api/collection/[id]/owned-releases/route';

const VN_ID = 'v990202';
const OTHER_VN_ID = 'v990203';
const EGS_VN_ID = 'egs_990204';
const SYNTHETIC_RELEASE_ID = `synthetic:${VN_ID}`;
const EGS_SYNTHETIC_RELEASE_ID = `synthetic:${EGS_VN_ID}`;
const RELEASE_ID = 'r990202';
const NOW = 1_700_000_000_000;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type AspectOverrideCase = [
  null | number | { width?: number; height?: number; aspect_key?: string; note?: string },
  number,
  string | null,
];

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function localReq(method: string, body?: Body, url = `http://127.0.0.1/api/collection/${VN_ID}/owned-releases`): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function externalReq(method: string, body?: Body): NextRequest {
  return new NextRequest(`http://203.0.113.9/api/collection/${VN_ID}/owned-releases`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function seedCollection(vnId = VN_ID): void {
  db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING')
    .run(vnId, `Synthetic ${vnId}`, NOW);
  db.prepare(
    `INSERT INTO collection (vn_id, status, added_at, updated_at, playtime_minutes)
     VALUES (?, 'playing', ?, ?, 0)
     ON CONFLICT(vn_id) DO NOTHING`,
  ).run(vnId, NOW, NOW);
}

function clearRows(): void {
  for (const id of [VN_ID, OTHER_VN_ID, EGS_VN_ID]) {
    db.prepare('DELETE FROM owned_release_aspect_override WHERE vn_id = ?').run(id);
    db.prepare('DELETE FROM owned_release WHERE vn_id = ?').run(id);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(id);
    db.prepare('DELETE FROM vn WHERE id = ?').run(id);
  }
}

async function addOwned(releaseId = SYNTHETIC_RELEASE_ID): Promise<void> {
  const response = await POST(localReq('POST', { release_id: releaseId }), ctx());
  expect(response.status).toBe(200);
}

beforeEach(() => {
  clearRows();
  seedCollection();
});

describe('GET /api/collection/[id]/owned-releases', () => {
  it('rejects malformed VN ids', async () => {
    const response = await GET(localReq('GET'), ctx('invalid'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid vn id' });
  });

  it('returns 404 when the VN is not in the collection', async () => {
    seedCollection(OTHER_VN_ID);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(OTHER_VN_ID);
    const response = await GET(localReq('GET'), ctx(OTHER_VN_ID));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('returns owned editions for a stored collection item', async () => {
    await addOwned();
    const response = await GET(localReq('GET'), ctx());
    expect(response.status).toBe(200);
    const body = await response.json() as { owned: Array<{ release_id: string }> };
    expect(body.owned.map((row) => row.release_id)).toEqual([SYNTHETIC_RELEASE_ID]);
  });
});

describe('POST /api/collection/[id]/owned-releases', () => {
  it('requires localhost or an admin token', async () => {
    const response = await POST(externalReq('POST', { release_id: SYNTHETIC_RELEASE_ID }), ctx());
    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body.error).toContain('restricted to localhost');
  });

  it('rejects invalid VN ids before reading the release id', async () => {
    const response = await POST(localReq('POST', { release_id: SYNTHETIC_RELEASE_ID }), ctx('bad-id'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid vn id' });
  });

  it('returns 404 when the VN is not in collection', async () => {
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN_ID);
    const response = await POST(localReq('POST', { release_id: SYNTHETIC_RELEASE_ID }), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('rejects release ids that do not match the VN route', async () => {
    const response = await POST(localReq('POST', { release_id: `synthetic:${OTHER_VN_ID}` }), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid release id' });
  });

  it('rejects missing release ids', async () => {
    const response = await POST(localReq('POST', {}), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid release id' });
  });

  it('accepts synthetic releases for EGS-only collection rows', async () => {
    seedCollection(EGS_VN_ID);
    const response = await POST(localReq('POST', { release_id: EGS_SYNTHETIC_RELEASE_ID }), ctx(EGS_VN_ID));
    expect(response.status).toBe(200);
    const body = await response.json() as { owned: Array<{ release_id: string }> };
    expect(body.owned.map((row) => row.release_id)).toContain(EGS_SYNTHETIC_RELEASE_ID);
  });

  it('accepts release metadata fields and normalizes currency and platform codes', async () => {
    const response = await POST(localReq('POST', {
      release_id: RELEASE_ID,
      notes: 'stored note',
      location: 'jp',
      box_type: 'dvd_case',
      edition_label: 'First press',
      condition: 'used',
      price_paid: 3456,
      currency: 'jpy',
      acquired_date: '2025-05-21',
      purchase_place: '  Shop A  ',
      owned_platform: 'WIN',
      dumped: true,
      physical_location: ['Shelf A', 'Shelf A', 'Box 1'],
    }), ctx());
    expect(response.status).toBe(200);
    const row = db.prepare(
      `SELECT notes, location, box_type, edition_label, condition, price_paid, currency,
              acquired_date, purchase_place, owned_platform, dumped, physical_location
         FROM owned_release
        WHERE vn_id = ? AND release_id = ?`,
    ).get(VN_ID, RELEASE_ID) as {
      notes: string;
      location: string;
      box_type: string;
      edition_label: string;
      condition: string;
      price_paid: number;
      currency: string;
      acquired_date: string;
      purchase_place: string;
      owned_platform: string;
      dumped: number;
      physical_location: string;
    };
    expect(row).toEqual({
      notes: 'stored note',
      location: 'jp',
      box_type: 'dvd_case',
      edition_label: 'First press',
      condition: 'used',
      price_paid: 3456,
      currency: 'JPY',
      acquired_date: '2025-05-21',
      purchase_place: 'Shop A',
      owned_platform: 'win',
      dumped: 1,
      physical_location: JSON.stringify(['Shelf A', 'Box 1']),
    });
  });

  it('clears nullable metadata fields from null values', async () => {
    const response = await POST(localReq('POST', {
      release_id: RELEASE_ID,
      notes: '',
      edition_label: '',
      condition: null,
      price_paid: null,
      currency: null,
      acquired_date: null,
      purchase_place: null,
      owned_platform: null,
    }), ctx());
    expect(response.status).toBe(200);
    const row = db.prepare(
      `SELECT notes, edition_label, condition, price_paid, currency, acquired_date,
              purchase_place, owned_platform
         FROM owned_release
        WHERE vn_id = ? AND release_id = ?`,
    ).get(VN_ID, RELEASE_ID) as {
      notes: string | null;
      edition_label: string | null;
      condition: string | null;
      price_paid: number | null;
      currency: string | null;
      acquired_date: string | null;
      purchase_place: string | null;
      owned_platform: string | null;
    };
    expect(row).toEqual({
      notes: null,
      edition_label: null,
      condition: null,
      price_paid: null,
      currency: null,
      acquired_date: null,
      purchase_place: null,
      owned_platform: null,
    });
  });

  it('clears nullable metadata fields from empty strings', async () => {
    const response = await POST(localReq('POST', {
      release_id: RELEASE_ID,
      condition: '',
      price_paid: '',
      currency: '',
      acquired_date: '',
      purchase_place: '',
      owned_platform: '',
    }), ctx());
    expect(response.status).toBe(200);
    const row = db.prepare(
      `SELECT condition, price_paid, currency, acquired_date, purchase_place, owned_platform
         FROM owned_release
        WHERE vn_id = ? AND release_id = ?`,
    ).get(VN_ID, RELEASE_ID) as {
      condition: string | null;
      price_paid: number | null;
      currency: string | null;
      acquired_date: string | null;
      purchase_place: string | null;
      owned_platform: string | null;
    };
    expect(row).toEqual({
      condition: null,
      price_paid: null,
      currency: null,
      acquired_date: null,
      purchase_place: null,
      owned_platform: null,
    });
  });
});

describe('PATCH /api/collection/[id]/owned-releases', () => {
  beforeEach(async () => {
    await addOwned();
  });

  it('requires localhost or an admin token', async () => {
    const response = await PATCH(externalReq('PATCH', { release_id: SYNTHETIC_RELEASE_ID }), ctx());
    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body.error).toContain('restricted to localhost');
  });

  it('rejects invalid release ids on update', async () => {
    const response = await PATCH(localReq('PATCH', { release_id: 'r-not-number' }), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid release id' });
  });

  it('rejects invalid VN ids and missing collection rows on update', async () => {
    const invalidResponse = await PATCH(localReq('PATCH', { release_id: SYNTHETIC_RELEASE_ID }), ctx('bad-id'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    seedCollection(OTHER_VN_ID);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(OTHER_VN_ID);
    const missingResponse = await PATCH(localReq('PATCH', { release_id: `synthetic:${OTHER_VN_ID}` }), ctx(OTHER_VN_ID));
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('rejects missing release ids on update', async () => {
    const response = await PATCH(localReq('PATCH', {}), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid release id' });
  });

  it.each([
    [{ notes: 123 }, 'notes must be a string or null'],
    [{ notes: 'x'.repeat(10_001) }, 'notes too long (max 10000)'],
    [{ location: 'mars' }, 'invalid location'],
    [{ box_type: 'crate' }, 'invalid box_type'],
    [{ edition_label: 123 }, 'edition_label must be a string or null'],
    [{ edition_label: 'x'.repeat(201) }, 'edition_label too long (max 200)'],
    [{ condition: 'mint' }, 'invalid condition'],
    [{ price_paid: -1 }, 'price_paid must be a non-negative number or null'],
    [{ currency: 'yen1' }, 'currency must be a 3-letter code or null'],
    [{ acquired_date: '2025-1-1' }, 'invalid acquired_date'],
    [{ purchase_place: '   ' }, 'invalid purchase_place'],
    [{ owned_platform: 'bad platform' }, 'invalid owned_platform'],
    [{ dumped: 'yes' }, 'dumped must be boolean'],
    [{ physical_location: { shelf: 'A' } }, 'physical_location must be array or string'],
  ] satisfies Array<[Body, string]>)('rejects malformed patch body %j', async (patch, error) => {
    const response = await PATCH(localReq('PATCH', { release_id: SYNTHETIC_RELEASE_ID, ...patch }), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it.each([
    [null, 200, null],
    [42, 400, 'invalid aspect_override'],
    [{ width: 1920 }, 400, 'aspect_override width and height are required together'],
    [{ width: 0, height: 1080 }, 400, 'aspect_override dimensions must be positive integers'],
    [{ aspect_key: 'unknown' }, 400, 'invalid aspect_override aspect_key'],
    [{ aspect_key: '16:9', note: 'x'.repeat(501) }, 400, 'aspect_override note too long (max 500)'],
    [{}, 400, 'aspect_override requires dimensions or aspect_key'],
  ] satisfies AspectOverrideCase[])(
    'validates aspect override payload %j',
    async (aspectOverride, status, error) => {
      const response = await PATCH(localReq('PATCH', {
        release_id: SYNTHETIC_RELEASE_ID,
        aspect_override: aspectOverride,
      }), ctx());
      expect(response.status).toBe(status);
      if (error) await expect(response.json()).resolves.toEqual({ error });
    },
  );

  it('stores a valid aspect override in the edition override table', async () => {
    const response = await PATCH(localReq('PATCH', {
      release_id: SYNTHETIC_RELEASE_ID,
      aspect_override: { width: 1920, height: 1080, aspect_key: '16:9', note: 'manual box' },
    }), ctx());
    expect(response.status).toBe(200);
    const row = db.prepare(
      `SELECT width, height, aspect_key, note
         FROM owned_release_aspect_override
        WHERE vn_id = ? AND release_id = ?`,
    ).get(VN_ID, SYNTHETIC_RELEASE_ID) as {
      width: number;
      height: number;
      aspect_key: string;
      note: string;
    };
    expect(row).toEqual({ width: 1920, height: 1080, aspect_key: '16:9', note: 'manual box' });
  });

  it('stores a dimension-only aspect override without a note', async () => {
    const response = await PATCH(localReq('PATCH', {
      release_id: SYNTHETIC_RELEASE_ID,
      aspect_override: { width: 1200, height: 800 },
    }), ctx());
    expect(response.status).toBe(200);
    const row = db.prepare(
      `SELECT width, height, aspect_key, note
         FROM owned_release_aspect_override
        WHERE vn_id = ? AND release_id = ?`,
    ).get(VN_ID, SYNTHETIC_RELEASE_ID) as {
      width: number;
      height: number;
      aspect_key: string | null;
      note: string | null;
    };
    expect(row).toEqual({ width: 1200, height: 800, aspect_key: 'other', note: null });
  });

  it('stores an aspect-key-only override without dimensions', async () => {
    const response = await PATCH(localReq('PATCH', {
      release_id: SYNTHETIC_RELEASE_ID,
      aspect_override: { aspect_key: '16:9' },
    }), ctx());
    expect(response.status).toBe(200);
    const row = db.prepare(
      `SELECT width, height, aspect_key, note
         FROM owned_release_aspect_override
        WHERE vn_id = ? AND release_id = ?`,
    ).get(VN_ID, SYNTHETIC_RELEASE_ID) as {
      width: number | null;
      height: number | null;
      aspect_key: string;
      note: string | null;
    };
    expect(row).toEqual({ width: null, height: null, aspect_key: '16:9', note: null });
  });
});

describe('DELETE /api/collection/[id]/owned-releases', () => {
  beforeEach(async () => {
    await addOwned();
  });

  it('requires localhost or an admin token', async () => {
    const url = `http://203.0.113.9/api/collection/${VN_ID}/owned-releases?release_id=${encodeURIComponent(SYNTHETIC_RELEASE_ID)}`;
    const response = await DELETE(localReq('DELETE', undefined, url), ctx());
    expect(response.status).toBe(403);
    const body = await response.json() as { error: string };
    expect(body.error).toContain('restricted to localhost');
  });

  it('rejects invalid VN ids', async () => {
    const url = `http://127.0.0.1/api/collection/${VN_ID}/owned-releases?release_id=${encodeURIComponent(SYNTHETIC_RELEASE_ID)}`;
    const response = await DELETE(localReq('DELETE', undefined, url), ctx('bad-id'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid vn id' });
  });

  it('rejects invalid release ids from the query string', async () => {
    const response = await DELETE(localReq('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/owned-releases?release_id=bad`), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid release id' });
  });

  it('returns 404 when deleting from a VN that is no longer in collection', async () => {
    seedCollection(OTHER_VN_ID);
    db.prepare('DELETE FROM collection WHERE vn_id = ?').run(OTHER_VN_ID);
    const response = await DELETE(
      localReq('DELETE', undefined, `http://127.0.0.1/api/collection/${OTHER_VN_ID}/owned-releases?release_id=${encodeURIComponent(`synthetic:${OTHER_VN_ID}`)}`),
      ctx(OTHER_VN_ID),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('removes a stored owned release', async () => {
    const url = `http://127.0.0.1/api/collection/${VN_ID}/owned-releases?release_id=${encodeURIComponent(SYNTHETIC_RELEASE_ID)}`;
    const response = await DELETE(localReq('DELETE', undefined, url), ctx());
    expect(response.status).toBe(200);
    const body = await response.json() as { owned: Array<{ release_id: string }> };
    expect(body.owned).toEqual([]);
  });
});
