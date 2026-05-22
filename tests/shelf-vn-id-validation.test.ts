/**
 * NEW-TCO-003 / R5-094 / R5-095 behavioral: shelf slot + display routes
 * reject malformed `vn_id` values with HTTP 400.
 *
 * Exercises the route handler directly with a loopback request so the
 * auth gate passes, then sends an invalid vn_id in a valid body shape
 * and asserts 400 with `error: 'invalid vn_id'`. Replaces the prior
 * source-pin test that asserted the regex literal as a string.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { createShelf } from '@/lib/db';
import { POST as slotsPOST } from '@/app/api/shelves/[id]/slots/route';
import { POST as displaysPOST } from '@/app/api/shelves/[id]/displays/route';

function loopbackReq(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

let shelfId: number;

beforeAll(() => {
  const shelf = createShelf({ name: 'vn_id-validation-test', cols: 3, rows: 3 });
  shelfId = shelf.id;
});

describe('shelf slots route — vn_id validation (R5-094)', () => {
  const validBody = (vn_id: string) => ({
    row: 0,
    col: 0,
    vn_id,
    release_id: `synthetic:${vn_id}`,
  });

  it('rejects vn_id "invalid-format" with 400', async () => {
    const res = await slotsPOST(
      loopbackReq(`/api/shelves/${shelfId}/slots`, validBody('invalid-format')),
      ctx(String(shelfId)),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid vn_id');
  });

  it('rejects vn_id "0.0.0.0" with 400', async () => {
    const res = await slotsPOST(
      loopbackReq(`/api/shelves/${shelfId}/slots`, validBody('0.0.0.0')),
      ctx(String(shelfId)),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid vn_id');
  });

  it('rejects vn_id "egs_" (no digits) with 400', async () => {
    const res = await slotsPOST(
      loopbackReq(`/api/shelves/${shelfId}/slots`, validBody('egs_')),
      ctx(String(shelfId)),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid vn_id');
  });
});

describe('shelf displays route — vn_id validation (R5-095)', () => {
  const validBody = (vn_id: string) => ({
    after_row: 0,
    position: 0,
    vn_id,
    release_id: `synthetic:${vn_id}`,
  });

  it('rejects vn_id "invalid-format" with 400', async () => {
    const res = await displaysPOST(
      loopbackReq(`/api/shelves/${shelfId}/displays`, validBody('invalid-format')),
      ctx(String(shelfId)),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid vn_id');
  });

  it('rejects vn_id "../etc/passwd" with 400', async () => {
    const res = await displaysPOST(
      loopbackReq(`/api/shelves/${shelfId}/displays`, validBody('../etc/passwd')),
      ctx(String(shelfId)),
    );
    expect(res.status).toBe(400);
    const body = await res.json() as { error: string };
    expect(body.error).toBe('invalid vn_id');
  });
});
