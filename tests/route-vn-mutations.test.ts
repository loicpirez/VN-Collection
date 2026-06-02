import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { addToCollection, db, upsertVn } from '@/lib/db';

const { getVnMock, labelsMock, entryMock, patchMock, deleteMock } = vi.hoisted(() => ({
  getVnMock: vi.fn(),
  labelsMock: vi.fn(),
  entryMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
}));

const { resolveMock, linkMock, clearMock } = vi.hoisted(() => ({
  resolveMock: vi.fn(),
  linkMock: vi.fn(),
  clearMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return {
    ...actual,
    getVn: getVnMock,
    fetchUlistLabels: labelsMock,
    fetchUlistEntry: entryMock,
    patchUlistEntry: patchMock,
    deleteUlistEntry: deleteMock,
  };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return {
    ...actual,
    resolveEgsForVn: resolveMock,
    linkEgsToVn: linkMock,
    clearEgsCache: clearMock,
  };
});

import { POST as linkVndbPOST } from '@/app/api/vn/[id]/link-vndb/route';
import {
  GET as statusGET,
  PATCH as statusPATCH,
  DELETE as statusDELETE,
} from '@/app/api/vn/[id]/vndb-status/route';
import {
  GET as egsGET,
  POST as egsPOST,
  DELETE as egsDELETE,
} from '@/app/api/vn/[id]/erogamescape/route';

const EGS_VN = 'egs_90401';
const REAL_VN = 'v90402';

function localReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function clear(): void {
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(EGS_VN, REAL_VN);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(EGS_VN, REAL_VN);
}

beforeEach(() => {
  for (const m of [getVnMock, labelsMock, entryMock, patchMock, deleteMock, resolveMock, linkMock, clearMock]) m.mockReset();
  clear();
});

afterEach(clear);

describe('POST /api/vn/[id]/link-vndb', () => {
  it('400 when the source id is not an egs_NNN id', async () => {
    const res = await linkVndbPOST(localReq('/api/vn/v90402/link-vndb', 'POST', { vndb_id: 'v90402' }), ctx(REAL_VN));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('source must be an egs_NNN id');
  });

  it('404 when the synthetic entry is not in collection', async () => {
    const res = await linkVndbPOST(localReq('/api/vn/egs_90401/link-vndb', 'POST', { vndb_id: 'v90402' }), ctx(EGS_VN));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('synthetic entry not in collection');
  });

  it('400 when vndb_id does not look like vNNN', async () => {
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS' });
    addToCollection(EGS_VN, { status: 'planning' });
    const res = await linkVndbPOST(localReq('/api/vn/egs_90401/link-vndb', 'POST', { vndb_id: 'garbage' }), ctx(EGS_VN));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('vndb_id must look like vNNN');
  });

  it('200 and migrates the synthetic entry to the real id', async () => {
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS' });
    addToCollection(EGS_VN, { status: 'planning' });
    getVnMock.mockResolvedValue({ id: REAL_VN, title: 'Real Target' });
    const res = await linkVndbPOST(localReq('/api/vn/egs_90401/link-vndb', 'POST', { vndb_id: REAL_VN }), ctx(EGS_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, vn_id: REAL_VN });
  });
});

describe('GET /api/vn/[id]/vndb-status', () => {
  it('400 on a non-VNDB id', async () => {
    const res = await statusGET(localReq('/api/vn/egs_90401/vndb-status', 'GET'), ctx(EGS_VN));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('200 with needsAuth when no token is configured', async () => {
    labelsMock.mockResolvedValue({ needsAuth: true });
    const res = await statusGET(localReq('/api/vn/v90402/vndb-status', 'GET'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ needsAuth: true, entry: null, labels: [] });
  });

  it('200 with entry + labels when authenticated', async () => {
    labelsMock.mockResolvedValue([{ id: 1, label: 'Playing', private: false, count: 0 }]);
    entryMock.mockResolvedValue({ id: REAL_VN, vote: null, labels: [] });
    const res = await statusGET(localReq('/api/vn/v90402/vndb-status', 'GET'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.labels).toHaveLength(1);
    expect(body.entry.id).toBe(REAL_VN);
  });
});

describe('PATCH /api/vn/[id]/vndb-status', () => {
  it('400 on an out-of-range vote', async () => {
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', { vote: 5 }), ctx(REAL_VN));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/vote must be/);
  });

  it('401 when the upstream reports needsAuth', async () => {
    patchMock.mockResolvedValue({ needsAuth: true });
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', { vote: 80 }), ctx(REAL_VN));
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('vndb_token_required');
  });

  it('200 with { ok: true } on a successful patch', async () => {
    patchMock.mockResolvedValue({ ok: true });
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', { vote: 80, notes: 'great' }), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('DELETE /api/vn/[id]/vndb-status', () => {
  it('400 on a non-VNDB id', async () => {
    const res = await statusDELETE(localReq('/api/vn/egs_90401/vndb-status', 'DELETE'), ctx(EGS_VN));
    expect(res.status).toBe(400);
  });

  it('200 with { ok: true } on a successful delete', async () => {
    deleteMock.mockResolvedValue({ ok: true });
    const res = await statusDELETE(localReq('/api/vn/v90402/vndb-status', 'DELETE'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('GET /api/vn/[id]/erogamescape', () => {
  it('400 on an invalid id', async () => {
    const res = await egsGET(localReq('/api/vn/zz/erogamescape', 'GET'), ctx('zz'));
    expect(res.status).toBe(400);
  });

  it('200 with game/source/manual fields', async () => {
    resolveMock.mockResolvedValue({ game: { id: 1, gamename: 'X' }, source: 'cache' });
    const res = await egsGET(localReq('/api/vn/v90402/erogamescape', 'GET'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ source: 'cache', manual: null });
    expect(body.game.id).toBe(1);
  });
});

describe('POST /api/vn/[id]/erogamescape', () => {
  it('400 on a non-positive egs_id', async () => {
    const res = await egsPOST(localReq('/api/vn/v90402/erogamescape', 'POST', { egs_id: 0 }), ctx(REAL_VN));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid egs_id');
  });

  it('404 when the EGS game cannot be linked', async () => {
    linkMock.mockResolvedValue(null);
    const res = await egsPOST(localReq('/api/vn/v90402/erogamescape', 'POST', { egs_id: 12345 }), ctx(REAL_VN));
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('egs_game_not_found');
  });

  it('200 with the linked game on success', async () => {
    linkMock.mockResolvedValue({ id: 12345, gamename: 'Linked' });
    const res = await egsPOST(localReq('/api/vn/v90402/erogamescape', 'POST', { egs_id: 12345 }), ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ source: 'manual' });
    expect(body.game.id).toBe(12345);
  });
});

describe('DELETE /api/vn/[id]/erogamescape', () => {
  it('400 on an invalid id', async () => {
    const res = await egsDELETE(localReq('/api/vn/zz/erogamescape', 'DELETE'), ctx('zz'));
    expect(res.status).toBe(400);
  });

  it('200 with the chosen clear mode', async () => {
    clearMock.mockReturnValue(undefined);
    const res = await egsDELETE(localReq('/api/vn/v90402/erogamescape?mode=clear-manual', 'DELETE'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: 'clear-manual' });
  });
});
