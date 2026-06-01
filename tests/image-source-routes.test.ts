import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { addToCollection, upsertVn } from '@/lib/db';
import { POST as postBanner } from '@/app/api/collection/[id]/banner/route';
import { POST as postCover } from '@/app/api/collection/[id]/cover/route';

function seedVn(id: string): void {
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

function jsonPost(path: string, body: object): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('cover and banner image source routes', () => {
  it('rejects an off-allowlist absolute URL passed as a cover path', async () => {
    const id = 'v90100';
    seedVn(id);
    const res = await postCover(
      jsonPost(`/api/collection/${id}/cover`, {
        source: 'path',
        value: 'https://evil.example.com/private.jpg',
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid path' });
  });

  it('rejects encoded traversal passed as a banner screenshot', async () => {
    const id = 'v90101';
    seedVn(id);
    const res = await postBanner(
      jsonPost(`/api/collection/${id}/banner`, {
        source: 'screenshot',
        value: '%252e%252e/private.jpg',
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: 'invalid path' });
  });

  it('accepts an allowlisted remote release image for a banner', async () => {
    const id = 'v90102';
    seedVn(id);
    const value = 'https://cdn.vndb.org/cv/custom.jpg';
    const res = await postBanner(
      jsonPost(`/api/collection/${id}/banner`, {
        source: 'release',
        value,
      }),
      { params: Promise.resolve({ id }) },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ banner: value });
  });
});
