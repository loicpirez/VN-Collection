import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(process.cwd(), 'src/app/api/stock/batch/route.ts'), 'utf8');

describe('stock batch queue bounds and cancellation', () => {
  it('caps active background batch jobs with an explicit rejection', () => {
    expect(source).toContain('const MAX_ACTIVE_BATCH_JOBS = 2');
    expect(source).toContain('const activeBatchJobs = new Map<string, AbortController>()');
    expect(source).toContain('activeBatchJobs.size >= MAX_ACTIVE_BATCH_JOBS');
    expect(source).toContain("{ error: 'stock batch queue is full', code: 'queue_full' }");
    expect(source).toContain('{ status: 429 }');
  });

  it('propagates cancellation into the active per-VN provider refresh', () => {
    expect(source).toContain('const controller = new AbortController()');
    expect(source).toContain('activeBatchJobs.set(job.id, controller)');
    expect(source).toContain('refreshStockForVn(vnId, providers, controller.signal');
    expect(source).toContain('activeBatchJobs.get(jobId)?.abort()');
  });

  it('processes VNs in bounded concurrent waves', () => {
    expect(source).toContain('const STOCK_BATCH_VN_CONCURRENCY = 2');
    expect(source).toContain('const chunk = vnIds.slice(start, start + STOCK_BATCH_VN_CONCURRENCY)');
    expect(source).toContain('await Promise.all(chunk.map(async (vnId) => {');
  });

  it('persists the top-level job across progress, cancellation, and finish paths', () => {
    expect(source).toContain('upsertDurableStockBatchJob');
    expect(source).toContain('persistJob(job.id)');
    expect(source).toContain('persistJob(jobId)');
    expect(source).toContain("finishJob(job.id, { complete: !isJobCancelled(job.id) && !controller.signal.aborted })");
  });

  it('releases queue capacity when the background batch finishes', () => {
    expect(source).toContain('activeBatchJobs.delete(job.id)');
  });
});
