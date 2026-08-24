import { describe, expect, it, vi } from 'vitest';
import {
  acquireBackgroundJobLease,
  BackgroundJobLeaseLostError,
} from '@/lib/background-job-lease';
import type { AppJobLockRepository } from '@/lib/db/repositories/app-job-lock';

function repository(results: boolean[]): AppJobLockRepository & {
  acquire: ReturnType<typeof vi.fn>;
  renew: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
} {
  return {
    acquire: vi.fn(async () => results.shift() ?? false),
    renew: vi.fn(async () => results.shift() ?? false),
    release: vi.fn(async () => results.shift() ?? false),
  };
}

describe('background job leases', () => {
  it('uses the configured repository, random owner, and wall clock by default', async () => {
    const lease = await acquireBackgroundJobLease('default-lease-fixture', 1, 500);
    expect(lease?.name).toBe('default-lease-fixture');
    await expect(lease?.release()).resolves.toBe(true);
  });

  it('acquires the first free queue slot and renews and releases its owner', async () => {
    const locks = repository([false, true, true, true]);
    const clock = vi.fn().mockReturnValueOnce(100).mockReturnValueOnce(120);
    const lease = await acquireBackgroundJobLease('stock-batch', 2, 500, {
      repository: locks,
      owner: 'owner-a',
      now: clock,
    });

    expect(lease?.name).toBe('stock-batch:2');
    expect(locks.acquire.mock.calls).toEqual([
      ['stock-batch:1', 'owner-a', 100, 500],
      ['stock-batch:2', 'owner-a', 100, 500],
    ]);
    await expect(lease?.renew()).resolves.toBeUndefined();
    expect(locks.renew).toHaveBeenCalledWith('stock-batch:2', 'owner-a', 120, 500);
    await expect(lease?.release()).resolves.toBe(true);
    expect(locks.release).toHaveBeenCalledWith('stock-batch:2', 'owner-a');
    await expect(lease?.release()).resolves.toBe(false);
  });

  it('returns null when every distributed slot is occupied', async () => {
    const locks = repository([false, false]);
    await expect(acquireBackgroundJobLease('stock-batch', 2, 500, {
      repository: locks,
      owner: 'owner-b',
      now: () => 100,
    })).resolves.toBeNull();
  });

  it('uses the unsuffixed name for a single-slot queue', async () => {
    const locks = repository([true]);
    const lease = await acquireBackgroundJobLease('alicenet-run', 1, 500, {
      repository: locks,
      owner: 'owner-c',
      now: () => 100,
    });
    expect(lease?.name).toBe('alicenet-run');
    expect(locks.acquire).toHaveBeenCalledWith('alicenet-run', 'owner-c', 100, 500);
  });

  it('fails closed when renewal loses ownership or follows release', async () => {
    const locks = repository([true, false, true]);
    const lost = await acquireBackgroundJobLease('job', 1, 500, {
      repository: locks,
      owner: 'owner-d',
      now: () => 100,
    });
    await expect(lost?.renew()).rejects.toBeInstanceOf(BackgroundJobLeaseLostError);

    const released = await acquireBackgroundJobLease('job-2', 1, 500, {
      repository: locks,
      owner: 'owner-e',
      now: () => 100,
    });
    await released?.release();
    await expect(released?.renew()).rejects.toBeInstanceOf(BackgroundJobLeaseLostError);
  });

  it.each([
    ['', 1, 1, 'name'],
    ['job', 0, 1, 'slots'],
    ['job', 33, 1, 'slots'],
    ['job', 1.5, 1, 'slots'],
    ['job', 1, 0, 'TTL'],
    ['job', 1, 1.5, 'TTL'],
  ])('rejects invalid lease input %#', async (name, slots, ttl, message) => {
    await expect(acquireBackgroundJobLease(name, slots, ttl)).rejects.toThrow(message);
  });
});
