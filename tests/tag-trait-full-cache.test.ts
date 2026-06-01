/**
 * Unit tests for the cache read helpers in:
 *   - src/lib/tag-full.ts → readTagFullCache(gid)
 *   - src/lib/trait-full.ts → readTraitFullCache(iid)
 *
 * Both helpers must:
 *   1. Return `null` on a cache miss.
 *   2. Return `null` on a corrupt JSON body (don't crash the caller).
 *   3. Splice the row's `fetched_at` into the returned payload — the
 *      stored body holds the upstream timestamp, but the row may have
 *      a fresher `fetched_at`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { readTagFullCache } from '@/lib/tag-full';
import { readTraitFullCache } from '@/lib/trait-full';

const NOW = 1716800000000;

function clearCache(): void {
  db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?').run('tag_full:%');
  db.prepare('DELETE FROM vndb_cache WHERE cache_key LIKE ?').run('trait_full:%');
}

function writeCacheRow(key: string, body: string, fetchedAt: number = NOW): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
  `).run(key, body, fetchedAt, fetchedAt + 30 * 24 * 3600 * 1000);
}

describe('readTagFullCache', () => {
  beforeEach(() => clearCache());

  it('returns null on cache miss', () => {
    expect(readTagFullCache('g90001')).toBeNull();
  });

  it('returns null on corrupt JSON body', () => {
    writeCacheRow('tag_full:g90002', '{not valid json');
    expect(readTagFullCache('g90002')).toBeNull();
  });

  it('round-trips a stored payload and uses the row fetched_at', () => {
    const stored = {
      tag: {
        id: 'g90003',
        name: 'Synthetic Tag',
        category: 'cont',
        description: '',
        searchable: true,
        applicable: true,
        vn_count: 12,
        aliases: [],
      },
      // Body has an older timestamp; the row's fetched_at must win.
      fetched_at: NOW - 100_000,
    };
    writeCacheRow('tag_full:g90003', JSON.stringify(stored), NOW);
    const got = readTagFullCache('g90003');
    expect(got).not.toBeNull();
    expect(got!.tag.id).toBe('g90003');
    expect(got!.fetched_at).toBe(NOW);
  });

  it('lowercases the gid before lookup', () => {
    writeCacheRow('tag_full:g90004', JSON.stringify({
      tag: {
        id: 'g90004',
        name: 'Synthetic Tag',
        aliases: [],
        description: null,
        category: 'cont',
        searchable: true,
        applicable: true,
        vn_count: 0,
      },
      fetched_at: NOW,
    }));
    // Uppercase input should still resolve.
    expect(readTagFullCache('G90004')).not.toBeNull();
  });
});

describe('readTraitFullCache', () => {
  beforeEach(() => clearCache());

  it('returns null on cache miss', () => {
    expect(readTraitFullCache('i90001')).toBeNull();
  });

  it('returns null on corrupt JSON body', () => {
    writeCacheRow('trait_full:i90002', '{still not json');
    expect(readTraitFullCache('i90002')).toBeNull();
  });

  it('round-trips a stored payload and uses the row fetched_at', () => {
    const stored = {
      trait: {
        id: 'i90003',
        name: 'Synthetic Trait',
        description: '',
        char_count: 5,
        searchable: true,
        applicable: true,
        sexual: false,
        group_id: null,
        group_name: null,
        aliases: [],
      },
      fetched_at: NOW - 100_000,
    };
    writeCacheRow('trait_full:i90003', JSON.stringify(stored), NOW);
    const got = readTraitFullCache('i90003');
    expect(got).not.toBeNull();
    expect(got!.trait.id).toBe('i90003');
    expect(got!.fetched_at).toBe(NOW);
  });

  it('lowercases the iid before lookup', () => {
    writeCacheRow('trait_full:i90004', JSON.stringify({
      trait: {
        id: 'i90004',
        name: 'Synthetic Trait',
        aliases: [],
        description: null,
        searchable: true,
        applicable: true,
        sexual: false,
        group_id: null,
        group_name: null,
        char_count: 0,
      },
      fetched_at: NOW,
    }));
    expect(readTraitFullCache('I90004')).not.toBeNull();
  });
});
