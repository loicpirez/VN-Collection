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

function validDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'g990050',
    name: 'Fixture',
    breadcrumb: [],
    properties: {},
    childGroups: [],
    ...overrides,
  };
}

function nestedNode(depth: number): Record<string, unknown> {
  return {
    id: `g${990100 + depth}`,
    name: 'Fixture child',
    href: `/tag/g${990100 + depth}?tab=vndb`,
    children: depth === 0 ? [] : [nestedNode(depth - 1)],
  };
}

beforeEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE 'vndb-tag-web:%'`).run();
});

describe('VNDB tag-web cache structure validation', () => {
  it('accepts a valid home-tree envelope', async () => {
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
    expect((await readVndbTagHomeTreeCache())?.data.groups).toHaveLength(1);
  });

  it('rejects non-array home-tree groups', async () => {
    writeCacheRow('vndb-tag-web:home', {
      source_url: 'https://vndb.org/g',
      data: { groups: {}, recentlyAdded: [], popular: [] },
    });
    expect(await readVndbTagHomeTreeCache()).toBeNull();
  });

  it('rejects unsafe cached source URLs', async () => {
    writeCacheRow('vndb-tag-web:home', {
      source_url: 'http://127.0.0.1/internal',
      data: { groups: [], recentlyAdded: [], popular: [] },
    });
    expect(await readVndbTagHomeTreeCache()).toBeNull();
  });

  it('rejects non-canonical nested tag links', async () => {
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
    expect(await readVndbTagHomeTreeCache()).toBeNull();
  });

  it('rejects malformed tag-detail child groups', async () => {
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
    expect(await readVndbTagWebDetailCache('g990050')).toBeNull();
  });

  it('accepts canonical and null tag breadcrumb links', async () => {
    writeCacheRow('vndb-tag-web:detail:g990050', {
      source_url: 'https://vndb.org/g990050',
      data: validDetail({
        breadcrumb: [
          { id: null, name: 'Tags', href: '/tags?mode=vndb' },
          { id: 'g990049', name: 'Parent', href: '/tag/g990049?tab=vndb' },
          { id: 'g990050', name: 'Fixture', href: null },
        ],
      }),
    });
    expect((await readVndbTagWebDetailCache('g990050'))?.data.breadcrumb).toHaveLength(3);
  });

  it('rejects malformed breadcrumbs and over-deep trees', async () => {
    writeCacheRow('vndb-tag-web:detail:g990050', {
      source_url: 'https://vndb.org/g990050',
      data: validDetail({ breadcrumb: [null] }),
    });
    expect(await readVndbTagWebDetailCache('g990050')).toBeNull();
    writeCacheRow('vndb-tag-web:home', {
      source_url: 'https://vndb.org/g',
      data: {
        groups: [{
          id: 'g990050',
          label: 'Fixture group',
          href: '/tag/g990050?tab=vndb',
          children: [nestedNode(9)],
        }],
        recentlyAdded: [],
        popular: [],
      },
    });
    expect(await readVndbTagHomeTreeCache()).toBeNull();
  });

  it('rejects malformed cached JSON', async () => {
    db.prepare(`
      INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
      VALUES (?, ?, NULL, NULL, ?, ?)
    `).run('vndb-tag-web:home', '{', NOW, NOW + 60_000);
    expect(await readVndbTagHomeTreeCache()).toBeNull();
  });
});
