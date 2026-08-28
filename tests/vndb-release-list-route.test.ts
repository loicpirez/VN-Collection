import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  deleteRlistEntry: vi.fn(),
  fetchUlistEntry: vi.fn(),
  patchRlistEntry: vi.fn(),
  recordActivity: vi.fn(),
}));

vi.mock('@/lib/vndb', () => ({
  deleteRlistEntry: mocks.deleteRlistEntry,
  fetchUlistEntry: mocks.fetchUlistEntry,
  patchRlistEntry: mocks.patchRlistEntry,
}));

vi.mock('@/lib/activity', () => ({ recordActivity: mocks.recordActivity }));

import { DELETE, GET, PATCH } from '@/app/api/release/[id]/vndb-list/route';

function request(path: string, method = 'GET', body?: unknown, host = '127.0.0.1'): NextRequest {
  return new NextRequest(`http://${host}${path}`, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context(id = 'r90001'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function entry(releases: Array<{ id: string; title: string; list_status: 0 | 1 | 2 | 3 | 4 }>) {
  return {
    id: 'v90001',
    added: 1,
    voted: null,
    lastmod: 2,
    vote: null,
    started: null,
    finished: null,
    notes: null,
    labels: [],
    releases,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchUlistEntry.mockResolvedValue(entry([]));
  mocks.patchRlistEntry.mockResolvedValue({ ok: true });
  mocks.deleteRlistEntry.mockResolvedValue({ ok: true });
  mocks.recordActivity.mockResolvedValue(undefined);
});

describe('GET /api/release/[id]/vndb-list', () => {
  it('requires the local or trusted-proxy gate', async () => {
    const response = await GET(request('/api/release/r90001/vndb-list?vn=v90001', 'GET', undefined, 'example.com'), context());
    expect(response.status).toBe(403);
    expect(mocks.fetchUlistEntry).not.toHaveBeenCalled();
  });

  it('rejects malformed release and VN identifiers', async () => {
    expect((await GET(request('/api/release/bad/vndb-list?vn=v90001'), context('bad'))).status).toBe(400);
    expect((await GET(request('/api/release/r90001/vndb-list?vn=egs_1'), context())).status).toBe(400);
    expect(mocks.fetchUlistEntry).not.toHaveBeenCalled();
  });

  it('returns the matching remote state and honors explicit refresh', async () => {
    mocks.fetchUlistEntry.mockResolvedValue(entry([
      { id: 'r90000', title: 'Other', list_status: 1 },
      { id: 'r90001', title: 'Edition', list_status: 2 },
    ]));
    const response = await GET(request('/api/release/R90001/vndb-list?vn=V90001&fresh=1'), context('R90001'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ needsAuth: false, status: 2 });
    expect(mocks.fetchUlistEntry).toHaveBeenCalledWith('v90001', expect.objectContaining({ fresh: true }));
  });

  it('returns an absent state for a missing VN entry or release', async () => {
    mocks.fetchUlistEntry.mockResolvedValueOnce(null).mockResolvedValueOnce(entry([]));
    const first = await GET(request('/api/release/r90001/vndb-list?vn=v90001'), context());
    const second = await GET(request('/api/release/r90001/vndb-list?vn=v90001'), context());
    expect(await first.json()).toEqual({ needsAuth: false, status: null });
    expect(await second.json()).toEqual({ needsAuth: false, status: null });
    expect(mocks.fetchUlistEntry).toHaveBeenNthCalledWith(1, 'v90001', expect.objectContaining({ fresh: false }));
  });

  it('returns a token state without exposing an upstream error', async () => {
    mocks.fetchUlistEntry.mockResolvedValue({ needsAuth: true });
    const response = await GET(request('/api/release/r90001/vndb-list?vn=v90001'), context());
    expect(await response.json()).toEqual({ needsAuth: true, status: null });
  });

  it('sanitizes read failures', async () => {
    mocks.fetchUlistEntry.mockRejectedValue(new Error('private upstream detail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await GET(request('/api/release/r90001/vndb-list?vn=v90001'), context());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'upstream_unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:release/[id]/vndb-list.GET] private upstream detail');
    consoleSpy.mockRestore();
  });
});

describe('PATCH /api/release/[id]/vndb-list', () => {
  it('requires authorization and validates the request body', async () => {
    expect((await PATCH(request('/api/release/r90001/vndb-list', 'PATCH', { status: 2 }, 'example.com'), context())).status).toBe(403);
    expect((await PATCH(request('/api/release/bad/vndb-list', 'PATCH', { status: 2 }), context('bad'))).status).toBe(400);
    expect((await PATCH(request('/api/release/r90001/vndb-list', 'PATCH', { status: 5 }), context())).status).toBe(400);
    expect((await PATCH(request('/api/release/r90001/vndb-list', 'PATCH', 'bad'), context())).status).toBe(400);
    expect(mocks.patchRlistEntry).not.toHaveBeenCalled();
  });

  it('writes the normalized release state and records activity', async () => {
    const response = await PATCH(request('/api/release/R90001/vndb-list', 'PATCH', { status: 3 }), context('R90001'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 3 });
    expect(mocks.patchRlistEntry).toHaveBeenCalledWith('r90001', 3);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'vndb-release-list.update',
      entity: 'release',
      entityId: 'r90001',
      label: 'Updated VNDB release-list state',
    });
  });

  it('returns the stable token error', async () => {
    mocks.patchRlistEntry.mockResolvedValue({ needsAuth: true });
    const response = await PATCH(request('/api/release/r90001/vndb-list', 'PATCH', { status: 2 }), context());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'vndb_token_required' });
  });

  it('returns a listwrite error for permission failures', async () => {
    mocks.patchRlistEntry.mockRejectedValue(new Error('VNDB PATCH /rlist/r90001 -> 403: forbidden'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await PATCH(request('/api/release/r90001/vndb-list', 'PATCH', { status: 2 }), context());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'vndb_listwrite_required' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:release/[id]/vndb-list.PATCH] VNDB rejected the release-list write');
    consoleSpy.mockRestore();
  });

  it('keeps a successful write successful when activity logging fails', async () => {
    mocks.recordActivity.mockRejectedValue(new Error('activity unavailable'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await PATCH(request('/api/release/r90001/vndb-list', 'PATCH', { status: 2 }), context());
    expect(response.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith('[vndb-release-list:r90001] activity log failed:', 'activity unavailable');
    consoleSpy.mockRestore();
  });

  it('sanitizes non-permission upstream failures', async () => {
    mocks.patchRlistEntry.mockRejectedValue(new Error('network secret'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await PATCH(request('/api/release/r90001/vndb-list', 'PATCH', { status: 2 }), context());
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'upstream_unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:release/[id]/vndb-list.PATCH] network secret');
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/release/[id]/vndb-list', () => {
  it('requires authorization and validates the release id', async () => {
    expect((await DELETE(request('/api/release/r90001/vndb-list', 'DELETE', undefined, 'example.com'), context())).status).toBe(403);
    expect((await DELETE(request('/api/release/bad/vndb-list', 'DELETE'), context('bad'))).status).toBe(400);
    expect(mocks.deleteRlistEntry).not.toHaveBeenCalled();
  });

  it('removes the normalized release and records activity', async () => {
    const response = await DELETE(request('/api/release/R90001/vndb-list', 'DELETE'), context('R90001'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: null });
    expect(mocks.deleteRlistEntry).toHaveBeenCalledWith('r90001');
    expect(mocks.recordActivity).toHaveBeenCalledWith(expect.objectContaining({ kind: 'vndb-release-list.remove' }));
  });

  it('returns the stable token error', async () => {
    mocks.deleteRlistEntry.mockResolvedValue({ needsAuth: true });
    const response = await DELETE(request('/api/release/r90001/vndb-list', 'DELETE'), context());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'vndb_token_required' });
  });

  it('keeps a successful removal successful for non-Error activity failures', async () => {
    mocks.recordActivity.mockRejectedValue('activity unavailable');
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await DELETE(request('/api/release/r90001/vndb-list', 'DELETE'), context());
    expect(response.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith('[vndb-release-list:r90001] activity log failed:', 'activity unavailable');
    consoleSpy.mockRestore();
  });

  it('classifies listwrite failures and sanitizes other failures', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.deleteRlistEntry
      .mockRejectedValueOnce(new Error('VNDB DELETE /rlist/r90001 -> 401: denied'))
      .mockRejectedValueOnce(new Error('network secret'));
    const permission = await DELETE(request('/api/release/r90001/vndb-list', 'DELETE'), context());
    const generic = await DELETE(request('/api/release/r90001/vndb-list', 'DELETE'), context());
    expect(permission.status).toBe(401);
    expect(await permission.json()).toMatchObject({ code: 'vndb_listwrite_required' });
    expect(generic.status).toBe(502);
    expect(await generic.json()).toMatchObject({ code: 'upstream_unavailable' });
    consoleSpy.mockRestore();
  });
});
