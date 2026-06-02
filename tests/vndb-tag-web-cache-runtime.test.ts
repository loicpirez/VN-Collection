/**
 * Hermetic coverage for `src/lib/vndb-tag-web-cache.ts` — the cache
 * read/write + stale-while-error wrapper around the vndb.org tag-hierarchy
 * scraper.
 *
 * The scraper (`fetchVndbWebHtml`) and the two HTML parsers are mocked so the
 * test drives only the cache module: fresh hit, forced refetch, stale read,
 * network-failure-with-cache (stale warning), network-failure-without-cache
 * (throws), and the `source_url` validation that rejects a hostile cached
 * origin. Cache rows live in the real per-worker SQLite. No network is
 * touched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchVndbWebHtmlMock, parseHomeMock, parseDetailMock } = vi.hoisted(() => ({
  fetchVndbWebHtmlMock: vi.fn(),
  parseHomeMock: vi.fn(),
  parseDetailMock: vi.fn(),
}));

vi.mock('@/lib/vndb-scrape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-scrape')>();
  return { ...actual, fetchVndbWebHtml: fetchVndbWebHtmlMock };
});

vi.mock('@/lib/vndb-tag-web-parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-tag-web-parser')>();
  return { ...actual, parseVndbTagHomeTree: parseHomeMock, parseVndbTagWebDetail: parseDetailMock };
});

import {
  getVndbTagHomeTree,
  getVndbTagWebDetail,
  readVndbTagHomeTreeCache,
  readVndbTagWebDetailCache,
  refreshVndbTagWebCache,
} from '@/lib/vndb-tag-web-cache';
import { clearCache, getCacheRow, putCacheRow } from '@/lib/db';
import type { VndbTagHomeTree, VndbTagWebDetail } from '@/lib/vndb-tag-web-parser';

const HOME_KEY = 'vndb-tag-web:home';
const DETAIL_KEY = (id: string) => `vndb-tag-web:detail:${id.toLowerCase()}`;

/** A minimal home tree the strict cache decoder accepts. */
function homeTree(): VndbTagHomeTree {
  return {
    groups: [
      {
        id: 'g90001',
        label: 'group-A',
        href: '/tag/g90001?tab=vndb',
        children: [{ id: 'g90002', name: 'child-A', href: '/tag/g90002?tab=vndb', count: 3 }],
      },
    ],
    recentlyAdded: [{ id: 'g90003', name: 'recent-A', href: '/tag/g90003?tab=vndb', count: 1 }],
    popular: [{ id: 'g90004', name: 'popular-A', href: '/tag/g90004?tab=vndb', count: 9 }],
    recentlyTaggedHref: '/g/links',
  };
}

/** A minimal tag detail the strict cache decoder accepts. */
function tagDetail(id: string): VndbTagWebDetail {
  return {
    id,
    name: `tag-${id}`,
    breadcrumb: [{ id: null, name: 'Tags', href: '/tags?mode=vndb' }],
    descriptionText: 'placeholder',
    properties: { searchable: true, applicable: true },
    categoryLabel: 'Content',
    aliases: ['alias-a'],
    childGroups: [{ title: 'child-group', children: [{ id: 'g90010', name: 'leaf', href: '/tag/g90010?tab=vndb' }] }],
  };
}

beforeEach(() => {
  clearCache();
  fetchVndbWebHtmlMock.mockReset();
  parseHomeMock.mockReset();
  parseDetailMock.mockReset();
  parseHomeMock.mockReturnValue(homeTree());
  parseDetailMock.mockImplementation((_html: string, id: string) => tagDetail(id));
});

afterEach(() => {
  fetchVndbWebHtmlMock.mockReset();
});

describe('getVndbTagHomeTree', () => {
  it('fetches, parses, and persists on a cold cache', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>home</html>');
    const r = await getVndbTagHomeTree();
    expect(r.stale).toBe(false);
    expect(r.source_url).toBe('https://vndb.org/g');
    expect(r.data.groups[0].id).toBe('g90001');
    // The cache row was written and is now directly readable.
    expect(getCacheRow(HOME_KEY)).not.toBeNull();
    const cached = readVndbTagHomeTreeCache();
    expect(cached?.data.popular[0].id).toBe('g90004');
  });

  it('serves a fresh cache row without re-scraping', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>home</html>');
    await getVndbTagHomeTree();
    fetchVndbWebHtmlMock.mockClear();
    const second = await getVndbTagHomeTree();
    expect(second.stale).toBe(false);
    expect(fetchVndbWebHtmlMock).not.toHaveBeenCalled();
  });

  it('force re-scrapes even when a fresh row exists', async () => {
    fetchVndbWebHtmlMock.mockResolvedValue('<html>home</html>');
    await getVndbTagHomeTree();
    fetchVndbWebHtmlMock.mockClear();
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>home2</html>');
    await getVndbTagHomeTree({ force: true });
    expect(fetchVndbWebHtmlMock).toHaveBeenCalledWith('/g', { force: true });
  });

  it('returns the stale cached tree with a warning when the scrape fails', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>home</html>');
    await getVndbTagHomeTree();
    // Expire the row so the next read is stale, then make the scrape fail.
    const row = getCacheRow(HOME_KEY)!;
    putCacheRow({ ...row, expires_at: Date.now() - 1 });
    fetchVndbWebHtmlMock.mockResolvedValueOnce(null);
    const r = await getVndbTagHomeTree();
    expect(r.stale).toBe(true);
    expect(r.warning).toMatch(/stale tag hierarchy/);
    expect(r.data.groups[0].id).toBe('g90001');
  });

  it('throws when the scrape fails and no cache exists', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce(null);
    await expect(getVndbTagHomeTree()).rejects.toThrow(/unavailable and no local cache/);
  });
});

describe('getVndbTagWebDetail', () => {
  it('fetches, parses, and persists one tag detail page', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>g90100</html>');
    const r = await getVndbTagWebDetail('G90100');
    // Id is normalised to lowercase for the cache key + source url.
    expect(r.data.id).toBe('g90100');
    expect(r.source_url).toBe('https://vndb.org/g90100');
    expect(getCacheRow(DETAIL_KEY('g90100'))).not.toBeNull();
    expect(fetchVndbWebHtmlMock).toHaveBeenCalledWith('/g90100', { force: undefined });
  });

  it('returns the stale detail with a per-id warning on scrape failure', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>g90101</html>');
    await getVndbTagWebDetail('g90101');
    const row = getCacheRow(DETAIL_KEY('g90101'))!;
    putCacheRow({ ...row, expires_at: Date.now() - 1 });
    fetchVndbWebHtmlMock.mockResolvedValueOnce(null);
    const r = await getVndbTagWebDetail('g90101');
    expect(r.stale).toBe(true);
    expect(r.warning).toMatch(/g90101 tag hierarchy/);
  });

  it('serves a fresh detail cache row and force-refreshes it on demand', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>g90103</html>');
    await getVndbTagWebDetail('g90103');
    fetchVndbWebHtmlMock.mockClear();
    await getVndbTagWebDetail('g90103');
    expect(fetchVndbWebHtmlMock).not.toHaveBeenCalled();
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>g90103-refresh</html>');
    await getVndbTagWebDetail('g90103', { force: true });
    expect(fetchVndbWebHtmlMock).toHaveBeenCalledWith('/g90103', { force: true });
  });

  it('throws when the detail scrape fails with no cache', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce(null);
    await expect(getVndbTagWebDetail('g90102')).rejects.toThrow(/g90102 is unavailable/);
  });
});

describe('source_url validation', () => {
  it('treats a cached row with a non-vndb.org origin as a miss', () => {
    // A poisoned cache row whose stored source_url points off-site must be
    // rejected by readParsed even though the payload shape is otherwise valid.
    putCacheRow({
      cache_key: HOME_KEY,
      body: JSON.stringify({ data: homeTree(), source_url: 'https://api.steampowered.com/g' }),
      etag: null,
      last_modified: null,
      fetched_at: Date.now(),
      expires_at: Date.now() + 60_000,
    });
    expect(readVndbTagHomeTreeCache()).toBeNull();
  });

  it('treats a structurally invalid cached detail payload as a miss', () => {
    putCacheRow({
      cache_key: DETAIL_KEY('g90200'),
      body: JSON.stringify({ data: { id: 'not-a-tag' }, source_url: 'https://vndb.org/g90200' }),
      etag: null,
      last_modified: null,
      fetched_at: Date.now(),
      expires_at: Date.now() + 60_000,
    });
    expect(readVndbTagWebDetailCache('g90200')).toBeNull();
  });
});

describe('refreshVndbTagWebCache', () => {
  it('force-refreshes the home tree', async () => {
    fetchVndbWebHtmlMock.mockResolvedValueOnce('<html>home</html>');
    await refreshVndbTagWebCache();
    expect(fetchVndbWebHtmlMock).toHaveBeenCalledWith('/g', { force: true });
    expect(getCacheRow(HOME_KEY)).not.toBeNull();
  });
});
