import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { addManualActivity, addToCollection, createRoute, db, markReleaseOwned, upsertVn } from '@/lib/db';
import {
  GET as activityGET,
  POST as activityPOST,
  DELETE as activityDELETE,
} from '@/app/api/collection/[id]/activity/route';
import {
  POST as descPOST,
  PATCH as descPATCH,
  DELETE as descDELETE,
} from '@/app/api/collection/[id]/custom-description/route';
import {
  GET as routesGET,
  POST as routesPOST,
  PATCH as routesPATCH,
} from '@/app/api/collection/[id]/routes/route';
import {
  GET as sourcePrefGET,
  PATCH as sourcePrefPATCH,
} from '@/app/api/collection/[id]/source-pref/route';
import {
  GET as ownedGET,
  POST as ownedPOST,
  PATCH as ownedPATCH,
  DELETE as ownedDELETE,
} from '@/app/api/collection/[id]/owned-releases/route';

const VN = 'v90104';
const ABSENT = 'v90105';

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
  db.prepare('DELETE FROM owned_release WHERE vn_id IN (?, ?)').run(VN, ABSENT);
  db.prepare('DELETE FROM vn_route WHERE vn_id IN (?, ?)').run(VN, ABSENT);
  db.prepare('DELETE FROM collection WHERE vn_id IN (?, ?)').run(VN, ABSENT);
  db.prepare('DELETE FROM vn WHERE id IN (?, ?)').run(VN, ABSENT);
}

beforeEach(() => {
  clear();
  upsertVn({ id: VN, title: 'Synthetic Tracking' });
  addToCollection(VN, { status: 'playing' });
});

afterEach(clear);

describe('GET /api/collection/[id]/activity', () => {
  it('404 when the VN is not in collection', async () => {
    const res = await activityGET(localReq('/api/collection/v90105/activity', 'GET'), ctx(ABSENT));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not in collection' });
  });

  it('200 with the entries array', async () => {
    addManualActivity(VN, 'bought a poster');
    const res = await activityGET(localReq('/api/collection/v90104/activity', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.entries.length).toBeGreaterThanOrEqual(1);
  });
});

describe('POST /api/collection/[id]/activity', () => {
  it('400 when text is missing', async () => {
    const res = await activityPOST(localReq('/api/collection/v90104/activity', 'POST', {}), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('text required');
  });

  it('200 and returns the created entry', async () => {
    const res = await activityPOST(localReq('/api/collection/v90104/activity', 'POST', { text: 'reached true end' }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).entry).toBeTruthy();
  });
});

describe('DELETE /api/collection/[id]/activity', () => {
  it('400 when the entry query param is absent', async () => {
    const res = await activityDELETE(localReq('/api/collection/v90104/activity', 'DELETE'), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('entry required');
  });

  it('404 when the entry id is unknown', async () => {
    const res = await activityDELETE(localReq('/api/collection/v90104/activity?entry=777777', 'DELETE'), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
  });

  it('200 with { ok: true } after deleting a real manual entry', async () => {
    const entry = addManualActivity(VN, 'temp note');
    const res = await activityDELETE(localReq(`/api/collection/v90104/activity?entry=${entry.id}`, 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('custom-description PATCH/POST/DELETE', () => {
  it('404 when the VN is not in collection (PATCH)', async () => {
    const res = await descPATCH(localReq('/api/collection/v90105/custom-description', 'PATCH', { text: 'x' }), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('400 when text is not a string or null', async () => {
    const res = await descPATCH(localReq('/api/collection/v90104/custom-description', 'PATCH', { text: 42 }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('text must be a string or null');
  });

  it('200 with { ok: true } on POST with a string body', async () => {
    const res = await descPOST(localReq('/api/collection/v90104/custom-description', 'POST', { text: 'my synopsis' }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('200 with { ok: true } on DELETE', async () => {
    const res = await descDELETE(localReq('/api/collection/v90104/custom-description', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('routes GET/POST/PATCH', () => {
  it('404 when the VN is not in collection (GET)', async () => {
    const res = await routesGET(localReq('/api/collection/v90105/routes', 'GET'), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('400 when the route name is empty (POST)', async () => {
    const res = await routesPOST(localReq('/api/collection/v90104/routes', 'POST', { name: '' }), ctx());
    expect(res.status).toBe(400);
  });

  it('200 and creates a route (POST)', async () => {
    const res = await routesPOST(localReq('/api/collection/v90104/routes', 'POST', { name: 'Heroine A route' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.route.name).toBe('Heroine A route');
    expect(body.routes).toHaveLength(1);
  });

  it('400 on duplicate ids (PATCH reorder)', async () => {
    const r = createRoute(VN, 'r1');
    const res = await routesPATCH(localReq('/api/collection/v90104/routes', 'PATCH', { ids: [r.id, r.id] }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ids must not contain duplicates');
  });

  it('200 on a valid reorder (PATCH)', async () => {
    const a = createRoute(VN, 'route A');
    const b = createRoute(VN, 'route B');
    const res = await routesPATCH(localReq('/api/collection/v90104/routes', 'PATCH', { ids: [b.id, a.id] }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).routes).toHaveLength(2);
  });
});

describe('source-pref GET/PATCH', () => {
  it('404 when the VN is not in collection (GET)', async () => {
    const res = await sourcePrefGET(localReq('/api/collection/v90105/source-pref', 'GET'), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('200 with the pref map (GET)', async () => {
    const res = await sourcePrefGET(localReq('/api/collection/v90104/source-pref', 'GET'), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).pref).toBeTruthy();
  });

  it('400 on an unknown field (PATCH)', async () => {
    const res = await sourcePrefPATCH(localReq('/api/collection/v90104/source-pref', 'PATCH', { unknownField: 'vndb' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('unknown field');
  });

  it('400 on an invalid choice (PATCH)', async () => {
    const res = await sourcePrefPATCH(localReq('/api/collection/v90104/source-pref', 'PATCH', { title: 'nonsense' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid value for title');
  });

  it('200 and stores the choice (PATCH)', async () => {
    const res = await sourcePrefPATCH(localReq('/api/collection/v90104/source-pref', 'PATCH', { title: 'egs' }), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).pref.title).toBe('egs');
  });
});

describe('owned-releases GET/POST/PATCH/DELETE', () => {
  it('404 when the VN is not in collection (GET)', async () => {
    const res = await ownedGET(localReq('/api/collection/v90105/owned-releases', 'GET'), ctx(ABSENT));
    expect(res.status).toBe(404);
  });

  it('200 with the owned array (GET)', async () => {
    const res = await ownedGET(localReq('/api/collection/v90104/owned-releases', 'GET'), ctx());
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).owned)).toBe(true);
  });

  it('400 on an invalid release id (POST)', async () => {
    const res = await ownedPOST(localReq('/api/collection/v90104/owned-releases', 'POST', { release_id: 'not-a-release' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid release id');
  });

  it('400 on a bad condition value (POST)', async () => {
    const res = await ownedPOST(localReq('/api/collection/v90104/owned-releases', 'POST', { release_id: 'r90001', condition: 'pristine' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid condition');
  });

  it('200 and marks a release owned, shaping the owned list (POST)', async () => {
    const res = await ownedPOST(localReq('/api/collection/v90104/owned-releases', 'POST', { release_id: 'r90001', condition: 'new' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.owned.some((o: { release_id: string }) => o.release_id === 'r90001')).toBe(true);
  });

  it('200 and updates an owned release (PATCH)', async () => {
    markReleaseOwned(VN, 'r90002', {});
    const res = await ownedPATCH(localReq('/api/collection/v90104/owned-releases', 'PATCH', { release_id: 'r90002', notes: 'mint condition' }), ctx());
    expect(res.status).toBe(200);
    const row = (await res.json()).owned.find((o: { release_id: string }) => o.release_id === 'r90002');
    expect(row.notes).toBe('mint condition');
  });

  it('400 on a missing release id (DELETE)', async () => {
    const res = await ownedDELETE(localReq('/api/collection/v90104/owned-releases', 'DELETE'), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid release id');
  });

  it('200 and unmarks a release (DELETE)', async () => {
    markReleaseOwned(VN, 'r90003', {});
    const res = await ownedDELETE(localReq('/api/collection/v90104/owned-releases?release_id=r90003', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).owned.some((o: { release_id: string }) => o.release_id === 'r90003')).toBe(false);
  });
});
