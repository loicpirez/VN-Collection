import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { refreshStockForVn, STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock';
import { sanitizeUnknownError } from '@/lib/error-sanitize';
import { cancelJob, finishJob, getJob, isJobCancelled, jobLabel, recordError, setJobCurrent, startJob, tickJob } from '@/lib/download-status';
import { upsertDurableStockBatchJob } from '@/lib/stock-batch-store';
import { isValidVnId, normalizeVnId } from '@/lib/vn-id-shape';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BATCH = 5000;
const MAX_ACTIVE_BATCH_JOBS = 2;
const STOCK_BATCH_VN_CONCURRENCY = 2;
const activeBatchJobs = new Map<string, AbortController>();

interface VnIdsParse {
  vnIds: string[];
  error: string | null;
}

function parseVnIds(value: unknown): VnIdsParse {
  if (!Array.isArray(value)) return { vnIds: [], error: 'vnIds must be an array' };
  if (value.length > MAX_BATCH) return { vnIds: [], error: `vnIds exceeds limit of ${MAX_BATCH}` };
  if (value.some((v) => typeof v !== 'string' || !isValidVnId(v))) {
    return { vnIds: [], error: 'vnIds must contain only VN ids' };
  }
  return { vnIds: Array.from(new Set((value as string[]).map(normalizeVnId))), error: null };
}

interface ProviderParse {
  providers: StockProviderId[];
  unknown: string[];
}

function parseProviders(value: unknown): ProviderParse {
  if (!Array.isArray(value)) return { providers: [...STOCK_PROVIDER_IDS], unknown: [] };
  const allowed = new Set<string>(STOCK_PROVIDER_IDS);
  const providers: StockProviderId[] = [];
  const unknown: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      unknown.push('non-string');
      continue;
    }
    if (allowed.has(item) && !providers.includes(item as StockProviderId)) providers.push(item as StockProviderId);
    else unknown.push(item.slice(0, 80));
  }
  return { providers, unknown };
}

function persistJob(jobId: string): void {
  const job = getJob(jobId);
  if (job) upsertDurableStockBatchJob(job);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const parsedVnIds = parseVnIds(body.vnIds);
  if (parsedVnIds.error) return NextResponse.json({ error: parsedVnIds.error }, { status: 400 });
  const vnIds = parsedVnIds.vnIds;
  if (vnIds.length === 0) return NextResponse.json({ error: 'no valid vnIds' }, { status: 400 });
  const parsed = parseProviders(body.providers);
  if (Array.isArray(body.providers) && parsed.unknown.length > 0) {
    return NextResponse.json(
      { error: 'invalid providers', code: 'invalid_providers', invalid: parsed.unknown },
      { status: 400 },
    );
  }
  const providers = parsed.providers.length > 0 ? parsed.providers : [...STOCK_PROVIDER_IDS];
  if (activeBatchJobs.size >= MAX_ACTIVE_BATCH_JOBS) {
    return NextResponse.json(
      { error: 'stock batch queue is full', code: 'queue_full' },
      { status: 429 },
    );
  }

  const job = startJob('stock-batch', jobLabel('stock_refresh', `Stock refresh × ${vnIds.length}`, { count: vnIds.length }), vnIds.length, null);
  const controller = new AbortController();
  activeBatchJobs.set(job.id, controller);
  persistJob(job.id);

  void (async () => {
    try {
      for (let start = 0; start < vnIds.length; start += STOCK_BATCH_VN_CONCURRENCY) {
        if (isJobCancelled(job.id) || controller.signal.aborted) break;
        const chunk = vnIds.slice(start, start + STOCK_BATCH_VN_CONCURRENCY);
        await Promise.all(chunk.map(async (vnId) => {
          if (isJobCancelled(job.id) || controller.signal.aborted) return;
          setJobCurrent(job.id, vnId);
          persistJob(job.id);
          const providerJob = startJob('stock-batch', jobLabel('stock_providers_for_vn', `Providers - ${vnId}`, { vnId }), providers.length, vnId);
          try {
            await refreshStockForVn(vnId, providers, controller.signal, (provider, _done, _total) => {
              setJobCurrent(providerJob.id, provider);
              tickJob(providerJob.id);
            });
          } catch (e) {
            if (!isJobCancelled(job.id) && !controller.signal.aborted) {
              const msg = sanitizeUnknownError(e);
              console.error('[stock/batch] refresh failed', { vnId, msg });
              recordError(job.id, vnId, msg);
              persistJob(job.id);
            }
          } finally {
            finishJob(providerJob.id, { complete: !controller.signal.aborted });
          }
          if (!isJobCancelled(job.id) && !controller.signal.aborted) {
            tickJob(job.id);
            persistJob(job.id);
          }
        }));
      }
    } finally {
      activeBatchJobs.delete(job.id);
      finishJob(job.id, { complete: !isJobCancelled(job.id) && !controller.signal.aborted });
      persistJob(job.id);
    }
  })();

  return NextResponse.json({ jobId: job.id, queued: vnIds.length }, { status: 202 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'missing jobId' }, { status: 400 });
  activeBatchJobs.get(jobId)?.abort();
  cancelJob(jobId);
  persistJob(jobId);
  return NextResponse.json({ cancelled: jobId });
}
