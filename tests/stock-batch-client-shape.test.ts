import { describe, expect, it } from 'vitest';
import {
  decodeDisabledStockProviders,
  decodeStockBatchQueuePage,
  decodeStockBatchStart,
} from '@/lib/stock-batch-client-shape';

describe('stock batch client response adapters', () => {
  it('decodes provider settings and canonical queue rows', () => {
    expect(decodeDisabledStockProviders({
      stock_disabled_providers: ['sofmap', 'sofmap', 'surugaya'],
    })).toEqual(['sofmap', 'surugaya']);
    expect(decodeStockBatchQueuePage({
      entries: [{ vn_id: 'V90001', title: 'Fixture' }, { vn_id: 'EGS_90002', title: null }],
      next_page: 2,
    })).toEqual({
      entries: [{ vnId: 'v90001', title: 'Fixture' }, { vnId: 'egs_90002' }],
      nextPage: 2,
    });
  });

  it('decodes accepted background jobs', () => {
    expect(decodeStockBatchStart({ jobId: 'stock-batch:1', queued: 4 })).toEqual({
      jobId: 'stock-batch:1',
      queued: 4,
    });
  });

  it('rejects malformed settings, pages, and jobs', () => {
    expect(decodeDisabledStockProviders({ stock_disabled_providers: ['bad'] })).toBeNull();
    expect(decodeStockBatchQueuePage({ entries: [{ vn_id: 'bad', title: null }], next_page: null })).toBeNull();
    expect(decodeStockBatchQueuePage({ entries: [], next_page: 1.5 })).toBeNull();
    expect(decodeStockBatchStart({ jobId: '', queued: 1 })).toBeNull();
    expect(decodeStockBatchStart({ jobId: 'stock-batch:1', queued: -1 })).toBeNull();
  });
});
