/**
 * Coverage for the durable stock-batch store branches the main suite leaves
 * open: the finished-row TTL garbage collection, the no-unfinished-rows
 * early return, the merge ordering, and the text-param validation that
 * discards arrays and non-string/number values.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  listDurableStockBatchJobs,
  markUnfinishedDurableStockBatchJobsInterrupted,
  mergeDurableStockBatchJobs,
  upsertDurableStockBatchJob,
} from '@/lib/stock-batch-store';
import type { DownloadJob } from '@/lib/download-status';

const PREFIX = 'stock-batch:gc:';

function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return {
    id: `${PREFIX}base`,
    kind: 'stock-batch',
    vn_id: null,
    label: 'GC fixture',
    label_code: 'stock_refresh',
    label_params: null,
    total: 4,
    done: 1,
    current_item: null,
    current_item_code: null,
    current_item_params: null,
    errors: [],
    started_at: Date.now(),
    finished_at: null,
    cancelled: false,
    interrupted: false,
    ...overrides,
  };
}

beforeEach(() => {
  db.prepare(`DELETE FROM stock_batch_job WHERE id LIKE ?`).run(`${PREFIX}%`);
});

describe('durable stock batch GC', () => {
  it('drops finished rows older than the one-hour retention window', () => {
    const stale = job({ id: `${PREFIX}stale`, finished_at: Date.now() - 3600 * 1000 - 60_000 });
    upsertDurableStockBatchJob(stale);
    // The upsert runs gc() after writing; the stale finished row is purged.
    const rows = listDurableStockBatchJobs().filter((entry) => entry.id === stale.id);
    expect(rows).toHaveLength(0);
  });

  it('keeps a recently-finished row inside the retention window', () => {
    const fresh = job({ id: `${PREFIX}fresh`, finished_at: Date.now() - 1000 });
    upsertDurableStockBatchJob(fresh);
    const rows = listDurableStockBatchJobs().filter((entry) => entry.id === fresh.id);
    expect(rows).toHaveLength(1);
  });

  it('keeps unfinished rows regardless of age', () => {
    const running = job({ id: `${PREFIX}running`, started_at: Date.now() - 86_400_000, finished_at: null });
    upsertDurableStockBatchJob(running);
    const rows = listDurableStockBatchJobs().filter((entry) => entry.id === running.id);
    expect(rows).toHaveLength(1);
  });
});

describe('markUnfinishedDurableStockBatchJobsInterrupted', () => {
  it('returns 0 when there is nothing unfinished to transition', () => {
    upsertDurableStockBatchJob(job({ id: `${PREFIX}done`, finished_at: Date.now() }));
    expect(markUnfinishedDurableStockBatchJobsInterrupted()).toBe(0);
  });

  it('transitions every unfinished row and appends one interrupted error each', () => {
    upsertDurableStockBatchJob(job({ id: `${PREFIX}r1` }));
    upsertDurableStockBatchJob(job({ id: `${PREFIX}r2` }));
    const count = markUnfinishedDurableStockBatchJobsInterrupted();
    expect(count).toBeGreaterThanOrEqual(2);
    for (const id of [`${PREFIX}r1`, `${PREFIX}r2`]) {
      const row = listDurableStockBatchJobs().find((entry) => entry.id === id);
      expect(row?.interrupted).toBe(true);
      expect(row?.errors).toContainEqual({ item: 'stock-batch', message: 'Interrupted by server restart' });
    }
  });
});

describe('error-list parsing through the durable round-trip', () => {
  it('keeps well-formed error entries and discards malformed array elements', () => {
    const coded = job({ id: `${PREFIX}errs`, finished_at: Date.now() });
    upsertDurableStockBatchJob(coded);
    db.prepare(`UPDATE stock_batch_job SET errors_json = ? WHERE id = ?`).run(
      JSON.stringify([{ item: 'v1', message: 'real' }, 'not-an-object', { item: 'v2' }, null]),
      coded.id,
    );
    const row = listDurableStockBatchJobs().find((entry) => entry.id === coded.id);
    expect(row?.errors).toEqual([{ item: 'v1', message: 'real' }]);
  });

  it('treats invalid error JSON as an empty list', () => {
    const coded = job({ id: `${PREFIX}errs2`, finished_at: Date.now() });
    upsertDurableStockBatchJob(coded);
    db.prepare(`UPDATE stock_batch_job SET errors_json = ? WHERE id = ?`).run('{not json', coded.id);
    expect(listDurableStockBatchJobs().find((entry) => entry.id === coded.id)?.errors).toEqual([]);
  });
});

describe('mergeDurableStockBatchJobs', () => {
  it('returns durable-only rows sorted newest-first', () => {
    const base = Date.now();
    // Unfinished rows survive gc regardless of age; started_at drives ordering.
    upsertDurableStockBatchJob(job({ id: `${PREFIX}older`, started_at: base - 5000, finished_at: null }));
    upsertDurableStockBatchJob(job({ id: `${PREFIX}newer`, started_at: base, finished_at: null }));
    const merged = mergeDurableStockBatchJobs([]).filter((entry) => entry.id.startsWith(PREFIX));
    const idx = (id: string) => merged.findIndex((entry) => entry.id === id);
    expect(idx(`${PREFIX}newer`)).toBeGreaterThanOrEqual(0);
    expect(idx(`${PREFIX}newer`)).toBeLessThan(idx(`${PREFIX}older`));
  });

  it('adds a live-only job that has no durable counterpart', () => {
    const live = job({ id: `${PREFIX}live-only`, done: 2 });
    const merged = mergeDurableStockBatchJobs([live]);
    expect(merged.find((entry) => entry.id === live.id)).toMatchObject({ done: 2 });
  });
});

describe('text-param validation through the durable round-trip', () => {
  it('keeps string and number params and discards array / nested-object payloads', () => {
    const coded = job({
      id: `${PREFIX}params`,
      label_code: 'stock_refresh',
      label_params: { count: 4, scope: 'collection' },
    });
    upsertDurableStockBatchJob(coded);
    expect(listDurableStockBatchJobs().find((entry) => entry.id === coded.id)?.label_params).toEqual({
      count: 4,
      scope: 'collection',
    });

    // A persisted array is not a valid JobTextParams object → discarded.
    db.prepare(`UPDATE stock_batch_job SET label_params_json = ? WHERE id = ?`).run('[1,2,3]', coded.id);
    expect(listDurableStockBatchJobs().find((entry) => entry.id === coded.id)?.label_params).toBeNull();

    // A param whose value is a nested object is rejected wholesale.
    db.prepare(`UPDATE stock_batch_job SET label_params_json = ? WHERE id = ?`).run('{"a":{"b":1}}', coded.id);
    expect(listDurableStockBatchJobs().find((entry) => entry.id === coded.id)?.label_params).toBeNull();

    // Invalid JSON is treated as absent.
    db.prepare(`UPDATE stock_batch_job SET label_params_json = ? WHERE id = ?`).run('{not json', coded.id);
    expect(listDurableStockBatchJobs().find((entry) => entry.id === coded.id)?.label_params).toBeNull();
  });
});
