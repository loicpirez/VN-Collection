import 'server-only';
import { randomUUID } from 'node:crypto';
import {
  getAppJobLockRepository,
  type AppJobLockRepository,
} from '@/lib/db/repositories/app-job-lock';

/** Error raised when a worker no longer owns its distributed job lease. */
export class BackgroundJobLeaseLostError extends Error {
  /**
   * Build a non-sensitive lock-loss error.
   *
   * @param name Logical lease slot that is no longer owned.
   */
  constructor(public readonly name: string) {
    super('background job lease lost');
    this.name = 'BackgroundJobLeaseLostError';
  }
}

/** Owner-bound lease returned after atomic distributed acquisition. */
export interface BackgroundJobLease {
  /** Exact durable lock row owned by this worker. */
  readonly name: string;
  /** Renew the lease or throw when ownership was lost. */
  renew(): Promise<void>;
  /** Release only this worker's ownership. */
  release(): Promise<boolean>;
}

/** Injectable dependencies used by deterministic lease tests. */
export interface BackgroundJobLeaseDependencies {
  /** Durable lock repository shared by every application instance. */
  repository?: AppJobLockRepository;
  /** Owner token. Defaults to a cryptographically random UUID. */
  owner?: string;
  /** Wall-clock source. Defaults to `Date.now`. */
  now?: () => number;
}

function validateLeaseInput(baseName: string, slots: number, ttlMs: number): void {
  if (!baseName.trim()) throw new Error('background job lease name is required');
  if (!Number.isSafeInteger(slots) || slots < 1 || slots > 32) {
    throw new Error('background job lease slots must be between 1 and 32');
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1) {
    throw new Error('background job lease TTL must be a positive integer');
  }
}

/**
 * Atomically acquire one slot from a bounded cross-process job queue.
 *
 * @param baseName Stable queue name shared by every worker instance.
 * @param slots Maximum number of simultaneous owners for the queue.
 * @param ttlMs Expiry interval used to recover slots after process failure.
 * @param dependencies Optional repository, owner, and clock overrides.
 * @returns An owner-bound lease, or `null` when every slot is occupied.
 */
export async function acquireBackgroundJobLease(
  baseName: string,
  slots: number,
  ttlMs: number,
  dependencies: BackgroundJobLeaseDependencies = {},
): Promise<BackgroundJobLease | null> {
  validateLeaseInput(baseName, slots, ttlMs);
  const repository = dependencies.repository ?? getAppJobLockRepository();
  const owner = dependencies.owner ?? randomUUID();
  const now = dependencies.now ?? Date.now;
  const acquiredAt = now();

  for (let slot = 0; slot < slots; slot++) {
    const name = slots === 1 ? baseName : `${baseName}:${slot + 1}`;
    if (!await repository.acquire(name, owner, acquiredAt, ttlMs)) continue;
    let released = false;
    return {
      name,
      async renew() {
        if (released || !await repository.renew(name, owner, now(), ttlMs)) {
          throw new BackgroundJobLeaseLostError(name);
        }
      },
      async release() {
        if (released) return false;
        released = true;
        return repository.release(name, owner);
      },
    };
  }
  return null;
}
