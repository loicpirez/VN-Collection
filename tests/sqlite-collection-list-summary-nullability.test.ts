import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: () => ({ backend: 'sqlite' }) }));
vi.mock('@/lib/db', () => ({
  getEgsSummariesForVns: () => new Map([['v90001', {
    egs_id: 90001,
    median: null,
    average: null,
    count: null,
    playtime_median_minutes: null,
    source: 'manual',
    okazu: null,
    erogame: null,
  }]]),
}));

import { getCollectionListRepository } from '@/lib/db/repositories/collection-list';

describe('SQLite collection-list summary nullability', () => {
  it('retains unknown EGS content flags as null rather than false', async () => {
    const summaries = await getCollectionListRepository().egsSummaries(['v90001']);
    expect(summaries.get('v90001')).toMatchObject({ okazu: null, erogame: null });
  });
});
