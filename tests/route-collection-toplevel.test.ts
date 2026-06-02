import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as charactersGET } from '@/app/api/collection/characters/route';
import { GET as traitsGET } from '@/app/api/collection/traits/route';
import { GET as tagsGET } from '@/app/api/collection/tags/route';
import { PATCH as orderPATCH, DELETE as orderDELETE } from '@/app/api/collection/order/route';
import { POST as importPOST } from '@/app/api/collection/import/route';
import { GET as exportGET } from '@/app/api/collection/export/route';
import { POST as fullDownloadPOST } from '@/app/api/collection/full-download/route';

function localReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function externalReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://93.184.216.34${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe('GET /api/collection/characters', () => {
  it('403 from a non-loopback origin', async () => {
    const res = await charactersGET(externalReq('/api/collection/characters'));
    expect(res.status).toBe(403);
  });

  it('200 with a characters array', async () => {
    const res = await charactersGET(localReq('/api/collection/characters?q=heroine'));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).characters)).toBe(true);
  });
});

describe('GET /api/collection/traits', () => {
  it('403 from a non-loopback origin', async () => {
    const res = await traitsGET(externalReq('/api/collection/traits'));
    expect(res.status).toBe(403);
  });

  it('200 with traits + cache_coverage', async () => {
    const res = await traitsGET(localReq('/api/collection/traits'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.traits)).toBe(true);
    expect(body.cache_coverage).toMatchObject({ total_vns: expect.any(Number) });
  });
});

describe('GET /api/collection/tags', () => {
  it('403 from a non-loopback origin', async () => {
    const res = await tagsGET(externalReq('/api/collection/tags'));
    expect(res.status).toBe(403);
  });

  it('200 with a tags array', async () => {
    const res = await tagsGET(localReq('/api/collection/tags'));
    expect(res.status).toBe(200);
    expect(Array.isArray((await res.json()).tags)).toBe(true);
  });
});

describe('PATCH /api/collection/order', () => {
  it('400 when ids is not an array', async () => {
    const res = await orderPATCH(localReq('/api/collection/order', 'PATCH', { ids: 'v1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ids must be an array/);
  });

  it('400 when ids contains a non-VN value', async () => {
    const res = await orderPATCH(localReq('/api/collection/order', 'PATCH', { ids: ['not-a-vn'] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ids must contain only VN ids');
  });

  it('400 on an empty ids array', async () => {
    const res = await orderPATCH(localReq('/api/collection/order', 'PATCH', { ids: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/non-empty array/);
  });

  it('400 on duplicate ids', async () => {
    const res = await orderPATCH(localReq('/api/collection/order', 'PATCH', { ids: ['v90201', 'v90201'] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('ids must not contain duplicates');
  });

  it('200 with the saved count for a valid order', async () => {
    const res = await orderPATCH(localReq('/api/collection/order', 'PATCH', { ids: ['v90201', 'v90202'] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, count: 2 });
  });
});

describe('DELETE /api/collection/order', () => {
  it('200 with { ok: true } when clearing the custom order', async () => {
    const res = await orderDELETE(localReq('/api/collection/order', 'DELETE'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('POST /api/collection/import', () => {
  it('400 on a payload whose version is not 2', async () => {
    const res = await importPOST(localReq('/api/collection/import', 'POST', { version: 1 }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('import payload version must be 2');
  });

  it('400 on invalid JSON', async () => {
    const req = new NextRequest('http://localhost/api/collection/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    const res = await importPOST(req);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid JSON');
  });

  it('200 with a summary for a valid empty backup', async () => {
    const payload = { version: 2, exported_at: 0, vns: [], collection: [], series: [], series_vn: [] };
    const res = await importPOST(localReq('/api/collection/import', 'POST', payload));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary).toBeTruthy();
  });
});

describe('GET /api/collection/export', () => {
  it('403 from a non-loopback origin', async () => {
    const res = await exportGET(externalReq('/api/collection/export'));
    expect(res.status).toBe(403);
  });

  it('200 with a JSON attachment from loopback', async () => {
    const res = await exportGET(new Request('http://localhost/api/collection/export', { headers: { host: '127.0.0.1' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="vndb-collection-/);
    const body = await res.json();
    expect(body.version).toBe(2);
  });
});

describe('POST /api/collection/full-download', () => {
  it('400 when vn_ids is not an array', async () => {
    const res = await fullDownloadPOST(localReq('/api/collection/full-download', 'POST', { vn_ids: 'v1' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('vn_ids must be an array');
  });

  it('400 when vn_ids contains a non-VNDB id', async () => {
    const res = await fullDownloadPOST(localReq('/api/collection/full-download', 'POST', { vn_ids: ['egs_1'] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('vn_ids must contain only VNDB VN ids');
  });

  it('200 with queued:0 on an empty array', async () => {
    const res = await fullDownloadPOST(localReq('/api/collection/full-download', 'POST', { vn_ids: [] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: 0 });
  });
});
