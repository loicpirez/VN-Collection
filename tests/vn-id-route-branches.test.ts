import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  downloadFullCharForVn: vi.fn(),
  downloadFullProducerForVn: vi.fn(),
  downloadFullStaffForVn: vi.fn(),
  getCollectionItem: vi.fn(),
  getVn: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  upsertVn: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/vndb', () => ({
  getVn: mocks.getVn,
}));

vi.mock('@/lib/db', () => ({
  getCollectionItem: mocks.getCollectionItem,
  upsertVn: mocks.upsertVn,
}));

vi.mock('@/lib/staff-full', () => ({
  downloadFullStaffForVn: mocks.downloadFullStaffForVn,
}));

vi.mock('@/lib/character-full', () => ({
  downloadFullCharForVn: mocks.downloadFullCharForVn,
}));

vi.mock('@/lib/producer-full', () => ({
  downloadFullProducerForVn: mocks.downloadFullProducerForVn,
}));

import { GET } from '@/app/api/vn/[id]/route';

const VN_ID = 'v990302';

type CollectionRow = {
  id: string;
  title: string;
  fetched_at: number;
  status?: string | null;
};

function req(): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/vn/${VN_ID}`);
}

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function row(status: string | null = null, fetchedAt = Date.now()): CollectionRow {
  return {
    id: VN_ID,
    title: 'Synthetic VN',
    fetched_at: fetchedAt,
    status,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.downloadFullStaffForVn.mockResolvedValue(undefined);
  mocks.downloadFullCharForVn.mockResolvedValue(undefined);
  mocks.downloadFullProducerForVn.mockResolvedValue(undefined);
});

describe('GET /api/vn/[id] route branches', () => {
  it('returns the auth gate response before validating the id', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await GET(req(), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
    expect(mocks.getCollectionItem).not.toHaveBeenCalled();
  });

  it('rejects unsupported VN id shapes', async () => {
    const response = await GET(req(), ctx('bad-id'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('serves a fresh cached collection row without contacting VNDB', async () => {
    const cached = row('completed');
    mocks.getCollectionItem.mockReturnValue(cached);
    const response = await GET(req(), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      vn: cached,
      in_collection: true,
    });
    expect(mocks.getVn).not.toHaveBeenCalled();
  });

  it('returns 404 when VNDB has no uncached row for the id', async () => {
    mocks.getCollectionItem.mockReturnValue(null);
    mocks.getVn.mockResolvedValue(null);
    const response = await GET(req(), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('stores a fetched VN, starts fan-out jobs, and returns the refreshed row', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refreshed = row(null, 1);
    mocks.getCollectionItem
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(refreshed);
    mocks.getVn.mockResolvedValue({ id: VN_ID, title: 'Synthetic VN' });
    mocks.downloadFullStaffForVn.mockRejectedValue(new Error('staff failed'));
    mocks.downloadFullCharForVn.mockRejectedValue(new Error('character failed'));
    mocks.downloadFullProducerForVn.mockRejectedValue(new Error('producer failed'));

    const response = await GET(req(), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      vn: refreshed,
      in_collection: false,
    });
    expect(mocks.upsertVn).toHaveBeenCalledWith({ id: VN_ID, title: 'Synthetic VN' });
    expect(mocks.downloadFullStaffForVn).toHaveBeenCalledWith(VN_ID);
    expect(mocks.downloadFullCharForVn).toHaveBeenCalledWith(VN_ID);
    expect(mocks.downloadFullProducerForVn).toHaveBeenCalledWith(VN_ID);

    await Promise.resolve();
    await Promise.resolve();
    expect(consoleSpy).toHaveBeenCalledWith(`[vn:${VN_ID}] staff fan-out failed:`, 'staff failed');
    expect(consoleSpy).toHaveBeenCalledWith(`[vn:${VN_ID}] character fan-out failed:`, 'character failed');
    expect(consoleSpy).toHaveBeenCalledWith(`[vn:${VN_ID}] producer fan-out failed:`, 'producer failed');
    consoleSpy.mockRestore();
  });

  it('returns a sanitized upstream error when VNDB throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.getCollectionItem.mockReturnValue(null);
    mocks.getVn.mockRejectedValue(new Error('token-shaped upstream failure'));
    const response = await GET(req(), ctx());
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: 'upstream service unavailable' });
    expect(consoleSpy).toHaveBeenCalledWith('[upstream:vn/[id]] token-shaped upstream failure');
    consoleSpy.mockRestore();
  });
});
