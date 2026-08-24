import { describe, expect, it, vi } from 'vitest';
import { createPostgresAppJobLockRepository } from '@/lib/db/repositories/app-job-lock';

type QueryValue = string | number | boolean | null;

describe('PostgreSQL application job locks', () => {
  it('rejects invalid acquisition and renewal input without querying', async () => {
    const query = vi.fn(async (_text: string, _values: readonly QueryValue[]) => ({ rowCount: 1 }));
    const repository = createPostgresAppJobLockRepository(query);
    await expect(repository.acquire('', 'owner', 10, 20)).resolves.toBe(false);
    await expect(repository.acquire('job', '', 10, 20)).resolves.toBe(false);
    await expect(repository.acquire('job', 'owner', Number.NaN, 20)).resolves.toBe(false);
    await expect(repository.acquire('job', 'owner', 10, 0)).resolves.toBe(false);
    await expect(repository.renew('job', 'owner', 10, Number.POSITIVE_INFINITY)).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('acquires an expired lock with bounded integer timestamps', async () => {
    const query = vi.fn(async (_text: string, _values: readonly QueryValue[]) => ({ rowCount: 1 }));
    const repository = createPostgresAppJobLockRepository(query);
    await expect(repository.acquire('alicenet-run', 'owner-a', 100.8, 50.7)).resolves.toBe(true);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0]?.[1]).toEqual(['alicenet-run', 'owner-a', 151, 100]);
    expect(query.mock.calls[0]?.[0]).toContain('ON CONFLICT(name) DO UPDATE');
    expect(query.mock.calls[0]?.[0]).toContain('RETURNING name');
  });

  it('returns false when a current owner prevents acquisition', async () => {
    const repository = createPostgresAppJobLockRepository(async (_text, _values) => ({ rowCount: 0 }));
    await expect(repository.acquire('alicenet-run', 'owner-b', 100, 50)).resolves.toBe(false);
  });

  it('treats null PostgreSQL row counts as unsuccessful acquisition and renewal', async () => {
    const query = vi.fn(async (_text: string, _values: readonly QueryValue[]): Promise<{ rowCount: number | null }> => ({ rowCount: null }));
    const repository = createPostgresAppJobLockRepository(query);

    await expect(repository.acquire('alicenet-run', 'owner-b', 100, 50)).resolves.toBe(false);
    await expect(repository.renew('alicenet-run', 'owner-b', 100, 50)).resolves.toBe(false);
  });

  it('renews and releases only when PostgreSQL returns the owned row', async () => {
    const query = vi.fn(async (_text: string, _values: readonly QueryValue[]): Promise<{ rowCount: number | null }> => ({ rowCount: 0 }))
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: null });
    const repository = createPostgresAppJobLockRepository(query);
    await expect(repository.renew('alicenet-run', 'owner-a', 200, 100)).resolves.toBe(true);
    expect(query.mock.calls[0]?.[1]).toEqual([300, 'alicenet-run', 'owner-a', 200]);
    await expect(repository.release('alicenet-run', 'owner-a')).resolves.toBe(false);
    expect(query.mock.calls[1]?.[0]).toContain('DELETE FROM app_job_lock');
  });

  it('rejects an invalid release without querying', async () => {
    const query = vi.fn(async (_text: string, _values: readonly QueryValue[]) => ({ rowCount: 1 }));
    const repository = createPostgresAppJobLockRepository(query);
    await expect(repository.release('', 'owner')).resolves.toBe(false);
    await expect(repository.release('job', '')).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
