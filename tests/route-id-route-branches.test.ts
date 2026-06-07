import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  deleteRoute: vi.fn(),
  getRoute: vi.fn(),
  readBodyWithLimit: vi.fn(),
  recordActivity: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  updateRoute: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  deleteRoute: mocks.deleteRoute,
  getRoute: mocks.getRoute,
  updateRoute: mocks.updateRoute,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  readBodyWithLimit: mocks.readBodyWithLimit,
}));

import {
  DELETE,
  GET,
  PATCH,
} from '@/app/api/route/[routeId]/route';

const ROUTE_ID = 44;
const VN_ID = 'v990801';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type RouteRow = {
  id: number;
  vn_id: string;
  name: string;
  completed: number;
  completed_date: string | null;
  order_index: number;
  notes: string | null;
};

function routeRow(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: ROUTE_ID,
    vn_id: VN_ID,
    name: 'Heroine route',
    completed: 0,
    completed_date: null,
    order_index: 0,
    notes: null,
    ...overrides,
  };
}

function ctx(routeId = String(ROUTE_ID)): { params: Promise<{ routeId: string }> } {
  return { params: Promise.resolve({ routeId }) };
}

function req(method: string, body?: Body): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/route/${ROUTE_ID}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.getRoute.mockReturnValue(routeRow());
  mocks.updateRoute.mockReturnValue(routeRow({ completed: 1, completed_date: '2025-05-21' }));
  mocks.deleteRoute.mockReturnValue(true);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
});

describe('GET /api/route/[routeId]', () => {
  it('rejects invalid ids and absent route rows', async () => {
    const invalidResponse = await GET(req('GET'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });

    mocks.getRoute.mockReturnValue(null);
    const missingResponse = await GET(req('GET'), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not found' });
  });

  it('returns the route row', async () => {
    const response = await GET(req('GET'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ route: routeRow() });
  });
});

describe('PATCH /api/route/[routeId]', () => {
  it('returns auth, invalid id, and not-found errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await PATCH(req('PATCH', { name: 'Route' }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await PATCH(req('PATCH', { name: 'Route' }), ctx('0'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });

    mocks.getRoute.mockReturnValue(null);
    const missingResponse = await PATCH(req('PATCH', { name: 'Route' }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not found' });
  });

  it.each([
    [{ name: 12 }, 'name must be a string'],
    [{ name: '   ' }, 'name is required'],
    [{ completed: 'yes' }, 'completed must be boolean'],
    [{ completed_date: '2025/05/21' }, 'completed_date must be YYYY-MM-DD or null'],
    [{ order_index: -1 }, 'order_index must be a non-negative integer'],
    [{ order_index: 1.5 }, 'order_index must be a non-negative integer'],
    [{ notes: 12 }, 'notes must be a string or null'],
    [{ notes: 'x'.repeat(10_001) }, 'notes too long (max 10000)'],
  ] satisfies Array<[Body, string]>)('rejects malformed route patch %j', async (body, error) => {
    const response = await PATCH(req('PATCH', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('updates all mutable route fields and records activity', async () => {
    const response = await PATCH(req('PATCH', {
      name: '  Updated route  ',
      completed: true,
      completed_date: '2025-05-21',
      order_index: 2,
      notes: '',
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ route: routeRow({ completed: 1, completed_date: '2025-05-21' }) });
    expect(mocks.updateRoute).toHaveBeenCalledWith(ROUTE_ID, {
      name: 'Updated route',
      completed: true,
      completed_date: '2025-05-21',
      order_index: 2,
      notes: null,
    });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.route-update',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Updated route',
      payload: { route_id: ROUTE_ID, completed: true },
    });
  });

  it('still returns the updated route when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await PATCH(req('PATCH', { completed: false }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ route: routeRow({ completed: 1, completed_date: '2025-05-21' }) });
    expect(consoleSpy).toHaveBeenCalledWith(`[route:${ROUTE_ID}] activity log failed:`, 'activity failed');
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/route/[routeId]', () => {
  it('returns auth and invalid id errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await DELETE(req('DELETE'), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await DELETE(req('DELETE'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid id' });
  });

  it('returns not found when deletion reports no removed row', async () => {
    mocks.deleteRoute.mockReturnValue(false);
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('deletes an existing route and records activity with completion state', async () => {
    mocks.getRoute.mockReturnValue(routeRow({ completed: 1 }));
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteRoute).toHaveBeenCalledWith(ROUTE_ID);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.route-delete',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Deleted route',
      payload: { route_id: ROUTE_ID, completed: true },
    });
  });

  it('handles inconsistent delete success when the route snapshot is absent', async () => {
    mocks.getRoute.mockReturnValue(null);
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.route-delete',
      entity: 'vn',
      entityId: null,
      label: 'Deleted route',
      payload: { route_id: ROUTE_ID, completed: undefined },
    });
  });

  it('still deletes the route when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await DELETE(req('DELETE'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(consoleSpy).toHaveBeenCalledWith(`[route:${ROUTE_ID}] activity log failed:`, 'activity failed');
    consoleSpy.mockRestore();
  });
});
