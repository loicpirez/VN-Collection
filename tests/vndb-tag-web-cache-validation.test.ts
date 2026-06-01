import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { readVndbTagHomeTreeCache, readVndbTagWebDetailCache } from '@/lib/vndb-tag-web-cache';

const NOW = Date.now();

function writeCacheRow(key: string, body: unknown): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
  `).run(key, JSON.stringify(body), NOW, NOW + 60_000);
}

beforeEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'vndb-tag-web:%'`).run();
});

describe('VNDB tag-web cache structure validation', () => {
  it('accepts a valid home-tree envelope', () => {
    writeCacheRow('vndb-tag-web:home', {
      source_url: 'https://vndb.org/g',
      data: {
        groups: [{
          id: 'g990050',
          label: 'Fixture group',
          href: '/tag/g990050?tab=vndb',
          children: [],
          moreCount: null,
        }],
        recentlyAdded: [],
        popular: [],
        recentlyTaggedHref: '/g/links',
      },
    });
    expect(readVndbTagHomeTreeCache()?.data.groups).toHaveLength(1);
  });

  it('rejects non-array home-tree groups', () => {
    writeCacheRow('vndb-tag-web:home', {
      source_url: 'https://vndb.org/g',
      data: { groups: {}, recentlyAdded: [], popular: [] },
    });
    expect(readVndbTagHomeTreeCache()).toBeNull();
  });

  it('rejects unsafe cached source URLs', () => {
    writeCacheRow('vndb-tag-web:home', {
      source_url: 'http://127.0.0.1/internal',
      data: { groups: [], recentlyAdded: [], popular: [] },
    });
    expect(readVndbTagHomeTreeCache()).toBeNull();
  });

  it('rejects non-canonical nested tag links', () => {
    writeCacheRow('vndb-tag-web:home', {
      source_url: 'https://vndb.org/g',
      data: {
        groups: [{
          id: 'g990050',
          label: 'Fixture group',
          href: '/tag/g990050?tab=vndb',
          children: [{
            id: 'g990051',
            name: 'Fixture child',
            href: 'https://example.invalid',
          }],
        }],
        recentlyAdded: [],
        popular: [],
      },
    });
    expect(readVndbTagHomeTreeCache()).toBeNull();
  });

  it('rejects malformed tag-detail child groups', () => {
    writeCacheRow('vndb-tag-web:detail:g990050', {
      source_url: 'https://vndb.org/g990050',
      data: {
        id: 'g990050',
        name: 'Fixture',
        breadcrumb: [],
        properties: {},
        childGroups: {},
      },
    });
    expect(readVndbTagWebDetailCache('g990050')).toBeNull();
  });
});
