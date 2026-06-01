import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/places/[id]/link/route';
import { createPlace, db } from '@/lib/db';

const PREFIX = '__test_place_link_route_';

function request(placeId: number, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/places/${placeId}/link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  db.prepare('DELETE FROM place_registry WHERE name LIKE ?').run(`${PREFIX}%`);
});

describe('place-provider link route validation', () => {
  it('rejects malformed explicit source-place ids instead of treating them as omitted', async () => {
    const id = createPlace({ name: `${PREFIX}target` });
    const response = await POST(request(id, { provider_label: 'Branch A', from_place_id: '1' }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(response.status).toBe(400);
  });

  it('rejects unbounded provider labels', async () => {
    const id = createPlace({ name: `${PREFIX}label` });
    const response = await POST(request(id, { provider_label: 'x'.repeat(201) }), {
      params: Promise.resolve({ id: String(id) }),
    });
    expect(response.status).toBe(400);
  });
});
