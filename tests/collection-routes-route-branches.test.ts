import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRoute: vi.fn(),
  isInCollection: vi.fn(),
  listRoutesForVn: vi.fn(),
  readBodyWithLimit: vi.fn(),
  recordActivity: vi.fn(),
  reorderRoutes: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  createRoute: mocks.createRoute,
  isInCollection: mocks.isInCollection,
  listRoutesForVn: mocks.listRoutesForVn,
  reorderRoutes: mocks.reorderRoutes,
}));

vi.mock('@/lib/activity', () => ({
  recordActivity: mocks.recordActivity,
}));

vi.mock('@/lib/read-limited-body', () => ({
  readBodyWithLimit: mocks.readBodyWithLimit,
}));

import {
  GET,
  PATCH,
  POST,
} from '@/app/api/collection/[id]/routes/route';

const VN_ID = 'v990701';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type RouteRow = {
  id: number;
  vn_id: string;
  name: string;
  completed: boolean;
  order_index: number;
};

function routeRow(overrides: Partial<RouteRow> = {}): RouteRow {
  return {
    id: 12,
    vn_id: VN_ID,
    name: 'Heroine route',
    completed: false,
    order_index: 0,
    ...overrides,
  };
}

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, body?: Body): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/collection/${VN_ID}/routes`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.isInCollection.mockReturnValue(true);
  mocks.createRoute.mockReturnValue(routeRow());
  mocks.listRoutesForVn.mockReturnValue([routeRow()]);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
});

describe('GET /api/collection/[id]/routes', () => {
  it('rejects invalid ids and missing collection rows', async () => {
    const invalidResponse = await GET(req('GET'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await GET(req('GET'), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('returns routes for the VN', async () => {
    const response = await GET(req('GET'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ routes: [routeRow()] });
    expect(mocks.listRoutesForVn).toHaveBeenCalledWith(VN_ID);
  });
});

describe('POST /api/collection/[id]/routes', () => {
  it('returns auth, invalid id, and missing collection errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await POST(req('POST', { name: 'Route' }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await POST(req('POST', { name: 'Route' }), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await POST(req('POST', { name: 'Route' }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it.each([
    [{}, 'name must be a string'],
    [{ name: '   ' }, 'name is required'],
    [{ name: 'x'.repeat(201) }, 'name too long (max 200)'],
  ] satisfies Array<[Body, string]>)('rejects invalid route names %j', async (body, error) => {
    const response = await POST(req('POST', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('creates a route and records activity', async () => {
    const response = await POST(req('POST', { name: '  Heroine route  ' }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ route: routeRow(), routes: [routeRow()] });
    expect(mocks.createRoute).toHaveBeenCalledWith(VN_ID, 'Heroine route');
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.route-add',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Added route',
      payload: { route_id: 12, completed: false },
    });
  });

  it('still creates a route when activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await POST(req('POST', { name: 'Route' }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ route: routeRow(), routes: [routeRow()] });
    expect(consoleSpy).toHaveBeenCalledWith(`[routes:${VN_ID}] activity log failed:`, 'activity failed');
    consoleSpy.mockRestore();
  });
});

describe('PATCH /api/collection/[id]/routes', () => {
  it('returns auth, invalid id, and missing collection errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await PATCH(req('PATCH', { ids: [12] }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await PATCH(req('PATCH', { ids: [12] }), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await PATCH(req('PATCH', { ids: [12] }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it.each([
    [{}, 'ids must be array of positive integers (max 1000)'],
    [{ ids: [0] }, 'ids must be array of positive integers (max 1000)'],
    [{ ids: [1.5] }, 'ids must be array of positive integers (max 1000)'],
    [{ ids: Array.from({ length: 1001 }, (_value, index) => index + 1) }, 'ids must be array of positive integers (max 1000)'],
    [{ ids: [12, 12] }, 'ids must not contain duplicates'],
  ] satisfies Array<[Body, string]>)('rejects invalid reorder bodies %j', async (body, error) => {
    const response = await PATCH(req('PATCH', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('reorders routes and records activity', async () => {
    const response = await PATCH(req('PATCH', { ids: [12, 13] }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ routes: [routeRow()] });
    expect(mocks.reorderRoutes).toHaveBeenCalledWith(VN_ID, [12, 13]);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.route-update',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Reordered routes',
      payload: { count: 2 },
    });
  });

  it('still returns routes when reorder activity logging fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await PATCH(req('PATCH', { ids: [12] }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ routes: [routeRow()] });
    expect(consoleSpy).toHaveBeenCalledWith(`[routes:${VN_ID}] activity log failed:`, 'activity failed');
    consoleSpy.mockRestore();
  });
});
