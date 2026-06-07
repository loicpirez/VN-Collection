import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteSeries: vi.fn(),
  getSeries: vi.fn(),
  recordActivity: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  updateSeries: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  deleteSeries: mocks.deleteSeries,
  getSeries: mocks.getSeries,
  updateSeries: mocks.updateSeries,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

import {
  DELETE,
  GET,
  PATCH,
} from '@/app/api/series/[id]/route';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;

function seriesRow(id = 7): Body {
  return {
    id,
    name: 'Series Fixture',
    description: null,
    cover_path: null,
    banner_path: null,
    created_at: 1,
    updated_at: 1,
  };
}

function ctx(id = '7'): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, body?: Body): NextRequest {
  return new NextRequest('http://127.0.0.1/api/series/7', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.getSeries.mockReturnValue(seriesRow());
  mocks.updateSeries.mockReturnValue(seriesRow());
});

describe('GET /api/series/[id]', () => {
  it('rejects non-positive ids', async () => {
    const response = await GET(req('GET'), ctx('0'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('returns 404 when no series exists', async () => {
    mocks.getSeries.mockReturnValue(null);
    const response = await GET(req('GET'), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('returns the stored series row', async () => {
    const response = await GET(req('GET'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ series: seriesRow() });
  });
});

describe('PATCH /api/series/[id]', () => {
  it('requires localhost or an admin token', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await PATCH(req('PATCH', { name: 'Renamed' }), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it('rejects invalid ids before parsing the body', async () => {
    const response = await PATCH(req('PATCH', { name: 'Renamed' }), ctx('NaN'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid id' });
    expect(mocks.updateSeries).not.toHaveBeenCalled();
  });

  it.each([
    [{ name: 12 }, 'name must be a string'],
    [{ name: '   ' }, 'name is required'],
    [{ name: 'x'.repeat(201) }, 'name too long (max 200)'],
    [{ description: 12 }, 'description must be a string'],
    [{ description: 'x'.repeat(20_001) }, 'description too long (max 20000)'],
  ] satisfies Array<[Body, string]>)('rejects invalid text fields %j', async (body, error) => {
    const response = await PATCH(req('PATCH', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it.each([
    [{ cover_path: 12 }, 'invalid cover_path'],
    [{ cover_path: '../cover.jpg' }, 'invalid cover_path'],
    [{ cover_path: 'series/'.repeat(40) }, 'invalid cover_path'],
    [{ cover_path: 'series/cover?.jpg' }, 'invalid cover_path'],
    [{ banner_path: '../banner.jpg' }, 'invalid banner_path'],
  ] satisfies Array<[Body, string]>)('rejects unsafe storage paths %j', async (body, error) => {
    const response = await PATCH(req('PATCH', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('returns 404 when the update target does not exist', async () => {
    mocks.updateSeries.mockReturnValue(null);
    const response = await PATCH(req('PATCH', { name: 'Renamed' }), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('updates series metadata and records changed fields', async () => {
    mocks.updateSeries.mockReturnValue({
      ...seriesRow(),
      name: 'Renamed',
      description: '',
      cover_path: 'series/cover.jpg',
      banner_path: null,
    });
    const response = await PATCH(req('PATCH', {
      name: '  Renamed  ',
      description: '',
      cover_path: 'series/cover.jpg',
      banner_path: null,
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ series: seriesRow() });
    expect(mocks.updateSeries).toHaveBeenCalledWith(7, {
      name: 'Renamed',
      description: '',
      cover_path: 'series/cover.jpg',
      banner_path: null,
    });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'series.update',
      entity: 'series',
      entityId: '7',
      label: 'Updated series',
      payload: { changed: ['name', 'description', 'cover_path', 'banner_path'] },
    });
  });

  it('still returns success when activity logging fails after the update', async () => {
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await PATCH(req('PATCH', { name: 'Renamed' }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ series: seriesRow() });
  });
});

describe('DELETE /api/series/[id]', () => {
  it('requires localhost or an admin token', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it('rejects invalid ids', async () => {
    const response = await DELETE(req('DELETE'), ctx('-1'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('returns 404 when the series no longer exists', async () => {
    mocks.getSeries.mockReturnValue(null);
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('deletes the series and records activity', async () => {
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteSeries).toHaveBeenCalledWith(7);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'series.delete',
      entity: 'series',
      entityId: '7',
      label: 'Series Fixture',
    });
  });

  it('still deletes the series when activity logging fails', async () => {
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
