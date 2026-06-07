import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type NextRequest } from 'next/server';
import { POST } from '@/app/api/collection/[id]/route';
import { addToCollection, db, getCollectionItem, upsertVn } from '@/lib/db';

const {
  getVnMock,
  ensureLocalImagesForVnMock,
  downloadFullStaffForVnMock,
  downloadFullCharForVnMock,
  downloadFullProducerForVnMock,
  maybePushStatusToVndbMock,
} = vi.hoisted(() => ({
  getVnMock: vi.fn(),
  ensureLocalImagesForVnMock: vi.fn(),
  downloadFullStaffForVnMock: vi.fn(),
  downloadFullCharForVnMock: vi.fn(),
  downloadFullProducerForVnMock: vi.fn(),
  maybePushStatusToVndbMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getVn: getVnMock };
});

vi.mock('@/lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/assets')>();
  return { ...actual, ensureLocalImagesForVn: ensureLocalImagesForVnMock };
});

vi.mock('@/lib/staff-full', () => ({
  downloadFullStaffForVn: downloadFullStaffForVnMock,
}));

vi.mock('@/lib/character-full', () => ({
  downloadFullCharForVn: downloadFullCharForVnMock,
}));

vi.mock('@/lib/producer-full', () => ({
  downloadFullProducerForVn: downloadFullProducerForVnMock,
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  return { ...actual, maybePushStatusToVndb: maybePushStatusToVndbMock };
});

const VN_PREFIX = 'v9906';

function req(id: string, body: unknown): NextRequest {
  return new Request(`http://127.0.0.1/api/collection/${id}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: '127.0.0.1' },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getVnMock.mockReset();
  ensureLocalImagesForVnMock.mockReset().mockResolvedValue(undefined);
  downloadFullStaffForVnMock.mockReset().mockResolvedValue(undefined);
  downloadFullCharForVnMock.mockReset().mockResolvedValue(undefined);
  downloadFullProducerForVnMock.mockReset().mockResolvedValue(undefined);
  maybePushStatusToVndbMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  db.prepare(`DELETE FROM collection WHERE vn_id LIKE ?`).run(`${VN_PREFIX}%`);
  db.prepare(`DELETE FROM vn WHERE id LIKE ?`).run(`${VN_PREFIX}%`);
  db.prepare(`DELETE FROM user_activity WHERE entity_id LIKE ?`).run(`${VN_PREFIX}%`);
});

describe('POST /api/collection/[id] orchestration branches', () => {
  it('returns 404 when VNDB has no VN for a valid new id', async () => {
    const id = `${VN_PREFIX}01`;
    getVnMock.mockResolvedValue(null);

    const res = await POST(req(id, { status: 'planning' }), ctx(id));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'VN not found' });
    expect(ensureLocalImagesForVnMock).not.toHaveBeenCalled();
  });

  it('sanitizes VNDB upstream failures while adding a new id', async () => {
    const id = `${VN_PREFIX}02`;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getVnMock.mockRejectedValue(new Error('token-bearing upstream error'));

    const res = await POST(req(id, { status: 'planning' }), ctx(id));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream service unavailable' });
    consoleSpy.mockRestore();
  });

  it('adds a new VN even when background fan-out and local image download fail', async () => {
    const id = `${VN_PREFIX}03`;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    getVnMock.mockResolvedValue({ id, title: 'New VN' });
    downloadFullStaffForVnMock.mockRejectedValue(new Error('staff failed'));
    downloadFullCharForVnMock.mockRejectedValue(new Error('char failed'));
    downloadFullProducerForVnMock.mockRejectedValue(new Error('producer failed'));
    ensureLocalImagesForVnMock.mockRejectedValue(new Error('image failed'));

    const res = await POST(req(id, { status: 'playing' }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ id, title: 'New VN', status: 'playing' });
    expect(downloadFullStaffForVnMock).toHaveBeenCalledWith(id);
    expect(downloadFullCharForVnMock).toHaveBeenCalledWith(id);
    expect(downloadFullProducerForVnMock).toHaveBeenCalledWith(id);
    expect(ensureLocalImagesForVnMock).toHaveBeenCalledWith(id);
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('updates an existing collection item without fetching VNDB or downloading first-add assets', async () => {
    const id = `${VN_PREFIX}04`;
    upsertVn({ id, title: 'Existing VN' });
    addToCollection(id, { status: 'planning' });

    const res = await POST(req(id, { status: 'on_hold', notes: 'updated' }), ctx(id));
    expect(res.status).toBe(200);
    expect((await res.json()).item).toMatchObject({ id, status: 'on_hold', notes: 'updated' });
    expect(getVnMock).not.toHaveBeenCalled();
    expect(ensureLocalImagesForVnMock).not.toHaveBeenCalled();
    expect(maybePushStatusToVndbMock).toHaveBeenCalledWith(id, 'on_hold');
    expect(getCollectionItem(id)).toMatchObject({ status: 'on_hold', notes: 'updated' });
  });
});
