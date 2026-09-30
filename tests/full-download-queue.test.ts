import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { getFullDownloadQueueStore } from '@/lib/db/repositories/full-download-queue';
import { processOneFullDownloadItem } from '@/lib/full-download-worker';
import type { BackgroundJobLease } from '@/lib/background-job-lease';

const IDS = ['v997001', 'v997002', 'v997003'] as const;

function lease(name: string): BackgroundJobLease {
  return {
    name,
    renew: vi.fn(async () => {}),
    release: vi.fn(async () => true),
  };
}

describe('durable full-download queue', () => {
  beforeEach(() => {
    db.prepare(`DELETE FROM full_download_queue WHERE vn_id IN (?, ?, ?)`).run(...IDS);
  });

  it('deduplicates active rows and requeues a completed VN', async () => {
    const store = getFullDownloadQueueStore();
    await expect(store.enqueue([IDS[0], IDS[1]], 100)).resolves.toBe(2);
    await expect(store.enqueue([IDS[0], IDS[1]], 101)).resolves.toBe(0);

    const first = await store.claim('owner-a', 110, 100);
    expect(first).toMatchObject({ vnId: IDS[0], phaseIndex: 0, leaseOwner: 'owner-a' });
    expect(first && await store.finishPhase(first, 'staff', null, 120, 100)).toBe(true);

    await expect(store.claim('owner-b', 150, 100)).resolves.toMatchObject({ vnId: IDS[1] });
    const recovered = await store.claim('owner-c', 221, 100);
    expect(recovered).toMatchObject({ vnId: IDS[0], phaseIndex: 1, leaseOwner: 'owner-c' });
    expect(recovered && await store.renew(recovered, 222, 100)).toBe(true);
    expect(recovered && await store.finishPhase(recovered, 'characters', null, 223, 100)).toBe(true);
    expect(recovered && await store.finishPhase({ ...recovered, phaseIndex: 2 }, 'producers', null, 224, 100)).toBe(true);
    expect(recovered && await store.finish(recovered, 225)).toBe(true);

    const job = (await store.listJobs()).find((candidate) => candidate.vn_id === IDS[0]);
    expect(job).toMatchObject({ done: 3, total: 3, finished_at: 225, errors: [] });
    await expect(store.enqueue([IDS[0]], 300)).resolves.toBe(1);
  });

  it('recovers an expired lease at the last completed phase and retains bounded failures', async () => {
    const store = getFullDownloadQueueStore();
    await store.enqueue([IDS[0]], 100);
    const original = await store.claim('owner-a', 101, 10);
    expect(original).not.toBeNull();
    if (!original) throw new Error('queue fixture was not claimed');
    await expect(store.finishPhase(original, 'staff', 'staff unavailable', 102, 10)).resolves.toBe(true);
    await expect(store.renew(original, 113, 10)).resolves.toBe(false);
    await expect(store.finish(original, 113)).resolves.toBe(false);

    const recovered = await store.claim('owner-b', 113, 10);
    expect(recovered).toMatchObject({ phaseIndex: 1, leaseOwner: 'owner-b' });
    if (!recovered) throw new Error('expired queue fixture was not recovered');
    await store.finishPhase(recovered, 'characters', null, 114, 10);
    await store.finishPhase({ ...recovered, phaseIndex: 2 }, 'producers', null, 115, 10);
    await expect(store.finish(recovered, 116)).resolves.toBe(true);

    const job = (await store.listJobs()).find((candidate) => candidate.vn_id === IDS[0]);
    expect(job).toMatchObject({ done: 3, errors: [{ item: 'staff', message: 'staff unavailable' }] });
  });

  it('runs at most two claimed items concurrently and continues after a phase failure', async () => {
    const store = getFullDownloadQueueStore();
    await store.enqueue(IDS, 100);
    let active = 0;
    let maximum = 0;
    const calls: string[] = [];
    const runPhase = vi.fn(async (phase: string, vnId: string) => {
      active += 1;
      maximum = Math.max(maximum, active);
      calls.push(`${vnId}:${phase}`);
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
      active -= 1;
      if (vnId === IDS[0] && phase === 'characters') throw new Error('character failure');
    });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await Promise.all([
      processOneFullDownloadItem({ store, acquireLease: async () => lease('slot-1'), runPhase, now: () => Date.now(), owner: () => 'worker-1' }),
      processOneFullDownloadItem({ store, acquireLease: async () => lease('slot-2'), runPhase, now: () => Date.now(), owner: () => 'worker-2' }),
    ]);

    expect(maximum).toBe(2);
    expect(calls).toHaveLength(6);
    expect(consoleSpy).toHaveBeenCalledWith(`[full-download:${IDS[0]}] characters:`, 'character failure');
    const jobs = await store.listJobs();
    expect(jobs.find((job) => job.vn_id === IDS[0])?.errors).toEqual([
      { item: 'characters', message: 'character failure' },
    ]);
    expect(jobs.find((job) => job.vn_id === IDS[2])?.current_item).toBe('Queued');
    consoleSpy.mockRestore();
  });

  it('does no work when every global worker slot is occupied', async () => {
    const runPhase = vi.fn();
    await expect(processOneFullDownloadItem({
      store: getFullDownloadQueueStore(),
      acquireLease: async () => null,
      runPhase,
    })).resolves.toBe(false);
    expect(runPhase).not.toHaveBeenCalled();
  });

  it('renews both leases while a phase runs longer than one heartbeat interval', async () => {
    vi.useFakeTimers();
    const item = { id: 'job', vnId: IDS[0], phaseIndex: 0, leaseOwner: 'owner' };
    const store = {
      enqueue: vi.fn(async () => 0),
      claim: vi.fn().mockResolvedValueOnce(item),
      renew: vi.fn(async () => true),
      finishPhase: vi.fn(async () => true),
      finish: vi.fn(async () => true),
      listJobs: vi.fn(async () => []),
    };
    let finishStaff!: () => void;
    const staff = new Promise<void>((resolve) => {
      finishStaff = resolve;
    });
    const runPhase = vi.fn(async (phase: string) => {
      if (phase === 'staff') await staff;
    });
    const ownedLease = lease('slot');
    const processing = processOneFullDownloadItem({
      store,
      acquireLease: async () => ownedLease,
      runPhase,
      now: () => Date.now(),
      owner: () => 'owner',
    });
    await vi.waitFor(() => expect(runPhase).toHaveBeenCalledWith('staff', IDS[0]));
    await vi.advanceTimersByTimeAsync(200_000);
    expect(store.renew).toHaveBeenCalledTimes(2);
    expect(ownedLease.renew).toHaveBeenCalledTimes(2);
    finishStaff();
    await processing;
    vi.useRealTimers();
  });

  it('fails closed on invalid SQLite lease input and an empty queue', async () => {
    const store = getFullDownloadQueueStore();
    const invalid = { id: 'job', vnId: IDS[0], phaseIndex: 0, leaseOwner: '' };
    await expect(store.enqueue([], 100)).resolves.toBe(0);
    await expect(store.claim('', 100, 10)).resolves.toBeNull();
    await expect(store.claim('owner', 100, 10)).resolves.toBeNull();
    await expect(store.renew(invalid, 100, 10)).resolves.toBe(false);
    await expect(store.finishPhase(invalid, 'staff', null, 100, 10)).resolves.toBe(false);
    await expect(store.finishPhase({ ...invalid, leaseOwner: 'owner' }, 'staff', null, 100, 10)).resolves.toBe(false);
  });

  it('stops processing when a phase heartbeat loses the durable item lease', async () => {
    vi.useFakeTimers();
    const item = { id: 'job', vnId: IDS[0], phaseIndex: 0, leaseOwner: 'owner' };
    const store = {
      enqueue: vi.fn(async () => 0),
      claim: vi.fn(async () => item),
      renew: vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false),
      finishPhase: vi.fn(async () => true),
      finish: vi.fn(async () => true),
      listJobs: vi.fn(async () => []),
    };
    let finishPhase!: () => void;
    const phase = new Promise<void>((resolve) => {
      finishPhase = resolve;
    });
    const processing = processOneFullDownloadItem({
      store,
      acquireLease: async () => lease('slot'),
      runPhase: async () => phase,
      now: () => Date.now(),
      owner: () => 'owner',
    });
    await vi.waitFor(() => expect(store.renew).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(200_000);
    finishPhase();
    await expect(processing).rejects.toThrow('full-download item lease lost');
    vi.useRealTimers();
  });

  it.each(['renew', 'finishPhase', 'finish'] as const)('releases the global slot when item %s loses ownership', async (failure) => {
    const item = { id: 'job', vnId: IDS[0], phaseIndex: 0, leaseOwner: 'owner' };
    const store = {
      enqueue: vi.fn(async () => 0),
      claim: vi.fn(async () => item),
      renew: vi.fn(async () => failure !== 'renew'),
      finishPhase: vi.fn(async () => failure !== 'finishPhase'),
      finish: vi.fn(async () => failure !== 'finish'),
      listJobs: vi.fn(async () => []),
    };
    const ownedLease = lease('slot');
    await expect(processOneFullDownloadItem({
      store,
      acquireLease: async () => ownedLease,
      runPhase: async () => {},
      now: () => 100,
      owner: () => 'owner',
    })).rejects.toThrow('full-download item lease lost');
    expect(ownedLease.release).toHaveBeenCalledOnce();
  });

  it('sanitizes malformed persisted errors and exposes the active phase', async () => {
    const store = getFullDownloadQueueStore();
    await store.enqueue([IDS[0]], 100);
    db.prepare(`UPDATE full_download_queue SET errors_json = ?, state = 'running', phase_index = 1, started_at = 110 WHERE vn_id = ?`)
      .run('[{"item":"ok","message":"kept"},{"item":4,"message":"ignored"}]', IDS[0]);
    await expect(store.listJobs()).resolves.toEqual([
      expect.objectContaining({
        current_item: 'characters',
        started_at: 110,
        errors: [{ item: 'ok', message: 'kept' }],
      }),
    ]);
    db.prepare('UPDATE full_download_queue SET errors_json = ? WHERE vn_id = ?').run('{bad json', IDS[0]);
    await expect(store.listJobs()).resolves.toEqual([
      expect.objectContaining({ errors: [] }),
    ]);
    db.prepare('UPDATE full_download_queue SET errors_json = ? WHERE vn_id = ?').run('{}', IDS[0]);
    await expect(store.listJobs()).resolves.toEqual([
      expect.objectContaining({ errors: [] }),
    ]);
  });
});
