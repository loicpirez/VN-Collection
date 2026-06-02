import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { addToCollection, db, upsertVn } from '@/lib/db';

const { getVnMock, charsMock, releasesMock, quotesMock } = vi.hoisted(() => ({
  getVnMock: vi.fn(),
  charsMock: vi.fn(),
  releasesMock: vi.fn(),
  quotesMock: vi.fn(),
}));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return {
    ...actual,
    getVn: getVnMock,
    getCharactersForVn: charsMock,
    getReleasesForVn: releasesMock,
    getQuotesForVn: quotesMock,
  };
});

import { GET as vnGET } from '@/app/api/vn/[id]/route';
import { GET as vnCharsGET } from '@/app/api/vn/[id]/characters/route';
import { GET as vnReleasesGET } from '@/app/api/vn/[id]/releases/route';
import { GET as vnQuotesGET } from '@/app/api/vn/[id]/quotes/route';
import {
  GET as aspectGET,
  PATCH as aspectPATCH,
  DELETE as aspectDELETE,
} from '@/app/api/vn/[id]/aspect/route';

const VN = 'v90301';

function localReq(path: string, method = 'GET', body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function ctx(id = VN) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  getVnMock.mockReset();
  charsMock.mockReset();
  releasesMock.mockReset();
  quotesMock.mockReset();
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN);
});

afterEach(() => {
  db.prepare('DELETE FROM collection WHERE vn_id = ?').run(VN);
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN);
});

describe('GET /api/vn/[id]', () => {
  it('400 on an invalid id', async () => {
    const res = await vnGET(localReq('/api/vn/bad', 'GET'), ctx('bad'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid id' });
  });

  it('404 when VNDB returns null for an uncached id', async () => {
    getVnMock.mockResolvedValue(null);
    const res = await vnGET(localReq('/api/vn/v90301', 'GET'), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'not found' });
    expect(getVnMock).toHaveBeenCalledOnce();
  });

  it('200 with the freshly-fetched vn payload', async () => {
    getVnMock.mockResolvedValue({ id: VN, title: 'Synthetic Read' });
    const res = await vnGET(localReq('/api/vn/v90301', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vn.id).toBe(VN);
    expect(body.in_collection).toBe(false);
  });
});

describe('GET /api/vn/[id]/characters', () => {
  it('400 on an invalid id', async () => {
    const res = await vnCharsGET(localReq('/api/vn/zz/characters', 'GET'), ctx('zz'));
    expect(res.status).toBe(400);
  });

  it('200 with characters enriched with a localImage field', async () => {
    charsMock.mockResolvedValue([{ id: 'c90001', name: 'Heroine', traits: [] }]);
    const res = await vnCharsGET(localReq('/api/vn/v90301/characters', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.characters).toHaveLength(1);
    expect(body.characters[0]).toMatchObject({ id: 'c90001', localImage: null });
  });

  it('502 when the upstream throws', async () => {
    charsMock.mockRejectedValue(new Error('upstream down'));
    const res = await vnCharsGET(localReq('/api/vn/v90301/characters', 'GET'), ctx());
    expect(res.status).toBe(502);
  });
});

describe('GET /api/vn/[id]/releases', () => {
  it('400 on an invalid id', async () => {
    const res = await vnReleasesGET(localReq('/api/vn/zz/releases', 'GET'), ctx('zz'));
    expect(res.status).toBe(400);
  });

  it('200 with the releases array', async () => {
    releasesMock.mockResolvedValue([{ id: 'r90001', resolution: null }]);
    const res = await vnReleasesGET(localReq('/api/vn/v90301/releases', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.releases).toHaveLength(1);
    expect(body.releases[0].id).toBe('r90001');
  });
});

describe('GET /api/vn/[id]/quotes', () => {
  it('400 on an invalid id', async () => {
    const res = await vnQuotesGET(localReq('/api/vn/zz/quotes', 'GET'), ctx('zz'));
    expect(res.status).toBe(400);
  });

  it('200 with the enriched quotes array', async () => {
    quotesMock.mockResolvedValue([{ id: 1, quote: 'a line', character: null }]);
    const res = await vnQuotesGET(localReq('/api/vn/v90301/quotes', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quotes).toHaveLength(1);
    expect(body.quotes[0].quote).toBe('a line');
  });
});

describe('aspect GET/PATCH/DELETE', () => {
  it('400 on an invalid id (GET)', async () => {
    const res = await aspectGET(localReq('/api/vn/zz/aspect', 'GET'), ctx('zz'));
    expect(res.status).toBe(400);
  });

  it('200 with override + derived (GET)', async () => {
    const res = await aspectGET(localReq('/api/vn/v90301/aspect', 'GET'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('override');
    expect(body).toHaveProperty('derived');
  });

  it('400 on a bad aspect_key (PATCH)', async () => {
    const res = await aspectPATCH(localReq('/api/vn/v90301/aspect', 'PATCH', { aspect_key: '7:1' }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/aspect_key must be one of/);
  });

  it('200 and sets the override (PATCH)', async () => {
    upsertVn({ id: VN, title: 'Synthetic Read' });
    const res = await aspectPATCH(localReq('/api/vn/v90301/aspect', 'PATCH', { aspect_key: '16:9' }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.override?.aspect_key).toBe('16:9');
  });

  it('200 and clears the override (DELETE)', async () => {
    const res = await aspectDELETE(localReq('/api/vn/v90301/aspect', 'DELETE'), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).override).toBeNull();
  });
});
