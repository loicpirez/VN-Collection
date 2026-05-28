import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { refreshStockForVn, STOCK_PROVIDER_IDS, type StockProviderId } from '@/lib/stock';
import { sanitizeUnknownError } from '@/lib/error-sanitize';
import { cancelJob, finishJob, isJobCancelled, recordError, setJobCurrent, startJob, tickJob } from '@/lib/download-status';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BATCH = 5000;

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

  const job = startJob('stock-batch', `Stock refresh × ${vnIds.length}`, vnIds.length, null);

  void (async () => {
    try {
      for (const vnId of vnIds) {
        if (isJobCancelled(job.id)) break;
        setJobCurrent(job.id, vnId);
        try {
          await refreshStockForVn(vnId, providers);
        } catch (e) {
          const msg = sanitizeUnknownError(e);
          console.error('[stock/batch] refresh failed', { vnId, msg });
          recordError(job.id, vnId, msg);
        }
        tickJob(job.id);
      }
    } finally {
      finishJob(job.id);
    }
  })();

  return NextResponse.json({ jobId: job.id, queued: vnIds.length }, { status: 202 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'missing jobId' }, { status: 400 });
  cancelJob(jobId);
  return NextResponse.json({ cancelled: jobId });
}
