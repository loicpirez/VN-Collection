import 'server-only';
import { db } from './db';
import { isJobCurrentItemCode, isJobLabelCode, type DownloadJob, type JobTextParams } from './download-status';

interface StockBatchJobRow {
  id: string;
  label: string;
  label_code: string | null;
  label_params_json: string | null;
  total: number;
  done: number;
  current_item: string | null;
  current_item_code: string | null;
  current_item_params_json: string | null;
  errors_json: string;
  started_at: number;
  finished_at: number | null;
  cancelled: number;
  interrupted: number;
}

function parseTextParams(raw: string | null): JobTextParams | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed);
    if (!entries.every(([, value]) => typeof value === 'string' || typeof value === 'number')) return null;
    return Object.fromEntries(entries);
  } catch {
    return null;
  }
}

interface DownloadJobError {
  item: string;
  message: string;
}

const MAX_DURABLE_JOBS = 200;
const INTERRUPTED_MESSAGE = 'Interrupted by server restart';
let initialized = false;

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

function toDownloadJob(row: StockBatchJobRow): DownloadJob {
  return {
    id: row.id,
    kind: 'stock-batch',
    vn_id: null,
    label: row.label,
    label_code: row.label_code && isJobLabelCode(row.label_code) ? row.label_code : null,
    label_params: parseTextParams(row.label_params_json),
    total: row.total,
    done: row.done,
    current_item: row.current_item,
    current_item_code: row.current_item_code && isJobCurrentItemCode(row.current_item_code) ? row.current_item_code : null,
    current_item_params: parseTextParams(row.current_item_params_json),
    errors: parseErrors(row.errors_json),
    started_at: row.started_at,
    finished_at: row.finished_at,
    cancelled: row.cancelled === 1,
    interrupted: row.interrupted === 1,
  };
}

function gc(): void {
  const cutoff = Date.now() - 3600 * 1000;
  db.prepare(`DELETE FROM stock_batch_job WHERE finished_at IS NOT NULL AND finished_at < ?`).run(cutoff);
  db.prepare(`
    DELETE FROM stock_batch_job
    WHERE id IN (
      SELECT id
      FROM stock_batch_job
      WHERE finished_at IS NOT NULL
      ORDER BY started_at DESC
      LIMIT -1 OFFSET ?
    )
  `).run(MAX_DURABLE_JOBS);
}

/**
 * Mark unfinished durable jobs as interrupted after a server restart.
 *
 * @returns Number of stale running rows transitioned to interrupted.
 */
export function markUnfinishedDurableStockBatchJobsInterrupted(): number {
  const rows = db
    .prepare(`SELECT id, errors_json FROM stock_batch_job WHERE finished_at IS NULL`)
    .all() as Array<{ id: string; errors_json: string }>;
  if (rows.length === 0) return 0;
  const now = Date.now();
  const update = db.prepare(`
    UPDATE stock_batch_job
    SET errors_json = ?, finished_at = ?, current_item = NULL, current_item_code = NULL, current_item_params_json = NULL, interrupted = 1
    WHERE id = ?
  `);
  db.transaction(() => {
    for (const row of rows) {
      const errors = parseErrors(row.errors_json);
      errors.push({ item: 'stock-batch', message: INTERRUPTED_MESSAGE });
      update.run(JSON.stringify(errors), now, row.id);
    }
  })();
  return rows.length;
}

function initialize(): void {
  if (initialized) return;
  initialized = true;
  markUnfinishedDurableStockBatchJobsInterrupted();
  gc();
}

/**
 * Persist the top-level progress snapshot for a bulk stock refresh.
 *
 * @param job Current in-memory top-level stock batch job.
 */
export function upsertDurableStockBatchJob(job: DownloadJob): void {
  initialize();
  db.prepare(`
    INSERT INTO stock_batch_job (
      id, label, label_code, label_params_json, total, done, current_item, current_item_code, current_item_params_json, errors_json,
      started_at, finished_at, cancelled, interrupted
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      label_code = excluded.label_code,
      label_params_json = excluded.label_params_json,
      total = excluded.total,
      done = excluded.done,
      current_item = excluded.current_item,
      current_item_code = excluded.current_item_code,
      current_item_params_json = excluded.current_item_params_json,
      errors_json = excluded.errors_json,
      finished_at = excluded.finished_at,
      cancelled = excluded.cancelled,
      interrupted = excluded.interrupted
  `).run(
    job.id,
    job.label,
    job.label_code ?? null,
    job.label_params ? JSON.stringify(job.label_params) : null,
    job.total,
    job.done,
    job.current_item ?? null,
    job.current_item_code ?? null,
    job.current_item_params ? JSON.stringify(job.current_item_params) : null,
    JSON.stringify(job.errors),
    job.started_at,
    job.finished_at,
    job.cancelled ? 1 : 0,
    job.interrupted ? 1 : 0,
  );
  gc();
}

/**
 * Return durable bulk stock refresh jobs sorted newest first.
 *
 * @returns Persisted top-level stock batch snapshots.
 */
export function listDurableStockBatchJobs(): DownloadJob[] {
  initialize();
  gc();
  const rows = db.prepare(`
    SELECT id, label, label_code, label_params_json, total, done, current_item, current_item_code, current_item_params_json, errors_json,
           started_at, finished_at, cancelled, interrupted
    FROM stock_batch_job
    ORDER BY started_at DESC
    LIMIT ?
  `).all(MAX_DURABLE_JOBS) as StockBatchJobRow[];
  return rows.map(toDownloadJob);
}

/**
 * Merge durable top-level stock refreshes with live tracker rows.
 *
 * @param liveJobs Current process-memory tracker rows.
 * @returns Newest-first status rows with live state preferred over persistence.
 */
export function mergeDurableStockBatchJobs(liveJobs: DownloadJob[]): DownloadJob[] {
  const merged = new Map<string, DownloadJob>();
  for (const job of listDurableStockBatchJobs()) merged.set(job.id, job);
  for (const job of liveJobs) merged.set(job.id, job);
  return Array.from(merged.values()).sort((a, b) => b.started_at - a.started_at);
}
