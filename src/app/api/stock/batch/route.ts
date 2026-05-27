import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { refreshStockForVn, STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock';
import { sanitizeUnknownError } from '@/lib/error-sanitize';
import { finishJob, recordError, setJobCurrent, startJob, tickJob } from '@/lib/download-status';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BATCH = 100;

function parseVnIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && /^(v\d+|egs_\d+)$/i.test(v)).slice(0, MAX_BATCH);
}

function parseProviders(value: unknown): StockProviderId[] {
  if (!Array.isArray(value)) return [...STOCK_PROVIDER_IDS];
  const allowed = new Set<string>(STOCK_PROVIDER_IDS);
  const providers = value.filter((item): item is StockProviderId => typeof item === 'string' && allowed.has(item));
  return providers.length > 0 ? providers : [...STOCK_PROVIDER_IDS];
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const vnIds = parseVnIds(body.vnIds);
  if (vnIds.length === 0) return NextResponse.json({ error: 'no valid vnIds' }, { status: 400 });
  const providers = parseProviders(body.providers);

  // User feedback: "Download state handle of stock price should also be
  // in global download state as now if I refresh the page it's gone".
  // Register the batch with the same `download-status` infra the rest
  // of the fan-out jobs use. DownloadStatusBar polls /api/download-status
  // (and subscribes via SSE), so the progress bar will repopulate after
  // a refresh as long as the job hasn't finished. Per-VN errors land
  // on `errors[]`, the current item label is the VN id (DownloadStatusBar
  // resolves it to a title via `download-status-names.ts`).
  const job = startJob('stock-batch', `Stock refresh × ${vnIds.length}`, vnIds.length, null);
  const results: Array<{ vnId: string; ok: boolean; offerCount?: number; error?: string }> = [];
  try {
    for (const vnId of vnIds) {
      if (req.signal?.aborted) break;
      setJobCurrent(job.id, vnId);
      try {
        const snapshot = await refreshStockForVn(vnId, providers, req.signal);
        results.push({ vnId, ok: true, offerCount: snapshot.summary.total });
      } catch (e) {
        const msg = sanitizeUnknownError(e);
        console.error('[stock/batch] refresh failed', { vnId, msg });
        recordError(job.id, vnId, msg);
        results.push({ vnId, ok: false, error: msg });
      }
      tickJob(job.id);
    }
  } finally {
    finishJob(job.id);
  }

  return NextResponse.json({ queued: vnIds.length, results, jobId: job.id });
}
