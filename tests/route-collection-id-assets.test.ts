import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { db, upsertVn } from '@/lib/db';

const { getVnMock, resolveEgsMock, ensureImagesMock } = vi.hoisted(() => ({
  getVnMock: vi.fn(),
  resolveEgsMock: vi.fn(),
  ensureImagesMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, getVn: getVnMock, refreshVn: async () => null };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return { ...actual, resolveEgsForVn: resolveEgsMock };
});

vi.mock('@/lib/assets', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/assets')>();
  return { ...actual, ensureLocalImagesForVn: ensureImagesMock };
});

import { POST as assetsPOST } from '@/app/api/collection/[id]/assets/route';

const REAL_VN = 'v90601';
const EGS_VN = 'egs_90602';

function localReq(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function clear(): void {
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(REAL_VN, EGS_VN);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(REAL_VN, EGS_VN);
}

beforeEach(() => {
  getVnMock.mockReset();
  resolveEgsMock.mockReset();
  ensureImagesMock.mockReset();
  clear();
});

afterEach(clear);

describe('POST /api/collection/[id]/assets', () => {
  it('400 on an invalid vn id', async () => {
    const res = await assetsPOST(localReq('/api/collection/bad/assets'), ctx('bad-id'));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid vn id');
  });

  it('404 for a synthetic egs-only id with no local row', async () => {
    const res = await assetsPOST(localReq('/api/collection/egs_90602/assets'), ctx(EGS_VN));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/synthetic VN with no local row/);
  });

  it('404 when an unknown VNDB id has no upstream record', async () => {
    getVnMock.mockResolvedValue(null);
    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('VN not found on VNDB');
    expect(getVnMock).toHaveBeenCalledOnce();
  });

  it('200 with the asset summary when the row already exists', async () => {
    upsertVn({ id: REAL_VN, title: 'Synthetic Assets' });
    resolveEgsMock.mockResolvedValue({ game: null, source: 'none' });
    ensureImagesMock.mockResolvedValue({ poster: 'p.jpg', posterThumb: 't.jpg', screenshots: [], releaseImages: [] });
    const res = await assetsPOST(localReq('/api/collection/v90601/assets'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, poster: 'p.jpg', screenshot_count: 0, egs_warning: null });
  });
});
