import { readApiError } from './api-error-read';
import {
  decodeAliceNetLoopResult,
  decodeAliceNetStockSyncResult,
  type AliceNetStockSyncResult,
} from './alicenet-client-shape';

/** One step of the AliceNet refresh pipeline, in execution order. */
export type AliceNetRefreshPhase =
  | 'scrape'
  | 'match'
  | 'retry'
  | 'vndb-from-egs'
  | 'download-vndb'
  | 'resolve-egs';

/** Progress for the phase currently running; `total` is per-phase and resets. */
export interface AliceNetRefreshProgress {
  phase: AliceNetRefreshPhase;
  done: number;
  total: number;
}

/** Outcome of a completed pipeline run. */
export interface AliceNetRefreshResult {
  scraped: AliceNetStockSyncResult;
  matched: number;
}

/** Inputs controlling a pipeline run. */
export interface RunAliceNetRefreshOptions {
  errorFallback: string;
  signal?: AbortSignal;
  onProgress?: (progress: AliceNetRefreshProgress) => void;
}

interface MatchPhaseStep {
  phase: Exclude<AliceNetRefreshPhase, 'scrape'>;
  endpoint: string;
  body: Record<string, unknown>;
  batchSize: number;
}

const MATCH_PHASES: readonly MatchPhaseStep[] = [
  { phase: 'match', endpoint: '/api/alicenet/match-next', body: { retry_none: false }, batchSize: 5 },
  { phase: 'retry', endpoint: '/api/alicenet/match-next', body: { retry_none: true }, batchSize: 4 },
  { phase: 'vndb-from-egs', endpoint: '/api/alicenet/match-vndb-from-egs', body: {}, batchSize: 10 },
  { phase: 'download-vndb', endpoint: '/api/alicenet/download-vndb', body: {}, batchSize: 10 },
  { phase: 'resolve-egs', endpoint: '/api/alicenet/resolve-egs', body: {}, batchSize: 10 },
];

async function runMatchPhase(step: MatchPhaseStep, opts: RunAliceNetRefreshOptions): Promise<number> {
  let done = 0;
  let matched = 0;
  const runStartedAt = Date.now();
  while (!opts.signal?.aborted) {
    const r = await fetch(step.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...step.body, batch: step.batchSize, run_started_at: runStartedAt }),
      signal: opts.signal,
    });
    if (!r.ok) throw new Error(await readApiError(r, opts.errorFallback));
    const d = decodeAliceNetLoopResult(await r.json());
    if (!d) throw new Error(opts.errorFallback);
    done += d.processed;
    matched += d.matched ?? 0;
    opts.onProgress?.({ phase: step.phase, done, total: done + d.remaining });
    if (d.processed === 0 || d.remaining === 0) break;
  }
  return matched;
}

/**
 * Run the full AliceNet refresh from any client surface: re-scrape the
 * catalog, then drive each matching loop to exhaustion in the same order
 * and batch sizes the AliceNet admin page uses. Resolves once every phase
 * is drained, or returns early if the signal aborts.
 */
export async function runAliceNetWholeRefresh(opts: RunAliceNetRefreshOptions): Promise<AliceNetRefreshResult> {
  opts.onProgress?.({ phase: 'scrape', done: 0, total: 0 });
  const scrapeResponse = await fetch('/api/alicenet/fetch', { method: 'POST', signal: opts.signal });
  if (!scrapeResponse.ok) throw new Error(await readApiError(scrapeResponse, opts.errorFallback));
  const scraped = decodeAliceNetStockSyncResult(await scrapeResponse.json());
  if (!scraped) throw new Error(opts.errorFallback);
  let matched = 0;
  for (const step of MATCH_PHASES) {
    if (opts.signal?.aborted) break;
    matched += await runMatchPhase(step, opts);
  }
  return { scraped, matched };
}
