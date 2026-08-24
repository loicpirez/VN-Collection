import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';

type LockValue = string | number | boolean | null;
type LockQuery = (text: string, values: readonly LockValue[]) => Promise<{ rowCount: number | null }>;

/** Persistence contract for an expiring, owner-bound application job lock. */
export interface AppJobLockRepository {
  /** Atomically acquire an absent or expired lock. */
  acquire(name: string, owner: string, now: number, ttlMs: number): Promise<boolean>;
  /** Extend a live lock only for its current owner. */
  renew(name: string, owner: string, now: number, ttlMs: number): Promise<boolean>;
  /** Release a lock only for its current owner. */
  release(name: string, owner: string): Promise<boolean>;
}

function validTimedInput(name: string, owner: string, now: number, ttlMs: number): boolean {
  return Boolean(name && owner && Number.isFinite(now) && Number.isFinite(ttlMs) && ttlMs > 0);
}

/**
 * Create the PostgreSQL job-lock repository around an injectable query function.
 *
 * @param query Parameterized PostgreSQL query executor.
 * @returns Owner-safe job-lock repository.
 */
export function createPostgresAppJobLockRepository(query: LockQuery = postgresQuery): AppJobLockRepository {
  return {
    async acquire(name, owner, now, ttlMs) {
      if (!validTimedInput(name, owner, now, ttlMs)) return false;
      const result = await query(`
        INSERT INTO app_job_lock (name, owner, expires_at)
        VALUES ($1, $2, $3)
        ON CONFLICT(name) DO UPDATE SET
          owner = EXCLUDED.owner,
          expires_at = EXCLUDED.expires_at
        WHERE app_job_lock.expires_at <= $4
        RETURNING name
      `, [name, owner, Math.floor(now + ttlMs), Math.floor(now)]);
      return (result.rowCount ?? 0) > 0;
    },
    async renew(name, owner, now, ttlMs) {
      if (!validTimedInput(name, owner, now, ttlMs)) return false;
      const result = await query(`
        UPDATE app_job_lock
        SET expires_at = $1
        WHERE name = $2 AND owner = $3 AND expires_at > $4
        RETURNING name
      `, [Math.floor(now + ttlMs), name, owner, Math.floor(now)]);
      return (result.rowCount ?? 0) > 0;
    },
    async release(name, owner) {
      if (!name || !owner) return false;
      const result = await query(
        'DELETE FROM app_job_lock WHERE name = $1 AND owner = $2 RETURNING name',
        [name, owner],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}

const sqliteRepository: AppJobLockRepository = {
  acquire: async (name, owner, now, ttlMs) => {
    const { acquireAppJobLock } = await import('@/lib/db');
    return acquireAppJobLock(name, owner, now, ttlMs);
  },
  renew: async (name, owner, now, ttlMs) => {
    const { renewAppJobLock } = await import('@/lib/db');
    return renewAppJobLock(name, owner, now, ttlMs);
  },
  release: async (name, owner) => {
    const { releaseAppJobLock } = await import('@/lib/db');
    return releaseAppJobLock(name, owner);
  },
};

let postgresRepository: AppJobLockRepository | null = null;

/** Return the configured owner-safe job-lock repository. */
export function getAppJobLockRepository(): AppJobLockRepository {
  const config = readDatabaseConfig();
  if (config.backend !== 'postgres') return sqliteRepository;
  postgresRepository ??= createPostgresAppJobLockRepository();
  return postgresRepository;
}
