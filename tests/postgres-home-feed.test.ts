import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postgresQuery: vi.fn(),
  readConfig: vi.fn(),
  prepare: vi.fn(),
  all: vi.fn(),
}));

vi.mock('@/lib/db/postgres', () => ({ postgresQuery: mocks.postgresQuery }));
vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: mocks.readConfig }));
vi.mock('@/lib/db', () => ({
  db: { prepare: mocks.prepare },
}));

import {
  createPostgresHomeFeedRepository,
  getHomeFeedRepository,
} from '@/lib/db/repositories/home-feed';

describe('home-feed repository', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mocks.postgresQuery.mockReset().mockResolvedValue({ rows: [] });
    mocks.readConfig.mockReset().mockReturnValue({ backend: 'postgres' });
    mocks.all.mockReset().mockReturnValue([]);
    mocks.prepare.mockReset().mockReturnValue({ all: mocks.all });
  });

  it('returns PostgreSQL queue and reading-speed rows unchanged', async () => {
    const queue = [{ vn_id: 'v90001', position: 1, title: 'Queued' }];
    const samples = [{ playtime: 120, vndb: 100, egs: null }];
    mocks.postgresQuery
      .mockResolvedValueOnce({ rows: queue })
      .mockResolvedValueOnce({ rows: samples });
    const repository = createPostgresHomeFeedRepository();

    await expect(repository.listReadingQueueVns()).resolves.toBe(queue);
    await expect(repository.listReadingSpeedSamples()).resolves.toBe(samples);
    expect(String(mocks.postgresQuery.mock.calls[0]?.[0])).toContain('ORDER BY q.position ASC');
    expect(String(mocks.postgresQuery.mock.calls[1]?.[0])).toContain("c.status = 'completed'");
  });

  it('filters invalid and non-elapsed PostgreSQL anniversaries', async () => {
    mocks.postgresQuery.mockResolvedValueOnce({
      rows: [
        { id: 'v90001', title: 'Past', released: '2020-05-06' },
        { id: 'v90002', title: 'Current', released: '2026-05-06' },
        { id: 'v90003', title: 'Invalid', released: 'xxxx-05-06' },
      ],
    });

    await expect(createPostgresHomeFeedRepository().listAnniversaries(new Date(2026, 4, 6))).resolves.toEqual([
      expect.objectContaining({ id: 'v90001', years: 6 }),
    ]);
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual(['05-06']);
  });

  it('uses the current date when an anniversary date is omitted', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 2, 12));
    mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });

    await expect(createPostgresHomeFeedRepository().listAnniversaries()).resolves.toEqual([]);
    expect(mocks.postgresQuery.mock.calls[0]?.[1]).toEqual(['01-02']);
  });

  it('executes every SQLite feed through the selected repository', async () => {
    mocks.readConfig.mockReturnValue({ backend: 'sqlite' });
    const queue = [{ vn_id: 'v90004', position: 2 }];
    const samples = [{ playtime: 90, vndb: null, egs: 80 }];
    mocks.all
      .mockReturnValueOnce(queue)
      .mockReturnValueOnce(samples)
      .mockReturnValueOnce([
        { id: 'v90004', title: 'Past', released: '2025-07-08' },
        { id: 'v90005', title: 'Future', released: '2035-07-08' },
      ]);
    const repository = getHomeFeedRepository();

    await expect(repository.listReadingQueueVns()).resolves.toBe(queue);
    await expect(repository.listReadingSpeedSamples()).resolves.toBe(samples);
    await expect(repository.listAnniversaries(new Date(2030, 6, 8))).resolves.toEqual([
      expect.objectContaining({ id: 'v90004', years: 5 }),
    ]);
    expect(mocks.prepare).toHaveBeenCalledTimes(3);
    expect(mocks.all).toHaveBeenLastCalledWith('07-08');
  });

  it('caches the selected PostgreSQL repository', () => {
    const first = getHomeFeedRepository();
    expect(getHomeFeedRepository()).toBe(first);
  });
});
