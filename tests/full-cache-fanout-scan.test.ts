/**
 * Fan-out scan + write coverage for the per-VN "download all" helpers:
 *   - release-full.ts   → downloadFullReleaseInfo / downloadScreenshotReleasesForVn / downloadFullReleasesForVn
 *   - staff-full.ts     → downloadFullStaffInfo / downloadFullStaffForVn
 *   - character-full.ts → downloadFullCharacterInfo / downloadFullCharForVn
 *   - tag-full.ts       → downloadFullTagInfo / downloadFullTagsForVn
 *   - trait-full.ts     → downloadFullTraitInfo / downloadFullTraitsForVn
 *   - relations-full.ts → downloadFullRelationsForVn
 *   - producer-full.ts  → downloadFullProducerForVn
 *
 * These walk the local DB (vn / vn_staff_credit / vn_va_credit /
 * character_vn_index / vn.tags / vn.developers / vn.raw) to collect ids,
 * skip ids already fresh in the cache, then fetch + persist the rest. The
 * tests cover: the fan-out-disabled opt-out, the empty/malformed input
 * branches, the "already fresh → skip" branch, and the live download +
 * cache-write path with the upstream fetchers mocked.
 *
 * Hermetic: `@/lib/vndb`, `@/lib/producer-completion`, and `@/lib/vndb`'s
 * fetchers are mocked. Synthetic ids only. The progress tracker
 * (`download-status`) is in-memory and schedules no timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getReleaseMock = vi.hoisted(() => vi.fn());
const getReleasesForVnMock = vi.hoisted(() => vi.fn());
const getStaffMock = vi.hoisted(() => vi.fn());
const fetchStaffVnListMock = vi.hoisted(() => vi.fn());
const fetchVaVnListMock = vi.hoisted(() => vi.fn());
const getCharacterMock = vi.hoisted(() => vi.fn());
const getTagMock = vi.hoisted(() => vi.fn());
const getTraitMock = vi.hoisted(() => vi.fn());
const getVnMock = vi.hoisted(() => vi.fn());
const fetchProducerCompletionMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/vndb', () => ({
  getRelease: getReleaseMock,
  getReleasesForVn: getReleasesForVnMock,
  getStaff: getStaffMock,
  fetchStaffVnList: fetchStaffVnListMock,
  fetchVaVnList: fetchVaVnListMock,
  getCharacter: getCharacterMock,
  getTag: getTagMock,
  getTrait: getTraitMock,
  getVn: getVnMock,
}));

vi.mock('@/lib/producer-completion', () => ({
  fetchProducerCompletion: fetchProducerCompletionMock,
}));

import { db, getAppSetting, setAppSetting } from '@/lib/db';
import {
  downloadFullReleaseInfo,
  downloadFullReleasesForVn,
  downloadScreenshotReleasesForVn,
  readReleaseFullCache,
} from '@/lib/release-full';
import { downloadFullStaffForVn, downloadFullStaffInfo, readStaffFullCache } from '@/lib/staff-full';
import { downloadFullCharForVn, downloadFullCharacterInfo, readCharacterFullCache } from '@/lib/character-full';
import { downloadFullTagInfo, downloadFullTagsForVn, readTagFullCache } from '@/lib/tag-full';
import { downloadFullTraitInfo, downloadFullTraitsForVn, readTraitFullCache } from '@/lib/trait-full';
import { downloadFullRelationsForVn } from '@/lib/relations-full';
import { downloadFullProducerForVn } from '@/lib/producer-full';

const NOW = Date.now();
const VN = 'v90500';

function release(id: string) {
  return {
    id,
    title: 'Fixture release',
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
    producers: [],
    extlinks: [],
    vns: [],
    images: [],
  };
}

function staffProfile(id: string) {
  return {
    id,
    aid: 1,
    ismain: true,
    name: 'Staff A',
    original: null,
    lang: 'ja',
    gender: null,
    description: null,
    aliases: [],
    extlinks: [],
  };
}

function characterProfile(id: string, vnId: string) {
  return {
    id,
    name: 'Heroine A',
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
    vns: [{ id: vnId, role: 'main', spoiler: 0 }],
    traits: [{ id: 'i90500', name: 'Trait', group_name: 'Group', spoiler: 0, sexual: false }],
  };
}

function tag(id: string) {
  return {
    id,
    name: 'Tag',
    aliases: [],
    description: null,
    category: 'cont',
    searchable: true,
    applicable: true,
    vn_count: 1,
  };
}

function trait(id: string) {
  return {
    id,
    name: 'Trait',
    aliases: [],
    description: null,
    searchable: true,
    applicable: true,
    sexual: false,
    group_id: null,
    group_name: null,
    char_count: 1,
  };
}

function seedVn(id: string, cols: { raw?: string; tags?: string; developers?: string } = {}): void {
  db.prepare(`
    INSERT INTO vn (id, title, fetched_at, raw, tags, developers)
    VALUES (?, 'Fixture VN', ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET raw = excluded.raw, tags = excluded.tags, developers = excluded.developers
  `).run(id, NOW, cols.raw ?? null, cols.tags ?? null, cols.developers ?? null);
}

function writeCacheRow(key: string, body: string, fetchedAt: number = NOW): void {
  db.prepare(`
    INSERT INTO vndb_cache (cache_key, body, etag, last_modified, fetched_at, expires_at)
    VALUES (?, ?, NULL, NULL, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET body = excluded.body, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at
  `).run(key, body, fetchedAt, fetchedAt + 60_000);
}

let priorFanout: string | null;

beforeEach(() => {
  for (const m of [
    getReleaseMock, getReleasesForVnMock, getStaffMock, fetchStaffVnListMock, fetchVaVnListMock,
    getCharacterMock, getTagMock, getTraitMock, getVnMock, fetchProducerCompletionMock,
  ]) m.mockReset();
  priorFanout = getAppSetting('vndb_fanout');
  setAppSetting('vndb_fanout', null);
  db.prepare(`DELETE FROM vndb_cache WHERE cache_key LIKE '%_full:%'`).run();
  db.prepare('DELETE FROM vn_staff_credit').run();
  db.prepare('DELETE FROM vn_va_credit').run();
  db.prepare('DELETE FROM character_vn_index').run();
  db.prepare('DELETE FROM staff_credit_index').run();
  db.prepare(`DELETE FROM producer WHERE id LIKE 'p905%'`).run();
  db.prepare(`DELETE FROM vn WHERE id LIKE 'v905%'`).run();
});

afterEach(() => {
  setAppSetting('vndb_fanout', priorFanout);
});

describe('fan-out disabled opt-out', () => {
  it('every per-VN helper returns the zero result without touching upstream when vndb_fanout=0', async () => {
    setAppSetting('vndb_fanout', '0');
    seedVn(VN, { raw: '{"screenshots":[{"release":{"id":"r90500"}}],"relations":[{"id":"v90501"}]}', tags: '[{"id":"g90500"}]', developers: '[{"id":"p90500"}]' });
    const zero = { scanned: 0, downloaded: 0 };
    await expect(downloadScreenshotReleasesForVn(VN)).resolves.toEqual(zero);
    await expect(downloadFullReleasesForVn(VN)).resolves.toEqual(zero);
    await expect(downloadFullStaffForVn(VN)).resolves.toEqual(zero);
    await expect(downloadFullCharForVn(VN)).resolves.toEqual(zero);
    await expect(downloadFullTagsForVn(VN)).resolves.toEqual(zero);
    await expect(downloadFullTraitsForVn(VN)).resolves.toEqual(zero);
    await expect(downloadFullRelationsForVn(VN)).resolves.toEqual(zero);
    await expect(downloadFullProducerForVn(VN)).resolves.toEqual(zero);
    expect(getReleaseMock).not.toHaveBeenCalled();
    expect(getVnMock).not.toHaveBeenCalled();
    expect(fetchProducerCompletionMock).not.toHaveBeenCalled();
  });
});

describe('downloadFullReleaseInfo', () => {
  it('persists a decodable cache row on success', async () => {
    getReleaseMock.mockResolvedValue(release('r90500'));
    const payload = await downloadFullReleaseInfo('r90500');
    expect(payload).not.toBeNull();
    expect(readReleaseFullCache('r90500')?.release.id).toBe('r90500');
  });

  it('returns null and writes nothing when VNDB does not recognise the id', async () => {
    getReleaseMock.mockResolvedValue(null);
    expect(await downloadFullReleaseInfo('r90599')).toBeNull();
    expect(readReleaseFullCache('r90599')).toBeNull();
  });
});

describe('downloadScreenshotReleasesForVn', () => {
  it('returns zero when the VN has no raw payload', async () => {
    seedVn(VN);
    await expect(downloadScreenshotReleasesForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
  });

  it('downloads each unique screenshot release id and writes the cache', async () => {
    seedVn(VN, { raw: JSON.stringify({ screenshots: [{ release: { id: 'r90500' } }, { release: { id: 'r90500' } }, { release: { id: 'r90501' } }] }) });
    getReleaseMock.mockImplementation((rid: string) => Promise.resolve(release(rid)));
    const r = await downloadScreenshotReleasesForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 2, downloaded: 2 });
    expect(getReleaseMock).toHaveBeenCalledTimes(2);
    expect(readReleaseFullCache('r90500')).not.toBeNull();
    expect(readReleaseFullCache('r90501')).not.toBeNull();
  });

  it('skips screenshot releases already fresh in the cache', async () => {
    writeCacheRow('release_full:r90500', JSON.stringify({ release: release('r90500'), fetched_at: NOW }), NOW);
    seedVn(VN, { raw: JSON.stringify({ screenshots: [{ release: { id: 'r90500' } }] }) });
    const r = await downloadScreenshotReleasesForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 1, downloaded: 0 });
    expect(getReleaseMock).not.toHaveBeenCalled();
  });

  it('records an error and continues when one screenshot-release fetch rejects', async () => {
    seedVn(VN, { raw: JSON.stringify({ screenshots: [{ release: { id: 'r90502' } }, { release: { id: 'r90503' } }] }) });
    getReleaseMock.mockImplementation((rid: string) =>
      rid === 'r90502' ? Promise.reject(new Error('offline')) : Promise.resolve(release(rid)),
    );
    const r = await downloadScreenshotReleasesForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(1);
    expect(readReleaseFullCache('r90503')).not.toBeNull();
  });

  it('does not count screenshot releases missing upstream', async () => {
    seedVn(VN, { raw: JSON.stringify({ screenshots: [{ release: { id: 'r90504' } }] }) });
    getReleaseMock.mockResolvedValue(null);
    await expect(downloadScreenshotReleasesForVn(VN, { force: true })).resolves.toEqual({ scanned: 1, downloaded: 0 });
  });
});

describe('downloadFullReleasesForVn', () => {
  it('returns zero when getReleasesForVn throws', async () => {
    seedVn(VN);
    getReleasesForVnMock.mockRejectedValue(new Error('offline'));
    await expect(downloadFullReleasesForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns zero when the VN has no releases', async () => {
    seedVn(VN);
    getReleasesForVnMock.mockResolvedValue([]);
    await expect(downloadFullReleasesForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
  });

  it('caches every returned release row', async () => {
    seedVn(VN);
    getReleasesForVnMock.mockResolvedValue([release('r90510'), release('r90511')]);
    const r = await downloadFullReleasesForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 2, downloaded: 2 });
    expect(readReleaseFullCache('r90510')).not.toBeNull();
    expect(readReleaseFullCache('r90511')).not.toBeNull();
  });

  it('skips releases already fresh in the cache', async () => {
    seedVn(VN);
    writeCacheRow('release_full:r90512', JSON.stringify({ release: release('r90512'), fetched_at: NOW }), NOW);
    getReleasesForVnMock.mockResolvedValue([release('r90512')]);
    await expect(downloadFullReleasesForVn(VN, { force: true })).resolves.toEqual({ scanned: 1, downloaded: 0 });
  });
});

describe('downloadFullStaffInfo / downloadFullStaffForVn', () => {
  it('persists a staff payload and rebuilds the credit index', async () => {
    getStaffMock.mockResolvedValue(staffProfile('s90500'));
    fetchStaffVnListMock.mockResolvedValue([]);
    fetchVaVnListMock.mockResolvedValue([]);
    await downloadFullStaffInfo('s90500');
    expect(readStaffFullCache('s90500')?.profile?.id).toBe('s90500');
  });

  it('indexes both production and VA credits onto staff_credit_index', async () => {
    getStaffMock.mockResolvedValue(staffProfile('s90505'));
    fetchStaffVnListMock.mockResolvedValue([
      { id: 'v90505', title: 'VN', alttitle: null, released: null, rating: null, image_url: null, image_thumb: null, roles: [{ role: 'scenario', note: null }] },
    ]);
    fetchVaVnListMock.mockResolvedValue([
      { id: 'v90506', title: 'VN', alttitle: null, released: null, rating: null, image_url: null, image_thumb: null, characters: [{ id: 'c90505', name: 'Heroine', original: null, image_url: null, note: null }] },
    ]);
    await downloadFullStaffInfo('s90505');
    const idx = db.prepare('SELECT vn_id, is_va FROM staff_credit_index WHERE sid = ? ORDER BY is_va').all('s90505') as { vn_id: string; is_va: number }[];
    expect(idx).toEqual([
      { vn_id: 'v90505', is_va: 0 },
      { vn_id: 'v90506', is_va: 1 },
    ]);
    const got = readStaffFullCache('s90505');
    expect(got?.productionCredits).toHaveLength(1);
    expect(got?.vaCredits).toHaveLength(1);
  });

  it('records an error and continues when one staff fetch rejects mid-loop', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO vn_staff_credit (vn_id, sid, role, name) VALUES (?, 's90507', 'scenario', 'A')`).run(VN);
    db.prepare(`INSERT INTO vn_staff_credit (vn_id, sid, role, name) VALUES (?, 's90508', 'art', 'B')`).run(VN);
    getStaffMock.mockImplementation((sid: string) =>
      sid === 's90507' ? Promise.reject(new Error('offline')) : Promise.resolve(staffProfile(sid)),
    );
    fetchStaffVnListMock.mockResolvedValue([]);
    fetchVaVnListMock.mockResolvedValue([]);
    const r = await downloadFullStaffForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(1);
  });

  it('returns zero when the VN credits no staff', async () => {
    seedVn(VN);
    await expect(downloadFullStaffForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
    expect(getStaffMock).not.toHaveBeenCalled();
  });

  it('fans out to each unique credited staff id', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO vn_staff_credit (vn_id, sid, role, name) VALUES (?, 's90500', 'scenario', 'Staff A')`).run(VN);
    db.prepare(`
      INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name)
      VALUES (?, 's90501', 'c90500', 'Heroine A', 'Staff B')
    `).run(VN);
    getStaffMock.mockImplementation((sid: string) => Promise.resolve(staffProfile(sid)));
    fetchStaffVnListMock.mockResolvedValue([]);
    fetchVaVnListMock.mockResolvedValue([]);
    const r = await downloadFullStaffForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(2);
    expect(readStaffFullCache('s90500')).not.toBeNull();
    expect(readStaffFullCache('s90501')).not.toBeNull();
  });

  it('skips staff already fresh in the cache', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO vn_staff_credit (vn_id, sid, role, name) VALUES (?, 's90502', 'scenario', 'Staff A')`).run(VN);
    writeCacheRow('staff_full:s90502', JSON.stringify({ profile: null, productionCredits: [], vaCredits: [], fetched_at: NOW }), NOW);
    const r = await downloadFullStaffForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 1, downloaded: 0 });
    expect(getStaffMock).not.toHaveBeenCalled();
  });
});

describe('downloadFullCharacterInfo / downloadFullCharForVn', () => {
  it('persists a character payload and rebuilds the character-vn index', async () => {
    getCharacterMock.mockResolvedValue(characterProfile('c90500', VN));
    await downloadFullCharacterInfo('c90500');
    expect(readCharacterFullCache('c90500')?.profile?.id).toBe('c90500');
    const idx = db.prepare('SELECT vn_id FROM character_vn_index WHERE character_id = ?').all('c90500') as { vn_id: string }[];
    expect(idx.map((r) => r.vn_id)).toContain(VN);
  });

  it('persists a stored-null profile without indexing any VN', async () => {
    getCharacterMock.mockResolvedValue(null);
    await downloadFullCharacterInfo('c90590');
    expect(readCharacterFullCache('c90590')).toEqual({ profile: null, fetched_at: expect.any(Number) });
    const idx = db.prepare('SELECT vn_id FROM character_vn_index WHERE character_id = ?').all('c90590');
    expect(idx).toEqual([]);
  });

  it('returns zero when the VN has no voice credits', async () => {
    seedVn(VN);
    await expect(downloadFullCharForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
    expect(getCharacterMock).not.toHaveBeenCalled();
  });

  it('fans out to each distinct voice-credited character', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES (?, 's90510', 'c90510', 'Heroine A', 'Staff')`).run(VN);
    getCharacterMock.mockImplementation((cid: string) => Promise.resolve(characterProfile(cid, VN)));
    const r = await downloadFullCharForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 1, downloaded: 1 });
    expect(readCharacterFullCache('c90510')).not.toBeNull();
  });

  it('skips characters already fresh in the cache', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES (?, 's90511', 'c90511', 'Heroine A', 'Staff')`).run(VN);
    writeCacheRow('char_full:c90511', JSON.stringify({ profile: null, fetched_at: NOW }), NOW);
    const r = await downloadFullCharForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 1, downloaded: 0 });
    expect(getCharacterMock).not.toHaveBeenCalled();
  });

  it('records an error and continues when one character fetch rejects', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES (?, 's90512', 'c90512', 'A', 'Staff')`).run(VN);
    db.prepare(`INSERT INTO vn_va_credit (vn_id, sid, c_id, c_name, va_name) VALUES (?, 's90513', 'c90513', 'B', 'Staff')`).run(VN);
    getCharacterMock.mockImplementation((cid: string) =>
      cid === 'c90512' ? Promise.reject(new Error('offline')) : Promise.resolve(characterProfile(cid, VN)),
    );
    const r = await downloadFullCharForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(1);
  });
});

describe('downloadFullTagsForVn', () => {
  it('returns zero when the VN has no tags column', async () => {
    seedVn(VN);
    await expect(downloadFullTagsForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
  });

  it('caches every g-id referenced in vn.tags', async () => {
    seedVn(VN, { tags: JSON.stringify([{ id: 'g90500' }, { id: 'g90500' }, { id: 'g90501' }, { id: 'not-a-tag' }]) });
    getTagMock.mockImplementation((gid: string) => Promise.resolve(tag(gid)));
    const r = await downloadFullTagsForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 2, downloaded: 2 });
    expect(readTagFullCache('g90500')).not.toBeNull();
    expect(readTagFullCache('g90501')).not.toBeNull();
  });

  it('skips tags already fresh in the cache', async () => {
    seedVn(VN, { tags: JSON.stringify([{ id: 'g90502' }]) });
    writeCacheRow('tag_full:g90502', JSON.stringify({ tag: tag('g90502'), fetched_at: NOW }), NOW);
    const r = await downloadFullTagsForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 1, downloaded: 0 });
    expect(getTagMock).not.toHaveBeenCalled();
  });

  it('records an error and continues when one tag fetch rejects', async () => {
    seedVn(VN, { tags: JSON.stringify([{ id: 'g90503' }, { id: 'g90504' }]) });
    getTagMock.mockImplementation((gid: string) =>
      gid === 'g90503' ? Promise.reject(new Error('offline')) : Promise.resolve(tag(gid)),
    );
    const r = await downloadFullTagsForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(1);
  });
});

describe('downloadFullTagInfo', () => {
  it('returns null and writes nothing when VNDB does not recognise the tag id', async () => {
    getTagMock.mockResolvedValue(null);
    expect(await downloadFullTagInfo('g90590')).toBeNull();
    expect(readTagFullCache('g90590')).toBeNull();
  });
});

describe('downloadFullTraitInfo', () => {
  it('returns null and writes nothing when VNDB does not recognise the trait id', async () => {
    getTraitMock.mockResolvedValue(null);
    expect(await downloadFullTraitInfo('i90590')).toBeNull();
    expect(readTraitFullCache('i90590')).toBeNull();
  });
});

describe('downloadFullTraitsForVn', () => {
  it('returns zero when no characters are indexed for the VN', async () => {
    seedVn(VN);
    await expect(downloadFullTraitsForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns zero when an indexed character has no cached profile', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO character_vn_index (character_id, vn_id) VALUES ('c90523', ?)`).run(VN);
    writeCacheRow('char_full:c90523', JSON.stringify({ profile: null, fetched_at: NOW }), NOW);
    await expect(downloadFullTraitsForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns scanned=traits, downloaded=0 when every referenced trait is already fresh', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO character_vn_index (character_id, vn_id) VALUES ('c90522', ?)`).run(VN);
    writeCacheRow('char_full:c90522', JSON.stringify({ profile: characterProfile('c90522', VN), fetched_at: NOW }), NOW);
    writeCacheRow('trait_full:i90500', JSON.stringify({ trait: trait('i90500'), fetched_at: NOW }), NOW);
    const r = await downloadFullTraitsForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 1, downloaded: 0 });
    expect(getTraitMock).not.toHaveBeenCalled();
  });

  it('collects trait ids from cached character bodies and caches each trait', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO character_vn_index (character_id, vn_id) VALUES ('c90520', ?)`).run(VN);
    writeCacheRow('char_full:c90520', JSON.stringify({ profile: characterProfile('c90520', VN), fetched_at: NOW }), NOW);
    getTraitMock.mockImplementation((iid: string) => Promise.resolve(trait(iid)));
    const r = await downloadFullTraitsForVn(VN, { force: true });
    expect(r.scanned).toBe(1);
    expect(r.downloaded).toBe(1);
    expect(readTraitFullCache('i90500')).not.toBeNull();
  });

  it('records an error and continues when one trait fetch rejects', async () => {
    seedVn(VN);
    db.prepare(`INSERT INTO character_vn_index (character_id, vn_id) VALUES ('c90521', ?)`).run(VN);
    const profile = characterProfile('c90521', VN);
    profile.traits = [
      { id: 'i90501', name: 'T1', group_name: 'G', spoiler: 0, sexual: false },
      { id: 'i90502', name: 'T2', group_name: 'G', spoiler: 0, sexual: false },
    ];
    writeCacheRow('char_full:c90521', JSON.stringify({ profile, fetched_at: NOW }), NOW);
    getTraitMock.mockImplementation((iid: string) =>
      iid === 'i90501' ? Promise.reject(new Error('offline')) : Promise.resolve(trait(iid)),
    );
    const r = await downloadFullTraitsForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(1);
  });
});

describe('downloadFullRelationsForVn', () => {
  it('returns zero when the VN has no raw payload', async () => {
    seedVn(VN);
    await expect(downloadFullRelationsForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
  });

  it('returns zero when relations is not an array', async () => {
    seedVn(VN, { raw: JSON.stringify({ relations: { id: 'v90501' } }) });
    await expect(downloadFullRelationsForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
    expect(getVnMock).not.toHaveBeenCalled();
  });

  it('persists each related VN that is stale or absent locally', async () => {
    seedVn(VN, { raw: JSON.stringify({ relations: [{ id: 'v90530' }, { id: 'not-a-vn' }] }) });
    getVnMock.mockResolvedValue({ id: 'v90530', title: 'Related VN' });
    const r = await downloadFullRelationsForVn(VN, { force: true });
    expect(r.scanned).toBe(1);
    expect(r.downloaded).toBe(1);
    expect(getVnMock).toHaveBeenCalledWith('v90530');
    const row = db.prepare('SELECT id FROM vn WHERE id = ?').get('v90530');
    expect(row).toBeTruthy();
  });

  it('skips related VNs already fresh in the local vn table', async () => {
    seedVn(VN, { raw: JSON.stringify({ relations: [{ id: 'v90531' }] }) });
    seedVn('v90531');
    const r = await downloadFullRelationsForVn(VN, { force: true });
    expect(r).toEqual({ scanned: 1, downloaded: 0 });
    expect(getVnMock).not.toHaveBeenCalled();
  });

  it('records an error and continues when one related-VN fetch rejects', async () => {
    seedVn(VN, { raw: JSON.stringify({ relations: [{ id: 'v90532' }, { id: 'v90533' }] }) });
    getVnMock.mockImplementation((id: string) =>
      id === 'v90532' ? Promise.reject(new Error('offline')) : Promise.resolve({ id, title: 'Related' }),
    );
    const r = await downloadFullRelationsForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(1);
  });

  it('does not count related VNs missing upstream', async () => {
    seedVn(VN, { raw: JSON.stringify({ relations: [{ id: 'v90534' }] }) });
    getVnMock.mockResolvedValue(null);
    await expect(downloadFullRelationsForVn(VN, { force: true })).resolves.toEqual({ scanned: 1, downloaded: 0 });
  });
});

describe('downloadFullProducerForVn', () => {
  it('returns zero when the VN has no developers column', async () => {
    seedVn(VN);
    await expect(downloadFullProducerForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
    expect(fetchProducerCompletionMock).not.toHaveBeenCalled();
  });

  it('returns zero when the developers column holds no valid p-id', async () => {
    seedVn(VN, { developers: JSON.stringify([{ id: 'not-a-producer' }, { name: 'no id' }]) });
    await expect(downloadFullProducerForVn(VN, { force: true })).resolves.toEqual({ scanned: 0, downloaded: 0 });
    expect(fetchProducerCompletionMock).not.toHaveBeenCalled();
  });

  it('pre-warms completion for each developer p-id referenced in vn.developers', async () => {
    seedVn(VN, { developers: JSON.stringify([{ id: 'p90540' }, { id: 'p90540' }, { id: 'p90541' }, { id: 'bad' }]) });
    fetchProducerCompletionMock.mockResolvedValue({ totalKnown: 0, ownedCount: 0, pct: 0, vns: [] });
    const r = await downloadFullProducerForVn(VN, { force: true });
    expect(r.scanned).toBe(2);
    expect(r.downloaded).toBe(2);
    expect(fetchProducerCompletionMock).toHaveBeenCalledTimes(2);
    expect(fetchProducerCompletionMock).toHaveBeenCalledWith('p90540');
    expect(fetchProducerCompletionMock).toHaveBeenCalledWith('p90541');
  });

  it('records an error and continues when one completion fetch rejects', async () => {
    seedVn(VN, { developers: JSON.stringify([{ id: 'p90550' }]) });
    fetchProducerCompletionMock.mockRejectedValue(new Error('offline'));
    const r = await downloadFullProducerForVn(VN, { force: true });
    expect(r.scanned).toBe(1);
    expect(r.downloaded).toBe(0);
  });

  it('without force, only refetches developers whose producer row is stale', async () => {
    seedVn(VN, { developers: JSON.stringify([{ id: 'p90560' }, { id: 'p90561' }]) });
    // p90560 was fetched just now → fresh → skipped; p90561 has no row → stale.
    db.prepare(`INSERT INTO producer (id, name, fetched_at) VALUES ('p90560', 'Studio', ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at`).run(Date.now());
    fetchProducerCompletionMock.mockResolvedValue({ totalKnown: 0, ownedCount: 0, pct: 0, vns: [] });
    const r = await downloadFullProducerForVn(VN);
    expect(r.scanned).toBe(1);
    expect(r.downloaded).toBe(1);
    expect(fetchProducerCompletionMock).toHaveBeenCalledTimes(1);
    expect(fetchProducerCompletionMock).toHaveBeenCalledWith('p90561');
  });

  it('without force, returns scanned=pids when every developer row is fresh', async () => {
    seedVn(VN, { developers: JSON.stringify([{ id: 'p90562' }]) });
    db.prepare(`INSERT INTO producer (id, name, fetched_at) VALUES ('p90562', 'Studio', ?) ON CONFLICT(id) DO UPDATE SET fetched_at = excluded.fetched_at`).run(Date.now());
    const r = await downloadFullProducerForVn(VN);
    expect(r).toEqual({ scanned: 1, downloaded: 0 });
    expect(fetchProducerCompletionMock).not.toHaveBeenCalled();
  });
});
