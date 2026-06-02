/**
 * Hermetic coverage for the AliceNet fetch/parse/match/resolve pipeline in
 * src/lib/alicenet.ts. Every upstream is mocked: VNDB search, the three EGS
 * helpers, and the single network primitive (`providerFetch`). The per-worker
 * SQLite store is seeded through the real exported db functions so the
 * matching code reads and writes genuine rows.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VndbSearchHit } from '@/lib/types';
import type { EgsCandidate, EgsGame } from '@/lib/erogamescape';

const { searchVnMock } = vi.hoisted(() => ({ searchVnMock: vi.fn() }));
const { searchEgsCandidatesMock, fetchEgsGameMock, searchEgsByNameMock } = vi.hoisted(() => ({
  searchEgsCandidatesMock: vi.fn(),
  fetchEgsGameMock: vi.fn(),
  searchEgsByNameMock: vi.fn(),
}));
const { providerFetchMock } = vi.hoisted(() => ({ providerFetchMock: vi.fn() }));

vi.mock('@/lib/vndb', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/vndb')>();
  return { ...actual, searchVn: searchVnMock };
});

vi.mock('@/lib/erogamescape', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/erogamescape')>();
  return {
    ...actual,
    searchEgsCandidates: searchEgsCandidatesMock,
    fetchEgsGame: fetchEgsGameMock,
    searchEgsByName: searchEgsByNameMock,
  };
});

vi.mock('@/lib/proxy-fetch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/proxy-fetch')>();
  return { ...actual, providerFetch: providerFetchMock };
});

import {
  buildAliceNetTitleSearchQueries,
  fetchAliceNetHtml,
  matchNextAliceNetItems,
  matchVndbFromEgsForAliceNet,
  normalizeTitle,
  normalizeTitleAggressive,
  parseAliceNetHtml,
  refreshAliceNetStock,
  resetAliceNetAutoMatches,
  retryVndbForAliceNetAggressive,
  searchEgsForAliceNetNoVndb,
} from '@/lib/alicenet';
import {
  countAliceNetStock,
  db,
  getAliceNetStockItem,
  setAliceNetEgsLink,
  setAliceNetVnLink,
  upsertAliceNetStock,
} from '@/lib/db';

function resetTable(): void {
  db.exec('DELETE FROM alicenet_stock; DELETE FROM vn; DELETE FROM collection;');
}

type SeedSpec = { code: string; title: string; release_date?: string | null };

function toRow(over: SeedSpec) {
  return {
    code: over.code,
    title: over.title,
    jan: null,
    release_date: over.release_date ?? null,
    list_price: null,
    sale_price: null,
  };
}

/**
 * `upsertAliceNetStock` is a full-sync: codes absent from the incoming set are
 * deleted. Seed every row a test needs in one call so earlier rows survive.
 */
function seedRows(...specs: SeedSpec[]): void {
  upsertAliceNetStock(specs.map(toRow));
}

function seedRow(over: SeedSpec): void {
  seedRows(over);
}

function vnHit(over: Partial<VndbSearchHit> & { id: string; title: string }): Omit<VndbSearchHit, 'in_collection'> {
  return {
    id: over.id,
    title: over.title,
    alttitle: over.alttitle ?? null,
    aliases: over.aliases ?? [],
    titles: over.titles ?? [],
    released: over.released ?? null,
    rating: null,
    votecount: null,
    length_minutes: null,
    languages: [],
    platforms: [],
    image: null,
    developers: [],
  };
}

function egsCandidate(over: Partial<EgsCandidate> & { id: number; gamename: string }): EgsCandidate {
  return {
    id: over.id,
    gamename: over.gamename,
    gamename_furigana: over.gamename_furigana ?? null,
    median: over.median ?? null,
    count: over.count ?? null,
    sellday: over.sellday ?? null,
  };
}

function egsGame(over: Partial<EgsGame> & { id: number }): EgsGame {
  return {
    id: over.id,
    gamename: over.gamename ?? 'EGS Title',
    gamename_furigana: over.gamename_furigana ?? null,
    brand_id: over.brand_id ?? null,
    brand_name: over.brand_name ?? 'Synthetic Brand',
    model: over.model ?? null,
    description: over.description ?? null,
    image_url: over.image_url ?? null,
    okazu: over.okazu ?? null,
    erogame: over.erogame ?? null,
    median: over.median ?? null,
    average: over.average ?? null,
    dispersion: over.dispersion ?? null,
    count: over.count ?? null,
    sellday: over.sellday ?? null,
    playtime_median_minutes: over.playtime_median_minutes ?? null,
    url: over.url ?? `https://egs.example/?game=${over.id}`,
    raw: over.raw ?? {},
  };
}

beforeEach(() => {
  resetTable();
  searchVnMock.mockReset();
  searchEgsCandidatesMock.mockReset();
  fetchEgsGameMock.mockReset();
  searchEgsByNameMock.mockReset();
  providerFetchMock.mockReset();
  searchVnMock.mockResolvedValue({ results: [], more: false });
  searchEgsCandidatesMock.mockResolvedValue([]);
  fetchEgsGameMock.mockResolvedValue(null);
  searchEgsByNameMock.mockResolvedValue(null);
});

afterEach(() => {
  resetTable();
});

describe('parseAliceNetHtml', () => {
  it('skips the header row and any row without the canonical code shape', () => {
    const html = `
      <table>
        <tr><td>商品コード</td><td>タイトル</td><td>JAN</td><td>発売日</td><td>定価</td><td>販売価格</td></tr>
        <tr><td>111-222222-333</td><td>Synthetic Title A</td><td>4900000000001</td><td>2020/01/02</td><td>8800</td><td>5500</td></tr>
        <tr><td>short</td><td>too few cells</td></tr>
        <tr><td>nope</td><td>Bad Code Row</td><td>x</td><td>y</td><td>z</td><td>w</td></tr>
      </table>`;
    const rows = parseAliceNetHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      code: '111-222222-333',
      title: 'Synthetic Title A',
      jan: '4900000000001',
      release_date: '2020/01/02',
      list_price: '8800',
      sale_price: '5500',
    });
  });

  it('coerces blank optional cells to null and accepts a data-first table', () => {
    const html = `
      <tr><td>222-333333-444</td><td>Synthetic Title B</td><td></td><td></td><td></td><td></td></tr>`;
    const rows = parseAliceNetHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].jan).toBeNull();
    expect(rows[0].release_date).toBeNull();
  });
});

describe('fetchAliceNetHtml', () => {
  it('decodes the EUC-JP body to UTF-8 text', async () => {
    const eucjp = Buffer.from([0xa4, 0xa2, 0xa4, 0xa4]); // あい in EUC-JP
    providerFetchMock.mockResolvedValue(new Response(eucjp, { status: 200 }));
    const text = await fetchAliceNetHtml();
    expect(text).toBe('あい');
    expect(providerFetchMock).toHaveBeenCalledTimes(1);
    expect(providerFetchMock.mock.calls[0]?.[2]).toBe('alicenet');
  });

  it('throws on a non-ok upstream response', async () => {
    providerFetchMock.mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(fetchAliceNetHtml()).rejects.toThrow(/HTTP 503/);
  });

  it('rejects an oversized declared content-length before reading the body', async () => {
    providerFetchMock.mockResolvedValue(
      new Response('x', { status: 200, headers: { 'content-length': String(9 * 1024 * 1024) } }),
    );
    await expect(fetchAliceNetHtml()).rejects.toThrow(/too large/);
  });

  it('throws when the upstream body is absent', async () => {
    providerFetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    await expect(fetchAliceNetHtml()).rejects.toThrow(/empty body/);
  });
});

describe('refreshAliceNetStock', () => {
  it('fetches, parses, and full-syncs the DB returning counters', async () => {
    seedRow({ code: '999-888888-777', title: 'Old Sold Item' });
    const html = `
      <tr><td>111-222222-333</td><td>Fresh Item</td><td></td><td>2021/05/05</td><td></td><td></td></tr>`;
    providerFetchMock.mockResolvedValue(new Response(Buffer.from(html, 'latin1'), { status: 200 }));
    const result = await refreshAliceNetStock();
    expect(result.count).toBe(1);
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(typeof result.fetched_at).toBe('number');
    expect(getAliceNetStockItem('999-888888-777')).toBeNull();
    expect(getAliceNetStockItem('111-222222-333')?.title).toBe('Fresh Item');
  });
});

describe('matchNextAliceNetItems — fresh pass', () => {
  it('auto-links a VNDB candidate when the release date corroborates', async () => {
    seedRow({ code: '111-000000-001', title: 'シンセティックタイトル', release_date: '2019/07/26' });
    searchVnMock.mockResolvedValue({
      results: [vnHit({ id: 'v50001', title: 'シンセティックタイトル', released: '2019-07-26' })],
      more: false,
    });
    const result = await matchNextAliceNetItems(5, false);
    expect(result.processed).toBe(1);
    expect(result.matched).toBe(1);
    const row = getAliceNetStockItem('111-000000-001');
    expect(row?.vn_id).toBe('v50001');
    expect(row?.vn_match_source).toBe('auto');
  });

  it('records source "none" and stores the candidate list when no candidate is safe', async () => {
    seedRow({ code: '111-000000-002', title: 'ティンクル', release_date: '2023/01/01' });
    searchVnMock.mockResolvedValue({
      results: [vnHit({ id: 'v50002', title: 'Twinkle Crusaders Totally Different', released: '2008-12-19' })],
      more: false,
    });
    const result = await matchNextAliceNetItems(5, false);
    expect(result.matched).toBe(0);
    const row = getAliceNetStockItem('111-000000-002');
    expect(row?.vn_id).toBeNull();
    expect(row?.vn_match_source).toBe('none');
  });

  it('links an EGS candidate concurrently while VNDB misses', async () => {
    seedRow({ code: '111-000000-003', title: 'エグズオンリー', release_date: '2015/03/27' });
    searchEgsCandidatesMock.mockResolvedValue([
      egsCandidate({ id: 8800001, gamename: 'エグズオンリー', sellday: '2015-03-27' }),
    ]);
    fetchEgsGameMock.mockResolvedValue(egsGame({ id: 8800001, gamename: 'エグズオンリー', sellday: '2015-03-27' }));
    const result = await matchNextAliceNetItems(5, false);
    expect(result.matched).toBe(1);
    const row = getAliceNetStockItem('111-000000-003');
    expect(row?.egs_id).toBe(8800001);
    expect(row?.egs_match_source).toBe('auto');
    expect(row?.vn_id).toBeNull();
  });

  it('marks an empty-query item as none without any upstream call', async () => {
    seedRow({ code: '111-000000-004', title: '1' });
    const result = await matchNextAliceNetItems(5, false);
    expect(result.processed).toBe(1);
    expect(result.matched).toBe(0);
    expect(searchVnMock).not.toHaveBeenCalled();
    expect(getAliceNetStockItem('111-000000-004')?.vn_match_source).toBe('none');
  });

  it('propagates a VNDB search failure as a thrown error', async () => {
    seedRow({ code: '111-000000-005', title: 'クラッシュタイトル', release_date: '2019/07/26' });
    searchVnMock.mockRejectedValue(new Error('vndb upstream down'));
    await expect(matchNextAliceNetItems(5, false)).rejects.toThrow(/vndb upstream down/);
  });
});

describe('matchNextAliceNetItems — retryNone pass', () => {
  it('recovers a VN id from the EGS row vndb column when VNDB search still misses', async () => {
    seedRow({ code: '222-000000-001', title: 'リトライタイトル', release_date: '2016/06/24' });
    setAliceNetVnLink('222-000000-001', null, 'none');
    searchVnMock.mockResolvedValue({ results: [], more: false });
    searchEgsCandidatesMock.mockResolvedValue([
      egsCandidate({ id: 8800002, gamename: 'リトライタイトル', sellday: '2016-06-24' }),
    ]);
    fetchEgsGameMock.mockResolvedValue(
      egsGame({ id: 8800002, gamename: 'リトライタイトル', sellday: '2016-06-24', raw: { vndb: 'v50010' } }),
    );
    const result = await matchNextAliceNetItems(5, true);
    expect(result.matched).toBe(1);
    const row = getAliceNetStockItem('222-000000-001');
    expect(row?.egs_id).toBe(8800002);
    expect(row?.vn_id).toBe('v50010');
  });

  it('keeps the item in the none queue when the EGS row carries no vndb id', async () => {
    seedRow({ code: '222-000000-002', title: 'ノーブイエヌタイトル', release_date: '2016/06/24' });
    setAliceNetVnLink('222-000000-002', null, 'none');
    searchEgsCandidatesMock.mockResolvedValue([
      egsCandidate({ id: 8800003, gamename: 'ノーブイエヌタイトル', sellday: '2016-06-24' }),
    ]);
    fetchEgsGameMock.mockResolvedValue(egsGame({ id: 8800003, gamename: 'ノーブイエヌタイトル', sellday: '2016-06-24', raw: {} }));
    const result = await matchNextAliceNetItems(5, true);
    expect(result.matched).toBe(1);
    const row = getAliceNetStockItem('222-000000-002');
    expect(row?.egs_id).toBe(8800003);
    expect(row?.vn_id).toBeNull();
    expect(row?.vn_match_source).toBe('none');
  });

  it('auto-links VNDB directly on a retry pass when the candidate is safe', async () => {
    seedRow({ code: '222-000000-003', title: 'リトライブイエヌ', release_date: '2017/08/25' });
    setAliceNetVnLink('222-000000-003', null, 'none');
    searchVnMock.mockResolvedValue({
      results: [vnHit({ id: 'v50011', title: 'リトライブイエヌ', released: '2017-08-25' })],
      more: false,
    });
    const result = await matchNextAliceNetItems(5, true);
    expect(result.matched).toBe(1);
    expect(getAliceNetStockItem('222-000000-003')?.vn_id).toBe('v50011');
  });
});

describe('matchVndbFromEgsForAliceNet', () => {
  it('reads the EGS vndb column for no-VNDB-with-EGS rows', async () => {
    seedRow({ code: '333-000000-001', title: 'イージーエスフォールバック', release_date: '2018/04/27' });
    setAliceNetVnLink('333-000000-001', null, 'none');
    setAliceNetEgsLink('333-000000-001', 8800010, 'auto', { title: 'EGS row' });
    fetchEgsGameMock.mockResolvedValue(egsGame({ id: 8800010, gamename: 'EGS row', raw: { vndb: 'v50020' } }));
    const result = await matchVndbFromEgsForAliceNet(50);
    expect(result.processed).toBe(1);
    expect(result.matched).toBe(1);
    expect(getAliceNetStockItem('333-000000-001')?.vn_id).toBe('v50020');
  });

  it('leaves the row in the none queue when the EGS row vndb column is empty', async () => {
    seedRow({ code: '333-000000-002', title: 'ノーリカバリー', release_date: '2018/04/27' });
    setAliceNetVnLink('333-000000-002', null, 'none');
    setAliceNetEgsLink('333-000000-002', 8800011, 'auto', { title: 'EGS row' });
    fetchEgsGameMock.mockResolvedValue(egsGame({ id: 8800011, gamename: 'EGS row', raw: {} }));
    const result = await matchVndbFromEgsForAliceNet(50);
    expect(result.matched).toBe(0);
    expect(getAliceNetStockItem('333-000000-002')?.vn_id).toBeNull();
  });

  it('swallows an EGS fetch failure and keeps the row for later retry', async () => {
    seedRow({ code: '333-000000-003', title: 'エラーリカバリー', release_date: '2018/04/27' });
    setAliceNetVnLink('333-000000-003', null, 'none');
    setAliceNetEgsLink('333-000000-003', 8800012, 'auto', { title: 'EGS row' });
    fetchEgsGameMock.mockRejectedValue(new Error('EGS SQL form timeout'));
    const result = await matchVndbFromEgsForAliceNet(50);
    expect(result.processed).toBe(1);
    expect(result.matched).toBe(0);
    expect(getAliceNetStockItem('333-000000-003')?.vn_id).toBeNull();
  });
});

describe('retryVndbForAliceNetAggressive', () => {
  it('links a VN once the aggressive normalization clears the edition suffix', async () => {
    seedRow({ code: '444-000000-001', title: 'アグレッシブタイトル　完全限定生産版', release_date: '2014/12/19' });
    setAliceNetVnLink('444-000000-001', null, 'none');
    searchVnMock.mockResolvedValue({
      results: [vnHit({ id: 'v50030', title: 'アグレッシブタイトル', released: '2014-12-19' })],
      more: false,
    });
    const result = await retryVndbForAliceNetAggressive(20);
    expect(result.matched).toBe(1);
    expect(getAliceNetStockItem('444-000000-001')?.vn_id).toBe('v50030');
  });

  it('rethrows a VNDB failure to stop the batch', async () => {
    seedRow({ code: '444-000000-002', title: 'アグレッシブエラー', release_date: '2014/12/19' });
    setAliceNetVnLink('444-000000-002', null, 'none');
    searchVnMock.mockRejectedValue(new Error('throttle exhausted'));
    await expect(retryVndbForAliceNetAggressive(20)).rejects.toThrow(/throttle exhausted/);
  });
});

describe('searchEgsForAliceNetNoVndb', () => {
  it('uses searchEgsByName on the standard (non-aggressive) pass', async () => {
    seedRow({ code: '555-000000-001', title: 'スタンダードイージーエス', release_date: '2013/02/22' });
    setAliceNetVnLink('555-000000-001', null, 'none');
    searchEgsByNameMock.mockResolvedValue(egsGame({ id: 8800020, gamename: 'スタンダードイージーエス' }));
    const result = await searchEgsForAliceNetNoVndb(50, false);
    expect(result.matched).toBe(1);
    expect(searchEgsByNameMock).toHaveBeenCalled();
    expect(getAliceNetStockItem('555-000000-001')?.egs_id).toBe(8800020);
  });

  it('uses the candidate search on the aggressive pass', async () => {
    seedRow({ code: '555-000000-002', title: 'アグレッシブイージーエス　普及版', release_date: '2013/02/22' });
    setAliceNetVnLink('555-000000-002', null, 'none');
    searchEgsCandidatesMock.mockResolvedValue([
      egsCandidate({ id: 8800021, gamename: 'アグレッシブイージーエス', sellday: '2013-02-22' }),
    ]);
    fetchEgsGameMock.mockResolvedValue(egsGame({ id: 8800021, gamename: 'アグレッシブイージーエス', sellday: '2013-02-22' }));
    const result = await searchEgsForAliceNetNoVndb(50, true);
    expect(result.matched).toBe(1);
    expect(searchEgsByNameMock).not.toHaveBeenCalled();
    expect(getAliceNetStockItem('555-000000-002')?.egs_id).toBe(8800021);
  });

  it('marks the row none when both EGS attempts miss', async () => {
    seedRow({ code: '555-000000-003', title: 'ミスイージーエス', release_date: '2013/02/22' });
    setAliceNetVnLink('555-000000-003', null, 'none');
    const result = await searchEgsForAliceNetNoVndb(50, false);
    expect(result.matched).toBe(0);
    expect(getAliceNetStockItem('555-000000-003')?.vn_match_source).toBe('none');
  });
});

describe('resetAliceNetAutoMatches', () => {
  it('clears auto links and preserves manual pins', async () => {
    seedRows({ code: '666-000000-001', title: 'オートマッチ' }, { code: '666-000000-002', title: 'マニュアルマッチ' });
    setAliceNetVnLink('666-000000-001', 'v50040', 'auto');
    setAliceNetVnLink('666-000000-002', 'v50041', 'manual');
    const cleared = resetAliceNetAutoMatches();
    expect(cleared).toBe(1);
    expect(getAliceNetStockItem('666-000000-001')?.vn_id).toBeNull();
    expect(getAliceNetStockItem('666-000000-002')?.vn_id).toBe('v50041');
  });
});

describe('countAliceNetStock aggregate after seeding', () => {
  it('reflects matched, egs-only, and none-found buckets', () => {
    seedRows(
      { code: '777-000000-001', title: 'VNDB matched' },
      { code: '777-000000-002', title: 'EGS only' },
      { code: '777-000000-003', title: 'None found' },
    );
    setAliceNetVnLink('777-000000-001', 'v50050', 'auto');
    setAliceNetEgsLink('777-000000-002', 8800030, 'auto');
    setAliceNetVnLink('777-000000-003', null, 'none');
    const stats = countAliceNetStock();
    expect(stats.total).toBe(3);
    expect(stats.vndb_matched).toBe(1);
    expect(stats.egs_only).toBe(1);
    expect(stats.none_found).toBe(1);
  });
});

describe('title normalization re-exports stay aligned with the query builder', () => {
  it('drops a trailing tilde subtitle only on the aggressive pass', () => {
    const raw = 'メインタイトル ~サブタイトル~';
    expect(normalizeTitle(raw)).toBe('メインタイトル ~サブタイトル~');
    expect(normalizeTitleAggressive(raw)).toBe('メインタイトル');
    expect(buildAliceNetTitleSearchQueries(raw)[0]).toBe(normalizeTitle(raw));
  });
});
