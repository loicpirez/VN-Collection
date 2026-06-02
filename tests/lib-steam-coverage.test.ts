/**
 * Hermetic coverage for `src/lib/steam.ts`.
 *
 * `safeFetch` (the network primitive) and `cachedFetch` (VNDB) are mocked;
 * the per-worker SQLite from `tests/setup.ts` is seeded with real `vn` /
 * `collection` rows plus `setSteamLink`. No real Steam key or network is
 * used. Covers credential reads, `fetchOwnedGames` happy + every error
 * branch (missing creds, off-allowlist, network error key-scrub, non-OK,
 * bad JSON, invalid payload shape), the VNDB release -> appid auto-detect
 * (numeric id / numeric string / `/app/N` URL / no appid), suggestion
 * deltas + sort, unlinked filtering, title search, and `recordSync`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { allowedTargetMock } = vi.hoisted(() => ({
  allowedTargetMock: vi.fn(() => true),
}));

vi.mock('@/lib/safe-fetch', () => ({ safeFetch: vi.fn() }));
vi.mock('@/lib/url-allowlist', () => ({ isAllowedHttpTarget: allowedTargetMock }));
vi.mock('@/lib/vndb-cache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb-cache')>();
  return { ...actual, cachedFetch: vi.fn() };
});

import { safeFetch } from '@/lib/safe-fetch';
import { cachedFetch } from '@/lib/vndb-cache';
import {
  computeSteamSuggestions,
  fetchOwnedGames,
  listUnlinkedSteamGames,
  readSteamConfig,
  recordSync,
  searchCollectionByTitle,
  type SteamPlaytime,
} from '@/lib/steam';
import {
  db,
  getSteamLinkForVn,
  setAppSetting,
  setSteamLink,
} from '@/lib/db';

const mSafeFetch = vi.mocked(safeFetch);
const mCachedFetch = vi.mocked(cachedFetch);

function clear(): void {
  db.exec(`
    DELETE FROM steam_link;
    DELETE FROM collection;
    DELETE FROM vn;
    DELETE FROM app_setting WHERE key IN ('steam_api_key', 'steam_id');
  `);
}

function seedVn(id: string, title: string, alttitle: string | null = null): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO vn (id, title, alttitle, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, alttitle = excluded.alttitle`,
  ).run(id, title, alttitle, now);
}

function seedCollection(vnId: string, playtimeMinutes: number | null): void {
  const now = Date.now();
  db.prepare(
    `INSERT INTO collection (vn_id, status, playtime_minutes, added_at, updated_at)
     VALUES (?, 'playing', ?, ?, ?)
     ON CONFLICT(vn_id) DO UPDATE SET playtime_minutes = excluded.playtime_minutes`,
  ).run(vnId, playtimeMinutes, now, now);
}

beforeEach(() => {
  clear();
  mSafeFetch.mockReset();
  mCachedFetch.mockReset();
  allowedTargetMock.mockReset();
  allowedTargetMock.mockReturnValue(true);
  // Default: the auto-detect release walk returns nothing so suggestion
  // tests exercise only persisted links unless they opt into a payload.
  mCachedFetch.mockResolvedValue({ data: { results: [] } } as never);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('readSteamConfig', () => {
  it('returns null fields when unset', () => {
    expect(readSteamConfig()).toEqual({ apiKey: null, steamId: null });
  });

  it('reads both fields from app settings', () => {
    setAppSetting('steam_api_key', 'fake-test-steam-key-not-real');
    setAppSetting('steam_id', '76500000000000001');
    expect(readSteamConfig()).toEqual({
      apiKey: 'fake-test-steam-key-not-real',
      steamId: '76500000000000001',
    });
  });
});

describe('fetchOwnedGames', () => {
  it('throws when credentials are not configured', async () => {
    await expect(fetchOwnedGames()).rejects.toThrow(/Steam not configured/);
    expect(mSafeFetch).not.toHaveBeenCalled();
  });

  it('returns the decoded playtime list on a well-formed response', async () => {
    setAppSetting('steam_api_key', 'fake-test-steam-key-not-real');
    setAppSetting('steam_id', '76500000000000001');
    mSafeFetch.mockResolvedValue(
      new Response(
        JSON.stringify({ response: { games: [{ appid: 10, name: 'Alpha', playtime_forever: 120 }] } }),
        { status: 200 },
      ),
    );
    const games = await fetchOwnedGames();
    expect(games).toEqual([{ appid: 10, name: 'Alpha', minutes: 120 }]);
    // The key must be passed as a query param, never leaked back to the caller.
    const calledUrl = mSafeFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('key=fake-test-steam-key-not-real');
  });

  it('blocks the request when the generated target fails the SSRF allowlist', async () => {
    setAppSetting('steam_api_key', 'fake-test-steam-key-not-real');
    setAppSetting('steam_id', '76500000000000001');
    allowedTargetMock.mockReturnValue(false);
    await expect(fetchOwnedGames()).rejects.toThrow(/host not on SSRF allowlist/);
    expect(mSafeFetch).not.toHaveBeenCalled();
  });

  it('scrubs the API key from a thrown network error', async () => {
    setAppSetting('steam_api_key', 'fake-test-steam-key-not-real');
    setAppSetting('steam_id', '76500000000000001');
    mSafeFetch.mockRejectedValue(new Error('ECONNRESET on key=fake-test-steam-key-not-real&steamid=1'));
    await expect(fetchOwnedGames()).rejects.toThrow(/Steam fetch failed/);
    await fetchOwnedGames().catch((e: Error) => {
      expect(e.message).toContain('key=***');
      expect(e.message).not.toContain('fake-test-steam-key-not-real');
    });
  });

  it('throws on a non-OK HTTP status', async () => {
    setAppSetting('steam_api_key', 'fake-test-steam-key-not-real');
    setAppSetting('steam_id', '76500000000000001');
    mSafeFetch.mockResolvedValue(new Response(null, { status: 500 }));
    await expect(fetchOwnedGames()).rejects.toThrow(/Steam HTTP 500/);
  });

  it('throws when the body is not valid JSON', async () => {
    setAppSetting('steam_api_key', 'fake-test-steam-key-not-real');
    setAppSetting('steam_id', '76500000000000001');
    mSafeFetch.mockResolvedValue(new Response('<html>maintenance</html>', { status: 200 }));
    await expect(fetchOwnedGames()).rejects.toThrow(/not valid JSON/);
  });

  it('throws when the decoded payload shape is invalid', async () => {
    setAppSetting('steam_api_key', 'fake-test-steam-key-not-real');
    setAppSetting('steam_id', '76500000000000001');
    // `response.games` present but not an array -> decoder returns null.
    mSafeFetch.mockResolvedValue(
      new Response(JSON.stringify({ response: { games: 'nope' } }), { status: 200 }),
    );
    await expect(fetchOwnedGames()).rejects.toThrow(/invalid payload shape/);
  });
});

describe('computeSteamSuggestions', () => {
  it('returns an empty list when no Steam links exist', async () => {
    const out = await computeSteamSuggestions([]);
    expect(out).toEqual([]);
  });

  it('auto-detects links from VNDB releases across appid id shapes, then surfaces positive deltas sorted', async () => {
    seedVn('v90101', 'Alpha');
    seedVn('v90102', 'Beta');
    seedVn('v90103', 'Gamma');
    seedCollection('v90101', 30);
    seedCollection('v90102', 0);
    seedCollection('v90103', 500); // steam < current -> skipped
    mCachedFetch.mockResolvedValue({
      data: {
        results: [
          { title: 'Alpha', extlinks: [{ url: 'x', name: 'steam', id: 10 }], vns: [{ id: 'v90101' }] },
          { title: 'Beta', extlinks: [{ url: 'x', name: 'steam', id: '20' }], vns: [{ id: 'v90102' }] },
          { title: 'Gamma', extlinks: [{ url: 'https://store.steampowered.com/app/30/', name: 'steam' }], vns: [{ id: 'v90103' }] },
          { title: 'NoApp', extlinks: [{ url: 'https://example.com/no-app', name: 'steam' }], vns: [{ id: 'v90199' }] },
        ],
      },
    } as never);
    const steamGames: SteamPlaytime[] = [
      { appid: 10, name: 'Alpha SE', minutes: 200 },
      { appid: 20, name: 'Beta SE', minutes: 50 },
      { appid: 30, name: 'Gamma SE', minutes: 100 },
    ];

    const out = await computeSteamSuggestions(steamGames);

    expect(out.map((s) => s.vn_id)).toEqual(['v90101', 'v90102']);
    expect(out[0]).toMatchObject({ vn_id: 'v90101', steam_appid: 10, current_minutes: 30, steam_minutes: 200, delta: 170 });
    expect(out[1]).toMatchObject({ vn_id: 'v90102', delta: 50 });
    // The Gamma row (steam 100 < current 500) is dropped.
    expect(out.find((s) => s.vn_id === 'v90103')).toBeUndefined();
    // Links were persisted as auto-source.
    expect(getSteamLinkForVn('v90101')?.appid).toBe(10);
  });

  it('skips a link whose appid is absent from the Steam library', async () => {
    seedVn('v90111', 'Solo');
    seedCollection('v90111', 0);
    setSteamLink({ vnId: 'v90111', appid: 999, steamName: 'Solo', source: 'manual' });
    const out = await computeSteamSuggestions([{ appid: 111, name: 'Other', minutes: 60 }]);
    expect(out).toEqual([]);
  });

  it('tolerates a VNDB auto-detect failure and still uses persisted links', async () => {
    seedVn('v90121', 'Persisted');
    seedCollection('v90121', 0);
    setSteamLink({ vnId: 'v90121', appid: 42, steamName: 'Persisted', source: 'manual' });
    mCachedFetch.mockRejectedValue(new Error('VNDB slow'));
    const out = await computeSteamSuggestions([{ appid: 42, name: 'Persisted SE', minutes: 90 }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ vn_id: 'v90121', delta: 90 });
  });

  it('ignores release rows without Steam links and preserves the first match for duplicate VN links', async () => {
    seedVn('v90122', 'Duplicate');
    seedCollection('v90122', 0);
    mCachedFetch.mockResolvedValue({
      data: {
        results: [
          { title: 'No Steam', extlinks: [{ url: 'https://example.com', name: 'website' }], vns: [{ id: 'v90122' }] },
          { title: 'First', extlinks: [{ url: 'x', name: 'steam', id: 41 }], vns: [{ id: 'v90122' }] },
          { title: 'Second', extlinks: [{ url: 'x', name: 'steam', id: 42 }], vns: [{ id: 'v90122' }] },
        ],
      },
    } as never);
    const out = await computeSteamSuggestions([
      { appid: 41, name: 'First Steam Game', minutes: 90 },
      { appid: 42, name: 'Second Steam Game', minutes: 120 },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ steam_appid: 41, steam_name: 'First Steam Game' });
  });

  it('skips a persisted link when the VN is no longer in the collection', async () => {
    seedVn('v90123', 'Not collected');
    setSteamLink({ vnId: 'v90123', appid: 43, steamName: 'Not collected', source: 'manual' });
    const out = await computeSteamSuggestions([{ appid: 43, name: 'Not collected', minutes: 90 }]);
    expect(out).toEqual([]);
  });
});

describe('listUnlinkedSteamGames', () => {
  it('returns played games with no link, sorted by minutes desc, dropping zero-playtime', () => {
    seedVn('v90131', 'Linked');
    setSteamLink({ vnId: 'v90131', appid: 5, steamName: 'Linked', source: 'manual' });
    const out = listUnlinkedSteamGames([
      { appid: 5, name: 'Linked', minutes: 600 }, // linked -> excluded
      { appid: 6, name: 'Zero', minutes: 0 }, // zero playtime -> excluded
      { appid: 7, name: 'Low', minutes: 10 },
      { appid: 8, name: 'High', minutes: 999 },
    ]);
    expect(out).toEqual([
      { appid: 8, name: 'High', minutes: 999 },
      { appid: 7, name: 'Low', minutes: 10 },
    ]);
  });
});

describe('searchCollectionByTitle', () => {
  it('returns an empty list for a blank query', () => {
    expect(searchCollectionByTitle('   ')).toEqual([]);
  });

  it('matches title and alttitle case-insensitively and escapes LIKE wildcards', () => {
    seedVn('v90141', 'Spring Demo', 'デモ春');
    seedVn('v90142', 'Winter Tale', null);
    seedVn('v90143', '100% Match', null);
    seedCollection('v90141', 0);
    seedCollection('v90142', 0);
    seedCollection('v90143', 0);

    expect(searchCollectionByTitle('spring').map((r) => r.id)).toEqual(['v90141']);
    expect(searchCollectionByTitle('春').map((r) => r.id)).toEqual(['v90141']);
    // '%' is escaped, so it matches the literal title rather than every row.
    expect(searchCollectionByTitle('100%').map((r) => r.id)).toEqual(['v90143']);
  });

  it('honours the limit argument', () => {
    for (let i = 0; i < 5; i++) {
      seedVn(`v9020${i}`, `Series Entry ${i}`);
      seedCollection(`v9020${i}`, 0);
    }
    expect(searchCollectionByTitle('Series Entry', 2)).toHaveLength(2);
  });
});

describe('recordSync', () => {
  it('stamps last_synced_minutes on the link', () => {
    seedVn('v90151', 'Synced');
    setSteamLink({ vnId: 'v90151', appid: 1, steamName: 'Synced', source: 'manual' });
    recordSync('v90151', 360);
    expect(getSteamLinkForVn('v90151')?.last_synced_minutes).toBe(360);
  });
});
