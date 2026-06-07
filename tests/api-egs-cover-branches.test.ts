import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { safeFetchMock, fetchEgsGameMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  fetchEgsGameMock: vi.fn(),
}));

vi.mock('@/lib/safe-fetch', () => ({
  safeFetch: safeFetchMock,
}));

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return {
    ...actual,
    fetchEgsGame: fetchEgsGameMock,
  };
});

import { GET } from '@/app/api/egs-cover/[id]/route';
import { db } from '@/lib/db';

function ctx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

function req(id: string, origin = 'http://localhost', forwardedFor = `10.0.0.${Math.max(1, Number(id) % 250)}`): Request {
  return new Request(`${origin}/api/egs-cover/${id}`, { headers: { 'x-forwarded-for': forwardedFor } });
}

function imageResponse(type = 'image/jpeg'): Response {
  return new Response('image-bytes', { status: 200, headers: { 'content-type': type } });
}

function imageResponseWithoutType(): Response {
  return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
}

function insertRaw(egsId: number, raw: Record<string, unknown>, vnId: string | null = null): void {
  db.prepare(
    `INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(vnId, egsId, `EGS ${egsId}`, JSON.stringify(raw), Date.now());
}

function insertCache(egsId: number, url: string | null, expiresAt = Date.now() + 60_000): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at
  `).run(`egs:cover-resolved:${egsId}`, JSON.stringify({ url }), now, expiresAt);
}

beforeEach(() => {
  safeFetchMock.mockReset();
  fetchEgsGameMock.mockReset();
  db.prepare('DELETE FROM egs_game WHERE egs_id BETWEEN 880001 AND 880080').run();
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'egs:cover-resolved:8800%'`).run();
  db.prepare(`DELETE FROM vn WHERE id LIKE 'v99000%'`).run();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/egs-cover/[id] route branches', () => {
  it('rejects remote callers and invalid ids', async () => {
    expect((await GET(req('880001', 'http://remote.example'), ctx('880001'))).status).toBe(403);
    const invalid = await GET(req('bad'), ctx('bad'));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid id' });
  });

  it('rate limits repeated cover requests from the same client', async () => {
    const client = '10.10.10.10';
    for (let i = 0; i < 30; i += 1) {
      const response = await GET(req('0', 'http://localhost', client), ctx('0'));
      expect(response.status).toBe(400);
    }
    const limited = await GET(req('0', 'http://localhost', client), ctx('0'));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: 'rate limit exceeded' });
  });

  it('returns 404 from a fresh negative cache entry without fetching upstream', async () => {
    insertCache(880001, null);
    const response = await GET(req('880001'), ctx('880001'));
    expect(response.status).toBe(404);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it('ignores malformed cache payloads and recomputes the miss', async () => {
    const now = Date.now();
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES (?, ?, NULL, NULL, ?, ?)
    `).run('egs:cover-resolved:880021', '{', now, now + 60_000);
    safeFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const response = await GET(req('880021'), ctx('880021'));
    expect(response.status).toBe(404);
    expect(safeFetchMock).toHaveBeenCalled();
  });

  it('proxies and caches a trusted local banner URL', async () => {
    insertRaw(880002, { banner_url: 'https://pics.dmm.co.jp/digital/pcgame/banner/bannerpl.jpg' });
    safeFetchMock.mockResolvedValue(imageResponse('image/png'));
    const response = await GET(req('880002'), ctx('880002'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(safeFetchMock).toHaveBeenCalledWith(
      'https://pics.dmm.co.jp/digital/pcgame/banner/bannerpl.jpg',
      expect.objectContaining({ redirect: 'manual' }),
    );
    const cached = db.prepare('SELECT body FROM vndb_cache WHERE cache_key = ?').get('egs:cover-resolved:880002') as { body: string };
    expect(JSON.parse(cached.body)).toEqual({ url: 'https://pics.dmm.co.jp/digital/pcgame/banner/bannerpl.jpg' });
  });

  it('returns 404 when a cached trusted URL resolves to a non-image response', async () => {
    insertCache(880003, 'https://pics.dmm.co.jp/digital/pcgame/cached/cachedpl.jpg');
    safeFetchMock.mockResolvedValue(new Response('html', { status: 200, headers: { 'content-type': 'text/html' } }));
    const response = await GET(req('880003'), ctx('880003'));
    expect(response.status).toBe(404);
  });

  it('uses the default proxied content type when the upstream image omits one', async () => {
    insertCache(880022, 'https://pics.dmm.co.jp/digital/pcgame/cached/cachedpl.jpg');
    safeFetchMock.mockResolvedValue(imageResponseWithoutType());
    const response = await GET(req('880022'), ctx('880022'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });

  it('returns 404 when a cached trusted URL fetch fails or has no body', async () => {
    insertCache(880023, 'https://pics.dmm.co.jp/digital/pcgame/cached/cachedpl.jpg');
    safeFetchMock.mockRejectedValueOnce(new Error('upstream failed'));
    expect((await GET(req('880023'), ctx('880023'))).status).toBe(404);

    insertCache(880024, 'https://pics.dmm.co.jp/digital/pcgame/cached/cachedpl.jpg');
    safeFetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await GET(req('880024'), ctx('880024'))).status).toBe(404);
  });

  it('falls back from a missing EGS image probe to trusted shop URLs', async () => {
    const cases: Array<[number, Record<string, unknown>, string]> = [
      [880004, { surugaya_1: '145081637' }, 'https://www.suruga-ya.jp/database/pics/game/145081637.jpg'],
      [880005, { dmm: 'sample-game' }, 'https://pics.dmm.co.jp/digital/pcgame/sample-game/sample-gamepl.jpg'],
      [880006, { dlsite_id: 'RJ123456' }, 'https://img.dlsite.jp/modpub/images2/work/doujin/RJ123456/RJ123456_img_main.jpg'],
      [880007, { gyutto_id: '12345' }, 'https://gyutto.com/i/item12345/package.jpg'],
      [880025, { dlsite_id: 'VJ123456' }, 'https://img.dlsite.jp/modpub/images2/work/professional/VJ123456/VJ123456_img_main.jpg'],
    ];
    safeFetchMock.mockImplementation(async (url: string) => (
      url.includes('image.php') ? new Response(null, { status: 404 }) : imageResponse()
    ));
    for (const [egsId, raw, expected] of cases) {
      insertRaw(egsId, raw);
      const response = await GET(req(String(egsId)), ctx(String(egsId)));
      expect(response.status).toBe(200);
      const cached = db.prepare('SELECT body FROM vndb_cache WHERE cache_key = ?').get(`egs:cover-resolved:${egsId}`) as { body: string };
      expect(JSON.parse(cached.body)).toEqual({ url: expected });
    }
  });

  it('uses fetchEgsGame fallback raw data when the local row has no cover ids', async () => {
    fetchEgsGameMock.mockResolvedValue({ raw: { dmm: 'fallback-game' } });
    safeFetchMock.mockImplementation(async (url: string) => (
      url.includes('image.php') ? new Response(null, { status: 404 }) : imageResponse()
    ));
    const response = await GET(req('880008'), ctx('880008'));
    expect(response.status).toBe(200);
    expect(fetchEgsGameMock).toHaveBeenCalledWith(880008);
    const cached = db.prepare('SELECT body FROM vndb_cache WHERE cache_key = ?').get('egs:cover-resolved:880008') as { body: string };
    expect(JSON.parse(cached.body)).toEqual({ url: 'https://pics.dmm.co.jp/digital/pcgame/fallback-game/fallback-gamepl.jpg' });
  });

  it('keeps local raw data when the EGS fallback request fails', async () => {
    fetchEgsGameMock.mockRejectedValue(new Error('EGS unavailable'));
    safeFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const response = await GET(req('880026'), ctx('880026'));
    expect(response.status).toBe(404);
    expect(fetchEgsGameMock).toHaveBeenCalledWith(880026);
  });

  it('uses linked VNDB remote covers and writes them to the cache', async () => {
    db.prepare('INSERT INTO vn (id, title, image_url, fetched_at) VALUES (?, ?, ?, ?)').run(
      'v990004',
      'Remote VNDB Cover',
      'https://t.vndb.org/cv/00/990004.jpg',
      Date.now(),
    );
    insertRaw(880027, {}, 'v990004');
    safeFetchMock.mockResolvedValue(imageResponse());
    const response = await GET(req('880027'), ctx('880027'));
    expect(response.status).toBe(200);
    const cached = db.prepare('SELECT body FROM vndb_cache WHERE cache_key = ?').get('egs:cover-resolved:880027') as { body: string };
    expect(JSON.parse(cached.body)).toEqual({ url: 'https://t.vndb.org/cv/00/990004.jpg' });
  });

  it('falls through when a linked VNDB id has no stored cover row', async () => {
    insertRaw(880028, { vn_id: 'v990005' });
    safeFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const response = await GET(req('880028'), ctx('880028'));
    expect(response.status).toBe(404);
  });

  it('falls through when a linked VNDB row has no image value', async () => {
    db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(
      'v990006',
      'No Cover VN',
      Date.now(),
    );
    insertRaw(880038, {}, 'v990006');
    safeFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const response = await GET(req('880038'), ctx('880038'));
    expect(response.status).toBe(404);
  });

  it('uses the probed EGS image endpoint when it resolves to an image', async () => {
    safeFetchMock.mockResolvedValue(imageResponse());
    const response = await GET(req('880009'), ctx('880009'));
    expect(response.status).toBe(200);
    const cached = db.prepare('SELECT body FROM vndb_cache WHERE cache_key = ?').get('egs:cover-resolved:880009') as { body: string };
    expect(JSON.parse(cached.body)).toEqual({
      url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/image.php?game=880009',
    });
  });

  it('handles manual image endpoint redirects through the same allowlist chain', async () => {
    safeFetchMock.mockImplementation(async (url: string) => {
      if (url.includes('image.php')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://pics.dmm.co.jp/digital/pcgame/redirect/redirectpl.jpg' },
        });
      }
      return imageResponse();
    });
    const response = await GET(req('880029'), ctx('880029'));
    expect(response.status).toBe(200);
    expect(safeFetchMock).toHaveBeenCalledWith(
      'https://pics.dmm.co.jp/digital/pcgame/redirect/redirectpl.jpg',
      expect.objectContaining({ redirect: 'manual' }),
    );
  });

  it('treats redirect loops, missing locations, and disallowed locations as probe misses', async () => {
    safeFetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }));
    expect((await GET(req('880030'), ctx('880030'))).status).toBe(404);

    const hostileRedirect = new Response(null, { status: 302 });
    vi.spyOn(hostileRedirect.headers, 'get').mockImplementation((name: string) => (
      name === 'location'
        ? 'https://pics.dmm.co.jp/digital/pcgame/redirect/redirectpl.jpg\nhttp://127.0.0.1/private.jpg'
        : null
    ));
    safeFetchMock.mockReset();
    safeFetchMock.mockResolvedValueOnce(hostileRedirect);
    expect((await GET(req('880039'), ctx('880039'))).status).toBe(404);

    safeFetchMock.mockReset();
    safeFetchMock.mockImplementation(async () => (
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private.jpg' },
      })
    ));
    expect((await GET(req('880031'), ctx('880031'))).status).toBe(404);

    safeFetchMock.mockReset();
    safeFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.signal?.aborted) return new Response(null, { status: 504 });
      return new Response(null, {
        status: 302,
        headers: { location: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/image.php?game=880032' },
      });
    });
    expect((await GET(req('880032'), ctx('880032'))).status).toBe(404);
  });

  it('treats missing content types and thrown probes as misses', async () => {
    safeFetchMock.mockResolvedValueOnce(imageResponseWithoutType());
    expect((await GET(req('880033'), ctx('880033'))).status).toBe(404);

    safeFetchMock.mockReset();
    safeFetchMock.mockRejectedValue(new Error('probe failed'));
    expect((await GET(req('880034'), ctx('880034'))).status).toBe(404);
  });

  it('aborts slow probes and slow proxied images', async () => {
    vi.useFakeTimers({ now: Date.now() });
    safeFetchMock.mockImplementation(async (_url: string, init?: RequestInit) => (
      new Promise<Response>((resolve) => {
        init?.signal?.addEventListener('abort', () => resolve(new Response(null, { status: 504 })), { once: true });
      })
    ));
    const probePromise = GET(req('880035'), ctx('880035'));
    await vi.advanceTimersByTimeAsync(3500);
    expect((await probePromise).status).toBe(404);

    insertCache(880036, 'https://pics.dmm.co.jp/digital/pcgame/cached/cachedpl.jpg');
    const proxyPromise = GET(req('880036'), ctx('880036'));
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await proxyPromise).status).toBe(404);
  });

  it('writes a short negative cache when no resolver candidate is usable', async () => {
    insertRaw(880037, {
      surugaya_1: '0',
      dmm: 'bad/slash',
      dlsite_id: 'XX123',
      gyutto_id: 'not-a-number',
    });
    safeFetchMock.mockResolvedValue(new Response(null, { status: 404 }));
    const response = await GET(req('880037'), ctx('880037'));
    expect(response.status).toBe(404);
    const cached = db.prepare('SELECT body FROM vndb_cache WHERE cache_key = ?').get('egs:cover-resolved:880037') as { body: string };
    expect(JSON.parse(cached.body)).toEqual({ url: null });
  });
});
