import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateCollectionMock } = vi.hoisted(() => ({
  updateCollectionMock: vi.fn(),
}));

vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>();
  updateCollectionMock.mockImplementation(actual.updateCollection);
  return { ...actual, updateCollection: updateCollectionMock };
});

import { db, setAppSetting } from '@/lib/db';

vi.mock('@/lib/erogamescape', () => ({
  fetchEgsUserReviews: vi.fn(),
}));

vi.mock('@/lib/download-status', () => ({
  jobLabel: vi.fn((code: string, fallback: string, params?: Record<string, string | number>) => ({ code, fallback, params })),
  startJob: vi.fn(() => ({ id: 'job-1' })),
  tickJob: vi.fn(),
  recordError: vi.fn(),
  finishJob: vi.fn(),
}));

import { computeEgsSuggestions, applyEgsSuggestions } from '@/lib/egs-sync';
import { fetchEgsUserReviews } from '@/lib/erogamescape';
import type { EgsUserReviewRow } from '@/lib/erogamescape';

const mockFetch = fetchEgsUserReviews as ReturnType<typeof vi.fn>;

const NOW = Date.now();

function insertVn(id: string, title: string): void {
  db.prepare(
    `INSERT INTO vn (id, title, fetched_at)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title`,
  ).run(id, title, NOW);
}

function insertCollection(vnId: string, playtimeMinutes = 0, userRating: number | null = null): void {
  db.prepare(
    `INSERT INTO collection (vn_id, status, added_at, updated_at, playtime_minutes, user_rating)
     VALUES (?, 'playing', ?, ?, ?, ?)
     ON CONFLICT(vn_id) DO UPDATE SET playtime_minutes = excluded.playtime_minutes, user_rating = excluded.user_rating`,
  ).run(vnId, NOW, NOW, playtimeMinutes, userRating);
}

function insertEgsGame(vnId: string, egsId: number): void {
  db.prepare(
    `INSERT INTO egs_game (vn_id, egs_id, gamename, fetched_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(vn_id) DO UPDATE SET egs_id = excluded.egs_id`,
  ).run(vnId, egsId, `EGS Game ${egsId}`, NOW);
}

function clearTables(): void {
  db.exec(`
    DELETE FROM collection;
    DELETE FROM egs_game;
    DELETE FROM vn;
  `);
}

function makeReview(egsId: number, overrides: Partial<EgsUserReviewRow> = {}): EgsUserReviewRow {
  return {
    egs_id: egsId,
    gamename: `Game ${egsId}`,
    tokuten: null,
    total_play_time_hours: null,
    start_date: null,
    finish_date: null,
    timestamp: null,
    ...overrides,
  };
}

beforeEach(() => {
  clearTables();
  vi.clearAllMocks();
  setAppSetting('egs_username', 'testuser');
});

describe('computeEgsSuggestions', () => {
  it('returns needsConfig=true when no username is configured', async () => {
    setAppSetting('egs_username', '');
    mockFetch.mockResolvedValue([]);
    const result = await computeEgsSuggestions();
    expect(result.needsConfig).toBe(true);
    expect(result.suggestions).toEqual([]);
  });

  it('returns empty suggestions when EGS fetch returns no rows', async () => {
    mockFetch.mockResolvedValue([]);
    const result = await computeEgsSuggestions();
    expect(result.needsConfig).toBe(false);
    expect(result.suggestions).toEqual([]);
  });

  it('returns empty suggestions when no EGS games are linked to local VNs', async () => {
    mockFetch.mockResolvedValue([makeReview(1001)]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toEqual([]);
  });

  it('returns empty suggestions when linked VN is not in collection', async () => {
    insertVn('v1', 'My VN');
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { total_play_time_hours: 10 })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toEqual([]);
  });

  it('suggests playtime bump when EGS hours > local minutes', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 60);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { total_play_time_hours: 5 })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.vn_id).toBe('v1');
    expect(result.suggestions[0]!.egs_minutes).toBe(300);
    expect(result.suggestions[0]!.local_minutes).toBe(60);
  });

  it('does not suggest when EGS playtime is lower than local', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 600);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { total_play_time_hours: 5 })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toHaveLength(0);
  });

  it('suggests score when EGS has score and local rating is null', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { tokuten: 80 })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.egs_score).toBe(80);
  });

  it('does not suggest score when local rating is already set', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 0, 75);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { tokuten: 80 })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toHaveLength(0);
  });

  it('suggests finish date when local has none', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { finish_date: '2024-03-15' })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.egs_finish_date).toBe('2024-03-15');
  });

  it('suggests start date when local has none', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { start_date: '2024-03-01' })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.egs_start_date).toBe('2024-03-01');
  });

  it('ignores an unlinked review when another review is linked', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([
      makeReview(1001, { tokuten: 80 }),
      makeReview(1002, { tokuten: 90 }),
    ]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]!.egs_id).toBe(1001);
  });

  it('does not suggest a zero EGS score', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { tokuten: 0 })]);
    const result = await computeEgsSuggestions();
    expect(result.suggestions).toEqual([]);
  });
});

describe('applyEgsSuggestions', () => {
  it('returns applied=0 when picks list is empty', async () => {
    mockFetch.mockResolvedValue([]);
    const result = await applyEgsSuggestions([]);
    expect(result.applied).toBe(0);
  });

  it('applies playtime bump and increments applied count', async () => {
    insertVn('v1', 'My VN');
    insertCollection('v1', 60);
    insertEgsGame('v1', 1001);
    mockFetch.mockResolvedValue([makeReview(1001, { total_play_time_hours: 5 })]);
    const result = await applyEgsSuggestions(['v1']);
    expect(result.applied).toBe(1);
    const row = db.prepare(`SELECT playtime_minutes FROM collection WHERE vn_id = 'v1'`).get() as { playtime_minutes: number };
    expect(row.playtime_minutes).toBe(300);
  });

  it('records error for vnId not in suggestions and does not throw', async () => {
    mockFetch.mockResolvedValue([]);
    const result = await applyEgsSuggestions(['v9999']);
    expect(result.applied).toBe(0);
  });

  it('applies rating when local is null', async () => {
    insertVn('v1', 'Rated VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1002);
    mockFetch.mockResolvedValue([makeReview(1002, { tokuten: 85 })]);
    const result = await applyEgsSuggestions(['v1']);
    expect(result.applied).toBe(1);
    const row = db.prepare(`SELECT user_rating FROM collection WHERE vn_id = 'v1'`).get() as { user_rating: number };
    expect(row.user_rating).toBe(85);
  });

  it('applies missing start and finish dates together', async () => {
    insertVn('v1', 'Dated VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1003);
    mockFetch.mockResolvedValue([makeReview(1003, { start_date: '2024-03-01', finish_date: '2024-03-15' })]);
    const result = await applyEgsSuggestions(['v1']);
    expect(result.applied).toBe(1);
    const row = db.prepare(`SELECT started_date, finished_date FROM collection WHERE vn_id = 'v1'`).get() as {
      started_date: string;
      finished_date: string;
    };
    expect(row).toEqual({ started_date: '2024-03-01', finished_date: '2024-03-15' });
  });

  it('records an update error and continues without incrementing applied', async () => {
    insertVn('v1', 'Failing VN');
    insertCollection('v1', 0, null);
    insertEgsGame('v1', 1004);
    mockFetch.mockResolvedValue([makeReview(1004, { tokuten: 90 })]);
    updateCollectionMock.mockImplementationOnce(() => {
      throw new Error('synthetic write failure');
    });
    const result = await applyEgsSuggestions(['v1']);
    expect(result.applied).toBe(0);
  });
});
