/**
 * Hermetic coverage for `src/lib/scrape-character-instances.ts`. The web
 * scrape boundary (`fetchVndbWebHtml`) is mocked so synthetic VNDB `/c<id>`
 * markup drives the Instances + Voiced-by parsers; `htmlToText` keeps its real
 * implementation. The fan-out path reads from the real per-worker SQLite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/vndb-scrape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-scrape')>();
  return { ...actual, fetchVndbWebHtml: vi.fn() };
});

import { db } from '@/lib/db';
import { fetchVndbWebHtml } from '@/lib/vndb-scrape';
import {
  readScrapedCharacterInfo,
  scrapeCharacterInfo,
  scrapeCharactersForVn,
} from '@/lib/scrape-character-instances';

const mockFetchHtml = vi.mocked(fetchVndbWebHtml);

function clearCache(): void {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'scrape_character:%'`).run();
}

function clearVnRows(): void {
  db.prepare(`DELETE FROM vn_va_credit`).run();
  db.prepare(`DELETE FROM vn`).run();
}

function seedVn(id: string): void {
  db.prepare(`INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .run(id, `Title ${id}`, Date.now());
}

/** Build a synthetic /c<id> page with an Instances table and Voiced-by block. */
function characterPage(opts: {
  instances?: Array<{ cid: string; name: string; vid: string; vtitle: string }>;
  voiced?: Array<{ sid: string; sname: string; vid: string; vtitle: string }>;
  malformedInstanceRow?: boolean;
} = {}): string {
  const { instances = [], voiced = [], malformedInstanceRow = false } = opts;
  const instRows = instances
    .map((i) => `<tr><td><a href="/${i.cid}">${i.name}</a> in <a href="/${i.vid}">${i.vtitle}</a></td></tr>`)
    .join('');
  const noise = malformedInstanceRow ? `<tr><td>no links here</td></tr>` : '';
  const voicedRows = voiced
    .map((v) => `<tr><td><a href="/${v.sid}">${v.sname}</a> for <a href="/${v.vid}">${v.vtitle}</a></td></tr>`)
    .join('');
  return [
    `<html><body>`,
    instances.length || malformedInstanceRow
      ? `<h1>Instances</h1><table class="charlist">${instRows}${noise}</table>`
      : '',
    voiced.length ? `<h2>Voiced by</h2><table>${voicedRows}</table><h1>Next</h1>` : '',
    `</body></html>`,
  ].join('');
}

beforeEach(() => {
  clearCache();
  clearVnRows();
  mockFetchHtml.mockReset();
});

afterEach(() => {
  clearCache();
  clearVnRows();
  vi.restoreAllMocks();
});

describe('scrapeCharacterInfo', () => {
  it('rejects a malformed character id without fetching', async () => {
    expect(await scrapeCharacterInfo('not-a-cid')).toBeNull();
    expect(mockFetchHtml).not.toHaveBeenCalled();
  });

  it('returns null when the page is unreachable', async () => {
    mockFetchHtml.mockResolvedValue(null);
    expect(await scrapeCharacterInfo('c100')).toBeNull();
  });

  it('parses Instances and Voiced-by rows and persists the result', async () => {
    mockFetchHtml.mockResolvedValue(characterPage({
      instances: [
        { cid: 'c100', name: 'Heroine A', vid: 'v10', vtitle: 'VN Ten' },
        { cid: 'c101', name: 'Heroine B', vid: 'v11', vtitle: 'VN Eleven' },
      ],
      voiced: [{ sid: 's200', sname: 'Seiyuu X', vid: 'v10', vtitle: 'VN Ten' }],
      malformedInstanceRow: true,
    }));
    const info = await scrapeCharacterInfo('c100');
    expect(info).not.toBeNull();
    expect(info?.cid).toBe('c100');
    expect(info?.instances).toHaveLength(2);
    expect(info?.instances[0]).toMatchObject({ cid: 'c100', name: 'Heroine A', vn_id: 'v10', vn_title: 'VN Ten' });
    expect(info?.voiced_by).toHaveLength(1);
    expect(info?.voiced_by[0]).toMatchObject({ sid: 's200', staff_name: 'Seiyuu X', vn_id: 'v10', note: null });

    // Persisted under the lowercased cache key and decodable on read-back.
    const readBack = readScrapedCharacterInfo('c100');
    expect(readBack?.instances).toHaveLength(2);
    expect(readBack?.voiced_by).toHaveLength(1);
  });

  it('lowercases an uppercase id for the cache key', async () => {
    mockFetchHtml.mockResolvedValue(characterPage({
      instances: [{ cid: 'c300', name: 'Heroine C', vid: 'v30', vtitle: 'VN Thirty' }],
    }));
    const info = await scrapeCharacterInfo('C300');
    expect(info?.cid).toBe('c300');
    expect(readScrapedCharacterInfo('c300')).not.toBeNull();
  });

  it('produces empty arrays when neither block is present', async () => {
    mockFetchHtml.mockResolvedValue('<html><body><h1>Unrelated</h1></body></html>');
    const info = await scrapeCharacterInfo('c400');
    expect(info?.instances).toEqual([]);
    expect(info?.voiced_by).toEqual([]);
  });
});

describe('readScrapedCharacterInfo', () => {
  it('returns null on a cache miss', () => {
    expect(readScrapedCharacterInfo('c9999')).toBeNull();
  });

  it('returns null when the cached body fails schema validation', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_character:c500', ?, NULL, NULL, ?, ?)`)
      .run(JSON.stringify({ cid: 'c500', instances: [{ bad: true }], voiced_by: [] }), now, now + 86_400_000);
    expect(readScrapedCharacterInfo('c500')).toBeNull();
  });

  it('returns null when the cached body is unparseable JSON', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_character:c501', '{broken', NULL, NULL, ?, ?)`)
      .run(now, now + 86_400_000);
    expect(readScrapedCharacterInfo('c501')).toBeNull();
  });
});

describe('scrapeCharactersForVn fan-out', () => {
  it('returns zeros when the VN has no character credits', async () => {
    seedVn('v50');
    const res = await scrapeCharactersForVn('v50');
    expect(res).toEqual({ scanned: 0, downloaded: 0 });
    expect(mockFetchHtml).not.toHaveBeenCalled();
  });

  it('scrapes each distinct credited character and counts downloads', async () => {
    seedVn('v51');
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES ('v51', 's1', 'c600', 'Char', 'VA')`).run();
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES ('v51', 's2', 'c600', 'Char', 'VA2')`).run(); // duplicate c_id
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES ('v51', 's3', 'c601', 'Char2', 'VA3')`).run();
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES ('v51', 's4', 'bogus', 'X', 'Y')`).run(); // non-c id

    mockFetchHtml.mockResolvedValue(characterPage({
      instances: [{ cid: 'c600', name: 'Heroine', vid: 'v51', vtitle: 'Title v51' }],
    }));
    const res = await scrapeCharactersForVn('v51');
    expect(res.scanned).toBe(2); // c600, c601 — duplicate + bogus excluded
    expect(res.downloaded).toBe(2);
    expect(mockFetchHtml).toHaveBeenCalledTimes(2);
  });

  it('records an error and continues when one character scrape throws', async () => {
    seedVn('v52');
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES ('v52', 's1', 'c700', 'A', 'VA')`).run();
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES ('v52', 's2', 'c701', 'B', 'VA')`).run();
    mockFetchHtml
      .mockRejectedValueOnce(new Error('scrape failed'))
      .mockResolvedValueOnce(characterPage({ instances: [{ cid: 'c701', name: 'B', vid: 'v52', vtitle: 'Title v52' }] }));
    const res = await scrapeCharactersForVn('v52');
    expect(res.scanned).toBe(2);
    expect(res.downloaded).toBe(1);
  });

  it('skips fresh cache entries unless force is set', async () => {
    seedVn('v53');
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES ('v53', 's1', 'c800', 'A', 'VA')`).run();
    const fresh = { cid: 'c800', instances: [], voiced_by: [], fetched_at: Date.now() };
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_character:c800', ?, NULL, NULL, ?, ?)`)
      .run(JSON.stringify(fresh), Date.now(), Date.now() + 86_400_000);

    const res = await scrapeCharactersForVn('v53');
    expect(res).toEqual({ scanned: 1, downloaded: 0 });
    expect(mockFetchHtml).not.toHaveBeenCalled();

    // force=true re-scrapes the fresh entry.
    mockFetchHtml.mockResolvedValue(characterPage({ instances: [{ cid: 'c800', name: 'A', vid: 'v53', vtitle: 'Title v53' }] }));
    const forced = await scrapeCharactersForVn('v53', { force: true });
    expect(forced.downloaded).toBe(1);
  });
});
