import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  backend: { value: 'sqlite' as 'sqlite' | 'sqlite-readonly' | 'postgres' },
  acquireAppJobLock: vi.fn(),
  addToCollection: vi.fn(),
  clearStockProviderExtras: vi.fn(),
  clearVnStockCache: vi.fn(),
  deleteStockAlias: vi.fn(),
  deleteStockSource: vi.fn(),
  isInCollection: vi.fn(),
  isInCollectionMany: vi.fn(),
  migrateVnId: vi.fn(),
  getCachedTitleResolution: vi.fn(),
  getAppSetting: vi.fn(),
  getCollectionItem: vi.fn(),
  getDisabledStockProviders: vi.fn(),
  getErogePriceStockExtras: vi.fn(),
  getStockRetryWithoutProxy: vi.fn(),
  listRecentVnStockOffers: vi.fn(),
  listStockAliases: vi.fn(),
  listStockSources: vi.fn(),
  listVnStockOffers: vi.fn(),
  listVnStockProviderStatuses: vi.fn(),
  listInCollectionVnIds: vi.fn(),
  batchVnStockSummaries: vi.fn(),
  prepare: vi.fn(),
  releaseAppJobLock: vi.fn(),
  removeFromCollection: vi.fn(),
  replaceVnStockProviderSnapshot: vi.fn(),
  setCachedTitleResolution: vi.fn(),
  setCollectionCustomOrder: vi.fn(),
  setAppSetting: vi.fn(),
  setStockProviderExtras: vi.fn(),
  upsertStockAlias: vi.fn(),
  upsertStockSource: vi.fn(),
  upsertEgsOnlyVn: vi.fn(),
  upsertVn: vi.fn(),
  updateCollection: vi.fn(),
  resetCollectionCustomOrder: vi.fn(),
  renewAppJobLock: vi.fn(),
}));

vi.mock('@/lib/db/postgres-config', () => ({
  readDatabaseConfig: () => mocks.backend.value === 'postgres'
    ? { backend: 'postgres', connectionString: 'postgresql://localhost/test' }
    : { backend: mocks.backend.value, path: './data/collection.db' },
}));

vi.mock('@/lib/db/postgres', () => ({
  postgresQuery: vi.fn(),
  withPostgresTransaction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  acquireAppJobLock: mocks.acquireAppJobLock,
  addToCollection: mocks.addToCollection,
  batchVnStockSummaries: mocks.batchVnStockSummaries,
  clearStockProviderExtras: mocks.clearStockProviderExtras,
  clearVnStockCache: mocks.clearVnStockCache,
  db: { prepare: mocks.prepare },
  deleteStockAlias: mocks.deleteStockAlias,
  deleteStockSource: mocks.deleteStockSource,
  getCachedTitleResolution: mocks.getCachedTitleResolution,
  getAppSetting: mocks.getAppSetting,
  getCollectionItem: mocks.getCollectionItem,
  getDisabledStockProviders: mocks.getDisabledStockProviders,
  getErogePriceStockExtras: mocks.getErogePriceStockExtras,
  getStockRetryWithoutProxy: mocks.getStockRetryWithoutProxy,
  isInCollection: mocks.isInCollection,
  isInCollectionMany: mocks.isInCollectionMany,
  migrateVnId: mocks.migrateVnId,
  listInCollectionVnIds: mocks.listInCollectionVnIds,
  listRecentVnStockOffers: mocks.listRecentVnStockOffers,
  listStockAliases: mocks.listStockAliases,
  listStockSources: mocks.listStockSources,
  listVnStockOffers: mocks.listVnStockOffers,
  listVnStockProviderStatuses: mocks.listVnStockProviderStatuses,
  replaceVnStockProviderSnapshot: mocks.replaceVnStockProviderSnapshot,
  releaseAppJobLock: mocks.releaseAppJobLock,
  removeFromCollection: mocks.removeFromCollection,
  renewAppJobLock: mocks.renewAppJobLock,
  setAppSetting: mocks.setAppSetting,
  setCachedTitleResolution: mocks.setCachedTitleResolution,
  setCollectionCustomOrder: mocks.setCollectionCustomOrder,
  setStockProviderExtras: mocks.setStockProviderExtras,
  upsertStockAlias: mocks.upsertStockAlias,
  upsertStockSource: mocks.upsertStockSource,
  upsertEgsOnlyVn: mocks.upsertEgsOnlyVn,
  upsertVn: mocks.upsertVn,
  updateCollection: mocks.updateCollection,
  resetCollectionCustomOrder: mocks.resetCollectionCustomOrder,
}));

import { getAppJobLockRepository } from '@/lib/db/repositories/app-job-lock';
import { getAppSettingRepository } from '@/lib/db/repositories/app-setting';
import { getCollectionCoreRepository } from '@/lib/db/repositories/collection-core';
import { getStockQueueRepository } from '@/lib/db/repositories/stock-queue';
import { getStockRepository } from '@/lib/db/repositories/stock';
import { getVnReadRepository } from '@/lib/db/repositories/vn-read';
import { getVnWriteRepository } from '@/lib/db/repositories/vn-write';
import { getVnIdentityRepository } from '@/lib/db/repositories/vn-identity';
import { getSteamRepository } from '@/lib/db/repositories/steam';

describe('database repository backend selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backend.value = 'sqlite';
  });

  it('keeps read operations on SQLite in compatibility read-only mode', async () => {
    mocks.backend.value = 'sqlite-readonly';
    mocks.isInCollection.mockReturnValue(true);
    await expect(getCollectionCoreRepository().contains('v90001')).resolves.toBe(true);
    expect(mocks.isInCollection).toHaveBeenCalledWith('v90001');
  });

  it('delegates the complete stock contract to the SQLite implementation', async () => {
    const offers = [{ provider_offer_id: 'offer-1' }];
    const statuses = [{ provider: 'sofmap' }];
    const aliases = [{ alias_term: 'Alias' }];
    const sources = [{ id: 4 }];
    const extras = { schemaVersion: 1 };
    const summaries = new Map([['v90001', { available: 1, best_price: 1200 }]]);
    const recent = [{ vn_id: 'v90001' }];
    const disabled = new Set(['sofmap']);
    const cacheResult = { offers: 2, statuses: 1 };
    const titleResolution = { vnId: 'v90001', title: 'Resolved' };
    const source = { id: 4, vn_id: 'v90001', provider: 'sofmap', url: 'https://example.test/source' };
    mocks.listVnStockOffers.mockReturnValue(offers);
    mocks.listVnStockProviderStatuses.mockReturnValue(statuses);
    mocks.setStockProviderExtras.mockReturnValue(true);
    mocks.getErogePriceStockExtras.mockReturnValue(extras);
    mocks.clearStockProviderExtras.mockReturnValue(true);
    mocks.batchVnStockSummaries.mockReturnValue(summaries);
    mocks.listRecentVnStockOffers.mockReturnValue(recent);
    mocks.listStockAliases.mockReturnValue(aliases);
    mocks.listStockSources.mockReturnValue(sources);
    mocks.upsertStockSource.mockReturnValue(source);
    mocks.deleteStockSource.mockReturnValue(true);
    mocks.getDisabledStockProviders.mockReturnValue(disabled);
    mocks.getStockRetryWithoutProxy.mockReturnValue(true);
    mocks.clearVnStockCache.mockReturnValue(cacheResult);
    mocks.getCachedTitleResolution.mockReturnValue(titleResolution);

    const repository = getStockRepository();
    const status = { status: 'ok' as const, message: null, fetched_at: 100, offer_count: 0 };
    await repository.replaceProviderSnapshot('v90001', 'sofmap', [], status, { preserveExistingOffers: true });
    await expect(repository.listOffers('v90001')).resolves.toBe(offers);
    await expect(repository.listProviderStatuses('v90001')).resolves.toBe(statuses);
    await expect(repository.setProviderExtras('v90001', 'eroge_price', extras)).resolves.toBe(true);
    await expect(repository.getErogePriceExtras('v90001')).resolves.toBe(extras);
    await expect(repository.clearProviderExtras('v90001', 'eroge_price')).resolves.toBe(true);
    await expect(repository.batchSummaries(['v90001'])).resolves.toBe(summaries);
    await expect(repository.listRecentOffers(5)).resolves.toBe(recent);
    await expect(repository.listAliases('v90001')).resolves.toBe(aliases);
    await repository.upsertAlias('v90001', 'Alias');
    await repository.deleteAlias('v90001', 'Alias');
    await expect(repository.listSources('v90001')).resolves.toBe(sources);
    await expect(repository.upsertSource({ vn_id: 'v90001', provider: 'sofmap', url: source.url })).resolves.toBe(source);
    await expect(repository.deleteSource('v90001', 4)).resolves.toBe(true);
    await expect(repository.disabledProviders()).resolves.toBe(disabled);
    await expect(repository.retryWithoutProxy()).resolves.toBe(true);
    await expect(repository.clearCache('v90001')).resolves.toBe(cacheResult);
    await expect(repository.getCachedTitleResolution('query')).resolves.toBe(titleResolution);
    await repository.setCachedTitleResolution('query', 'v90001', 'Resolved');

    expect(mocks.replaceVnStockProviderSnapshot).toHaveBeenCalledWith('v90001', 'sofmap', [], status, { preserveExistingOffers: true });
    expect(mocks.upsertStockAlias).toHaveBeenCalledWith('v90001', 'Alias');
    expect(mocks.deleteStockAlias).toHaveBeenCalledWith('v90001', 'Alias');
    expect(mocks.setCachedTitleResolution).toHaveBeenCalledWith('query', 'v90001', 'Resolved');
  });

  it('enumerates every SQLite stock queue and chunks title lookup', async () => {
    mocks.prepare.mockImplementation((sql: string) => ({
      get: () => ({ count: sql.includes('collection') ? 3 : sql.includes('reading_queue') ? 2 : 1 }),
      all: (...parameters: Array<string | number>) => {
        if (sql.includes('SELECT id, title FROM vn')) {
          const firstId = parameters[0];
          return typeof firstId === 'string' ? [{ id: firstId, title: `Title ${firstId}` }] : [];
        }
        return [{ vn_id: `v${String(parameters[0])}`, title: 'Queued title' }];
      },
    }));
    const repository = getStockQueueRepository();

    await expect(repository.list('collection', 20, 40)).resolves.toEqual({
      total: 3,
      entries: [{ vn_id: 'v20', title: 'Queued title' }],
    });
    await expect(repository.list('reading_queue', 10, 2)).resolves.toEqual({
      total: 2,
      entries: [{ vn_id: 'v10', title: 'Queued title' }],
    });
    await expect(repository.list('recent_stock', 5, 1)).resolves.toEqual({
      total: 1,
      entries: [{ vn_id: 'v5', title: 'Queued title' }],
    });
    await expect(repository.list('recent_checked', 4, 3)).resolves.toEqual({
      total: 1,
      entries: [{ vn_id: 'v4', title: 'Queued title' }],
    });
    const stockQueueSql = mocks.prepare.mock.calls.map(([sql]) => String(sql));
    expect(stockQueueSql.some((sql) => sql.includes('MIN(s.fetched_at) ASC'))).toBe(true);
    expect(stockQueueSql.some((sql) => sql.includes('MAX(s.fetched_at) DESC'))).toBe(true);
    await expect(repository.titlesFor([])).resolves.toEqual(new Map());

    const ids = Array.from({ length: 501 }, (_, index) => `v${index + 1}`);
    const titles = await repository.titlesFor(ids);
    expect(titles.get('v1')).toBe('Title v1');
    expect(titles.get('v501')).toBe('Title v501');
    expect(titles.get('v2')).toBeNull();
    expect(mocks.prepare.mock.calls.filter(([sql]) => String(sql).includes('SELECT id, title FROM vn'))).toHaveLength(2);
  });

  it('reads and searches stock VN context through SQLite', async () => {
    const row = {
      title: 'SQLite title',
      alttitle: 'Alternate',
      titles: [{ lang: 'en', title: 'SQLite title', latin: null, official: true, main: true }],
      extlinks: [{ url: 'https://example.test', label: 'site', name: 'Site' }],
    };
    mocks.getCollectionItem.mockReturnValueOnce(row).mockReturnValueOnce(null);
    const statementGet = vi.fn()
      .mockReturnValueOnce({ id: 'v90001', title: 'Matched' })
      .mockReturnValueOnce(undefined);
    mocks.prepare.mockReturnValue({ get: statementGet });
    const repository = getVnReadRepository();

    await expect(repository.getStockContext('v90001')).resolves.toEqual(row);
    await expect(repository.getStockContext('v90002')).resolves.toBeNull();
    await expect(repository.findTitleMatch('100%_match')).resolves.toEqual({ vnId: 'v90001', title: 'Matched' });
    await expect(repository.findTitleMatch('missing')).resolves.toBeNull();
    expect(statementGet.mock.calls[0]).toEqual(['%100\\%\\_match%', '%100\\%\\_match%']);
  });

  it('delegates settings, job locks, and VN writes to SQLite', async () => {
    mocks.getAppSetting.mockReturnValue('stored');
    mocks.acquireAppJobLock.mockReturnValue(true);
    mocks.renewAppJobLock.mockReturnValue(true);
    mocks.releaseAppJobLock.mockReturnValue(false);
    const payload = { id: 'v90001', title: 'SQLite payload' };

    await expect(getAppSettingRepository().get('key')).resolves.toBe('stored');
    await getAppSettingRepository().set('key', 'value');
    await expect(getAppJobLockRepository().acquire('job', 'owner', 100, 50)).resolves.toBe(true);
    await expect(getAppJobLockRepository().renew('job', 'owner', 110, 50)).resolves.toBe(true);
    await expect(getAppJobLockRepository().release('job', 'owner')).resolves.toBe(false);
    await getVnWriteRepository().upsert(payload);
    await getVnWriteRepository().upsertEgsOnly({
      vnId: 'egs_90001',
      title: 'Synthetic payload',
      alttitle: null,
      released: null,
      description: null,
      imageUrl: null,
    });

    expect(mocks.setAppSetting).toHaveBeenCalledWith('key', 'value');
    expect(mocks.acquireAppJobLock).toHaveBeenCalledWith('job', 'owner', 100, 50);
    expect(mocks.renewAppJobLock).toHaveBeenCalledWith('job', 'owner', 110, 50);
    expect(mocks.releaseAppJobLock).toHaveBeenCalledWith('job', 'owner');
    expect(mocks.upsertVn).toHaveBeenCalledWith(payload);
    expect(mocks.upsertEgsOnlyVn).toHaveBeenCalledWith({
      vnId: 'egs_90001',
      title: 'Synthetic payload',
      alttitle: null,
      released: null,
      description: null,
      imageUrl: null,
    });
  });

  it('delegates the collection core contract to SQLite', async () => {
    mocks.isInCollection.mockReturnValue(true);
    mocks.isInCollectionMany.mockReturnValue(new Set(['v90001']));
    mocks.listInCollectionVnIds.mockReturnValue(['v90001', 'v90002']);
    const repository = getCollectionCoreRepository();
    const patch = { status: 'completed' as const, custom_description: 'Custom' };

    await repository.add('v90001', patch);
    await repository.update('v90001', patch);
    await repository.remove('v90001');
    await expect(repository.contains('v90001')).resolves.toBe(true);
    await expect(repository.containsMany(['v90001', 'v90003'])).resolves.toEqual(new Set(['v90001']));
    await repository.setCustomOrder(['v90002', 'v90001']);
    await repository.resetCustomOrder();
    await expect(repository.listIds()).resolves.toEqual(['v90001', 'v90002']);

    expect(mocks.addToCollection).toHaveBeenCalledWith('v90001', patch);
    expect(mocks.updateCollection).toHaveBeenCalledWith('v90001', patch);
    expect(mocks.removeFromCollection).toHaveBeenCalledWith('v90001');
    expect(mocks.isInCollection).toHaveBeenCalledWith('v90001');
    expect(mocks.isInCollectionMany).toHaveBeenCalledWith(['v90001', 'v90003']);
    expect(mocks.setCollectionCustomOrder).toHaveBeenCalledWith(['v90002', 'v90001']);
    expect(mocks.resetCollectionCustomOrder).toHaveBeenCalledOnce();
  });

  it('delegates VN identity migration to SQLite', async () => {
    await getVnIdentityRepository().migrate('egs_90001', 'v90001');
    expect(mocks.migrateVnId).toHaveBeenCalledWith('egs_90001', 'v90001');
  });

  it('selects and reuses PostgreSQL repositories when configured', () => {
    mocks.backend.value = 'postgres';
    const stock = getStockRepository();
    const queue = getStockQueueRepository();
    const vn = getVnReadRepository();
    const settings = getAppSettingRepository();
    const locks = getAppJobLockRepository();
    const writer = getVnWriteRepository();
    const collection = getCollectionCoreRepository();
    const identity = getVnIdentityRepository();
    const steam = getSteamRepository();

    expect(getStockRepository()).toBe(stock);
    expect(getStockQueueRepository()).toBe(queue);
    expect(getVnReadRepository()).toBe(vn);
    expect(getAppSettingRepository()).toBe(settings);
    expect(getAppJobLockRepository()).toBe(locks);
    expect(getVnWriteRepository()).toBe(writer);
    expect(getCollectionCoreRepository()).toBe(collection);
    expect(getVnIdentityRepository()).toBe(identity);
    expect(getSteamRepository()).toBe(steam);
  });
});
