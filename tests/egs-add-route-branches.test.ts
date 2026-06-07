import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/egs/[id]/add/route';
import { db } from '@/lib/db';
import { EgsUnreachable, type EgsGame } from '@/lib/erogamescape';

const { fetchEgsGameMock, linkEgsToVnMock, recordActivityMock } = vi.hoisted(() => ({
  fetchEgsGameMock: vi.fn(),
  linkEgsToVnMock: vi.fn(),
  recordActivityMock: vi.fn(),
}));

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return {
    ...actual,
    fetchEgsGame: fetchEgsGameMock,
    linkEgsToVn: linkEgsToVnMock,
  };
});

vi.mock('@/lib/activity', () => ({
  recordActivity: recordActivityMock,
}));

function req(id: number | string, body: unknown): NextRequest {
  return new NextRequest(`http://127.0.0.1/api/egs/${id}/add`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function ctx(id: number | string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: String(id) }) };
}

function game(id: number, gamename: string): EgsGame {
  return {
    id,
    gamename,
    gamename_furigana: 'furigana',
    brand_id: 99,
    brand_name: 'Brand',
    model: 'PC',
    description: 'Description',
    image_url: 'https://pics.dmm.co.jp/test.jpg',
    okazu: null,
    erogame: true,
    median: 80,
    average: 79,
    dispersion: 12,
    count: 100,
    sellday: '2024-01-01',
    playtime_median_minutes: 600,
    url: `https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${id}`,
  };
}

beforeEach(() => {
  fetchEgsGameMock.mockReset();
  linkEgsToVnMock.mockReset();
  recordActivityMock.mockReset();
});

afterEach(() => {
  db.prepare("DELETE FROM collection WHERE vn_id LIKE 'egs_9905%'").run();
  db.prepare("DELETE FROM vn WHERE id LIKE 'egs_9905%'").run();
});

describe('POST /api/egs/[id]/add', () => {
  it('rejects malformed identifiers and status before contacting EGS', async () => {
    expect((await POST(req('bad', {}), ctx('bad'))).status).toBe(400);
    expect((await POST(req(0, {}), ctx(0))).status).toBe(400);
    expect((await POST(req(990501, { status: 'invalid' }), ctx(990501))).status).toBe(400);
    expect(fetchEgsGameMock).not.toHaveBeenCalled();
  });

  it('returns 404 when EGS has no matching game', async () => {
    fetchEgsGameMock.mockResolvedValue(null);
    const res = await POST(req(990501, {}), ctx(990501));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'EGS game not found' });
  });

  it('sanitizes EGS unreachable failures as upstream errors', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchEgsGameMock.mockRejectedValue(new EgsUnreachable('server', 'HTTP 503', 503));
    const res = await POST(req(990501, {}), ctx(990501));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream service unavailable' });
    consoleSpy.mockRestore();
  });

  it('rethrows unexpected EGS errors', async () => {
    fetchEgsGameMock.mockRejectedValue(new Error('unexpected EGS failure'));
    await expect(POST(req(990501, {}), ctx(990501))).rejects.toThrow('unexpected EGS failure');
  });

  it('adds an EGS-only VN with default planning status and tolerates activity failures', async () => {
    fetchEgsGameMock.mockResolvedValue(game(990501, ''));
    linkEgsToVnMock.mockResolvedValue(null);
    recordActivityMock.mockImplementation(() => {
      throw new Error('activity unavailable');
    });

    const res = await POST(req(990501, {}), ctx(990501));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.vn_id).toBe('egs_990501');
    expect(body.item).toMatchObject({ id: 'egs_990501', status: 'planning' });
    expect(linkEgsToVnMock).toHaveBeenCalledWith('egs_990501', 990501);
    const row = db.prepare('SELECT title, egs_only FROM vn WHERE id = ?').get('egs_990501') as { title: string; egs_only: number };
    expect(row).toEqual({ title: 'EGS #990501', egs_only: 1 });
  });

  it('adds an EGS-only VN with an explicit valid status and records activity', async () => {
    fetchEgsGameMock.mockResolvedValue(game(990502, 'EGS Title'));
    linkEgsToVnMock.mockResolvedValue(null);

    const res = await POST(req(990502, { status: 'completed' }), ctx(990502));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.item).toMatchObject({ id: 'egs_990502', status: 'completed' });
    expect(recordActivityMock).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'collection.add',
      entity: 'vn',
      entityId: 'egs_990502',
      label: 'EGS Title',
      payload: { source: 'egs', egs_id: 990502, status: 'completed' },
    }));
  });
});
