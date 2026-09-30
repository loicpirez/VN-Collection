import 'server-only';
import { randomUUID } from 'node:crypto';
import { acquireBackgroundJobLease, type BackgroundJobLease } from './background-job-lease';
import { downloadFullStaffForVn } from './staff-full';
import { downloadFullCharForVn } from './character-full';
import { downloadFullProducerForVn } from './producer-full';
import { sanitizeUnknownError } from './error-sanitize';
import { bumpStatus } from './download-status';
import {
  FULL_DOWNLOAD_PHASES,
  getFullDownloadQueueStore,
  type FullDownloadPhase,
  type FullDownloadQueueStore,
} from './db/repositories/full-download-queue';
import { registerServerShutdownHandler } from './server-shutdown';

const WORKER_SLOTS = 2;
const LEASE_TTL_MS = 10 * 60 * 1000;
const LEASE_HEARTBEAT_MS = Math.floor(LEASE_TTL_MS / 3);
const POLL_INTERVAL_MS = 30 * 1000;
const WORKER_LOCK_NAME = 'full-download-worker';

/** Dependencies exposed for deterministic queue lifecycle tests. */
export interface FullDownloadWorkerDependencies {
  store?: FullDownloadQueueStore;
  acquireLease?: () => Promise<BackgroundJobLease | null>;
  runPhase?: (phase: FullDownloadPhase, vnId: string) => Promise<void>;
  now?: () => number;
  owner?: () => string;
}

async function runDefaultPhase(phase: FullDownloadPhase, vnId: string): Promise<void> {
  if (phase === 'staff') await downloadFullStaffForVn(vnId, { force: true });
  else if (phase === 'characters') await downloadFullCharForVn(vnId, { force: true });
  else await downloadFullProducerForVn(vnId, { force: true });
}

function startPhaseLeaseHeartbeat(
  lease: BackgroundJobLease,
  store: FullDownloadQueueStore,
  item: Parameters<FullDownloadQueueStore['renew']>[0],
  now: () => number,
): () => Promise<void> {
  let heartbeatFailure: unknown = null;
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    pending = pending
      .then(async () => {
        await lease.renew();
        if (!await store.renew(item, now(), LEASE_TTL_MS)) {
          throw new Error('full-download item lease lost');
        }
      })
      .catch((error: unknown) => {
        heartbeatFailure = error;
      });
  }, LEASE_HEARTBEAT_MS);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await pending;
    if (heartbeatFailure !== null) throw heartbeatFailure;
  };
}

/**
 * Claim and process one durable queue item.
 *
 * @param dependencies Injectable database, lease, clock, and phase runner.
 * @returns `true` when an item was claimed, including partially failed items.
 */
export async function processOneFullDownloadItem(
  dependencies: FullDownloadWorkerDependencies = {},
): Promise<boolean> {
  const store = dependencies.store ?? getFullDownloadQueueStore();
  const now = dependencies.now ?? Date.now;
  const lease = await (dependencies.acquireLease ?? (() => acquireBackgroundJobLease(
    WORKER_LOCK_NAME,
    WORKER_SLOTS,
    LEASE_TTL_MS,
  )))();
  if (!lease) return false;
  const owner = (dependencies.owner ?? randomUUID)();
  try {
    const item = await store.claim(owner, now(), LEASE_TTL_MS);
    if (!item) return false;
    bumpStatus();
    for (let index = item.phaseIndex; index < FULL_DOWNLOAD_PHASES.length; index++) {
      const phase = FULL_DOWNLOAD_PHASES[index];
      await lease.renew();
      if (!await store.renew(item, now(), LEASE_TTL_MS)) throw new Error('full-download item lease lost');
      let failure: string | null = null;
      const stopHeartbeat = startPhaseLeaseHeartbeat(lease, store, item, now);
      try {
        await (dependencies.runPhase ?? runDefaultPhase)(phase, item.vnId);
      } catch (error) {
        failure = sanitizeUnknownError(error);
        console.error(`[full-download:${item.vnId}] ${phase}:`, failure);
      }
      await stopHeartbeat();
      const phaseItem = { ...item, phaseIndex: index };
      if (!await store.finishPhase(phaseItem, phase, failure, now(), LEASE_TTL_MS)) {
        throw new Error('full-download item lease lost');
      }
      bumpStatus();
    }
    if (!await store.finish(item, now())) throw new Error('full-download item lease lost');
    bumpStatus();
    return true;
  } finally {
    await lease.release();
  }
}

let started = false;
let stopping = false;
let running: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

async function drain(): Promise<void> {
  if (running) return running;
  running = (async () => {
    for (;;) {
      const outcomes = await Promise.allSettled([
        processOneFullDownloadItem(),
        processOneFullDownloadItem(),
      ]);
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          console.error('[full-download-worker] queue item failed:', sanitizeUnknownError(outcome.reason));
        }
      }
      if (stopping || !outcomes.some((outcome) => outcome.status === 'fulfilled' && outcome.value)) break;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

/** Wake the process-local coordinator after queue insertion. */
export function wakeFullDownloadWorkers(): void {
  if (!started || stopping) return;
  void drain();
}

/** Start bounded workers and periodic expired-lease recovery. */
export function startFullDownloadWorkers(): void {
  if (started) return;
  started = true;
  stopping = false;
  pollTimer = setInterval(wakeFullDownloadWorkers, POLL_INTERVAL_MS);
  pollTimer.unref();
  registerServerShutdownHandler(() => {
    stopping = true;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  });
  wakeFullDownloadWorkers();
}
