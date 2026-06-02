/**
 * Decode coverage for the persisted full-cache readers:
 *   - src/lib/release-full.ts   → readReleaseFullCache(rid)
 *   - src/lib/staff-full.ts     → readStaffFullCache(sid) / decodeStaffFullPayload
 *   - src/lib/character-full.ts → readCharacterFullCache(cid) / decodeCharacterFullPayload
 *   - src/lib/tag-full.ts       → readTagFullCache(gid)
 *   - src/lib/trait-full.ts     → readTraitFullCache(iid)
 *
 * Each reader pulls a `vndb_cache` row, JSON-parses the body, and runs it
 * through a strict structural decoder. The decoder rejects partial /
 * malformed payloads by returning `null` so the caller falls back to a
 * live fetch instead of rendering corrupt data.
 *
 * These tests seed representative cache rows through the real SQLite
 * handle and assert both the well-formed round-trip (including the
 * row-level `fetched_at` splice) and the rejection branches. No network,
 * no upstream module mocked — the readers decode persisted bytes only.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { readReleaseFullCache } from '@/lib/release-full';
import { decodeStaffFullPayload, readStaffFullCache } from '@/lib/staff-full';
import { decodeCharacterFullPayload, readCharacterFullCache } from '@/lib/character-full';
import { readTagFullCache } from '@/lib/tag-full';
import { readTraitFullCache } from '@/lib/trait-full';

const NOW = 1_716_000_000_000;

function writeCacheRow(key: string, body: string, fetchedAt: number = NOW): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET
      body = excluded.body,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at
  `).run(key, body, fetchedAt, fetchedAt + 60_000);
}

function validRelease() {
  return {
    id: 'r90001',
    title: 'Fixture release',
    alttitle: null,
    languages: [{ lang: 'ja', title: null, latin: null, mtl: false, main: true }],
    platforms: ['win'],
    media: [{ medium: 'dvd', qty: 1 }],
    released: '2026-01-01',
    minage: 18,
    patch: false,
    freeware: false,
    uncensored: null,
    official: true,
    has_ero: true,
    resolution: [1920, 1080],
    engine: null,
    voiced: 4,
    notes: null,
    gtin: null,
    catalog: null,
    producers: [{ id: 'p90001', name: 'Studio X', developer: true, publisher: false }],
    extlinks: [],
    vns: [{ id: 'v90001', rtype: 'complete' }],
    images: [],
  };
}

function validCharacterProfile() {
  return {
    id: 'c90001',
    name: 'Heroine A',
    original: null,
    aliases: [],
    description: null,
    image: null,
    blood_type: 'a',
    height: 160,
    weight: null,
    bust: null,
    waist: null,
    hips: null,
    cup: null,
    age: 18,
    birthday: [4, 12],
    sex: ['f', null],
    gender: ['f', null],
    vns: [{ id: 'v90001', role: 'main', spoiler: 0 }],
    traits: [],
  };
}

function validStaffProfile() {
  return {
    id: 's90001',
    aid: 1,
    ismain: true,
    name: 'Staff A',
    original: null,
    lang: 'ja',
    gender: null,
    description: null,
    aliases: [{ aid: 1, name: 'Staff A', latin: null, ismain: true }],
    extlinks: [],
  };
}

function validStaffVnCredit() {
  return {
    id: 'v90001',
    title: 'Fixture VN',
    alttitle: null,
    released: '2026-01-01',
    rating: 80,
    image_url: null,
    image_thumb: null,
    roles: [{ role: 'scenario', note: null }],
  };
}

function validStaffVaCredit() {
  return {
    id: 'v90002',
    title: 'Fixture VN 2',
    alttitle: null,
    released: null,
    rating: null,
    image_url: null,
    image_thumb: null,
    characters: [{ id: 'c90001', name: 'Heroine A', original: null, image_url: null, note: null }],
  };
}

function validTag() {
  return {
    id: 'g90001',
    name: 'Synthetic Tag',
    aliases: [],
    description: null,
    category: 'cont',
    searchable: true,
    applicable: true,
    vn_count: 7,
  };
}

function validTrait() {
  return {
    id: 'i90001',
    name: 'Synthetic Trait',
    aliases: [],
    description: null,
    searchable: true,
    applicable: true,
    sexual: false,
    group_id: null,
    group_name: null,
    char_count: 3,
  };
}

beforeEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE '%_full:%'`).run();
});

describe('readReleaseFullCache', () => {
  it('returns null on a cache miss', () => {
    expect(readReleaseFullCache('r90099')).toBeNull();
  });

  it('returns null when the stored body is not valid JSON', () => {
    writeCacheRow('release_full:r90098', '{ not json');
    expect(readReleaseFullCache('r90098')).toBeNull();
  });

  it('decodes a well-formed release row and splices the row fetched_at', () => {
    writeCacheRow(
      'release_full:r90001',
      JSON.stringify({ release: validRelease(), fetched_at: NOW - 999_999 }),
      NOW,
    );
    const got = readReleaseFullCache('r90001');
    expect(got).not.toBeNull();
    expect(got!.release.id).toBe('r90001');
    expect(got!.release.producers[0].id).toBe('p90001');
    expect(got!.fetched_at).toBe(NOW);
  });

  it('lowercases the rid before lookup', () => {
    writeCacheRow('release_full:r90002', JSON.stringify({ release: { ...validRelease(), id: 'r90002' } }));
    expect(readReleaseFullCache('R90002')).not.toBeNull();
  });

  it('rejects a row whose release fails the strict decoder', () => {
    writeCacheRow(
      'release_full:r90003',
      JSON.stringify({ release: { ...validRelease(), id: 'r90003', producers: [{ id: 'p90003' }] } }),
    );
    expect(readReleaseFullCache('r90003')).toBeNull();
  });

  it('rejects a row missing the release envelope entirely', () => {
    writeCacheRow('release_full:r90004', JSON.stringify({ fetched_at: NOW }));
    expect(readReleaseFullCache('r90004')).toBeNull();
  });
});

describe('readStaffFullCache / decodeStaffFullPayload', () => {
  it('returns null on a cache miss', () => {
    expect(readStaffFullCache('s90099')).toBeNull();
  });

  it('returns null on a corrupt JSON body', () => {
    writeCacheRow('staff_full:s90098', 'not-json-at-all');
    expect(readStaffFullCache('s90098')).toBeNull();
  });

  it('decodes a full staff payload (profile + credits) and uses the row fetched_at', () => {
    writeCacheRow(
      'staff_full:s90001',
      JSON.stringify({
        profile: validStaffProfile(),
        productionCredits: [validStaffVnCredit()],
        vaCredits: [validStaffVaCredit()],
        fetched_at: NOW - 5,
      }),
      NOW,
    );
    const got = readStaffFullCache('s90001');
    expect(got).not.toBeNull();
    expect(got!.profile?.id).toBe('s90001');
    expect(got!.productionCredits).toHaveLength(1);
    expect(got!.vaCredits[0].characters[0].id).toBe('c90001');
    expect(got!.fetched_at).toBe(NOW);
  });

  it('accepts a null profile with empty credit arrays', () => {
    const got = decodeStaffFullPayload(
      JSON.stringify({ profile: null, productionCredits: [], vaCredits: [] }),
      NOW,
    );
    expect(got).not.toBeNull();
    expect(got!.profile).toBeNull();
    expect(got!.fetched_at).toBe(NOW);
  });

  it('rejects a payload whose profile is present but structurally invalid', () => {
    expect(
      decodeStaffFullPayload(
        JSON.stringify({ profile: { id: 's90001' }, productionCredits: [], vaCredits: [] }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects a production credit with a non-VN id', () => {
    expect(
      decodeStaffFullPayload(
        JSON.stringify({
          profile: null,
          productionCredits: [{ ...validStaffVnCredit(), id: 'p90001' }],
          vaCredits: [],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects a production credit with a malformed role row', () => {
    expect(
      decodeStaffFullPayload(
        JSON.stringify({
          profile: null,
          productionCredits: [{ ...validStaffVnCredit(), roles: [{ note: null }] }],
          vaCredits: [],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects a VA credit with a malformed character row', () => {
    expect(
      decodeStaffFullPayload(
        JSON.stringify({
          profile: null,
          productionCredits: [],
          vaCredits: [{ ...validStaffVaCredit(), characters: [{ id: 'bad', name: 'x' }] }],
        }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects when productionCredits is not an array', () => {
    expect(
      decodeStaffFullPayload(
        JSON.stringify({ profile: null, productionCredits: {}, vaCredits: [] }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects an absent body', () => {
    expect(decodeStaffFullPayload(null, NOW)).toBeNull();
    expect(decodeStaffFullPayload(undefined, NOW)).toBeNull();
  });
});

describe('readCharacterFullCache / decodeCharacterFullPayload', () => {
  it('returns null on a cache miss', () => {
    expect(readCharacterFullCache('c90099')).toBeNull();
  });

  it('returns null on a corrupt JSON body', () => {
    writeCacheRow('char_full:c90098', '{ broken');
    expect(readCharacterFullCache('c90098')).toBeNull();
  });

  it('decodes a well-formed character profile and uses the row fetched_at', () => {
    writeCacheRow(
      'char_full:c90001',
      JSON.stringify({ profile: validCharacterProfile(), fetched_at: NOW - 100 }),
      NOW,
    );
    const got = readCharacterFullCache('c90001');
    expect(got).not.toBeNull();
    expect(got!.profile?.id).toBe('c90001');
    expect(got!.profile?.vns[0].id).toBe('v90001');
    expect(got!.fetched_at).toBe(NOW);
  });

  it('decodes a stored null profile (known "no such character") row', () => {
    const got = decodeCharacterFullPayload(JSON.stringify({ profile: null }), NOW);
    expect(got).toEqual({ profile: null, fetched_at: NOW });
  });

  it('rejects a payload that omits the profile key entirely', () => {
    expect(decodeCharacterFullPayload(JSON.stringify({ fetched_at: NOW }), NOW)).toBeNull();
  });

  it('rejects a profile that fails the strict character decoder', () => {
    expect(
      decodeCharacterFullPayload(
        JSON.stringify({ profile: { ...validCharacterProfile(), birthday: [4] } }),
        NOW,
      ),
    ).toBeNull();
  });

  it('rejects an absent or non-object body', () => {
    expect(decodeCharacterFullPayload(null, NOW)).toBeNull();
    expect(decodeCharacterFullPayload('[]', NOW)).toBeNull();
  });
});

describe('readTagFullCache', () => {
  it('returns null on a cache miss', () => {
    expect(readTagFullCache('g90099')).toBeNull();
  });

  it('decodes a well-formed tag row and splices the row fetched_at', () => {
    writeCacheRow(
      'tag_full:g90001',
      JSON.stringify({ tag: validTag(), fetched_at: NOW - 1 }),
      NOW,
    );
    const got = readTagFullCache('g90001');
    expect(got).not.toBeNull();
    expect(got!.tag.id).toBe('g90001');
    expect(got!.tag.category).toBe('cont');
    expect(got!.fetched_at).toBe(NOW);
  });

  it('rejects a tag with an out-of-range category', () => {
    writeCacheRow('tag_full:g90002', JSON.stringify({ tag: { ...validTag(), id: 'g90002', category: 'bogus' } }));
    expect(readTagFullCache('g90002')).toBeNull();
  });
});

describe('readTraitFullCache', () => {
  it('returns null on a cache miss', () => {
    expect(readTraitFullCache('i90099')).toBeNull();
  });

  it('decodes a well-formed trait row and splices the row fetched_at', () => {
    writeCacheRow(
      'trait_full:i90001',
      JSON.stringify({ trait: validTrait(), fetched_at: NOW - 1 }),
      NOW,
    );
    const got = readTraitFullCache('i90001');
    expect(got).not.toBeNull();
    expect(got!.trait.id).toBe('i90001');
    expect(got!.fetched_at).toBe(NOW);
  });

  it('rejects a trait whose group_id is not a trait id', () => {
    writeCacheRow('trait_full:i90002', JSON.stringify({ trait: { ...validTrait(), id: 'i90002', group_id: 'bad' } }));
    expect(readTraitFullCache('i90002')).toBeNull();
  });
});
