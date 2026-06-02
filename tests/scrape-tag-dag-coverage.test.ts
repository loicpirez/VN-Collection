/**
 * Hermetic coverage for `src/lib/scrape-tag-dag.ts`. The web scrape boundary
 * (`fetchVndbWebHtml`) is mocked with synthetic VNDB `/g<id>` markup so the
 * Parent/Child tag-DAG parser runs offline; `htmlToText` keeps its real
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
  readScrapedTagDag,
  scrapeTagDag,
  scrapeTagDagForVn,
} from '@/lib/scrape-tag-dag';

const mockFetchHtml = vi.mocked(fetchVndbWebHtml);

function clearCache(): void {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'scrape_tag:%'`).run();
}

function clearVnRows(): void {
  db.prepare(`DELETE FROM vn`).run();
}

function seedVnWithTags(id: string, tags: unknown): void {
  db.prepare(`INSERT INTO vn (id, title, tags, fetched_at) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET tags = excluded.tags`)
    .run(id, `Title ${id}`, tags === null ? null : JSON.stringify(tags), Date.now());
}

/** Build a synthetic /g<id> page with Parent Tags / Child Tags UL blocks. */
function tagPage(opts: {
  parents?: Array<{ id: string; name: string }>;
  children?: Array<{ id: string; name: string }>;
  selfId?: string;
} = {}): string {
  const { parents = [], children = [], selfId } = opts;
  const li = (nodes: Array<{ id: string; name: string }>) =>
    nodes.map((n) => `<li><a href="/${n.id}">${n.name}</a></li>`).join('');
  const selfLink = selfId ? `<li><a href="/${selfId}">itself</a></li>` : '';
  return [
    `<html><body>`,
    parents.length || selfId ? `<h2>Parent Tags</h2><ul>${li(parents)}${selfLink}</ul>` : '',
    children.length ? `<h2>Child Tags</h2><ul>${li(children)}</ul>` : '',
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

describe('scrapeTagDag', () => {
  it('rejects a malformed tag id without fetching', async () => {
    expect(await scrapeTagDag('bad')).toBeNull();
    expect(mockFetchHtml).not.toHaveBeenCalled();
  });

  it('returns null when the page is unreachable', async () => {
    mockFetchHtml.mockResolvedValue(null);
    expect(await scrapeTagDag('g100')).toBeNull();
  });

  it('parses parents and children, dedupes, and drops the self link', async () => {
    mockFetchHtml.mockResolvedValue(tagPage({
      parents: [
        { id: 'g10', name: 'Parent One' },
        { id: 'g10', name: 'Parent One dup' }, // duplicate id → deduped
      ],
      children: [{ id: 'g20', name: 'Child One' }],
      selfId: 'g100', // self reference should be excluded
    }));
    const dag = await scrapeTagDag('g100');
    expect(dag?.gid).toBe('g100');
    expect(dag?.parents).toHaveLength(1);
    expect(dag?.parents[0]).toMatchObject({ id: 'g10', name: 'Parent One' });
    expect(dag?.children).toHaveLength(1);
    expect(dag?.children[0]).toMatchObject({ id: 'g20', name: 'Child One' });

    const readBack = readScrapedTagDag('g100');
    expect(readBack?.parents).toHaveLength(1);
    expect(readBack?.children).toHaveLength(1);
  });

  it('lowercases an uppercase id and returns empty lists when no blocks exist', async () => {
    mockFetchHtml.mockResolvedValue('<html><body><h2>Other</h2></body></html>');
    const dag = await scrapeTagDag('G200');
    expect(dag?.gid).toBe('g200');
    expect(dag?.parents).toEqual([]);
    expect(dag?.children).toEqual([]);
  });
});

describe('readScrapedTagDag', () => {
  it('returns null on a cache miss', () => {
    expect(readScrapedTagDag('g9999')).toBeNull();
  });

  it('returns null when the cached body fails schema validation', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_tag:g300', ?, NULL, NULL, ?, ?)`)
      .run(JSON.stringify({ gid: 'g300', parents: [{ id: 'not-a-tag' }], children: [] }), now, now + 86_400_000);
    expect(readScrapedTagDag('g300')).toBeNull();
  });

  it('returns null when the cached body is unparseable JSON', () => {
    const now = Date.now();
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_tag:g301', 'not json', NULL, NULL, ?, ?)`)
      .run(now, now + 86_400_000);
    expect(readScrapedTagDag('g301')).toBeNull();
  });
});

describe('scrapeTagDagForVn fan-out', () => {
  it('returns zeros when the VN row has no tags', async () => {
    seedVnWithTags('v60', null);
    expect(await scrapeTagDagForVn('v60')).toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns zeros when the VN is absent entirely', async () => {
    expect(await scrapeTagDagForVn('v61')).toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns zeros when the tags JSON has no valid g-ids', async () => {
    seedVnWithTags('v62', [{ id: 'not-a-tag' }, { nope: 1 }, 'string-entry']);
    expect(await scrapeTagDagForVn('v62')).toEqual({ scanned: 0, downloaded: 0 });
  });

  it('scrapes each distinct tag id from the tags JSON', async () => {
    seedVnWithTags('v63', [
      { id: 'g400', rating: 2 },
      { id: 'G400' }, // case-folded duplicate
      { id: 'g401' },
      { id: 'bogus' },
    ]);
    mockFetchHtml.mockResolvedValue(tagPage({ parents: [{ id: 'g1', name: 'P' }] }));
    const res = await scrapeTagDagForVn('v63');
    expect(res.scanned).toBe(2); // g400, g401
    expect(res.downloaded).toBe(2);
  });

  it('records an error and continues when one tag scrape throws', async () => {
    seedVnWithTags('v64', [{ id: 'g500' }, { id: 'g501' }]);
    mockFetchHtml
      .mockRejectedValueOnce(new Error('tag scrape failed'))
      .mockResolvedValueOnce(tagPage({ children: [{ id: 'g9', name: 'C' }] }));
    const res = await scrapeTagDagForVn('v64');
    expect(res.scanned).toBe(2);
    expect(res.downloaded).toBe(1);
  });

  it('continues when one tag scrape returns no page', async () => {
    seedVnWithTags('v67', [{ id: 'g502' }]);
    mockFetchHtml.mockResolvedValue(null);
    expect(await scrapeTagDagForVn('v67')).toEqual({ scanned: 1, downloaded: 0 });
  });

  it('skips fresh cache entries unless force is set', async () => {
    seedVnWithTags('v65', [{ id: 'g600' }]);
    const fresh = { gid: 'g600', parents: [], children: [], fetched_at: Date.now() };
    db.prepare(`INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at) VALUES ('scrape_tag:g600', ?, NULL, NULL, ?, ?)`)
      .run(JSON.stringify(fresh), Date.now(), Date.now() + 86_400_000);
    const res = await scrapeTagDagForVn('v65');
    expect(res).toEqual({ scanned: 1, downloaded: 0 });
    expect(mockFetchHtml).not.toHaveBeenCalled();

    mockFetchHtml.mockResolvedValue(tagPage({ parents: [{ id: 'g1', name: 'P' }] }));
    const forced = await scrapeTagDagForVn('v65', { force: true });
    expect(forced.downloaded).toBe(1);
  });

  it('returns zeros for a malformed tags JSON string', async () => {
    db.prepare(`INSERT INTO vn (id, title, tags, fetched_at) VALUES ('v66', 'Title v66', '{broken', ?)`).run(Date.now());
    expect(await scrapeTagDagForVn('v66')).toEqual({ scanned: 0, downloaded: 0 });
  });
});
