import { beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/saved-filters/route';
import { createSavedFilter, db, listSavedFilters } from '@/lib/db';

function request(body: unknown): NextRequest {
  return new NextRequest('http://127.0.0.1/api/saved-filters', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  db.prepare('DELETE FROM saved_filter').run();
});

describe('saved-filter validation', () => {
  it('persists normalized route values', async () => {
    const response = await POST(request({ name: '  Fixture filter  ', params: '  status=planning  ' }));
    expect(response.status).toBe(200);
    expect((await response.json()).filter).toMatchObject({
      name: 'Fixture filter',
      params: 'status=planning',
    });
  });

  it('rejects values longer than the supported persisted limits', async () => {
    const longNameResponse = await POST(request({ name: 'n'.repeat(61), params: '' }));
    expect(longNameResponse.status).toBe(400);
    expect(await longNameResponse.json()).toEqual({ error: 'name too long (max 60)' });
    const longParamsResponse = await POST(request({ name: 'Fixture', params: 'p'.repeat(2001) }));
    expect(longParamsResponse.status).toBe(400);
    expect(await longParamsResponse.json()).toEqual({ error: 'params too long (max 2000)' });
    expect(listSavedFilters()).toEqual([]);
  });

  it('does not silently truncate direct helper values', () => {
    const created = createSavedFilter('n'.repeat(61), 'p'.repeat(2001));
    expect(created.name).toHaveLength(61);
    expect(created.params).toHaveLength(2001);
  });
});
