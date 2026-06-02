/**
 * Hermetic coverage for `src/lib/scrape-producer-relations.ts`. The web scrape
 * boundary (`fetchVndbWebHtml`) is mocked with synthetic VNDB `/p<id>` markup
 * so the Relations-table parser runs offline; `htmlToText` keeps its real
 * implementation. Fan-out reads the real per-worker SQLite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/vndb-scrape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-scrape')>();
  return { ...actual, fetchVndbWebHtml: vi.fn() };
});

import { db } from '@/lib/db';
import { fetchVndbWebHtml } from '@/lib/vndb-scrape';
import {
  readScrapedProducerInfo,
  scrapeProducerRelations,
  scrapeProducersForVn,
} from '@/lib/scrape-producer-relations';

const mockFetchHtml = vi.mocked(fetchVndbWebHtml);

function clearCache(): void {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'scrape_producer:%'`).run();
}

function clearVnRows(): void {
  db.prepare(`DELETE FROM vn`).run();
}

function seedVnWithDevs(id: string, devs: unknown): void {
  db.prepare(`INSERT INTO vn (id, title, developers, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET developers = excluded.developers`)
    .run(id, `Title ${id}`, devs === null ? null : JSON.stringify(devs), Date.now());
}

/** Build a synthetic /p<id> page with a Relations table. */
function producerPage(opts: {
  relations?: Array<{ label: string; id: string; name: string }>;
  malformedRow?: boolean;
} = {}): string {
  const { relations = [], malformedRow = false } = opts;
  const rows = relations
    .map((r) => `<tr><td class="key">${r.label}:</td><td><a href="/${r.id}">${r.name}</a></td></tr>`)
    .join('');
  const noise = malformedRow ? `<tr><td class="key">Orphan:</td><td>no link</td></tr>` : '';
  return [
    `<html><body>`,
    relations.length || malformedRow ? `<h1>Relations</h1><table class="stripe">${rows}${noise}</table>` : '',
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

describe('scrapeProducerRelations', () => {
  it('rejects a malformed producer id without fetching', async () => {
    expect(await scrapeProducerRelations('nope')).toBeNull();
    expect(mockFetchHtml).not.toHaveBeenCalled();
  });

  it('returns null when the page is unreachable', async () => {
    mockFetchHtml.mockResolvedValue(null);
    expect(await scrapeProducerRelations('p100')).toBeNull();
  });

  it('parses relation rows, strips the trailing colon, and skips link-less rows', async () => {
    mockFetchHtml.mockResolvedValue(producerPage({
      relations: [
        { label: 'Parent brand', id: 'p10', name: 'Studio Parent' },
        { label: 'Subsidiary', id: 'p11', name: 'Studio Child' },
      ],
      malformedRow: true,
    }));
    const info = await scrapeProducerRelations('p100');
    expect(info?.pid).toBe('p100');
    expect(info?.relations).toHaveLength(2);
    expect(info?.relations[0]).toMatchObject({ relation: 'Parent brand', id: 'p10', name: 'Studio Parent' });
    expect(info?.relations[1]).toMatchObject({ relation: 'Subsidiary', id: 'p11', name: 'Studio Child' });

    const readBack = readScrapedProducerInfo('p100');
    expect(readBack?.relations).toHaveLength(2);
  });

  it('lowercases an uppercase id and returns an empty relation list when no block exists', async () => {
    mockFetchHtml.mockResolvedValue('<html><body><h1>Other</h1></body></html>');
    const info = await scrapeProducerRelations('P200');
    expect(info?.pid).toBe('p200');
    expect(info?.relations).toEqual([]);
  });
});

describe('readScrapedProducerInfo', () => {
  it('returns null on a cache miss', () => {
    expect(readScrapedProducerInfo('p9999')).toBeNull();
  });

  it('returns null when the cached body fails schema validation', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_producer:p300', ?, NULL, NULL, ?, ?)`)
      .run(JSON.stringify({ pid: 'p300', relations: [{ relation: 'x', id: 'not-a-pid', name: 'y' }] }), now, now + 86_400_000);
    expect(readScrapedProducerInfo('p300')).toBeNull();
  });

  it('returns null when the cached body is unparseable JSON', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_producer:p301', '{broken', NULL, NULL, ?, ?)`)
      .run(now, now + 86_400_000);
    expect(readScrapedProducerInfo('p301')).toBeNull();
  });
});

describe('scrapeProducersForVn fan-out', () => {
  it('returns zeros when the VN row has no developers', async () => {
    seedVnWithDevs('v70', null);
    expect(await scrapeProducersForVn('v70')).toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns zeros when the VN is absent entirely', async () => {
    expect(await scrapeProducersForVn('v71')).toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns zeros when developers JSON holds no valid p-ids', async () => {
    seedVnWithDevs('v72', [{ id: 'not-a-pid' }, { name: 'no id' }]);
    expect(await scrapeProducersForVn('v72')).toEqual({ scanned: 0, downloaded: 0 });
  });

  it('scrapes each distinct developer id', async () => {
    seedVnWithDevs('v73', [
      { id: 'p400', name: 'Studio A' },
      { id: 'P400' }, // case-folded duplicate
      { id: 'p401' },
      { id: 'bogus' },
    ]);
    mockFetchHtml.mockResolvedValue(producerPage({ relations: [{ label: 'Parent brand', id: 'p1', name: 'X' }] }));
    const res = await scrapeProducersForVn('v73');
    expect(res.scanned).toBe(2); // p400, p401
    expect(res.downloaded).toBe(2);
  });

  it('records an error and continues when one producer scrape throws', async () => {
    seedVnWithDevs('v74', [{ id: 'p500' }, { id: 'p501' }]);
    mockFetchHtml
      .mockRejectedValueOnce(new Error('producer scrape failed'))
      .mockResolvedValueOnce(producerPage({ relations: [{ label: 'Imprint', id: 'p9', name: 'Y' }] }));
    const res = await scrapeProducersForVn('v74');
    expect(res.scanned).toBe(2);
    expect(res.downloaded).toBe(1);
  });

  it('continues when one producer page is unavailable', async () => {
    seedVnWithDevs('v76', [{ id: 'p502' }]);
    mockFetchHtml.mockResolvedValue(null);
    await expect(scrapeProducersForVn('v76')).resolves.toEqual({ scanned: 1, downloaded: 0 });
  });

  it('skips fresh cache entries unless force is set', async () => {
    seedVnWithDevs('v75', [{ id: 'p600' }]);
    const fresh = { pid: 'p600', relations: [], fetched_at: Date.now() };
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_producer:p600', ?, NULL, NULL, ?, ?)`)
      .run(JSON.stringify(fresh), Date.now(), Date.now() + 86_400_000);
    const res = await scrapeProducersForVn('v75');
    expect(res).toEqual({ scanned: 1, downloaded: 0 });
    expect(mockFetchHtml).not.toHaveBeenCalled();

    mockFetchHtml.mockResolvedValue(producerPage({ relations: [{ label: 'Parent brand', id: 'p1', name: 'X' }] }));
    const forced = await scrapeProducersForVn('v75', { force: true });
    expect(forced.downloaded).toBe(1);
  });
});
