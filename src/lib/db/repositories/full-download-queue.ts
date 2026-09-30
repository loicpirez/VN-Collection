import 'server-only';
import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { readDatabaseConfig } from '../postgres-config';
import { postgresQuery } from '../postgres';
import type { DownloadJob, DownloadJobError } from '../../download-status';

/** Ordered work performed for every selective full-download item. */
export const FULL_DOWNLOAD_PHASES = ['staff', 'characters', 'producers'] as const;

/** One phase in the selective full-download pipeline. */
export type FullDownloadPhase = (typeof FULL_DOWNLOAD_PHASES)[number];

/** A claimed queue item that may be processed only by its lease owner. */
export interface ClaimedFullDownloadItem {
  id: string;
  vnId: string;
  phaseIndex: number;
  leaseOwner: string;
}

interface FullDownloadQueueRow extends QueryResultRow {
  id: string;
  vn_id: string;
  state: string;
  phase_index: number;
  attempts: number;
  errors_json: string;
  enqueued_at: number;
  started_at: number | null;
  updated_at: number;
  finished_at: number | null;
  lease_owner: string | null;
  lease_expires_at: number | null;
}

function parseErrors(raw: string): DownloadJobError[] {
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry): DownloadJobError[] => {
      if (
        typeof entry === 'object'
        && entry !== null
        && 'item' in entry
        && typeof entry.item === 'string'
        && 'message' in entry
        && typeof entry.message === 'string'
      ) {
        return [{ item: entry.item, message: entry.message }];
      }
      return [];
    });
  } catch {
    return [];
  }
}

function appendError(raw: string, phase: FullDownloadPhase, error: string | null): string {
  if (error === null) return raw;
  return JSON.stringify([...parseErrors(raw), { item: phase, message: error }].slice(-FULL_DOWNLOAD_PHASES.length));
}

function toDownloadJob(row: FullDownloadQueueRow): DownloadJob {
  const phase = FULL_DOWNLOAD_PHASES[row.phase_index];
  return {
    id: row.id,
    kind: 'cache-refresh',
    vn_id: row.vn_id,
    label: `Full data download - ${row.vn_id}`,
    total: FULL_DOWNLOAD_PHASES.length,
    done: Math.min(row.phase_index, FULL_DOWNLOAD_PHASES.length),
    current_item: row.state === 'queued' ? 'Queued' : phase ?? null,
    errors: parseErrors(row.errors_json),
    started_at: row.started_at ?? row.enqueued_at,
    finished_at: row.finished_at,
    interrupted: false,
  };
}

/** Persistence contract used by the full-download worker coordinator. */
export interface FullDownloadQueueStore {
  /** Insert new VN rows and leave active rows untouched. */
  enqueue(vnIds: readonly string[], now: number): Promise<number>;
  /** Atomically claim the oldest queued or expired item. */
  claim(owner: string, now: number, leaseTtlMs: number): Promise<ClaimedFullDownloadItem | null>;
  /** Renew an item lease while its owner is still current. */
  renew(item: ClaimedFullDownloadItem, now: number, leaseTtlMs: number): Promise<boolean>;
  /** Persist one completed phase and an optional bounded failure. */
  finishPhase(item: ClaimedFullDownloadItem, phase: FullDownloadPhase, error: string | null, now: number, leaseTtlMs: number): Promise<boolean>;
  /** Finish an item after all phases have been attempted. */
  finish(item: ClaimedFullDownloadItem, now: number): Promise<boolean>;
  /** List bounded durable queue status for the download-status surface. */
  listJobs(): Promise<DownloadJob[]>;
}

function validateLease(owner: string, now: number, leaseTtlMs: number): boolean {
  return Boolean(owner && Number.isSafeInteger(now) && Number.isSafeInteger(leaseTtlMs) && leaseTtlMs > 0);
}

function sqliteStore(): FullDownloadQueueStore {
  return {
    async enqueue(vnIds, now) {
      if (vnIds.length === 0) return 0;
      const { db } = await import('@/lib/db');
      const insert = db.prepare(`
        INSERT INTO full_download_queue (
          id, vn_id, state, phase_index, attempts, errors_json,
          enqueued_at, started_at, updated_at, finished_at, lease_owner, lease_expires_at
        ) VALUES (?, ?, 'queued', 0, 0, '[]', ?, NULL, ?, NULL, NULL, NULL)
        ON CONFLICT(vn_id) DO UPDATE SET
          id = excluded.id, state = 'queued', phase_index = 0, attempts = 0,
          errors_json = '[]', enqueued_at = excluded.enqueued_at, started_at = NULL,
          updated_at = excluded.updated_at, finished_at = NULL,
          lease_owner = NULL, lease_expires_at = NULL
        WHERE full_download_queue.state IN ('completed', 'failed')
      `);
      return db.transaction(() => {
        let queued = 0;
        for (const vnId of vnIds) {
          queued += insert.run(`full-download:${randomUUID()}`, vnId, now, now).changes;
        }
        return queued;
      })();
    },
    async claim(owner, now, leaseTtlMs) {
      if (!validateLease(owner, now, leaseTtlMs)) return null;
      const { db } = await import('@/lib/db');
      return db.transaction(() => {
        const row = db.prepare(`
          SELECT id, vn_id, phase_index FROM full_download_queue
          WHERE state = 'queued' OR (state = 'running' AND lease_expires_at <= ?)
          ORDER BY enqueued_at, vn_id LIMIT 1
        `).get(now) as Pick<FullDownloadQueueRow, 'id' | 'vn_id' | 'phase_index'> | undefined;
        if (!row) return null;
        db.prepare(`
          UPDATE full_download_queue SET state = 'running', attempts = attempts + 1,
            started_at = COALESCE(started_at, ?), updated_at = ?, lease_owner = ?, lease_expires_at = ?
          WHERE id = ? AND (state = 'queued' OR (state = 'running' AND lease_expires_at <= ?))
        `).run(now, now, owner, now + leaseTtlMs, row.id, now);
        return { id: row.id, vnId: row.vn_id, phaseIndex: Number(row.phase_index), leaseOwner: owner };
      })();
    },
    async renew(item, now, leaseTtlMs) {
      if (!validateLease(item.leaseOwner, now, leaseTtlMs)) return false;
      const { db } = await import('@/lib/db');
      return db.prepare(`
        UPDATE full_download_queue SET updated_at = ?, lease_expires_at = ?
        WHERE id = ? AND state = 'running' AND lease_owner = ? AND lease_expires_at > ?
      `).run(now, now + leaseTtlMs, item.id, item.leaseOwner, now).changes === 1;
    },
    async finishPhase(item, phase, error, now, leaseTtlMs) {
      if (!validateLease(item.leaseOwner, now, leaseTtlMs)) return false;
      const { db } = await import('@/lib/db');
      return db.transaction(() => {
        const row = db.prepare(`
          SELECT errors_json FROM full_download_queue
          WHERE id = ? AND state = 'running' AND lease_owner = ?
            AND lease_expires_at > ? AND phase_index = ?
        `).get(item.id, item.leaseOwner, now, item.phaseIndex) as Pick<FullDownloadQueueRow, 'errors_json'> | undefined;
        if (!row) return false;
        return db.prepare(`
          UPDATE full_download_queue SET phase_index = phase_index + 1,
            errors_json = ?, updated_at = ?, lease_expires_at = ?
          WHERE id = ? AND state = 'running' AND lease_owner = ?
            AND lease_expires_at > ? AND phase_index = ?
        `).run(
          appendError(row.errors_json, phase, error),
          now,
          now + leaseTtlMs,
          item.id,
          item.leaseOwner,
          now,
          item.phaseIndex,
        ).changes === 1;
      })();
    },
    async finish(item, now) {
      const { db } = await import('@/lib/db');
      return db.prepare(`
        UPDATE full_download_queue SET
          state = CASE WHEN errors_json = '[]' THEN 'completed' ELSE 'failed' END,
          updated_at = ?, finished_at = ?, lease_owner = NULL, lease_expires_at = NULL
        WHERE id = ? AND state = 'running' AND lease_owner = ?
          AND lease_expires_at > ? AND phase_index = 3
      `).run(now, now, item.id, item.leaseOwner, now).changes === 1;
    },
    async listJobs() {
      const { db } = await import('@/lib/db');
      const rows = db.prepare(`
        SELECT id, vn_id, state, phase_index, attempts, errors_json, enqueued_at,
          started_at, updated_at, finished_at, lease_owner, lease_expires_at
        FROM full_download_queue ORDER BY enqueued_at DESC LIMIT 200
      `).all() as FullDownloadQueueRow[];
      return rows.map(toDownloadJob);
    },
  };
}

function postgresStore(): FullDownloadQueueStore {
  return {
    async enqueue(vnIds, now) {
      let queued = 0;
      for (const vnId of vnIds) {
        const result = await postgresQuery(`
          INSERT INTO full_download_queue (
            id, vn_id, state, phase_index, attempts, errors_json,
            enqueued_at, started_at, updated_at, finished_at, lease_owner, lease_expires_at
          ) VALUES ($1, $2, 'queued', 0, 0, '[]', $3, NULL, $3, NULL, NULL, NULL)
          ON CONFLICT(vn_id) DO UPDATE SET
            id = excluded.id, state = 'queued', phase_index = 0, attempts = 0,
            errors_json = '[]', enqueued_at = excluded.enqueued_at, started_at = NULL,
            updated_at = excluded.updated_at, finished_at = NULL,
            lease_owner = NULL, lease_expires_at = NULL
          WHERE full_download_queue.state IN ('completed', 'failed')
          RETURNING id
        `, [`full-download:${randomUUID()}`, vnId, now]);
        queued += result.rowCount ?? 0;
      }
      return queued;
    },
    async claim(owner, now, leaseTtlMs) {
      if (!validateLease(owner, now, leaseTtlMs)) return null;
      const result = await postgresQuery<Pick<FullDownloadQueueRow, 'id' | 'vn_id' | 'phase_index'> & QueryResultRow>(`
        WITH candidate AS (
          SELECT id FROM full_download_queue
          WHERE state = 'queued' OR (state = 'running' AND lease_expires_at <= $1)
          ORDER BY enqueued_at, vn_id FOR UPDATE SKIP LOCKED LIMIT 1
        )
        UPDATE full_download_queue AS job SET state = 'running', attempts = attempts + 1,
          started_at = COALESCE(started_at, $1), updated_at = $1,
          lease_owner = $2, lease_expires_at = $3
        FROM candidate WHERE job.id = candidate.id
        RETURNING job.id, job.vn_id, job.phase_index
      `, [now, owner, now + leaseTtlMs]);
      const row = result.rows[0];
      return row
        ? { id: row.id, vnId: row.vn_id, phaseIndex: Number(row.phase_index), leaseOwner: owner }
        : null;
    },
    async renew(item, now, leaseTtlMs) {
      if (!validateLease(item.leaseOwner, now, leaseTtlMs)) return false;
      const result = await postgresQuery(`
        UPDATE full_download_queue SET updated_at = $1, lease_expires_at = $2
        WHERE id = $3 AND state = 'running' AND lease_owner = $4 AND lease_expires_at > $1
        RETURNING id
      `, [now, now + leaseTtlMs, item.id, item.leaseOwner]);
      return (result.rowCount ?? 0) === 1;
    },
    async finishPhase(item, phase, error, now, leaseTtlMs) {
      if (!validateLease(item.leaseOwner, now, leaseTtlMs)) return false;
      const current = await postgresQuery<Pick<FullDownloadQueueRow, 'errors_json'> & QueryResultRow>(`
        SELECT errors_json FROM full_download_queue
        WHERE id = $1 AND state = 'running' AND lease_owner = $2
          AND lease_expires_at > $3 AND phase_index = $4
      `, [item.id, item.leaseOwner, now, item.phaseIndex]);
      const row = current.rows[0];
      if (!row) return false;
      const result = await postgresQuery(`
        UPDATE full_download_queue SET phase_index = phase_index + 1,
          errors_json = $1, updated_at = $2, lease_expires_at = $3
        WHERE id = $4 AND state = 'running' AND lease_owner = $5
          AND lease_expires_at > $2 AND phase_index = $6
        RETURNING id
      `, [appendError(row.errors_json, phase, error), now, now + leaseTtlMs, item.id, item.leaseOwner, item.phaseIndex]);
      return (result.rowCount ?? 0) === 1;
    },
    async finish(item, now) {
      const result = await postgresQuery(`
        UPDATE full_download_queue SET
          state = CASE WHEN errors_json = '[]' THEN 'completed' ELSE 'failed' END,
          updated_at = $1, finished_at = $1, lease_owner = NULL, lease_expires_at = NULL
        WHERE id = $2 AND state = 'running' AND lease_owner = $3
          AND lease_expires_at > $1 AND phase_index = 3 RETURNING id
      `, [now, item.id, item.leaseOwner]);
      return (result.rowCount ?? 0) === 1;
    },
    async listJobs() {
      const result = await postgresQuery<FullDownloadQueueRow>(`
        SELECT id, vn_id, state, phase_index, attempts, errors_json, enqueued_at,
          started_at, updated_at, finished_at, lease_owner, lease_expires_at
        FROM full_download_queue ORDER BY enqueued_at DESC LIMIT 200
      `);
      return result.rows.map(toDownloadJob);
    },
  };
}

/** Return a queue store backed by the selected runtime database. */
export function getFullDownloadQueueStore(): FullDownloadQueueStore {
  return readDatabaseConfig().backend === 'postgres' ? postgresStore() : sqliteStore();
}
