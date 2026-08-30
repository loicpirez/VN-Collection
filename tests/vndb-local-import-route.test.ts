import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  importLocalLibraryToVndb: vi.fn(),
  recordActivity: vi.fn(),
}));

vi.mock('@/lib/vndb-local-import', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-local-import')>();
  return { ...actual, importLocalLibraryToVndb: mocks.importLocalLibraryToVndb };
});

vi.mock('@/lib/activity', () => ({ recordActivity: mocks.recordActivity }));

import { POST } from '@/app/api/vndb/import-local-library/route';

function request(body: unknown, host = '127.0.0.1'): NextRequest {
  return new NextRequest(`http://${host}/api/vndb/import-local-library`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.recordActivity.mockResolvedValue(undefined);
  mocks.importLocalLibraryToVndb.mockResolvedValue({
    ok: true,
    action: 'preview',
    needsAuth: false,
    canApply: true,
    candidates: [],
    ineligible: [],
    summary: {
      scanned_vns: 0,
      scanned_releases: 0,
      already_in_vndb: 0,
      already_obtained: 0,
      ineligible: 0,
    },
  });
});

describe('POST /api/vndb/import-local-library', () => {
  it('requires the local or trusted-proxy gate', async () => {
    const response = await POST(request({ action: 'preview' }, 'example.com'));
    expect(response.status).toBe(403);
    expect(mocks.importLocalLibraryToVndb).not.toHaveBeenCalled();
  });

  it('rejects invalid actions and apply selections', async () => {
    expect((await POST(request({ action: 'other' }))).status).toBe(400);
    expect((await POST(request({ action: 'apply', selections: [] }))).status).toBe(400);
    expect(mocks.importLocalLibraryToVndb).not.toHaveBeenCalled();
  });

  it('returns a preview and forwards the request abort signal', async () => {
    const req = request({ action: 'preview' });
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, action: 'preview' });
    expect(mocks.importLocalLibraryToVndb).toHaveBeenCalledWith({ action: 'preview', signal: req.signal });
  });

  it('returns authentication and permission errors with exact statuses', async () => {
    mocks.importLocalLibraryToVndb
      .mockResolvedValueOnce({ ok: false, action: 'preview', needsAuth: true, errorCode: 'vndb_token_required' })
      .mockResolvedValueOnce({ ok: false, action: 'preview', needsAuth: false, errorCode: 'vndb_list_read_permission_required' })
      .mockResolvedValueOnce({ ok: false, action: 'apply', needsAuth: false, errorCode: 'vndb_list_write_permission_required' });
    expect((await POST(request({ action: 'preview' }))).status).toBe(401);
    expect((await POST(request({ action: 'preview' }))).status).toBe(403);
    expect((await POST(request({
      action: 'apply',
      selections: [{ kind: 'vn', vn_id: 'v90001', local_status: 'planning' }],
    }))).status).toBe(403);
  });

  it('applies normalized selections and records aggregate-only activity', async () => {
    mocks.importLocalLibraryToVndb.mockResolvedValue({
      ok: true,
      action: 'apply',
      needsAuth: false,
      applied: ['vn:v90001'],
      conflicts: [{ key: 'vn:v90002', reason: 'remote_changed' }],
      failures: [{ key: 'release:r90003', code: 'vndb_write_failed' }],
    });
    const req = request({
      action: 'apply',
      selections: [{ kind: 'vn', vn_id: 'V90001', local_status: 'planning' }],
    });
    const response = await POST(req);
    expect(response.status).toBe(200);
    expect(mocks.importLocalLibraryToVndb).toHaveBeenCalledWith({
      action: 'apply',
      selections: [{ kind: 'vn', vn_id: 'v90001', local_status: 'planning' }],
      signal: req.signal,
    });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'vndb.library.import',
      entity: 'vndb',
      entityId: 'user-lists',
      label: 'Imported local library into VNDB',
      payload: { applied: 1, conflicts: 1, failures: 1 },
    });
  });

  it('keeps a successful apply successful when activity recording fails', async () => {
    mocks.importLocalLibraryToVndb.mockResolvedValue({
      ok: true,
      action: 'apply',
      needsAuth: false,
      applied: [],
      conflicts: [],
      failures: [],
    });
    mocks.recordActivity.mockRejectedValue(new Error('activity unavailable'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(request({
      action: 'apply',
      selections: [{ kind: 'vn', vn_id: 'v90001', local_status: 'planning' }],
    }));
    expect(response.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[vndb:import-local-library] activity log failed:',
      'activity unavailable',
    );
    consoleSpy.mockRestore();
  });

  it('sanitizes unexpected upstream failures', async () => {
    mocks.importLocalLibraryToVndb.mockRejectedValue(new Error('private upstream detail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(request({ action: 'preview' }));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'upstream_unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith(
      '[upstream:vndb/import-local-library] private upstream detail',
    );
    consoleSpy.mockRestore();
  });
});
