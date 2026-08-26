import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { addToCollection, db, getCollectionItem, setVnEgsLink, upsertVn } from '@/lib/db';
import { getVnWriteRepository } from '@/lib/db/repositories/vn-write';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import type { VndbSyncField, VndbSyncSelection, VndbSyncValue } from '@/lib/vndb-user-data-sync';

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

const { recordActivityMock } = vi.hoisted(() => ({
  recordActivityMock: vi.fn(),
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

vi.mock('@/lib/activity', () => ({
  recordActivity: recordActivityMock,
}));

import { POST as linkVndbPOST } from '@/app/api/vn/[id]/link-vndb/route';
import {
  GET as statusGET,
  POST as statusPOST,
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
  for (const m of [getVnMock, labelsMock, entryMock, patchMock, deleteMock, resolveMock, linkMock, clearMock, recordActivityMock]) m.mockReset();
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

  it('400 when vndb_id is missing from the body', async () => {
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS' });
    addToCollection(EGS_VN, { status: 'planning' });
    const res = await linkVndbPOST(localReq('/api/vn/egs_90401/link-vndb', 'POST', {}), ctx(EGS_VN));
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

  it('keeps a completed identity migration successful when activity logging fails', async () => {
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS' });
    addToCollection(EGS_VN, { status: 'planning' });
    getVnMock.mockResolvedValue({ id: REAL_VN, title: 'Real Target' });
    recordActivityMock.mockRejectedValue(new Error('activity unavailable'));

    const response = await linkVndbPOST(
      localReq('/api/vn/egs_90401/link-vndb', 'POST', { vndb_id: REAL_VN }),
      ctx(EGS_VN),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, vn_id: REAL_VN });
  });

  it('404 when the target VNDB id does not resolve', async () => {
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS' });
    addToCollection(EGS_VN, { status: 'planning' });
    getVnMock.mockResolvedValue(null);
    const res = await linkVndbPOST(localReq('/api/vn/egs_90401/link-vndb', 'POST', { vndb_id: REAL_VN }), ctx(EGS_VN));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'VNDB id not found' });
  });

  it('502 when fetching the target VNDB id fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS' });
    addToCollection(EGS_VN, { status: 'planning' });
    getVnMock.mockRejectedValue(new Error('vndb target failed'));
    const res = await linkVndbPOST(localReq('/api/vn/egs_90401/link-vndb', 'POST', { vndb_id: REAL_VN }), ctx(EGS_VN));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'vn/[id]/link-vndb' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/link-vndb] vndb target failed');
    consoleSpy.mockRestore();
  });

  it('500 when persisting the resolved VNDB target fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const upsertSpy = vi.spyOn(getVnWriteRepository(), 'upsert').mockRejectedValueOnce(
      new Error('private persistence failure'),
    );
    upsertVn({ id: EGS_VN, title: 'Synthetic EGS' });
    addToCollection(EGS_VN, { status: 'planning' });
    getVnMock.mockResolvedValue({ id: REAL_VN, title: 'Real Target' });
    try {
      const response = await linkVndbPOST(
        localReq('/api/vn/egs_90401/link-vndb', 'POST', { vndb_id: REAL_VN }),
        ctx(EGS_VN),
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        ok: false,
        error: 'internal error',
        code: 'internal_error',
        context: 'vn/[id]/link-vndb',
      });
      expect(consoleSpy).toHaveBeenCalledWith('[internal:vn/[id]/link-vndb] private persistence failure');
    } finally {
      upsertSpy.mockRestore();
      consoleSpy.mockRestore();
    }
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

  it('returns local differences and bypasses the entry cache on an explicit refresh', async () => {
    upsertVn({ id: REAL_VN, title: 'Fixture' });
    addToCollection(REAL_VN, {
      status: 'completed',
      user_rating: 90,
      started_date: '2025-01-01',
      finished_date: '2025-01-02',
      notes: 'local note',
    });
    labelsMock.mockResolvedValue([{ id: 1, label: 'Playing', private: false, count: 0 }]);
    entryMock.mockResolvedValue({
      id: REAL_VN,
      vote: null,
      started: '2025-01-01',
      finished: null,
      notes: null,
      labels: [{ id: 1, label: 'Playing' }],
    });
    const request = localReq('/api/vn/v90402/vndb-status?fresh=1', 'GET');
    const res = await statusGET(request, ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.labels).toHaveLength(1);
    expect(body.entry.id).toBe(REAL_VN);
    expect(body.local).toEqual({
      status: 'completed',
      vote: 90,
      started: '2025-01-01',
      finished: '2025-01-02',
      notes: 'local note',
    });
    expect(body.differences.map((difference: { field: string }) => difference.field)).toEqual([
      'status',
      'vote',
      'finished',
      'notes',
    ]);
    expect(labelsMock).toHaveBeenCalledWith(request.signal);
    expect(entryMock).toHaveBeenCalledWith(REAL_VN, { fresh: true, signal: request.signal });
  });

  it('200 with needsAuth when entry loading reports missing auth after labels resolve', async () => {
    labelsMock.mockResolvedValue([{ id: 1, label: 'Playing', private: false, count: 0 }]);
    entryMock.mockResolvedValue({ needsAuth: true });
    const res = await statusGET(localReq('/api/vn/v90402/vndb-status', 'GET'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      needsAuth: true,
      entry: null,
      labels: [{ id: 1, label: 'Playing', private: false, count: 0 }],
    });
  });

  it('returns an empty local comparison when the VN is not collected and the remote entry is absent', async () => {
    labelsMock.mockResolvedValue([]);
    entryMock.mockResolvedValue(null);

    const response = await statusGET(localReq('/api/vn/v90402/vndb-status', 'GET'), ctx(REAL_VN));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entry: null, labels: [], local: null, differences: [] });
  });

  it('preserves nullable local tracking fields in comparison data', async () => {
    upsertVn({ id: REAL_VN, title: 'Fixture' });
    addToCollection(REAL_VN, { status: 'planning' });
    labelsMock.mockResolvedValue([]);
    entryMock.mockResolvedValue(null);

    const response = await statusGET(localReq('/api/vn/v90402/vndb-status', 'GET'), ctx(REAL_VN));

    expect(response.status).toBe(200);
    expect((await response.json()).local).toEqual({
      status: 'planning',
      vote: null,
      started: null,
      finished: null,
      notes: null,
    });
  });

  it('502 when status loading throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    labelsMock.mockRejectedValue(new Error('ulist labels failed'));
    const res = await statusGET(localReq('/api/vn/v90402/vndb-status', 'GET'), ctx(REAL_VN));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'vn/[id]/vndb-status' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/vndb-status] ulist labels failed');
    consoleSpy.mockRestore();
  });
});

describe('POST /api/vn/[id]/vndb-status', () => {
  function seedLocal(fields: Parameters<typeof addToCollection>[1] = {}): void {
    upsertVn({ id: REAL_VN, title: 'Fixture' });
    addToCollection(REAL_VN, {
      status: 'completed',
      user_rating: 90,
      started_date: '2025-01-01',
      finished_date: '2025-01-02',
      notes: 'local note',
      ...fields,
    });
  }

  function remotePlaying(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: REAL_VN,
      vote: null,
      started: null,
      finished: null,
      notes: null,
      labels: [{ id: 1, label: 'Playing' }],
      ...overrides,
    };
  }

  function selection(
    field: VndbSyncField,
    local: VndbSyncValue,
    remote: VndbSyncValue,
  ): VndbSyncSelection {
    return { field, local, remote };
  }

  it('rejects malformed requests and non-VNDB ids', async () => {
    const invalidId = await statusPOST(
      localReq('/api/vn/egs_90401/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(EGS_VN),
    );
    expect(invalidId.status).toBe(400);
    expect(await invalidId.json()).toEqual({ error: 'invalid id' });

    const invalidBody = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', { direction: 'local_to_vndb', fields: ['status', 'status'] }),
      ctx(REAL_VN),
    );
    expect(invalidBody.status).toBe(400);
    expect(await invalidBody.json()).toEqual({ error: 'invalid sync request' });
  });

  it('returns 404 when the VN is not in the local collection', async () => {
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'not in collection' });
    expect(entryMock).not.toHaveBeenCalled();
  });

  it('copies only selected local fields to VNDB and preserves custom labels', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying({ labels: [{ id: 1, label: 'Playing' }, { id: 42, label: 'Custom' }] }));
    patchMock.mockResolvedValue({ ok: true });
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [
          selection('status', 'completed', 'playing'),
          selection('vote', 90, null),
          selection('started', '2025-01-01', null),
          selection('finished', '2025-01-02', null),
          selection('notes', 'local note', null),
        ],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      direction: 'local_to_vndb',
      fields: ['status', 'vote', 'started', 'finished', 'notes'],
    });
    expect(entryMock).toHaveBeenCalledWith(REAL_VN, { fresh: true });
    expect(patchMock).toHaveBeenCalledWith(REAL_VN, {
      labels_set: [2],
      labels_unset: [5, 1, 3, 4],
      vote: 90,
      started: '2025-01-01',
      finished: '2025-01-02',
      notes: 'local note',
    });
    expect(getCollectionItem(REAL_VN)).toMatchObject({ status: 'completed', user_rating: 90 });
  });

  it('pushes a selected vote without including unrelated local fields', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying({ vote: 70 }));
    patchMock.mockResolvedValue({ ok: true });

    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('vote', 90, 70)],
      }),
      ctx(REAL_VN),
    );

    expect(response.status).toBe(200);
    expect(patchMock).toHaveBeenCalledWith(REAL_VN, { vote: 90 });
  });

  it('copies selected VNDB fields to the local collection', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying({
      vote: 70,
      started: '2024-02-01',
      finished: null,
      notes: 'remote note',
    }));
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'vndb_to_local',
        selections: [
          selection('status', 'completed', 'playing'),
          selection('vote', 90, 70),
          selection('started', '2025-01-01', '2024-02-01'),
          selection('finished', '2025-01-02', null),
          selection('notes', 'local note', 'remote note'),
        ],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(200);
    expect(getCollectionItem(REAL_VN)).toMatchObject({
      status: 'playing',
      user_rating: 70,
      started_date: '2024-02-01',
      finished_date: null,
      notes: 'remote note',
    });
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('pulls a selected status without replacing unrelated local fields', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying({
      vote: 70,
      started: '2024-02-01',
      finished: null,
      notes: 'remote note',
    }));

    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'vndb_to_local',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );

    expect(response.status).toBe(200);
    expect(getCollectionItem(REAL_VN)).toMatchObject({
      status: 'playing',
      user_rating: 90,
      started_date: '2025-01-01',
      finished_date: '2025-01-02',
      notes: 'local note',
    });
  });

  it('pulls a selected vote without replacing the local status', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying({ vote: 70 }));

    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'vndb_to_local',
        selections: [selection('vote', 90, 70)],
      }),
      ctx(REAL_VN),
    );

    expect(response.status).toBe(200);
    expect(getCollectionItem(REAL_VN)).toMatchObject({ status: 'completed', user_rating: 70 });
  });

  it('rejects a decision when the selected field no longer differs', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying({ vote: 90 }));
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('vote', 90, 70)],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: 'selected fields changed since preview',
      code: 'vndb_sync_changed',
    });
  });

  it('rejects a still-different field when the local value changed after preview', async () => {
    seedLocal({ status: 'on_hold' });
    entryMock.mockResolvedValue(remotePlaying());
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('vndb_sync_changed');
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('rejects a still-different field when the remote value changed after preview', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying({ labels: [{ id: 4, label: 'Dropped' }] }));
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('vndb_sync_changed');
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('rejects synchronization when the local row disappears during the fresh VNDB read', async () => {
    seedLocal();
    entryMock.mockImplementation(async () => {
      db.prepare('DELETE FROM collection WHERE vn_id = ?').run(REAL_VN);
      return remotePlaying();
    });
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('vndb_sync_changed');
    expect(patchMock).not.toHaveBeenCalled();
  });

  it('rejects a remote pull when the atomic local comparison loses a race', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying());
    const repository = getCollectionCoreRepository();
    const updateSpy = vi.spyOn(repository, 'updateUserDataIfCurrent').mockResolvedValueOnce(false);
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'vndb_to_local',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('vndb_sync_changed');
    expect(updateSpy).toHaveBeenCalledWith(
      REAL_VN,
      { status: 'completed' },
      { status: 'playing' },
    );
    updateSpy.mockRestore();
  });

  it('blocks pulling an absent remote status and pushing an overlong local note', async () => {
    seedLocal({ notes: 'x'.repeat(10_001) });
    entryMock.mockResolvedValue(remotePlaying({ labels: [] }));
    const pullResponse = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'vndb_to_local',
        selections: [selection('status', 'completed', null)],
      }),
      ctx(REAL_VN),
    );
    expect(pullResponse.status).toBe(409);
    expect((await pullResponse.json()).code).toBe('vndb_sync_direction_unavailable');

    const pushResponse = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('notes', 'x'.repeat(10_001), null)],
      }),
      ctx(REAL_VN),
    );
    expect(pushResponse.status).toBe(409);
    expect((await pushResponse.json()).code).toBe('vndb_sync_direction_unavailable');
  });

  it('returns 401 when conflict resolution needs VNDB authentication', async () => {
    seedLocal();
    entryMock.mockResolvedValue({ needsAuth: true });
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'VNDB token required', code: 'vndb_token_required' });
  });

  it('returns 401 when authentication expires during the VNDB write', async () => {
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying());
    patchMock.mockResolvedValue({ needsAuth: true });

    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'VNDB token required', code: 'vndb_token_required' });
  });

  it('keeps a completed resolution successful when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedLocal();
    entryMock.mockResolvedValue(remotePlaying());
    patchMock.mockResolvedValue({ ok: true });
    recordActivityMock.mockRejectedValueOnce(new Error('activity failed'));
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, direction: 'local_to_vndb', fields: ['status'] });
    expect(consoleSpy).toHaveBeenCalledWith('[vndb-status:v90402] activity log failed:', 'activity failed');
    consoleSpy.mockRestore();
  });

  it('returns a sanitized upstream failure when the fresh VNDB read fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    seedLocal();
    entryMock.mockRejectedValue(new Error('private upstream detail'));
    const response = await statusPOST(
      localReq('/api/vn/v90402/vndb-status', 'POST', {
        direction: 'local_to_vndb',
        selections: [selection('status', 'completed', 'playing')],
      }),
      ctx(REAL_VN),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      ok: false,
      error: 'upstream service unavailable',
      code: 'upstream_unavailable',
      context: 'vn/[id]/vndb-status/sync',
    });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/vndb-status/sync] private upstream detail');
    consoleSpy.mockRestore();
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

  it('200 even when the patch activity log write fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    patchMock.mockResolvedValue({ ok: true });
    recordActivityMock.mockImplementationOnce(() => {
      throw new Error('activity failed');
    });
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', { labels_set: [1, 2] }), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(consoleSpy).toHaveBeenCalledWith('[vndb-status:v90402] activity log failed:', 'activity failed');
    consoleSpy.mockRestore();
  });

  it('502 when patching the ulist entry throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    patchMock.mockRejectedValue(new Error('ulist patch failed'));
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', { finished: null }), ctx(REAL_VN));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'vn/[id]/vndb-status' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/vndb-status] ulist patch failed');
    consoleSpy.mockRestore();
  });

  it('400 on a non-VNDB id before parsing patch fields', async () => {
    const res = await statusPATCH(localReq('/api/vn/egs_90401/vndb-status', 'PATCH', { vote: 80 }), ctx(EGS_VN));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('200 with nullable vote and empty notes normalized to null', async () => {
    patchMock.mockResolvedValue({ ok: true });
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', {
      vote: '',
      notes: '',
    }), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(patchMock).toHaveBeenCalledWith('v90402', {
      vote: null,
      notes: null,
    });
  });

  it('200 with valid labels_unset and started date patch fields', async () => {
    patchMock.mockResolvedValue({ ok: true });
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', {
      labels_unset: [3, 3, 4],
      started: '2026-06-06',
    }), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(patchMock).toHaveBeenCalledWith('v90402', {
      labels_unset: [3, 4],
      started: '2026-06-06',
    });
  });

  it('200 with an explicitly null vote', async () => {
    patchMock.mockResolvedValue({ ok: true });
    const res = await statusPATCH(localReq('/api/vn/v90402/vndb-status', 'PATCH', { vote: null }), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(patchMock).toHaveBeenCalledWith('v90402', { vote: null });
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

  it('401 when deleting the ulist entry needs a VNDB token', async () => {
    deleteMock.mockResolvedValue({ needsAuth: true });
    const res = await statusDELETE(localReq('/api/vn/v90402/vndb-status', 'DELETE'), ctx(REAL_VN));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'VNDB token required', code: 'vndb_token_required' });
  });

  it('200 even when the delete activity log write fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteMock.mockResolvedValue({ ok: true });
    recordActivityMock.mockImplementationOnce(() => {
      throw new Error('activity failed');
    });
    const res = await statusDELETE(localReq('/api/vn/v90402/vndb-status', 'DELETE'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(consoleSpy).toHaveBeenCalledWith('[vndb-status:v90402] activity log failed:', 'activity failed');
    consoleSpy.mockRestore();
  });

  it('502 when deleting the ulist entry throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    deleteMock.mockRejectedValue(new Error('ulist delete failed'));
    const res = await statusDELETE(localReq('/api/vn/v90402/vndb-status', 'DELETE'), ctx(REAL_VN));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'vn/[id]/vndb-status' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/vndb-status] ulist delete failed');
    consoleSpy.mockRestore();
  });
});

describe('GET /api/vn/[id]/erogamescape', () => {
  it('400 on an invalid id', async () => {
    const res = await egsGET(localReq('/api/vn/zz/erogamescape', 'GET'), ctx('zz'));
    expect(res.status).toBe(400);
  });

  it('200 with game/source/manual fields', async () => {
    resolveMock.mockResolvedValue({ game: { id: 1, gamename: 'X' }, source: 'cache' });
    const request = localReq('/api/vn/v90402/erogamescape', 'GET');
    const res = await egsGET(request, ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ source: 'cache', manual: null });
    expect(body.game.id).toBe(1);
    expect(resolveMock).toHaveBeenCalledWith(REAL_VN, {
      force: false,
      allowSearch: true,
      signal: request.signal,
    });
  });

  it('200 includes a manual EGS link when one is stored for the VN', async () => {
    upsertVn({ id: REAL_VN, title: 'Real Target' });
    setVnEgsLink(REAL_VN, 34567);
    resolveMock.mockResolvedValue({ game: { id: 34567, gamename: 'Pinned' }, source: 'manual' });
    const res = await egsGET(localReq('/api/vn/v90402/erogamescape', 'GET'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manual.egs_id).toBe(34567);
    expect(typeof body.manual.updated_at).toBe('number');
  });

  it('200 skips manual VNDB link lookup for synthetic EGS-only ids', async () => {
    resolveMock.mockResolvedValue({ game: { id: 1, gamename: 'Synthetic' }, source: 'cache' });
    const res = await egsGET(localReq('/api/vn/egs_90401/erogamescape', 'GET'), ctx(EGS_VN));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manual).toBeNull();
    expect(body.game.id).toBe(1);
  });

  it('502 when EGS resolution throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    resolveMock.mockRejectedValue(new Error('egs resolve failed'));
    const res = await egsGET(localReq('/api/vn/v90402/erogamescape', 'GET'), ctx(REAL_VN));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'vn/[id]/erogamescape' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/erogamescape] egs resolve failed');
    consoleSpy.mockRestore();
  });
});

describe('POST /api/vn/[id]/erogamescape', () => {
  it('400 on a non-positive egs_id', async () => {
    const res = await egsPOST(localReq('/api/vn/v90402/erogamescape', 'POST', { egs_id: 0 }), ctx(REAL_VN));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid egs_id');
  });

  it('400 on an invalid VN id before validating egs_id', async () => {
    const res = await egsPOST(localReq('/api/vn/zz/erogamescape', 'POST', { egs_id: 12345 }), ctx('zz'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
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

  it('200 even when EGS link activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    linkMock.mockResolvedValue({ id: 12345, gamename: 'Linked' });
    recordActivityMock.mockImplementationOnce(() => {
      throw new Error('activity failed');
    });
    const res = await egsPOST(localReq('/api/vn/v90402/erogamescape', 'POST', { egs_id: 12345 }), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith('[vn-egs:v90402] activity log failed:', 'activity failed');
    consoleSpy.mockRestore();
  });

  it('502 when EGS manual linking throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    linkMock.mockRejectedValue(new Error('egs link failed'));
    const res = await egsPOST(localReq('/api/vn/v90402/erogamescape', 'POST', { egs_id: 12345 }), ctx(REAL_VN));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: 'upstream service unavailable', code: 'upstream_unavailable', context: 'vn/[id]/erogamescape' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]/erogamescape] egs link failed');
    consoleSpy.mockRestore();
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

  it('200 with manual-none mode and logs activity failures without failing the request', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    recordActivityMock.mockImplementationOnce(() => {
      throw new Error('activity failed');
    });
    const res = await egsDELETE(localReq('/api/vn/v90402/erogamescape?mode=manual-none', 'DELETE'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: 'manual-none' });
    expect(clearMock).toHaveBeenCalledWith('v90402', 'manual-none');
    expect(consoleSpy).toHaveBeenCalledWith('[vn-egs:v90402] activity log failed:', 'activity failed');
    consoleSpy.mockRestore();
  });

  it('defaults unknown clear modes to auto', async () => {
    const res = await egsDELETE(localReq('/api/vn/v90402/erogamescape?mode=surprise', 'DELETE'), ctx(REAL_VN));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, mode: 'auto' });
    expect(clearMock).toHaveBeenCalledWith('v90402', 'auto');
  });
});
