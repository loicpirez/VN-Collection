import { beforeEach, describe, expect, it } from 'vitest';
import { GET as candidatesGET } from '@/app/api/egs-cover/[id]/candidates/route';
import { GET as coverGET } from '@/app/api/egs-cover/[id]/route';
import { db } from '@/lib/db';
import { decodeCachedEgsCoverUrl, decodeEgsCoverRaw, decodeEgsCoverRawJson } from '@/lib/egs-cover-raw';

beforeEach(() => {
  db.prepare('DELETE FROM egs_game WHERE egs_id = ?').run(990001);
  db.prepare('DELETE FROM egs_game WHERE egs_id IN (?, ?)').run(990002, 990003);
  db.prepare('DELETE FROM vn WHERE id = ?').run('v990001');
  db.prepare('DELETE FROM vn WHERE id = ?').run('v990002');
  db.prepare('DELETE FROM vndb_cache WHERE cache_key = ?').run('egs:cover-resolved:990001');
  db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run('v990001', 'Fixture', Date.now());
});

describe('EGS cover payload decoding', () => {
  it('keeps only nullable strings from persisted raw payloads', () => {
    expect(
      decodeEgsCoverRaw({
        vn_id: 'v990001',
        banner_url: { url: 'https://example.invalid/banner.jpg' },
        surugaya_1: [],
        dmm: 42,
        dlsite_id: true,
        gyutto_id: '123',
      }),
    ).toEqual({
      vn_id: 'v990001',
      banner_url: null,
      surugaya_1: null,
      dmm: null,
      dlsite_id: null,
      gyutto_id: '123',
    });
  });

  it('keeps the preferred local VN id and tolerates corrupt JSON', () => {
    expect(decodeEgsCoverRawJson('{', 'v990002')).toEqual({
      vn_id: 'v990002',
      banner_url: null,
      surugaya_1: null,
      dmm: null,
      dlsite_id: null,
      gyutto_id: null,
    });
  });

  it('falls back to the legacy VNDB id and tolerates an absent JSON payload', () => {
    expect(decodeEgsCoverRaw({ vndb_id: 'v990003' }).vn_id).toBe('v990003');
    expect(decodeEgsCoverRawJson(null).vn_id).toBeNull();
  });

  it('distinguishes cached URLs, negative cache entries, and malformed cache payloads', () => {
    expect(decodeCachedEgsCoverUrl({ url: 'https://example.invalid/cover.jpg' })).toBe(
      'https://example.invalid/cover.jpg',
    );
    expect(decodeCachedEgsCoverUrl({ url: null })).toBeNull();
    expect(decodeCachedEgsCoverUrl({ url: 42 })).toBeUndefined();
    expect(decodeCachedEgsCoverUrl(null)).toBeUndefined();
  });

  it('keeps candidate listing non-fatal for parseable malformed rows', async () => {
    db.prepare(
      `INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'v990001',
      990001,
      'Fixture',
      JSON.stringify({
        banner_url: { url: 'https://example.invalid/banner.jpg' },
        surugaya_1: [],
        dmm: 42,
        dlsite_id: true,
        gyutto_id: {},
      }),
      Date.now(),
    );

    const response = await candidatesGET(new Request('http://localhost/api/egs-cover/990001/candidates'), {
      params: Promise.resolve({ id: '990001' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidates: [
        {
          source: 'image_php',
          url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/image.php?game=990001',
          label: 'EGS image.php',
        },
      ],
    });
  });

  it('rejects remote callers and malformed candidate ids', async () => {
    expect(
      (await candidatesGET(new Request('http://remote.example/api/egs-cover/990001/candidates'), {
        params: Promise.resolve({ id: '990001' }),
      })).status,
    ).toBe(403);
    const invalid = await candidatesGET(new Request('http://localhost/api/egs-cover/nope/candidates'), {
      params: Promise.resolve({ id: 'nope' }),
    });
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'invalid id' });
  });

  it('filters persisted remote candidates that are outside the trusted image-host allowlist', async () => {
    db.prepare('UPDATE vn SET image_url = ? WHERE id = ?').run(
      'https://example.invalid/vndb.jpg',
      'v990001',
    );
    db.prepare(
      `INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'v990001',
      990001,
      'Fixture',
      JSON.stringify({ banner_url: 'https://example.invalid/banner.jpg' }),
      Date.now(),
    );

    const response = await candidatesGET(new Request('http://localhost/api/egs-cover/990001/candidates'), {
      params: Promise.resolve({ id: '990001' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidates: [
        {
          source: 'image_php',
          url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/image.php?game=990001',
          label: 'EGS image.php',
        },
      ],
    });
  });

  it('lists every trusted persisted candidate source for a cover picker', async () => {
    db.prepare('INSERT INTO vn (id, title, local_image, fetched_at) VALUES (?, ?, ?, ?)').run(
      'v990002',
      'Candidate VN',
      'covers/candidate.jpg',
      Date.now(),
    );
    db.prepare(
      `INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'v990002',
      990002,
      'Candidate Game',
      JSON.stringify({
        banner_url: 'https://pics.dmm.co.jp/digital/pcgame/banner/bannerpl.jpg',
        surugaya_1: '145081637',
        dmm: 'sample-game',
        dlsite_id: 'VJ123456',
        gyutto_id: '12345',
      }),
      Date.now(),
    );

    const response = await candidatesGET(new Request('http://localhost/api/egs-cover/990002/candidates'), {
      params: Promise.resolve({ id: '990002' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidates: [
        {
          source: 'banner',
          url: 'https://pics.dmm.co.jp/digital/pcgame/banner/bannerpl.jpg',
          label: 'EGS banner',
        },
        { source: 'vndb', url: '/api/files/covers/candidate.jpg', label: 'VNDB v990002' },
        {
          source: 'image_php',
          url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/image.php?game=990002',
          label: 'EGS image.php',
        },
        {
          source: 'surugaya',
          url: 'https://www.suruga-ya.jp/database/pics/game/145081637.jpg',
          label: 'Suruga-ya',
        },
        {
          source: 'dmm',
          url: 'https://pics.dmm.co.jp/digital/pcgame/sample-game/sample-gamepl.jpg',
          label: 'DMM',
        },
        {
          source: 'dlsite',
          url: 'https://img.dlsite.jp/modpub/images2/work/professional/VJ123456/VJ123456_img_main.jpg',
          label: 'DLsite',
        },
        { source: 'gyutto', url: 'https://gyutto.com/i/item12345/package.jpg', label: 'Gyutto' },
      ],
    });
  });

  it('builds the doujin DLsite candidate URL for RJ ids', async () => {
    db.prepare(
      `INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      null,
      990003,
      'Doujin Candidate',
      JSON.stringify({ dlsite_id: 'RJ123456' }),
      Date.now(),
    );
    const response = await candidatesGET(new Request('http://localhost/api/egs-cover/990003/candidates'), {
      params: Promise.resolve({ id: '990003' }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidates: [
        {
          source: 'image_php',
          url: 'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/image.php?game=990003',
          label: 'EGS image.php',
        },
        {
          source: 'dlsite',
          url: 'https://img.dlsite.jp/modpub/images2/work/doujin/RJ123456/RJ123456_img_main.jpg',
          label: 'DLsite',
        },
      ],
    });
  });

  it('ignores unsafe cached and persisted banners before selecting a linked local VNDB cover', async () => {
    const now = Date.now();
    db.prepare('UPDATE vn SET local_image = ? WHERE id = ?').run('covers/local.jpg', 'v990001');
    db.prepare(
      `INSERT INTO egs_game (vn_id, egs_id, gamename, raw_json, fetched_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(
      'v990001',
      990001,
      'Fixture',
      JSON.stringify({ banner_url: 'https://example.invalid/banner.jpg' }),
      now,
    );
    db.prepare(
      `INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
       VALUES (?, ?, NULL, NULL, ?, ?)`,
    ).run(
      'egs:cover-resolved:990001',
      JSON.stringify({ url: 'https://example.invalid/cached.jpg' }),
      now,
      now + 60_000,
    );

    const response = await coverGET(new Request('http://localhost/api/egs-cover/990001'), {
      params: Promise.resolve({ id: '990001' }),
    });
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('http://localhost/api/files/covers/local.jpg');
    const cached = db
      .prepare('SELECT body FROM vndb_cache WHERE cache_key = ?')
      .get('egs:cover-resolved:990001') as { body: string };
    expect(JSON.parse(cached.body)).toEqual({ url: 'http://localhost/api/files/covers/local.jpg' });
  });
});
