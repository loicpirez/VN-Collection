import { describe, expect, it } from 'vitest';
import { normalizeRotation, getCollectionItem, upsertVn, setCoverRotation, setBannerRotation } from '@/lib/db';
import { PATCH as patchCover } from '@/app/api/collection/[id]/cover/route';
import { PATCH as patchBanner } from '@/app/api/collection/[id]/banner/route';
import { addToCollection } from '@/lib/db';

/**
 * Pin the rotation contract end-to-end:
 *   - `normalizeRotation` rejects anything that isn't 0/90/180/270.
 *   - The PATCH cover / banner routes accept `{ rotation }` and
 *     persist the normalized value.
 *   - The persisted value round-trips through `getCollectionItem`.
 *
 * Without this, a future refactor could silently start storing
 * arbitrary integers (e.g. 45deg) which break the SafeImage
 * container-aspect math.
 */

function fakeVn(id: string) {
  upsertVn({
    id,
    title: 'Test',
    alttitle: null,
    image_url: null,
    image_thumb: null,
    image_sexual: null,
    image_violence: null,
    released: null,
    olang: null,
    languages: [],
    platforms: [],
    length: null,
    length_minutes: null,
    rating: null,
    votecount: null,
    description: null,
    developers: [],
    publishers: [],
    tags: [],
    screenshots: [],
    release_images: [],
    relations: [],
    aliases: [],
    extlinks: [],
    length_votes: null,
    average: null,
    has_anime: null,
    devstatus: null,
    titles: [],
    editions: [],
    staff: [],
    va: [],
  } as Parameters<typeof upsertVn>[0]);
  addToCollection(id);
}

function makePatchRequest(body: unknown): Request {
  return new Request('http://localhost/api/collection/v1/cover', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('normalizeRotation', () => {
  it('passes through valid quarter-turn values', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(270);
  });

  it('coerces invalid / out-of-spec values to 0', () => {
    expect(normalizeRotation(45)).toBe(0);
    expect(normalizeRotation(-1)).toBe(0);
    expect(normalizeRotation(null)).toBe(0);
    expect(normalizeRotation(undefined)).toBe(0);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it('wraps negative / over-360 values onto the canonical range', () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
    expect(normalizeRotation(-180)).toBe(180);
  });
});

describe('schema migration — cover_rotation / banner_rotation', () => {
  it('persists rotation through setCoverRotation', () => {
    fakeVn('v90001');
    setCoverRotation('v90001', 90);
    const row = getCollectionItem('v90001');
    expect(row?.cover_rotation).toBe(90);
  });

  it('persists rotation through setBannerRotation', () => {
    fakeVn('v90002');
    setBannerRotation('v90002', 270);
    const row = getCollectionItem('v90002');
    expect(row?.banner_rotation).toBe(270);
  });

  it('defaults to 0 when never set', () => {
    fakeVn('v90003');
    const row = getCollectionItem('v90003');
    expect(row?.cover_rotation).toBe(0);
    expect(row?.banner_rotation).toBe(0);
  });

  it('quietly normalises bogus stored values to 0', () => {
    fakeVn('v90004');
    setCoverRotation('v90004', 45);
    const row = getCollectionItem('v90004');
    expect(row?.cover_rotation).toBe(0);
  });
});

describe('PATCH /api/collection/[id]/cover — rotation', () => {
  it('writes a valid rotation', async () => {
    fakeVn('v90010');
    const res = await patchCover(
      makePatchRequest({ rotation: 180 }) as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'v90010' }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { rotation: number };
    expect(json.rotation).toBe(180);
    expect(getCollectionItem('v90010')?.cover_rotation).toBe(180);
  });

  it('rejects non-numeric rotation', async () => {
    fakeVn('v90011');
    const res = await patchCover(
      makePatchRequest({ rotation: 'left' }) as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'v90011' }) },
    );
    expect(res.status).toBe(400);
  });

  it('normalises arbitrary degree values', async () => {
    fakeVn('v90012');
    const res = await patchCover(
      makePatchRequest({ rotation: 45 }) as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'v90012' }) },
    );
    expect(res.status).toBe(200);
    expect(getCollectionItem('v90012')?.cover_rotation).toBe(0);
  });
});

describe('PATCH /api/collection/[id]/banner — rotation + position', () => {
  it('accepts rotation alone', async () => {
    fakeVn('v90020');
    const res = await patchBanner(
      makePatchRequest({ rotation: 90 }) as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'v90020' }) },
    );
    expect(res.status).toBe(200);
    expect(getCollectionItem('v90020')?.banner_rotation).toBe(90);
  });

  it('accepts position alone (back-compat)', async () => {
    fakeVn('v90021');
    const res = await patchBanner(
      makePatchRequest({ position: '40% 60%' }) as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'v90021' }) },
    );
    expect(res.status).toBe(200);
    expect(getCollectionItem('v90021')?.banner_position).toBe('40% 60%');
  });

  it('accepts both in the same body', async () => {
    fakeVn('v90022');
    const res = await patchBanner(
      makePatchRequest({ position: '10% 20%', rotation: 270 }) as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'v90022' }) },
    );
    expect(res.status).toBe(200);
    const row = getCollectionItem('v90022');
    expect(row?.banner_position).toBe('10% 20%');
    expect(row?.banner_rotation).toBe(270);
  });

  it('rejects an empty body', async () => {
    fakeVn('v90023');
    const res = await patchBanner(
      makePatchRequest({}) as unknown as import('next/server').NextRequest,
      { params: Promise.resolve({ id: 'v90023' }) },
    );
    expect(res.status).toBe(400);
  });
});
