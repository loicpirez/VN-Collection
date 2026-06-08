import { NextRequest, NextResponse } from 'next/server';
import { requireLocalhostOrToken } from '@/lib/auth-gate';
import { readJsonObject } from '@/lib/api-body';
import { sanitizeUnknownError } from '@/lib/error-sanitize';
import { cancelJob, finishJob, isJobCancelled, jobLabel, recordError, setJobTotal, startJob, tickJob, type JobLabelCode } from '@/lib/download-status';
import { matchNextAliceNetItems, matchVndbFromEgsForAliceNet, refreshAliceNetStock, searchEgsForAliceNetNoVndb } from '@/lib/alicenet';
import { setAppSetting } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type AliceNetOp = 'download' | 'pipeline' | 'match-vndb' | 'match-egs';

const OP_LABEL: Record<AliceNetOp, { code: JobLabelCode; fallback: string }> = {
  download: { code: 'alicenet_download', fallback: 'AliceNet stock download' },
  pipeline: { code: 'alicenet_pipeline', fallback: 'AliceNet download and match' },
  'match-vndb': { code: 'alicenet_match_vndb', fallback: 'AliceNet VNDB match' },
  'match-egs': { code: 'alicenet_match_egs', fallback: 'AliceNet EGS match' },
};

interface PhaseResult {
  processed: number;
  remaining: number;
}

interface Phase {
  run: (runStartedAt: number) => Promise<PhaseResult>;
}

const scrapePhase: Phase = {
  run: async () => {
    const result = await refreshAliceNetStock();
    setAppSetting('alicenet_last_fetch', String(result.fetched_at));
    return { processed: result.count, remaining: 0 };
  },
};

function matchNextPhase(retryNone: boolean): Phase {
  return { run: (runStartedAt) => matchNextAliceNetItems(5, retryNone, runStartedAt) };
}

const vndbFromEgsPhase: Phase = { run: (runStartedAt) => matchVndbFromEgsForAliceNet(10, runStartedAt) };
const searchEgsPhase: Phase = { run: (runStartedAt) => searchEgsForAliceNetNoVndb(10, false, runStartedAt) };

function phasesForOp(op: AliceNetOp): Phase[] {
  switch (op) {
    case 'download':
      return [scrapePhase];
    case 'pipeline':
      return [scrapePhase, matchNextPhase(false), matchNextPhase(true), vndbFromEgsPhase, searchEgsPhase];
    case 'match-vndb':
      return [matchNextPhase(false), matchNextPhase(true), vndbFromEgsPhase];
    case 'match-egs':
      return [searchEgsPhase];
  }
}

function parseOp(value: unknown): AliceNetOp | null {
  if (value === 'download' || value === 'pipeline' || value === 'match-vndb' || value === 'match-egs') return value;
  return null;
}

const MAX_ACTIVE_JOBS = 1;
const activeJobs = new Set<string>();

/**
 * Start an AliceNet operation as a detached server-side download-status job so
 * progress survives a browser refresh and surfaces in the global Downloads bar.
 * Each phase runs in its own try/catch; one failing phase records an error and
 * the run continues to the next phase. Cancellation is checked between phases
 * and between batches via the shared download-status registry.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const body = await readJsonObject(req);
  const op = parseOp(body.op);
  if (!op) return NextResponse.json({ error: 'op must be one of download, pipeline, match-vndb, match-egs' }, { status: 400 });
  if (activeJobs.size >= MAX_ACTIVE_JOBS) {
    return NextResponse.json({ error: 'an AliceNet operation is already running', code: 'queue_full' }, { status: 429 });
  }
  const phases = phasesForOp(op);
  const labelSpec = OP_LABEL[op];
  const job = startJob('alicenet', jobLabel(labelSpec.code, labelSpec.fallback), 0, null);
  activeJobs.add(job.id);

  void (async () => {
    const runStartedAt = Date.now();
    let total = 0;
    try {
      for (const phase of phases) {
        if (isJobCancelled(job.id)) break;
        try {
          let counted = false;
          for (;;) {
            if (isJobCancelled(job.id)) break;
            const result = await phase.run(runStartedAt);
            if (!counted) {
              total += result.processed + result.remaining;
              setJobTotal(job.id, total);
              counted = true;
            }
            tickJob(job.id, result.processed);
            if (result.processed === 0 || result.remaining === 0) break;
          }
        } catch (e) {
          if (!isJobCancelled(job.id)) recordError(job.id, labelSpec.fallback, sanitizeUnknownError(e));
        }
      }
    } finally {
      activeJobs.delete(job.id);
      finishJob(job.id, { complete: !isJobCancelled(job.id) });
    }
  })();

  return NextResponse.json({ jobId: job.id, op }, { status: 202 });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const denied = requireLocalhostOrToken(req);
  if (denied) return denied;
  const jobId = req.nextUrl.searchParams.get('jobId');
  if (!jobId) return NextResponse.json({ error: 'missing jobId' }, { status: 400 });
  cancelJob(jobId);
  return NextResponse.json({ cancelled: jobId });
}
