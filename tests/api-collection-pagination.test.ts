import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/collection/route';
import { addToCollection, db, upsertVn } from '@/lib/db';

const IDS = ['v90211', 'v90212', 'v90213'];

function request(query = ''): NextRequest {
  return new NextRequest(`http://localhost/api/collection${query ? `?${query}` : ''}`);
}

describe('GET /api/collection pagination', () => {
  beforeEach(() => {
    db.prepare(`DELETE FROM collection WHERE vn_id IN (?, ?, ?)`).run(...IDS);
    db.prepare(`DELETE FROM vn WHERE id IN (?, ?, ?)`).run(...IDS);
    for (const [index, id] of IDS.entries()) {
      upsertVn({ id, title: `Pagination Fixture ${String.fromCharCode(65 + index)}` });
      addToCollection(id, {
        status: 'planning',
        notes: index === 1 ? 'private note' : null,
        user_rating: index === 0 ? 40 : index === 1 ? 80 : null,
      });
    }
  });

  afterEach(() => {
    db.prepare(`DELETE FROM collection WHERE vn_id IN (?, ?, ?)`).run(...IDS);
    db.prepare(`DELETE FROM vn WHERE id IN (?, ?, ?)`).run(...IDS);
  });

  it('returns deterministic bounded pages with has_more metadata', async () => {
    const first = await GET(request('q=Pagination%20Fixture&sort=title&order=asc&limit=2&page=1'));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      items: [{ id: 'v90211' }, { id: 'v90212' }],
      pagination: {
        page: 1,
        page_size: 2,
        returned: 2,
        has_more: true,
      },
    });

    const second = await GET(request('q=Pagination%20Fixture&sort=title&order=asc&limit=2&page=2'));
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      items: [{ id: 'v90213' }],
      pagination: {
        page: 2,
        page_size: 2,
        returned: 1,
        has_more: false,
      },
    });
  });

  it('uses the default page size and clamps oversized requests', async () => {
    const defaultResponse = await GET(request('q=Pagination%20Fixture'));
    expect(defaultResponse.status).toBe(200);
    expect((await defaultResponse.json()).pagination.page_size).toBe(240);

    const clampedResponse = await GET(request('q=Pagination%20Fixture&limit=999999'));
    expect(clampedResponse.status).toBe(200);
    expect((await clampedResponse.json()).pagination.page_size).toBe(500);
  });

  it.each([
    'page=0',
    'page=nope',
    'limit=0',
    'limit=2.5',
  ])('rejects invalid pagination input: %s', async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid pagination' });
  });

  it('applies tri-state filters before pagination', async () => {
    const response = await GET(request('q=Pagination%20Fixture&has_notes=1&limit=1'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ id: 'v90212', has_notes: true }],
      pagination: {
        page: 1,
        page_size: 1,
        returned: 1,
        has_more: false,
      },
    });
  });

  it('applies numeric filters before pagination', async () => {
    const response = await GET(request('q=Pagination%20Fixture&ratingMin=70&limit=1'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      items: [{ id: 'v90212', user_rating: 80 }],
      pagination: {
        page: 1,
        page_size: 1,
        returned: 1,
        has_more: false,
      },
    });
  });

  it('rejects malformed tri-state filters', async () => {
    const response = await GET(request('has_notes=true'));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid filter' });
  });

  it.each([
    'sort=sideways',
    'order=sideways',
    'dumped=true',
    'series=1.5',
    'series=-1',
    'yearMin=20.5',
    'yearMax=nope',
    'yearMin=2025&yearMax=2024',
    'ratingMin=90&ratingMax=10',
    'playtimeMin=2&playtimeMax=1',
  ])('rejects malformed or contradictory collection filters: %s', async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid filter' });
  });
});
