import { beforeEach, describe, expect, it } from 'vitest';
import { GET as candidatesGET } from '@/app/api/egs-cover/[id]/candidates/route';
import { db } from '@/lib/db';
import { decodeCachedEgsCoverUrl, decodeEgsCoverRaw, decodeEgsCoverRawJson } from '@/lib/egs-cover-raw';

beforeEach(() => {
  db.prepare('DELETE FROM egs_game WHERE egs_id = ?').run(990001);
  db.prepare('DELETE FROM vn WHERE id = ?').run('v990001');
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
});
