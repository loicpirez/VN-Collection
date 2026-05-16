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

export type JobKind =
  | 'staff'
  | 'characters'
  | 'producers'
  | 'vndb-pull'
  | 'egs-sync'
  | 'vn-fetch'
  // `cache-refresh` covers the global refresh fan-out, which busts &
  // re-fetches a mix of VNDB AND EGS caches (anticipated, upcoming, stats,
  // tags, traits, ...). Tagging it as `vndb-pull` was misleading on
  // /upcoming?tab=anticipated where the user only sees EGS content.
  | 'cache-refresh';

export interface DownloadJob {
  id: string;
  kind: JobKind;
  vn_id: string | null;
  label: string;
  total: number;
  done: number;
  /**
   * Short identifier of the item currently being fetched, e.g. a staff
   * id `s1234` or a character id `c5678`. Surfaced in the
   * DownloadStatusBar so the user sees exactly what's downloading
   * instead of only "Staff for v123 (3/12)". Cleared when the job
   * finishes.
   */
  current_item?: string | null;
  errors: { item: string; message: string }[];
  started_at: number;
  finished_at: number | null;
}

const jobs = new Map<string, DownloadJob>();
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

export function subscribeStatus(listener: Listener): () => void {
  // Defence against runaway listener counts (e.g. a reverse proxy
  // that drops SSE connections without firing `abort`). Evicts the
  // oldest subscriber rather than refusing — the producer loop
  // running over a stale Set is more expensive than a dropped tab
  // missing one beat.
  if (listeners.size >= MAX_LISTENERS) {
    const oldest = listeners.values().next().value;
    if (oldest) listeners.delete(oldest);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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
      .filter((j) => j.finished_at != null)
      .sort((a, b) => (a.finished_at ?? 0) - (b.finished_at ?? 0));
    while (jobs.size > MAX_LIVE_JOBS && finished.length > 0) {
      const oldest = finished.shift();
      if (oldest) jobs.delete(oldest.id);
    }
  }
}

export function startJob(kind: JobKind, label: string, total: number, vnId: string | null = null): DownloadJob {
  gc();
  const id = `${kind}:${nextSeq++}`;
  const job: DownloadJob = {
    id,
    kind,
    vn_id: vnId,
    label,
    total,
    done: 0,
    current_item: null,
    errors: [],
    started_at: Date.now(),
    finished_at: null,
  };
  jobs.set(id, job);
  emit();
  return job;
}

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
export function setJobCurrent(jobId: string, item: string | null): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.current_item = item;
  emit();
}

export function recordError(jobId: string, item: string, message: string): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.errors.push({ item, message });
  // Surface to server logs so the user can correlate via the UI link.
  console.error(`[download:${j.kind}] ${item}: ${message}`);
  emit();
}

export function finishJob(jobId: string): void {
  const j = jobs.get(jobId);
  if (!j) return;
  j.finished_at = Date.now();
  // If we never ticked but total > 0, mark as complete so the UI doesn't
  // appear stuck on partial progress.
  if (j.done < j.total) j.done = j.total;
  // Clear the in-flight hint — the job is done, nothing is being
  // downloaded right now even if a stale label survived.
  j.current_item = null;
  emit();
}

export function listJobs(): DownloadJob[] {
  return Array.from(jobs.values()).sort((a, b) => b.started_at - a.started_at);
}

export function activeJobs(): DownloadJob[] {
  return listJobs().filter((j) => j.finished_at == null);
}
