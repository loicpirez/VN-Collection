import 'server-only';
import { listJobs } from './download-status';
import { enrichJobs } from './download-status-names';
import type { DownloadStatusSnapshot } from './download-status-snapshot';
import { mergeDurableStockBatchJobs } from './stock-batch-store';
import { getVndbThrottleStats } from './vndb-throttle';

let pendingSnapshot: Promise<DownloadStatusSnapshot> | null = null;

async function loadSnapshot(): Promise<DownloadStatusSnapshot> {
  const liveJobs = listJobs();
  let jobs = liveJobs;
  try {
    jobs = await mergeDurableStockBatchJobs(liveJobs);
  } catch (error) {
    console.error('[download-status] durable stock jobs unavailable', error);
  }
  return {
    throttle: getVndbThrottleStats(),
    jobs: await enrichJobs(jobs),
  };
}

/**
 * Build one process-shared download snapshot for concurrent status consumers.
 *
 * @returns The current enriched job and throttle state.
 */
export function buildDownloadStatusSnapshot(): Promise<DownloadStatusSnapshot> {
  if (pendingSnapshot) return pendingSnapshot;
  pendingSnapshot = loadSnapshot().finally(() => {
    pendingSnapshot = null;
  });
  return pendingSnapshot;
}
