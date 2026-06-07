import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/collection/route';
import { addToCollection, db, upsertVn } from '@/lib/db';
import * as dbModule from '@/lib/db';

const VN_PREFIX = 'v9907';

function request(query = ''): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection${query}`);
}

afterEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id LIKE ?').run(`${VN_PREFIX}%`);
  db.prepare('DELETE FROM reading_queue WHERE vn_id LIKE ?').run(`${VN_PREFIX}%`);
  db.prepare('DELETE FROM user_list_vn WHERE vn_id LIKE ?').run(`${VN_PREFIX}%`);
  db.prepare("DELETE FROM user_list WHERE slug LIKE '__test_collection_route_%'").run();
  db.prepare('DELETE FROM vn WHERE id LIKE ?').run(`${VN_PREFIX}%`);
});

describe('GET /api/collection filter parsing', () => {
  it('rejects invalid enum and aspect filters with specific 400 responses', async () => {
    const invalidStatus = await GET(request('?status=finished'));
    expect(invalidStatus.status).toBe(400);
    expect(await invalidStatus.json()).toEqual({ error: 'invalid status' });

    const invalidEdition = await GET(request('?edition=deluxe'));
    expect(invalidEdition.status).toBe(400);
    expect(await invalidEdition.json()).toEqual({ error: 'invalid edition' });

    const invalidAspect = await GET(request('?aspect=16:9,3:2,wide'));
    expect(invalidAspect.status).toBe(400);
    expect(await invalidAspect.json()).toEqual({ error: 'invalid aspect: 3:2, wide' });
  });

  it('rejects invalid pagination before running the collection query', async () => {
    expect((await GET(request('?page=0'))).status).toBe(400);
    expect((await GET(request('?page=1.5'))).status).toBe(400);
    const invalidLimit = await GET(request('?limit=abc'));
    expect(invalidLimit.status).toBe(400);
    expect(await invalidLimit.json()).toEqual({ error: 'invalid pagination' });
  });

  it('rejects malformed numeric, boolean, sort, order, and inverted range filters', async () => {
    const cases = [
      '?ratingMin=-1',
      '?ratingMax=101',
      '?playtimeMin=-1',
      '?playtimeMax=100001',
      '?nsfwThreshold=3',
      '?series=0',
      '?yearMin=0',
      '?yearMax=10000',
      '?dumped=yes',
      '?only_egs_only=maybe',
      '?match_vndb=true',
      '?match_egs=false',
      '?fan_disc=2',
      '?has_notes=x',
      '?has_custom_cover=x',
      '?has_banner=x',
      '?is_favorite=x',
      '?has_released=x',
      '?is_nsfw=x',
      '?is_nukige=x',
      '?in_reading_queue=x',
      '?in_list=x',
      '?exclude_nsfw=x',
      '?sort=invalid',
      '?order=sideways',
      '?ratingMin=80&ratingMax=60',
      '?playtimeMin=30&playtimeMax=10',
      '?yearMin=2025&yearMax=2024',
    ];

    for (const query of cases) {
      const res = await GET(request(query));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'invalid filter' });
    }
  });

  it('returns paginated card rows with list counts and reading-queue flags', async () => {
    const first = `${VN_PREFIX}01`;
    const second = `${VN_PREFIX}02`;
    upsertVn({ id: first, title: 'Alpha Route' });
    upsertVn({ id: second, title: 'Beta Route' });
    addToCollection(first, { status: 'planning', notes: 'note', favorite: true });
    addToCollection(second, { status: 'planning' });
    db.prepare('INSERT INTO reading_queue (vn_id, position, added_at) VALUES (?, ?, ?)').run(first, 1, Date.now());
    const listId = db.prepare('INSERT INTO user_list (name, slug, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('__test_collection_route_list', '__test_collection_route_list', Date.now(), Date.now()).lastInsertRowid;
    db.prepare('INSERT INTO user_list_vn (list_id, vn_id, added_at) VALUES (?, ?, ?)').run(listId, first, Date.now());

    const res = await GET(request('?status=planning&q=Route&sort=title&order=asc&page=1&limit=1'));
    expect(res.status).toBe(200);
    const body = await res.json() as {
      items: Array<{ id: string; title: string; has_notes: boolean; list_count: number; in_reading_queue: boolean }>;
      pagination: { page: number; page_size: number; returned: number; has_more: boolean };
    };
    expect(body.pagination).toEqual({ page: 1, page_size: 1, returned: 1, has_more: true });
    expect(body.items).toEqual([
      expect.objectContaining({ id: first, title: 'Alpha Route', has_notes: true, list_count: 1, in_reading_queue: true }),
    ]);
    db.prepare('DELETE FROM user_list WHERE id = ?').run(listId);
  });

  it('accepts valid optional numeric, boolean, and multi-aspect filters', async () => {
    const id = `${VN_PREFIX}03`;
    upsertVn({
      id,
      title: 'Aspect Route',
      released: '2024-01-01',
      rating: 75,
      image: { sexual: 1 },
    });
    addToCollection(id, {
      status: 'completed',
      user_rating: 85,
      playtime_minutes: 600,
      dumped: true,
      favorite: true,
      edition_type: 'physical',
    });
    db.prepare(
      'INSERT INTO release_resolution_cache (release_id, vn_id, width, height, raw_resolution, aspect_key, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run('r990703', id, 1920, 1080, '1920x1080', '16:9', Date.now());

    const query = [
      '?status=completed',
      '&ratingMin=70',
      '&ratingMax=90',
      '&playtimeMin=5',
      '&playtimeMax=20',
      '&nsfwThreshold=2',
      '&yearMin=2020',
      '&yearMax=2026',
      '&dumped=1',
      '&edition=physical',
      '&only_egs_only=0',
      '&match_vndb=1',
      '&match_egs=0',
      '&has_notes=0',
      '&has_released=1',
      '&is_favorite=1',
      '&exclude_nsfw=0',
      '&aspect=16:9,4:3',
    ].join('');

    const res = await GET(request(query));
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string; aspect_keys: string[] }> };
    expect(body.items).toEqual([expect.objectContaining({ id, aspect_keys: ['16:9'] })]);

    const cached = await GET(request('?aspect=16:9'));
    expect(cached.status).toBe(200);
  });

  it('returns a sanitized 500 when the collection card query fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const listSpy = vi.spyOn(dbModule, 'listCollectionForCards').mockImplementation(() => {
      throw new Error('private collection listing failure');
    });
    try {
      const res = await GET(request());
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'internal error' });
      expect(consoleSpy).toHaveBeenCalledWith('[collection] DB error:', 'private collection listing failure');
    } finally {
      listSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });
});
