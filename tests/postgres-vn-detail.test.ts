import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postgresQuery: vi.fn(),
  readConfig: vi.fn(),
  egs: vi.fn(),
  sourcePreference: vi.fn(),
  gameLog: vi.fn(),
  updateGameLog: vi.fn(),
  deleteGameLog: vi.fn(),
  aspectOverride: vi.fn(),
  setAspectOverride: vi.fn(),
  aspectKey: vi.fn(),
  aspectDisplay: vi.fn(),
  coOccurringTags: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({ postgresQuery: mocks.postgresQuery }));
vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: mocks.readConfig }));
vi.mock('@/lib/db', () => ({
  getEgsForVn: mocks.egs,
  getSourcePref: mocks.sourcePreference,
  listGameLogForVn: mocks.gameLog,
  updateGameLogEntry: mocks.updateGameLog,
  deleteGameLogEntry: mocks.deleteGameLog,
  getVnAspectOverride: mocks.aspectOverride,
  setVnAspectOverride: mocks.setAspectOverride,
  deriveVnAspectKey: mocks.aspectKey,
  deriveVnAspectDisplay: mocks.aspectDisplay,
  getCoOccurringTags: mocks.coOccurringTags,
}));

import {
  createPostgresVnDetailRepository,
  getVnDetailRepository,
} from '@/lib/db/repositories/vn-detail';

const logRow = {
  id: 1,
  vn_id: 'v90001',
  note: 'Current note',
  logged_at: 100,
  session_minutes: 20,
  created_at: 90,
  updated_at: 100,
};

describe('VN-detail repository', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mocks.readConfig.mockReset().mockReturnValue({ backend: 'postgres' });
    for (const mock of [
      mocks.egs,
      mocks.sourcePreference,
      mocks.gameLog,
      mocks.updateGameLog,
      mocks.deleteGameLog,
      mocks.aspectOverride,
      mocks.setAspectOverride,
      mocks.aspectKey,
      mocks.aspectDisplay,
      mocks.coOccurringTags,
    ]) mock.mockReset();
  });

  it('reads EGS rows and validates persisted source preferences', async () => {
    const repository = createPostgresVnDetailRepository();
    const egs = { vn_id: 'v90001', egs_id: 10 };
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [egs] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ source_pref: null }] })
      .mockResolvedValueOnce({ rows: [{ source_pref: '[]' }] })
      .mockResolvedValueOnce({ rows: [{ source_pref: '{"bad":"vndb"}' }] })
      .mockResolvedValueOnce({ rows: [{ source_pref: '{"title":"egs","image":"custom"}' }] })
      .mockResolvedValueOnce({ rows: [{ source_pref: '{broken' }] });

    await expect(repository.egs('v90001')).resolves.toBe(egs);
    await expect(repository.egs('v90002')).resolves.toBeNull();
    await expect(repository.sourcePreference('v90001')).resolves.toEqual({});
    await expect(repository.sourcePreference('v90001')).resolves.toEqual({});
    await expect(repository.sourcePreference('v90001')).resolves.toEqual({});
    await expect(repository.sourcePreference('v90001')).resolves.toEqual({ title: 'egs', image: 'custom' });
    await expect(repository.sourcePreference('v90001')).resolves.toEqual({});
  });

  it('bounds game-log limits and returns rows', async () => {
    const repository = createPostgresVnDetailRepository();
    mocks.postgresQuery.mockResolvedValue({ rows: [logRow] });

    await expect(repository.gameLog('v90001')).resolves.toEqual([logRow]);
    await repository.gameLog('v90001', Number.POSITIVE_INFINITY);
    await repository.gameLog('v90001', -5);
    await repository.gameLog('v90001', 900.9);
    expect(mocks.postgresQuery.mock.calls.map((call) => call[1]?.[1])).toEqual([200, 200, 1, 500]);
  });

  it('updates game logs through every normalization branch', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(500);
    const repository = createPostgresVnDetailRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });
    await expect(repository.updateGameLog('v90001', 1, {})).resolves.toBeNull();

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [logRow] })
      .mockResolvedValueOnce({ rows: [{ ...logRow, updated_at: 500 }] });
    await expect(repository.updateGameLog('v90001', 1, {})).resolves.toMatchObject({ updated_at: 500 });
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]).toEqual(['Current note', 100, 20, 500, 1, 'v90001']);

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [logRow] })
      .mockResolvedValueOnce({ rows: [{ ...logRow, note: 'Changed', session_minutes: 13 }] });
    await repository.updateGameLog('v90001', 1, { note: ' Changed ', logged_at: 200, session_minutes: 12.7 });
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]).toEqual(['Changed', 200, 13, 500, 1, 'v90001']);

    mocks.postgresQuery.mockResolvedValueOnce({ rows: [logRow] });
    await expect(repository.updateGameLog('v90001', 1, { note: '   ' })).rejects.toThrow('empty note');

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [logRow] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.updateGameLog('v90001', 1, { session_minutes: 0 })).resolves.toBeNull();
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]?.[2]).toBeNull();

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [logRow] })
      .mockResolvedValueOnce({ rows: [logRow] });
    await repository.updateGameLog('v90001', 1, { session_minutes: null });
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]?.[2]).toBeNull();
  });

  it('reports scoped game-log deletion outcomes', async () => {
    const repository = createPostgresVnDetailRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 })
      .mockResolvedValueOnce({ rows: [], rowCount: null });
    await expect(repository.deleteGameLog('v90001', 1)).resolves.toBe(true);
    await expect(repository.deleteGameLog('v90001', 2)).resolves.toBe(false);
    await expect(repository.deleteGameLog('v90001', 3)).resolves.toBe(false);
  });

  it('reads, writes, and clears manual aspect overrides', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(600);
    const repository = createPostgresVnDetailRepository();
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ aspect_key: '16:9', note: 'Manual', updated_at: 1 }] })
      .mockResolvedValueOnce({ rows: [{ aspect_key: 'invalid', note: null, updated_at: 1 }] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.aspectOverride('v90001')).resolves.toMatchObject({ aspect_key: '16:9' });
    await expect(repository.aspectOverride('v90002')).resolves.toBeNull();
    await expect(repository.aspectOverride('v90003')).resolves.toBeNull();

    await repository.setAspectOverride({ vnId: 'v90001', aspectKey: null });
    await repository.setAspectOverride({ vnId: 'v90001', aspectKey: 'unknown' });
    await repository.setAspectOverride({ vnId: 'v90001', aspectKey: '4:3', note: ' Source ' });
    await repository.setAspectOverride({ vnId: 'v90001', aspectKey: '16:10', note: '   ' });
    expect(mocks.postgresQuery.mock.calls.at(-2)?.[1]).toEqual(['v90001', '4:3', 'Source', 600]);
    expect(mocks.postgresQuery.mock.calls.at(-1)?.[1]).toEqual(['v90001', '16:10', null, 600]);
  });

  it('derives aspect keys from manual, edition, direct, and screenshot data', async () => {
    const repository = createPostgresVnDetailRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ aspect_key: '4:3', note: null, updated_at: 1 }] });
    await expect(repository.aspectKey('v90001')).resolves.toBe('4:3');

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ aspect: '16:9' }] });
    await expect(repository.aspectKey('v90001')).resolves.toBe('16:9');

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [{ aspect_key: 'invalid' }] })
      .mockResolvedValueOnce({ rows: [{ aspect: 'unknown' }] })
      .mockResolvedValueOnce({ rows: [{ aspect_key: '16:10' }] });
    await expect(repository.aspectKey('v90001')).resolves.toBe('16:10');

    const screenshots = JSON.stringify([
      null,
      [],
      {},
      { dims: [1] },
      { dims: ['1920', 1080] },
      { dims: [0, 1080] },
      { dims: [1920, 1080] },
      { dims: [1280, 720] },
      { dims: [800, 600] },
    ]);
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ screenshots }] });
    await expect(repository.aspectKey('v90001')).resolves.toBe('16:9');

    for (const raw of [null, '{broken', '{}']) {
      mocks.postgresQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ screenshots: raw }] });
      await expect(repository.aspectKey('v90001')).resolves.toBe('unknown');
    }
  });

  it('derives aspect display provenance from every source', async () => {
    const repository = createPostgresVnDetailRepository();
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [{ aspect_key: '4:3', note: null, updated_at: 1 }] });
    await expect(repository.aspectDisplay('v90001')).resolves.toMatchObject({ source: 'manual', aspect: '4:3' });

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ aspect_key: '16:10', width: 1280, height: 800 }] });
    await expect(repository.aspectDisplay('v90001')).resolves.toMatchObject({ source: 'edition', aspect: '16:10' });

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [
        { aspect_key: 'invalid', width: 1, height: 1, release_id: 'r0' },
        { aspect_key: 'unknown', width: null, height: null, release_id: 'r1' },
        { aspect_key: '16:9', width: 1920, height: 1080, release_id: 'screenshot:1' },
        { aspect_key: '16:9', width: null, height: null, release_id: 'screenshot:2' },
        { aspect_key: '4:3', width: 800, height: 600, release_id: 'screenshot:3' },
      ] });
    await expect(repository.aspectDisplay('v90001')).resolves.toEqual({
      aspect: '16:9',
      aspects: ['16:9', '4:3'],
      width: 1920,
      height: 1080,
      source: 'screenshot',
    });

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ aspect_key: '21:9', width: null, height: null, release_id: 'r90001' }] });
    await expect(repository.aspectDisplay('v90001')).resolves.toMatchObject({
      source: 'release', aspect: '21:9', width: null, height: null,
    });

    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(repository.aspectDisplay('v90001')).resolves.toEqual({
      aspect: 'unknown', aspects: [], width: null, height: null, source: 'unknown',
    });
  });

  it('maps co-occurring tags and bounds their limit', async () => {
    const repository = createPostgresVnDetailRepository();
    mocks.postgresQuery.mockResolvedValue({
      rows: [{ tag_id: 'g90001', tag_name: 'Tag', tag_category: null, shared_count: 3 }],
    });
    await expect(repository.coOccurringTags('v90001')).resolves.toEqual([
      { id: 'g90001', name: 'Tag', category: null, shared: 3 },
    ]);
    await repository.coOccurringTags('v90001', Number.NaN);
    await repository.coOccurringTags('v90001', 0);
    await repository.coOccurringTags('v90001', 800);
    expect(mocks.postgresQuery.mock.calls.map((call) => call[1]?.[1])).toEqual([24, 24, 1, 500]);
  });

  it('delegates the complete SQLite contract', async () => {
    mocks.readConfig.mockReturnValue({ backend: 'sqlite' });
    mocks.egs.mockReturnValue({ egs_id: 1 });
    mocks.sourcePreference.mockReturnValue({ title: 'vndb' });
    mocks.gameLog.mockReturnValue([logRow]);
    mocks.updateGameLog.mockReturnValue(logRow);
    mocks.deleteGameLog.mockReturnValue(true);
    mocks.aspectOverride.mockReturnValue({ aspect_key: '4:3' });
    mocks.aspectKey.mockReturnValue('4:3');
    mocks.aspectDisplay.mockReturnValue({ aspect: '4:3' });
    mocks.coOccurringTags.mockReturnValue([{ id: 'g1' }]);
    const repository = getVnDetailRepository();

    await expect(repository.egs('v90001')).resolves.toEqual({ egs_id: 1 });
    await expect(repository.sourcePreference('v90001')).resolves.toEqual({ title: 'vndb' });
    await expect(repository.gameLog('v90001', 2)).resolves.toEqual([logRow]);
    await expect(repository.updateGameLog('v90001', 1, { note: 'N' })).resolves.toBe(logRow);
    await expect(repository.deleteGameLog('v90001', 1)).resolves.toBe(true);
    await expect(repository.aspectOverride('v90001')).resolves.toEqual({ aspect_key: '4:3' });
    await repository.setAspectOverride({ vnId: 'v90001', aspectKey: '4:3' });
    await expect(repository.aspectKey('v90001')).resolves.toBe('4:3');
    await expect(repository.aspectDisplay('v90001')).resolves.toEqual({ aspect: '4:3' });
    await expect(repository.coOccurringTags('v90001', 3)).resolves.toEqual([{ id: 'g1' }]);
  });
});
