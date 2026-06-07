import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addGameLogEntry: vi.fn(),
  deleteGameLogEntry: vi.fn(),
  isInCollection: vi.fn(),
  listGameLogForVn: vi.fn(),
  readBodyWithLimit: vi.fn(),
  recordActivity: vi.fn(),
  requireLocalhostOrToken: vi.fn(),
  updateGameLogEntry: vi.fn(),
}));

vi.mock('@/lib/auth-gate', () => ({
  requireLocalhostOrToken: mocks.requireLocalhostOrToken,
}));

vi.mock('@/lib/db', () => ({
  addGameLogEntry: mocks.addGameLogEntry,
  deleteGameLogEntry: mocks.deleteGameLogEntry,
  isInCollection: mocks.isInCollection,
  listGameLogForVn: mocks.listGameLogForVn,
  updateGameLogEntry: mocks.updateGameLogEntry,
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
  POST,
} from '@/app/api/collection/[id]/game-log/route';

const VN_ID = 'v990501';
const ENTRY_ID = 23;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type Body = Record<string, JsonValue>;
type Entry = {
  id: number;
  vn_id: string;
  note: string;
  logged_at: number;
  session_minutes: number | null;
};

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: ENTRY_ID,
    vn_id: VN_ID,
    note: 'Progress note',
    logged_at: 1_700_000_000_000,
    session_minutes: 30,
    ...overrides,
  };
}

function ctx(id = VN_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(method: string, body?: Body, url = `http://127.0.0.1/api/collection/${VN_ID}/game-log`): NextRequest {
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
  mocks.listGameLogForVn.mockReturnValue([entry()]);
  mocks.addGameLogEntry.mockReturnValue(entry());
  mocks.updateGameLogEntry.mockReturnValue(entry());
  mocks.deleteGameLogEntry.mockReturnValue(true);
  mocks.readBodyWithLimit.mockImplementation(async (request: Request) => Buffer.from(await request.arrayBuffer()));
});

describe('GET /api/collection/[id]/game-log', () => {
  it('rejects invalid ids and missing collection rows', async () => {
    const invalidResponse = await GET(req('GET'), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await GET(req('GET'), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it('returns the bounded game-log list', async () => {
    const response = await GET(req('GET'), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entries: [entry()] });
    expect(mocks.listGameLogForVn).toHaveBeenCalledWith(VN_ID, 200);
  });
});

describe('POST /api/collection/[id]/game-log', () => {
  it('returns the auth gate response before validating the body', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValue(denied);
    const response = await POST(req('POST', { note: 'Progress' }), ctx());
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'forbidden' });
  });

  it.each([
    [{}, 'note required'],
    [{ note: '   ' }, 'note required'],
    [{ note: 12 }, 'note required'],
    [{ note: 'x'.repeat(10_001) }, 'note too long (max 10000)'],
  ] satisfies Array<[Body, string]>)('rejects invalid note bodies %j', async (body, error) => {
    const response = await POST(req('POST', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('rejects invalid ids and missing collection rows after body validation', async () => {
    const invalidResponse = await POST(req('POST', { note: 'Progress' }), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await POST(req('POST', { note: 'Progress' }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it.each([
    [{ note: 'Progress', logged_at: 'bad-date' }, 'logged_at must be an ISO-8601 date'],
    [{ note: 'Progress', session_minutes: -1 }, 'session_minutes must be between 0 and 100000'],
    [{ note: 'Progress', session_minutes: 1.5 }, 'session_minutes must be an integer'],
  ] satisfies Array<[Body, string]>)('rejects invalid optional fields %j', async (body, error) => {
    const response = await POST(req('POST', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('returns 500 when the game-log insert fails', async () => {
    mocks.addGameLogEntry.mockImplementation(() => {
      throw new Error('insert failed');
    });
    const response = await POST(req('POST', { note: 'Progress' }), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'could not add entry' });
  });

  it('adds a valid entry and maps zero-minute sessions to null', async () => {
    const response = await POST(req('POST', {
      note: 'Progress',
      logged_at: '2025-05-21T00:00:00.000Z',
      session_minutes: 0,
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: entry() });
    expect(mocks.addGameLogEntry).toHaveBeenCalledWith(VN_ID, 'Progress', Date.parse('2025-05-21T00:00:00.000Z'), null);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.game-log-add',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Added game-log entry',
      payload: { minutes: null, hasNote: true },
    });
  });

  it('keeps the response successful when activity logging fails after insert', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.recordActivity.mockImplementation(() => {
      throw new Error('activity failed');
    });
    const response = await POST(req('POST', { note: 'Progress', session_minutes: 10 }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: entry() });
    expect(consoleSpy).toHaveBeenCalledWith(`[game-log:${VN_ID}] activity log failed:`, 'activity failed');
    consoleSpy.mockRestore();
  });
});

describe('PATCH /api/collection/[id]/game-log', () => {
  it('returns auth, id, and collection validation errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await PATCH(req('PATCH', { id: ENTRY_ID }), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await PATCH(req('PATCH', { id: ENTRY_ID }), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValue(false);
    const missingResponse = await PATCH(req('PATCH', { id: ENTRY_ID }), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });
  });

  it.each([
    [{}, 'entry id required'],
    [{ id: -1 }, 'entry id required'],
    [{ id: ENTRY_ID, note: 12 }, 'note must be a string'],
    [{ id: ENTRY_ID, note: 'x'.repeat(10_001) }, 'note too long (max 10000)'],
    [{ id: ENTRY_ID, logged_at: 'bad-date' }, 'logged_at must be an ISO-8601 date'],
    [{ id: ENTRY_ID, session_minutes: -1 }, 'session_minutes must be between 0 and 100000'],
  ] satisfies Array<[Body, string]>)('rejects malformed update body %j', async (body, error) => {
    const response = await PATCH(req('PATCH', body), ctx());
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('returns 404 when the target entry does not belong to the VN', async () => {
    mocks.updateGameLogEntry.mockReturnValue(null);
    const response = await PATCH(req('PATCH', { id: ENTRY_ID, note: 'Changed' }), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'entry not found' });
  });

  it('returns 500 when updating the entry throws', async () => {
    mocks.updateGameLogEntry.mockImplementation(() => {
      throw new Error('update failed');
    });
    const response = await PATCH(req('PATCH', { id: ENTRY_ID, note: 'Changed' }), ctx());
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'could not update entry' });
  });

  it('updates nullable session minutes and derives activity payload from the patch', async () => {
    mocks.updateGameLogEntry.mockReturnValue(entry({ note: '', session_minutes: null }));
    const response = await PATCH(req('PATCH', {
      id: ENTRY_ID,
      note: '',
      logged_at: 1_700_000_001_000,
      session_minutes: null,
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: entry({ note: '', session_minutes: null }) });
    expect(mocks.updateGameLogEntry).toHaveBeenCalledWith(VN_ID, ENTRY_ID, {
      note: '',
      logged_at: 1_700_000_001_000,
      session_minutes: null,
    });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.game-log-update',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Updated game-log entry',
      payload: { minutes: null, hasNote: false },
    });
  });

  it('updates positive session minutes and uses the returned note when note is omitted', async () => {
    mocks.updateGameLogEntry.mockReturnValue(entry({ note: 'Kept note', session_minutes: 45 }));
    const response = await PATCH(req('PATCH', {
      id: ENTRY_ID,
      session_minutes: 45,
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: entry({ note: 'Kept note', session_minutes: 45 }) });
    expect(mocks.updateGameLogEntry).toHaveBeenCalledWith(VN_ID, ENTRY_ID, {
      session_minutes: 45,
    });
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.game-log-update',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Updated game-log entry',
      payload: { minutes: 45, hasNote: true },
    });
  });

  it('maps zero-minute update payloads to null session minutes', async () => {
    mocks.updateGameLogEntry.mockReturnValue(entry({ session_minutes: null }));
    const response = await PATCH(req('PATCH', {
      id: ENTRY_ID,
      session_minutes: 0,
    }), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ entry: entry({ session_minutes: null }) });
    expect(mocks.updateGameLogEntry).toHaveBeenCalledWith(VN_ID, ENTRY_ID, {
      session_minutes: null,
    });
  });
});

describe('DELETE /api/collection/[id]/game-log', () => {
  it('returns auth, id, collection, and entry validation errors', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 });
    mocks.requireLocalhostOrToken.mockReturnValueOnce(denied);
    const deniedResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/game-log?entry=${ENTRY_ID}`), ctx());
    expect(deniedResponse.status).toBe(403);
    await expect(deniedResponse.json()).resolves.toEqual({ error: 'forbidden' });

    const invalidResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/game-log?entry=${ENTRY_ID}`), ctx('bad'));
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toEqual({ error: 'invalid vn id' });

    mocks.isInCollection.mockReturnValueOnce(false);
    const missingResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/game-log?entry=${ENTRY_ID}`), ctx());
    expect(missingResponse.status).toBe(404);
    await expect(missingResponse.json()).resolves.toEqual({ error: 'not in collection' });

    const badEntryResponse = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/game-log?entry=0`), ctx());
    expect(badEntryResponse.status).toBe(400);
    await expect(badEntryResponse.json()).resolves.toEqual({ error: 'entry required' });
  });

  it('returns 404 when the entry cannot be deleted for the VN', async () => {
    mocks.deleteGameLogEntry.mockReturnValue(false);
    const response = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/game-log?entry=${ENTRY_ID}`), ctx());
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'entry not found' });
  });

  it('deletes the target entry and records activity', async () => {
    const response = await DELETE(req('DELETE', undefined, `http://127.0.0.1/api/collection/${VN_ID}/game-log?entry=${ENTRY_ID}`), ctx());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteGameLogEntry).toHaveBeenCalledWith(VN_ID, ENTRY_ID);
    expect(mocks.recordActivity).toHaveBeenCalledWith({
      kind: 'collection.game-log-delete',
      entity: 'vn',
      entityId: VN_ID,
      label: 'Deleted game-log entry',
      payload: { minutes: null, hasNote: false },
    });
  });
});
