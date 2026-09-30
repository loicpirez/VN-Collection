import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  postgresQuery: vi.fn(),
  readDatabaseConfig: vi.fn(() => ({ backend: 'postgres' as const, url: 'postgres://fixture/db' })),
}));

vi.mock('@/lib/db/postgres', () => ({ postgresQuery: mocks.postgresQuery }));
vi.mock('@/lib/db/postgres-config', () => ({ readDatabaseConfig: mocks.readDatabaseConfig }));

import { getFullDownloadQueueStore } from '@/lib/db/repositories/full-download-queue';

describe('PostgreSQL full-download queue', () => {
  beforeEach(() => {
    mocks.postgresQuery.mockReset();
  });

  it('uses conflict-safe enqueue and atomic skip-locked claims', async () => {
    mocks.postgresQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'job-1', vn_id: 'v998001', phase_index: 1 }] });
    const store = getFullDownloadQueueStore();
    await expect(store.enqueue(['v998001', 'v998002'], 100)).resolves.toBe(1);
    await expect(store.claim('owner-a', 110, 50)).resolves.toEqual({
      id: 'job-1', vnId: 'v998001', phaseIndex: 1, leaseOwner: 'owner-a',
    });
    expect(String(mocks.postgresQuery.mock.calls[0]?.[0])).toContain('ON CONFLICT(vn_id) DO UPDATE');
    expect(String(mocks.postgresQuery.mock.calls[2]?.[0])).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('renews, advances, finishes, and maps durable status rows', async () => {
    mocks.postgresQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ errors_json: '[]' }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: 'job-1', vn_id: 'v998001', state: 'failed', phase_index: 3, attempts: 2,
        errors_json: '[{"item":"staff","message":"failed"}]', enqueued_at: 100,
        started_at: 110, updated_at: 130, finished_at: 130, lease_owner: null,
        lease_expires_at: null,
      }] });
    const store = getFullDownloadQueueStore();
    const item = { id: 'job-1', vnId: 'v998001', phaseIndex: 0, leaseOwner: 'owner-a' };
    await expect(store.renew(item, 110, 50)).resolves.toBe(true);
    await expect(store.finishPhase(item, 'staff', 'failed', 120, 50)).resolves.toBe(true);
    await expect(store.finish(item, 130)).resolves.toBe(true);
    await expect(store.listJobs()).resolves.toEqual([expect.objectContaining({
      id: 'job-1', vn_id: 'v998001', done: 3, finished_at: 130,
      errors: [{ item: 'staff', message: 'failed' }],
    })]);
  });

  it('fails closed for invalid or unowned lease mutations and empty results', async () => {
    const store = getFullDownloadQueueStore();
    const item = { id: 'job-1', vnId: 'v998001', phaseIndex: 0, leaseOwner: '' };
    await expect(store.enqueue([], 100)).resolves.toBe(0);
    await expect(store.claim('', 100, 10)).resolves.toBeNull();
    await expect(store.renew(item, 100, 10)).resolves.toBe(false);
    await expect(store.finishPhase(item, 'staff', null, 100, 10)).resolves.toBe(false);
    expect(mocks.postgresQuery).not.toHaveBeenCalled();

    mocks.postgresQuery
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    const valid = { ...item, leaseOwner: 'owner-a' };
    await expect(store.claim('owner-a', 100, 10)).resolves.toBeNull();
    await expect(store.renew(valid, 100, 10)).resolves.toBe(false);
    await expect(store.finishPhase(valid, 'staff', null, 100, 10)).resolves.toBe(false);
    await expect(store.finish(valid, 100)).resolves.toBe(false);
  });

  it('treats a null enqueue row count as deduplicated', async () => {
    mocks.postgresQuery.mockResolvedValueOnce({ rowCount: null, rows: [] });
    await expect(getFullDownloadQueueStore().enqueue(['v998001'], 100)).resolves.toBe(0);
  });

  it('treats a null phase-update row count as a lost lease', async () => {
    mocks.postgresQuery
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ errors_json: '[]' }] })
      .mockResolvedValueOnce({ rowCount: null, rows: [] });
    await expect(getFullDownloadQueueStore().finishPhase(
      { id: 'job-1', vnId: 'v998001', phaseIndex: 0, leaseOwner: 'owner-a' },
      'staff',
      null,
      100,
      50,
    )).resolves.toBe(false);
  });
});
