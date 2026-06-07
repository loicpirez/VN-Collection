import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addManualActivity: vi.fn(),
  deleteActivityForVn: vi.fn(),
  isInCollection: vi.fn(),
  listActivityForVn: vi.fn(),
  readBodyWithLimit: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  addManualActivity: mocks.addManualActivity,
  deleteActivityForVn: mocks.deleteActivityForVn,
  isInCollection: mocks.isInCollection,
  listActivityForVn: mocks.listActivityForVn,
}));

vi.mock('@/lib/read-limited-body', () => ({
  readBodyWithLimit: mocks.readBodyWithLimit,
}));

import {
  DELETE,
  GET,
  POST,
} from '@/app/api/collection/[id]/activity/route';

const VN_ID = 'v990601';
const ENTRY_ID = 31;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type ActivityEntry = {
  id: number;
  vn_id: string;
  kind: string;
  label: string;
  occurred_at: number;
};

function entry(): ActivityEntry {
  return {
    id: ENTRY_ID,
    vn_id: VN_ID,
    kind: 'manual',
    label: 'Manual note',
    occurred_at: 1_700_000_000_000,
  };
}

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, body?: Body, url = `http://127.0.0.1/api/collection/${VN_ID}/activity`): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireLocalhostOrToken.mockReturnValue(null);
  mocks.isInCollection.mockReturnValue(true);
  mocks.listActivityForVn.mockReturnValue([entry()]);
  mocks.addManualActivity.mockReturnValue(entry());
  mocks.deleteActivityForVn.mockReturnValue(true);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
});

describe('GET /api/collection/[id]/activity', () => {
  it('returns auth, invalid id, and missing collection errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await GET(req('GET'), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await GET(req('GET'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await GET(req('GET'), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('returns the bounded activity list', async () => {
    const response = await GET(req('GET'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entries: [entry()] });
    expect(mocks.listActivityForVn).toHaveBeenCalledWith(VN_ID, 100);
  });

  it('returns a sanitized internal error when listing throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.listActivityForVn.mockImplementation(() => {
      throw new Error('db failed');
    });
    const response = await GET(req('GET'), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:collection.activity.GET] db failed');
    consoleSpy.mockRestore();
  });
});

describe('POST /api/collection/[id]/activity', () => {
  it('returns auth, invalid id, and missing collection errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await POST(req('POST', { text: 'Note' }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await POST(req('POST', { text: 'Note' }), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await POST(req('POST', { text: 'Note' }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it.each([
    [{}, 'text required'],
    [{ text: '   ' }, 'text required'],
    [{ text: 12 }, 'text required'],
    [{ text: 'x'.repeat(10_001) }, 'text too long (max 10000)'],
    [{ text: 'Note', occurred_at: 'bad-date' }, 'logged_at must be an ISO-8601 date'],
  ] satisfies Array<[Body, string]>)('rejects malformed manual activity body %j', async (body, error) => {
    const response = await POST(req('POST', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('adds a manual activity entry with an optional occurrence timestamp', async () => {
    const response = await POST(req('POST', {
      text: 'Manual note',
      occurred_at: '2025-05-21T00:00:00.000Z',
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: entry() });
    expect(mocks.addManualActivity).toHaveBeenCalledWith(VN_ID, 'Manual note', Date.parse('2025-05-21T00:00:00.000Z'));
  });

  it('returns a sanitized internal error when insert throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.addManualActivity.mockImplementation(() => {
      throw new Error('insert failed');
    });
    const response = await POST(req('POST', { text: 'Manual note' }), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:collection.activity.POST] insert failed');
    consoleSpy.mockRestore();
  });
});

describe('DELETE /api/collection/[id]/activity', () => {
  it('returns auth, invalid id, missing collection, and malformed entry errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/activity?entry=${ENTRY_ID}`), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/activity?entry=${ENTRY_ID}`), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValueOnce(false);
    const missingResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/activity?entry=${ENTRY_ID}`), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });

    const entryResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/activity?entry=0`), ctx());
    expect(entryResponse.status).toBe(400);
    await expect(entryResponse.json()).resolves.toEqual({ error: 'entry required' });
  });

  it('returns not found when the entry is absent for the VN', async () => {
    mocks.deleteActivityForVn.mockReturnValue(false);
    const response = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/activity?entry=${ENTRY_ID}`), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'not found' });
  });

  it('deletes the target manual activity entry', async () => {
    const response = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/activity?entry=${ENTRY_ID}`), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteActivityForVn).toHaveBeenCalledWith(ENTRY_ID, VN_ID);
  });

  it('returns a sanitized internal error when deletion throws', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.deleteActivityForVn.mockImplementation(() => {
      throw new Error('delete failed');
    });
    const response = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/activity?entry=${ENTRY_ID}`), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'internal error' });
    expect(consoleSpy).toHaveBeenCalledWith('[internal:collection.activity.DELETE] delete failed');
    consoleSpy.mockRestore();
  });
});
