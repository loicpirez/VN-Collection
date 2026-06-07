import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { addGameLogEntry, addToCollection, db, upsertVn } from '@/lib/db';
import {
  GET as gameLogGET,
  POST as gameLogPOST,
  PATCH as gameLogPATCH,
  DELETE as gameLogDELETE,
} from '@/app/api/collection/[id]/game-log/route';
import {
  POST as bannerPOST,
  PATCH as bannerPATCH,
  DELETE as bannerDELETE,
} from '@/app/api/collection/[id]/banner/route';
import {
  POST as coverPOST,
  PATCH as coverPATCH,
  DELETE as coverDELETE,
} from '@/app/api/collection/[id]/cover/route';

const VN = 'v90102';
const ABSENT = 'v90103';

function localReq(path: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ctx(id = VN) {
  return { params: Promise.resolve({ id }) };
}

function clear(): void {
  db.prepare('DELETE FROM vn_game_log WHERE vn_id IN (?, ?)').run(VN, ABSENT);
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(VN, ABSENT);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(VN, ABSENT);
}

beforeEach(() => {
  clear();
  upsertVn({ id: VN, title: 'Synthetic Media' });
  addToCollection(VN, { status: 'playing' });
});

afterEach(clear);

describe('GET /api/collection/[id]/game-log', () => {
  it('400 on an invalid vn id', async () => {
    const res = await gameLogGET(localReq('/api/collection/x/game-log', 'GET'), ctx('not-valid'));
    expect(res.status).toBe(400);
  });

  it('404 when the VN is not in collection', async () => {
    const res = await gameLogGET(localReq('/api/collection/v90103/game-log', 'GET'), ctx(ABSENT));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not in collection' });
  });

  it('200 with the entries array', async () => {
    addGameLogEntry(VN, 'route A started');
    const res = await gameLogGET(localReq('/api/collection/v90102/game-log', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].note).toBe('route A started');
  });
});

describe('POST /api/collection/[id]/game-log', () => {
  it('400 when note is missing', async () => {
    const res = await gameLogPOST(localReq('/api/collection/v90102/game-log', 'POST', {}), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('note required');
  });

  it('404 when the VN is not in collection', async () => {
    const res = await gameLogPOST(localReq('/api/collection/v90103/game-log', 'POST', { note: 'hi' }), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('200 and returns the persisted entry', async () => {
    const res = await gameLogPOST(localReq('/api/collection/v90102/game-log', 'POST', { note: 'chapter 4 cleared', session_minutes: 90 }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.note).toBe('chapter 4 cleared');
    expect(body.entry.session_minutes).toBe(90);
  });
});

describe('PATCH /api/collection/[id]/game-log', () => {
  it('400 when entry id is missing', async () => {
    const res = await gameLogPATCH(localReq('/api/collection/v90102/game-log', 'PATCH', { note: 'x' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('entry id required');
  });

  it('404 when the entry id does not exist', async () => {
    const res = await gameLogPATCH(localReq('/api/collection/v90102/game-log', 'PATCH', { id: 999999, note: 'x' }), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'entry not found' });
  });

  it('200 and returns the updated entry', async () => {
    const entry = addGameLogEntry(VN, 'original');
    const res = await gameLogPATCH(localReq('/api/collection/v90102/game-log', 'PATCH', { id: entry.id, note: 'edited' }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).entry.note).toBe('edited');
  });
});

describe('DELETE /api/collection/[id]/game-log', () => {
  it('400 when the entry query param is absent', async () => {
    const res = await gameLogDELETE(localReq('/api/collection/v90102/game-log', 'DELETE'), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('entry required');
  });

  it('404 when the entry id is unknown', async () => {
    const res = await gameLogDELETE(localReq('/api/collection/v90102/game-log?entry=424242', 'DELETE'), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'entry not found' });
  });

  it('200 with { ok: true } after deleting a real entry', async () => {
    const entry = addGameLogEntry(VN, 'to delete');
    const res = await gameLogDELETE(localReq(`/api/collection/v90102/game-log?entry=${entry.id}`, 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/collection/[id]/banner', () => {
  it('404 when the VN is not in collection', async () => {
    const res = await bannerPOST(localReq('/api/collection/v90103/banner', 'POST', { source: 'cover' }), ctx(ABSENT));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not in collection' });
  });

  it('400 on an unknown source', async () => {
    const res = await bannerPOST(localReq('/api/collection/v90102/banner', 'POST', { source: 'bogus' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid source');
  });

  it('400 on a url source that is not an allowed host', async () => {
    const res = await bannerPOST(localReq('/api/collection/v90102/banner', 'POST', { source: 'url', value: 'http://127.0.0.1/evil.png' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid url');
  });

  it('200 and clears the banner when source=cover has no image', async () => {
    const res = await bannerPOST(localReq('/api/collection/v90102/banner', 'POST', { source: 'cover' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.banner).toBeNull();
    expect(body.item).not.toBeNull();
  });
});

describe('PATCH /api/collection/[id]/banner', () => {
  it('400 when neither position nor rotation is supplied', async () => {
    const res = await bannerPATCH(localReq('/api/collection/v90102/banner', 'PATCH', {}), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('missing position or rotation');
  });

  it('400 on a malformed position string', async () => {
    const res = await bannerPATCH(localReq('/api/collection/v90102/banner', 'PATCH', { position: 'left top' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/position must be/);
  });

  it('200 when a valid position is supplied', async () => {
    const res = await bannerPATCH(localReq('/api/collection/v90102/banner', 'PATCH', { position: '50% 25%' }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).item).not.toBeNull();
  });
});

describe('DELETE /api/collection/[id]/banner', () => {
  it('404 when the VN is not in collection', async () => {
    const res = await bannerDELETE(localReq('/api/collection/v90103/banner', 'DELETE'), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('200 and resets the banner', async () => {
    const res = await bannerDELETE(localReq('/api/collection/v90102/banner', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).item).not.toBeNull();
  });
});

describe('POST /api/collection/[id]/cover', () => {
  it('404 when the VN is not in collection', async () => {
    const res = await coverPOST(localReq('/api/collection/v90103/cover', 'POST', { source: 'url', value: 'https://t.vndb.org/cv/x.jpg' }), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('400 on an invalid path source value', async () => {
    const res = await coverPOST(localReq('/api/collection/v90102/cover', 'POST', { source: 'path', value: '../../etc/passwd' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid path');
  });

  it('400 on an unknown source', async () => {
    const res = await coverPOST(localReq('/api/collection/v90102/cover', 'POST', { source: 'nope' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid source');
  });
});

describe('PATCH /api/collection/[id]/cover (rotation)', () => {
  it('400 on an invalid vn id', async () => {
    const res = await coverPATCH(localReq('/api/collection/x/cover', 'PATCH', { rotation: 90 }), ctx('not-valid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid vn id' });
  });

  it('404 when the VN is not in collection', async () => {
    const res = await coverPATCH(localReq('/api/collection/v90103/cover', 'PATCH', { rotation: 90 }), ctx(ABSENT));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not in collection' });
  });

  it('400 when rotation is not a number', async () => {
    const res = await coverPATCH(localReq('/api/collection/v90102/cover', 'PATCH', { rotation: 'sideways' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('rotation must be a number');
  });

  it('200 and normalises the rotation', async () => {
    const res = await coverPATCH(localReq('/api/collection/v90102/cover', 'PATCH', { rotation: 90 }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).rotation).toBe(90);
  });
});

describe('DELETE /api/collection/[id]/cover', () => {
  it('400 on an invalid vn id', async () => {
    const res = await coverDELETE(localReq('/api/collection/x/cover', 'DELETE'), ctx('not-valid'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid vn id' });
  });

  it('404 when the VN is not in collection', async () => {
    const res = await coverDELETE(localReq('/api/collection/v90103/cover', 'DELETE'), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('200 and resets the cover', async () => {
    const res = await coverDELETE(localReq('/api/collection/v90102/cover', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).item).not.toBeNull();
  });
});
