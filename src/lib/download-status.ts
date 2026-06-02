import 'server-only';

/**
 * In-memory progress tracker for the fan-out and sync operations. Replaces
 * the previous `.catch(() => {})` "silent failure" pattern: every job that
 * starts is registered here, its progress (`done/total`) is updated as it
 * runs, and errors land on the job's `errors[]` list instead of vanishing.
 *
 * The home page strip + the /data sync sections poll `/api/download-status`
 * to render a live progress indicator so the user can see what's actually
 * downloading and notice when something goes wrong.
 */

/**
 * Discriminator for the kind of background fan-out job.
 * Surfaced in `DownloadStatusBar` to group and label progress entries.
 */
export type JobKind =
  | 'staff'
  | 'characters'
  | 'producers'
  | 'vndb-pull'
  | 'egs-sync'
  | 'vn-fetch'
  | 'cache-refresh'
  | 'stock-batch';

export type JobLabelCode =
  | 'staff_for_vn'
  | 'characters_for_vn'
  | 'developers_for_vn'
  | 'tags_for_vn'
  | 'traits_for_vn'
  | 'relations_for_vn'
  | 'tag_graph_for_vn'
  | 'character_instances_for_vn'
  | 'producer_relations_for_vn'
  | 'screenshot_releases_for_vn'
  | 'releases_for_vn'
  | 'egs_updates'
  | 'global_refresh'
  | 'pull_statuses_for_account'
  | 'stock_refresh'
  | 'stock_providers_for_vn';

export type JobCurrentItemCode =
  | 'vndb_label'
  | 'refresh_cache_rows'
  | 'refresh_release_metadata_cache'
  | 'refresh_egs_anticipated'
  | 'refresh_egs_top_ranked'
  | 'refresh_vndb_top_ranked'
  | 'refresh_vndb_stats'
  | 'refresh_vndb_schema'
  | 'refresh_vndb_authinfo'
  | 'refresh_upcoming_collection'
  | 'refresh_upcoming_all'
  | 'refresh_tags_default'
  | 'refresh_traits_default'
  | 'refresh_release_metadata_collection';

export type JobTextParams = Record<string, string | number>;

export interface JobLabelSpec {
  code: JobLabelCode;
  fallback: string;
  params?: JobTextParams;
}

export interface JobCurrentItemSpec {
  code: JobCurrentItemCode;
  fallback: string;
  params?: JobTextParams;
}

export interface DownloadJob {
  id: string;
  kind: JobKind;
  vn_id: string | null;
  label: string;
  label_code?: JobLabelCode | null;
  label_params?: JobTextParams | null;
  total: number;
  done: number;
  /**
   * Short identifier of the item currently being fetched, e.g. a staff
   * id `sNNNN` or a character id `cNNNN`. Surfaced in the
   * DownloadStatusBar so the user sees exactly what's downloading
   * instead of only "Staff for vNNN (3/12)". Cleared when the job
   * finishes.
   */
  current_item?: string | null;
  current_item_code?: JobCurrentItemCode | null;
  current_item_params?: JobTextParams | null;
  errors: { item: string; message: string }[];
  started_at: number;
  finished_at: number | null;
  cancelled?: boolean;
  interrupted?: boolean;
}

const JOB_LABEL_CODES: ReadonlySet<string> = new Set<JobLabelCode>([
  'staff_for_vn',
  'characters_for_vn',
  'developers_for_vn',
  'tags_for_vn',
  'traits_for_vn',
  'relations_for_vn',
  'tag_graph_for_vn',
  'character_instances_for_vn',
  'producer_relations_for_vn',
  'screenshot_releases_for_vn',
  'releases_for_vn',
  'egs_updates',
  'global_refresh',
  'pull_statuses_for_account',
  'stock_refresh',
  'stock_providers_for_vn',
]);

const JOB_CURRENT_ITEM_CODES: ReadonlySet<string> = new Set<JobCurrentItemCode>([
  'vndb_label',
  'refresh_cache_rows',
  'refresh_release_metadata_cache',
  'refresh_egs_anticipated',
  'refresh_egs_top_ranked',
  'refresh_vndb_top_ranked',
  'refresh_vndb_stats',
  'refresh_vndb_schema',
  'refresh_vndb_authinfo',
  'refresh_upcoming_collection',
  'refresh_upcoming_all',
  'refresh_tags_default',
  'refresh_traits_default',
  'refresh_release_metadata_collection',
]);

/** Return whether a persisted label code belongs to the supported job-label contract. */
export function isJobLabelCode(value: string): value is JobLabelCode {
  return JOB_LABEL_CODES.has(value);
}

/** Return whether a persisted current-item code belongs to the supported job-item contract. */
export function isJobCurrentItemCode(value: string): value is JobCurrentItemCode {
  return JOB_CURRENT_ITEM_CODES.has(value);
}

/** Build a locale-independent job-label spec with a legacy fallback. */
export function jobLabel(code: JobLabelCode, fallback: string, params?: JobTextParams): JobLabelSpec {
  return { code, fallback, params };
}

/** Build a locale-independent current-item spec with a legacy fallback. */
export function jobCurrentItem(code: JobCurrentItemCode, fallback: string, params?: JobTextParams): JobCurrentItemSpec {
  return { code, fallback, params };
}

const jobs = new Map<string, DownloadJob>();
const cancelledJobs = new Set<string>();
let nextSeq = 1;
const MAX_LIVE_JOBS = 200;

/**
 * Minimal in-process pub/sub for SSE consumers. Every mutating call
 * (startJob / tickJob / recordError / finishJob) emits a beat so the
 * `/api/download-status/stream` route can push a fresh snapshot to
 * connected clients without resorting to interval polling.
 *
 * `bumpStatus` is also exported so callers outside the lifecycle —
 * e.g. the throttler when it transitions in/out of cooldown — can
 * nudge subscribers.
 */
type Listener = () => void;
const listeners = new Set<Listener>();
// Sanity cap. Each SSE client adds one listener; we should never see
// hundreds simultaneously. If we do, something leaked — drop the
// oldest so the producer loop stays bounded.
const MAX_LISTENERS = 100;

// Coalesce bursts of mutations (e.g. hundreds of tickJob calls during
// a bulk fan-out) into one notification per microtask, so SSE
// subscribers don't serialize the whole jobs list on every increment.
let pendingFlush = false;
function emit(): void {
  if (pendingFlush) return;
  pendingFlush = true;
  queueMicrotask(() => {
    pendingFlush = false;
    for (const l of listeners) {
      try {
        l();
      } catch {
        // Listener throws shouldn't break the producer.
      }
    }
  });
}

/**
 * Register a listener that fires whenever any job changes state (start / tick /
 * error / finish). Notifications are coalesced per microtask so bulk updates
 * (e.g. hundreds of `tickJob` calls during a fan-out) produce a single callback.
 *
 * @param listener Zero-argument callback invoked on each state change beat.
 * @returns A teardown function — call it to unsubscribe (e.g. on SSE disconnect).
 */
export function subscribeStatus(listener: Listener): () => void {
  // Defence against runaway listener counts (e.g. a reverse proxy
  // that drops SSE connections without firing `abort`). Evicts the
  // oldest subscriber rather than refusing — the producer loop
  // running over a stale Set is more expensive than a dropped tab
  // missing one beat.
  if (listeners.size >= MAX_LISTENERS) {
    listeners.delete(listeners.values().next().value!);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Manually trigger a status notification outside the normal job lifecycle —
 * e.g. when the VNDB throttler transitions in or out of cooldown.
 */
export function bumpStatus(): void {
  emit();
}

function gc(): void {
  // Trim finished jobs older than 1h to keep the list bounded for the UI.
  const cutoff = Date.now() - 3600 * 1000;
  for (const [id, j] of jobs) {
    if (j.finished_at != null && j.finished_at < cutoff) jobs.delete(id);
  }
  if (jobs.size > MAX_LIVE_JOBS) {
    // Oldest finished first.
    const finished = Array.from(jobs.values())
      .filter((j): j is DownloadJob & { finished_at: number } => j.finished_at != null)
      .sort((a, b) => a.finished_at - b.finished_at);
    while (jobs.size > MAX_LIVE_JOBS && finished.length > 0) {
      jobs.delete(finished.shift()!.id);
    }
  }
}

/**
 * Register a new fan-out job and return its handle.
 *
 * @param kind   Job category displayed in `DownloadStatusBar`.
 * @param label  Human-readable description, e.g. `"Staff for v90017"`.
 * @param total  Expected number of work items (used to drive the progress bar).
 * @param vnId   Optional VN id to associate with the job for per-VN filtering.
 * @returns The newly created `DownloadJob` — pass `job.id` to `tickJob` / `finishJob`.
 */
export function startJob(kind: JobKind, label: string | JobLabelSpec, total: number, vnId: string | null = null): DownloadJob {
  gc();
  const id = `${kind}:${Date.now()}:${nextSeq++}`;
  const job: DownloadJob = {
    id,
    kind,
    vn_id: vnId,
    label: typeof label === 'string' ? label : label.fallback,
    label_code: typeof label === 'string' ? null : label.code,
    label_params: typeof label === 'string' ? null : (label.params ?? null),
    total,
    done: 0,
    current_item: null,
    errors: [],
    started_at: Date.now(),
    finished_at: null,
    cancelled: false,
    interrupted: false,
  };
  jobs.set(id, job);
  emit();
  return job;
}

/**
 * Increment the `done` counter for a job, capped at `total`.
 *
 * @param jobId The job identifier returned by `startJob`.
 * @param by    Increment amount (default `1`).
 */
export function tickJob(jobId: string, by = 1): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.done = Math.min(j.total, j.done + by);
  emit();
}

/**
 * Update the "what's downloading right now" hint for a job. Called by
 * each fan-out helper at the start of its per-item iteration so the
 * status bar can surface the specific staff / character / producer id
 * (or human label) currently in flight, not just the per-VN summary.
 * Pass `null` to clear the hint without finishing the job.
 */
export function setJobCurrent(jobId: string, item: string | JobCurrentItemSpec | null): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.current_item = typeof item === 'string' || item == null ? item : item.fallback;
  j.current_item_code = typeof item === 'object' && item != null ? item.code : null;
  j.current_item_params = typeof item === 'object' && item != null ? (item.params ?? null) : null;
  emit();
}

/**
 * Append an error entry to a job's `errors` list and emit a status beat.
 * The error is also written to `console.error` so it appears in server logs
 * alongside the job kind and item identifier.
 *
 * @param jobId   The job identifier returned by `startJob`.
 * @param item    Short identifier for the failing item (e.g. a staff id or character id).
 * @param message Human-readable error description (typically `(e as Error).message`).
 */
export function recordError(jobId: string, item: string, message: string): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.errors.push({ item, message });
  // Surface to server logs so the user can correlate via the UI link.
  console.error(`[download:${j.kind}] ${item}: ${message}`);
  emit();
}

/**
 * Finalize a job: sets `finished_at`, clears `current_item`, and optionally
 * advances `done` to `total` if some ticks were skipped.
 *
 * @param jobId The job identifier returned by `startJob`.
 * @param options Set `complete` to `false` for cancelled or interrupted work.
 */
export function finishJob(jobId: string, options: { complete?: boolean } = {}): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.finished_at = Date.now();
  if (options.complete !== false && j.done < j.total) j.done = j.total;
  j.current_item = null;
  j.current_item_code = null;
  j.current_item_params = null;
  cancelledJobs.delete(jobId);
  emit();
}

export function cancelJob(jobId: string): void {
  cancelledJobs.add(jobId);
  const j = jobs.get(jobId);
  if (j) {
    j.finished_at = Date.now();
    j.current_item = null;
    j.current_item_code = null;
    j.current_item_params = null;
    j.cancelled = true;
    emit();
  }
}

export function isJobCancelled(jobId: string): boolean {
  return cancelledJobs.has(jobId);
}

/**
 * Return all tracked jobs sorted newest-first. Called by
 * `GET /api/download-status` (polling) and `GET /api/download-status/stream` (SSE)
 * to build the snapshot sent to clients.
 *
 * @returns Array of `DownloadJob` records, most-recently-started first.
 */
export function listJobs(): DownloadJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.started_at - a.started_at);
}

/**
 * Return one tracked job by id.
 *
 * @param jobId Identifier returned by `startJob`.
 * @returns The current in-memory snapshot or `null` when it no longer exists.
 */
export function getJob(jobId: string): DownloadJob | null {
  return jobs.get(jobId) ?? null;
}
