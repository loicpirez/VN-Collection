import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as postShelf } from '@/app/api/shelves/route';
import { PATCH as patchShelf } from '@/app/api/shelves/[id]/route';
import { POST as postVnRoute } from '@/app/api/collection/[id]/routes/route';
import { PATCH as patchVnRoute } from '@/app/api/route/[routeId]/route';
import { POST as postSeries } from '@/app/api/series/route';
import { PATCH as patchSeries } from '@/app/api/series/[id]/route';
import {
  addToCollection,
  createRoute,
  createSeries,
  createShelf,
  getRoute,
  getSeries,
  getShelf,
  upsertVn,
} from '@/lib/db';

function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('metadata mutation boundaries', () => {
  it('rejects shelf names longer than the persisted maximum', async () => {
    const response = await postShelf(jsonRequest('/api/shelves', 'POST', { name: 's'.repeat(101) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name too long (max 100)' });
  });

  it('rejects malformed shelf rename values without changing the shelf', async () => {
    const shelf = createShelf({ name: 'Original shelf' });
    const response = await patchShelf(
      jsonRequest(`/api/shelves/${shelf.id}`, 'PATCH', { name: { invalid: true } }),
      { params: Promise.resolve({ id: String(shelf.id) }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name must be a string' });
    expect(getShelf(shelf.id)?.name).toBe('Original shelf');
  });

  it('rejects route names longer than the persisted maximum', async () => {
    const vnId = 'v99871';
    upsertVn({ id: vnId, title: 'Route fixture' });
    addToCollection(vnId);
    const response = await postVnRoute(
      jsonRequest(`/api/collection/${vnId}/routes`, 'POST', { name: 'r'.repeat(201) }),
      { params: Promise.resolve({ id: vnId }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name too long (max 200)' });
  });

  it('rejects oversized route renames without changing the route', async () => {
    const route = createRoute('v99871', 'Original route');
    const response = await patchVnRoute(
      jsonRequest(`/api/route/${route.id}`, 'PATCH', { name: 'r'.repeat(201) }),
      { params: Promise.resolve({ routeId: String(route.id) }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name too long (max 200)' });
    expect(getRoute(route.id)?.name).toBe('Original route');
  });

  it('rejects series names longer than the persisted maximum', async () => {
    const response = await postSeries(jsonRequest('/api/series', 'POST', { name: 's'.repeat(201) }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name too long (max 200)' });
  });

  it('persists normalized series descriptions on create and update', async () => {
    const createdResponse = await postSeries(jsonRequest('/api/series', 'POST', {
      name: 'Normalized series',
      description: '  Initial description  ',
    }));
    expect(createdResponse.status).toBe(200);
    const created = await createdResponse.json() as { series: { id: number; description: string | null } };
    expect(created.series.description).toBe('Initial description');

    const updateResponse = await patchSeries(
      jsonRequest(`/api/series/${created.series.id}`, 'PATCH', { description: '  Updated description  ' }),
      { params: Promise.resolve({ id: String(created.series.id) }) },
    );
    expect(updateResponse.status).toBe(200);
    expect(getSeries(created.series.id)?.description).toBe('Updated description');
  });

  it('rejects oversized series renames without changing the series', async () => {
    const series = createSeries('Original series');
    const response = await patchSeries(
      jsonRequest(`/api/series/${series.id}`, 'PATCH', { name: 's'.repeat(201) }),
      { params: Promise.resolve({ id: String(series.id) }) },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'name too long (max 200)' });
    expect(getSeries(series.id)?.name).toBe('Original series');
  });
});
