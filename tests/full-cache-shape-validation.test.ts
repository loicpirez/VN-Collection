import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { readStaffFullCache } from '@/lib/staff-full';
import { readCharacterFullCache } from '@/lib/character-full';
import { downloadFullTagsForVn, readTagFullCache } from '@/lib/tag-full';
import { readTraitFullCache } from '@/lib/trait-full';
import { downloadScreenshotReleasesForVn, readReleaseFullCache } from '@/lib/release-full';

const NOW = Date.now();
const VN_ID = 'v990030';

function writeCacheRow(key: string, body: string): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
  `).run(key, body, NOW, NOW + 60_000);
}

beforeEach(() => {
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE '%_full:%'`).run();
  db.prepare('DELETE FROM vn WHERE id = ?').run(VN_ID);
  db.prepare('INSERT INTO vn (id, title, fetched_at) VALUES (?, ?, ?)').run(VN_ID, 'Fixture', NOW);
});

describe('full-cache structure validation', () => {
  it('rejects incomplete staff payloads', () => {
    writeCacheRow('staff_full:s990030', '{}');
    expect(readStaffFullCache('s990030')).toBeNull();
  });

  it('rejects staff payloads with non-array credits', () => {
    writeCacheRow('staff_full:s990031', JSON.stringify({
      profile: null,
      productionCredits: {},
      vaCredits: [],
    }));
    expect(readStaffFullCache('s990031')).toBeNull();
  });

  it('rejects staff payloads with shallow flattened credits', () => {
    writeCacheRow('staff_full:s990032', JSON.stringify({
      profile: null,
      productionCredits: [{ id: 'v990032', title: 'Fixture', roles: [] }],
      vaCredits: [],
    }));
    expect(readStaffFullCache('s990032')).toBeNull();
  });

  it('rejects incomplete character payloads', () => {
    writeCacheRow('char_full:c990030', JSON.stringify({ profile: { id: 'c990030' } }));
    expect(readCharacterFullCache('c990030')).toBeNull();
  });

  it('rejects characters with malformed nested appearances', () => {
    writeCacheRow('char_full:c990031', JSON.stringify({
      profile: {
        id: 'c990031',
        name: 'Fixture',
        original: null,
        aliases: [],
        description: null,
        image: null,
        blood_type: null,
        height: null,
        weight: null,
        bust: null,
        waist: null,
        hips: null,
        cup: null,
        age: null,
        birthday: null,
        sex: null,
        gender: null,
        vns: [{ id: 'v990031' }],
        traits: [],
      },
    }));
    expect(readCharacterFullCache('c990031')).toBeNull();
  });

  it('rejects incomplete tag and trait payloads', () => {
    writeCacheRow('tag_full:g990030', JSON.stringify({ tag: { id: 'g990030' } }));
    writeCacheRow('trait_full:i990030', JSON.stringify({ trait: { id: 'i990030' } }));
    expect(readTagFullCache('g990030')).toBeNull();
    expect(readTraitFullCache('i990030')).toBeNull();
  });

  it('rejects incomplete release payloads', () => {
    writeCacheRow('release_full:r990030', JSON.stringify({ release: { id: 'r990030', title: 'Fixture' } }));
    expect(readReleaseFullCache('r990030')).toBeNull();
  });

  it('rejects release payloads with malformed nested rows', () => {
    writeCacheRow('release_full:r990031', JSON.stringify({
      release: {
        id: 'r990031',
        title: 'Fixture',
        alttitle: null,
        languages: [],
        platforms: [],
        media: [],
        released: null,
        minage: null,
        patch: false,
        freeware: false,
        uncensored: null,
        official: true,
        has_ero: false,
        resolution: null,
        engine: null,
        voiced: null,
        notes: null,
        gtin: null,
        catalog: null,
        producers: [{ id: 'p990031' }],
        extlinks: [],
        vns: [],
        images: [],
      },
    }));
    expect(readReleaseFullCache('r990031')).toBeNull();
  });

  it('treats parseable non-array VN tags as empty fan-out input', async () => {
    db.prepare('UPDATE vn SET tags = ? WHERE id = ?').run('{"id":"g990030"}', VN_ID);
    await expect(downloadFullTagsForVn(VN_ID, { force: true })).resolves.toEqual({
      scanned: 0,
      downloaded: 0,
    });
  });

  it('treats parseable non-array screenshots as empty fan-out input', async () => {
    db.prepare('UPDATE vn SET raw = ? WHERE id = ?').run('{"screenshots":{"release":{"id":"r990030"}}}', VN_ID);
    await expect(downloadScreenshotReleasesForVn(VN_ID, { force: true })).resolves.toEqual({
      scanned: 0,
      downloaded: 0,
    });
  });
});
