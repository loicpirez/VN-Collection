import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { DELETE as deleteSavedFilter } from '@/app/api/saved-filters/route';
import { PATCH as patchShelves } from '@/app/api/shelves/route';
import { GET as getShelf } from '@/app/api/shelves/[id]/route';
import { POST as postShelfSlot } from '@/app/api/shelves/[id]/slots/route';
import { PATCH as patchVndbStatus } from '@/app/api/vn/[id]/vndb-status/route';
import { createShelf } from '@/lib/db';

const ROOT = join(__dirname, '..');
const UNSAFE_INTEGER = Number.MAX_SAFE_INTEGER + 1;

function jsonRequest(path: string, method: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('safe integer API boundaries', () => {
  it('rejects unsafe path and query identifiers', async () => {
    const shelfResponse = await getShelf(
      new NextRequest(`http://127.0.0.1/api/shelves/${UNSAFE_INTEGER}`),
      { params: Promise.resolve({ id: String(UNSAFE_INTEGER) }) },
    );
    expect(shelfResponse.status).toBe(400);
    const savedFilterResponse = await deleteSavedFilter(new NextRequest(
      `http://127.0.0.1/api/saved-filters?id=${UNSAFE_INTEGER}`,
      { method: 'DELETE' },
    ));
    expect(savedFilterResponse.status).toBe(400);
  });

  it('rejects unsafe reorder and coordinate values', async () => {
    const reorderResponse = await patchShelves(jsonRequest('/api/shelves', 'PATCH', {
      order: [UNSAFE_INTEGER],
    }));
    expect(reorderResponse.status).toBe(400);
    const shelf = createShelf({ name: `Safe integer fixture ${Date.now()}` });
    const slotResponse = await postShelfSlot(
      jsonRequest(`/api/shelves/${shelf.id}/slots`, 'POST', {
        row: UNSAFE_INTEGER,
        col: 0,
        vn_id: 'v1',
        release_id: 'synthetic:v1',
      }),
      { params: Promise.resolve({ id: String(shelf.id) }) },
    );
    expect(slotResponse.status).toBe(400);
  });

  it('rejects unsafe VNDB label identifiers', async () => {
    const response = await patchVndbStatus(
      jsonRequest('/api/vn/v1/vndb-status', 'PATCH', { labels_set: [UNSAFE_INTEGER] }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(response.status).toBe(400);
  });

  it('does not leave weaker integer predicates in API routes', () => {
    const files = [
      'src/app/api/egs/[id]/add/route.ts',
      'src/app/api/lists/[id]/route.ts',
      'src/app/api/lists/[id]/items/route.ts',
      'src/app/api/places/[id]/route.ts',
      'src/app/api/route/[routeId]/route.ts',
      'src/app/api/saved-filters/route.ts',
      'src/app/api/series/[id]/route.ts',
      'src/app/api/shelves/route.ts',
      'src/app/api/shelves/[id]/route.ts',
      'src/app/api/shelves/[id]/slots/route.ts',
      'src/app/api/vn/[id]/vndb-status/route.ts',
    ];
    for (const file of files) {
      expect(readFileSync(join(ROOT, file), 'utf8')).not.toContain('Number.isInteger(');
    }
  });
});
