import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToCollection, db, upsertVn } from '@/lib/db';
import * as dbModule from '@/lib/db';
import * as activityModule from '@/lib/activity';
import {
  GET as collectionGET,
  POST as collectionPOST,
  PATCH as collectionPATCH,
  DELETE as collectionDELETE,
} from '@/app/api/collection/[id]/route';

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getVn: async (id: string) => ({ id, title: 'Synthetic Core' }) };
});

vi.mock('@/lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/assets')>();
  return {
    ...actual,
    ensureLocalImagesForVn: async () => ({ poster: null, posterThumb: null, screenshots: [], releaseImages: [] }),
  };
});

const VN = 'v90101';

function localReq(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/collection/v90101', {
    method,
    headers: { 'Content-Type': 'application/json', host: '127.0.0.1' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function externalReq(method: string, body?: unknown): Request {
  return new Request('http://93.184.216.34/api/collection/v90101', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function seed(): void {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN);
  upsertVn({ id: VN, title: 'Synthetic Core' });
}

function ctx() {
  return { params: Promise.resolve({ id: VN }) };
}

afterEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN);
});

describe('GET /api/collection/[id]', () => {
  beforeEach(() => {
    seed();
    addToCollection(VN, { status: 'planning', user_rating: 80 });
  });

  it('400 on an invalid vn id', async () => {
    const res = await collectionGET(localReq('GET') as never, { params: Promise.resolve({ id: 'bad-id' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid vn id');
  });

  it('200 with the item + in_collection when present', async () => {
    const res = await collectionGET(localReq('GET') as never, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ in_collection: true, item: { user_rating: 80 } });
  });

  it('404 when the id is valid but not stored', async () => {
    const res = await collectionGET(localReq('GET') as never, { params: Promise.resolve({ id: 'v90199' }) });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('500 with a sanitized response when the collection read fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const readSpy = vi.spyOn(dbModule, 'getCollectionItem').mockImplementation(() => {
      throw new Error('read failed');
    });

    const res = await collectionGET(localReq('GET') as never, ctx());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[collection/[id] GET] DB error:', 'read failed');
    readSpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('POST /api/collection/[id]', () => {
  beforeEach(seed);

  it('403 from a non-loopback origin', async () => {
    const res = await collectionPOST(externalReq('POST', { status: 'planning' }) as never, ctx());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/restricted to localhost/);
  });

  it('400 on an invalid vn id', async () => {
    const res = await collectionPOST(localReq('POST', { status: 'planning' }) as never, { params: Promise.resolve({ id: 'nope' }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid vn id');
  });

  it('400 on an invalid status field', async () => {
    addToCollection(VN, { status: 'planning' });
    const res = await collectionPOST(localReq('POST', { status: 'not-a-status' }) as never, ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid status');
  });

  it('200 and persists the new status', async () => {
    const res = await collectionPOST(localReq('POST', { status: 'completed' }) as never, ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).item.status).toBe('completed');
  });
});

describe('PATCH /api/collection/[id]', () => {
  beforeEach(seed);

  it('400 on an out-of-range user_rating', async () => {
    addToCollection(VN, { status: 'planning' });
    const res = await collectionPATCH(localReq('PATCH', { user_rating: 5 }) as never, ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/user_rating must be/);
  });

  it('404 when the row is not in collection', async () => {
    const res = await collectionPATCH(localReq('PATCH', { favorite: true }) as never, ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not in collection' });
  });

  it('200 and applies the patch', async () => {
    addToCollection(VN, { status: 'planning' });
    const res = await collectionPATCH(localReq('PATCH', { favorite: true, user_rating: 95 }) as never, ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item.favorite).toBe(true);
    expect(body.item.user_rating).toBe(95);
  });

  it('accepts null to clear the download URL', async () => {
    addToCollection(VN, { status: 'planning', download_url: 'https://example.com/file.zip' });

    const res = await collectionPATCH(localReq('PATCH', { download_url: null }) as never, ctx());

    expect(res.status).toBe(200);
    expect((await res.json()).item.download_url).toBeNull();
  });

  it('500 with a sanitized response when the collection update fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const updateSpy = vi.spyOn(dbModule, 'updateCollection').mockImplementation(() => {
      throw new Error('update failed');
    });
    addToCollection(VN, { status: 'planning' });

    const res = await collectionPATCH(localReq('PATCH', { favorite: true }) as never, ctx());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[collection/[id] PATCH] DB error:', 'update failed');
    updateSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('500 with a sanitized response when patch activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('activity failed');
    });
    addToCollection(VN, { status: 'planning' });

    const res = await collectionPATCH(localReq('PATCH', { favorite: true }) as never, ctx());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[collection/[id] PATCH] DB error:', 'activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/collection/[id]', () => {
  beforeEach(seed);

  it('400 on an invalid vn id', async () => {
    const res = await collectionDELETE(localReq('DELETE') as never, { params: Promise.resolve({ id: 'xx' }) });
    expect(res.status).toBe(400);
  });

  it('404 when the row is not in collection', async () => {
    const res = await collectionDELETE(localReq('DELETE') as never, ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not in collection' });
  });

  it('200 with { ok: true } after removing a stored row', async () => {
    addToCollection(VN, { status: 'planning' });
    const res = await collectionDELETE(localReq('DELETE') as never, ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('500 with a sanitized response when delete activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const activitySpy = vi.spyOn(activityModule, 'recordActivity').mockImplementation(() => {
      throw new Error('activity failed');
    });
    addToCollection(VN, { status: 'planning' });

    const res = await collectionDELETE(localReq('DELETE') as never, ctx());

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[collection/[id] DELETE] DB error:', 'activity failed');
    activitySpy.mockRestore();
    consoleSpy.mockRestore();
  });
});
