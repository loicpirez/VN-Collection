import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  listDurableStockBatchJobs,
  markUnfinishedDurableStockBatchJobsInterrupted,
  mergeDurableStockBatchJobs,
  upsertDurableStockBatchJob,
} from '@/lib/stock-batch-store';
import type { DownloadJob } from '@/lib/download-status';

const PREFIX = 'stock-batch:test:';

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: `${PREFIX}base`,
    kind: 'stock-batch',
    vn_id: null,
    label: 'Durable stock fixture',
    total: 4,
    done: 1,
    current_item: 'v90001',
    errors: [],
    started_at: Date.now(),
    finished_at: null,
    cancelled: false,
    interrupted: false,
    ...overrides,
  };
}

describe('durable stock batch store', () => {
  beforeEach(() => {
    db.prepare(`DELETE FROM stock_batch_job WHERE id LIKE ?`).run(`${PREFIX}%`);
  });

  it('stores and restores a top-level progress snapshot', () => {
    const input = job({ id: `${PREFIX}stored`, errors: [{ item: 'v90002', message: 'fixture error' }] });
    upsertDurableStockBatchJob(input);
    const restored = listDurableStockBatchJobs().find((entry) => entry.id === input.id);
    expect(restored).toMatchObject({
      id: input.id,
      kind: 'stock-batch',
      vn_id: null,
      total: 4,
      done: 1,
      current_item: 'v90001',
      errors: [{ item: 'v90002', message: 'fixture error' }],
      cancelled: false,
      interrupted: false,
    });
  });

  it('marks unfinished rows as interrupted without fabricating completion', () => {
    const input = job({ id: `${PREFIX}interrupted`, done: 2 });
    upsertDurableStockBatchJob(input);
    expect(markUnfinishedDurableStockBatchJobsInterrupted()).toBe(1);
    const restored = listDurableStockBatchJobs().find((entry) => entry.id === input.id);
    expect(restored?.done).toBe(2);
    expect(restored?.finished_at).not.toBeNull();
    expect(restored?.interrupted).toBe(true);
    expect(restored?.errors).toContainEqual({
      item: 'stock-batch',
      message: 'Interrupted by server restart',
    });
  });

  it('prefers the live snapshot when a durable row has the same id', () => {
    const stored = job({ id: `${PREFIX}merged`, done: 1 });
    upsertDurableStockBatchJob(stored);
    const live = job({ id: stored.id, done: 3, current_item: 'v90003' });
    const merged = mergeDurableStockBatchJobs([live]);
    expect(merged.find((entry) => entry.id === stored.id)).toMatchObject({
      done: 3,
      current_item: 'v90003',
    });
  });

  it('treats malformed persisted errors as an empty list', () => {
    const input = job({ id: `${PREFIX}malformed`, finished_at: Date.now() });
    upsertDurableStockBatchJob(input);
    db.prepare(`UPDATE stock_batch_job SET errors_json = ? WHERE id = ?`).run('{"bad":true}', input.id);
    const restored = listDurableStockBatchJobs().find((entry) => entry.id === input.id);
    expect(restored?.errors).toEqual([]);
  });
});
