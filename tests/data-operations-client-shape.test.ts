import { describe, expect, it } from 'vitest';
import {
  decodeDbRestoreSummary,
  decodeJsonImportSummary,
  decodeMaintenanceDuplicateGroups,
  decodeMaintenanceStaleVns,
} from '@/lib/data-operations-client-shape';

describe('data operations client response adapters', () => {
  it('decodes maintenance groups and canonical stale rows', () => {
    expect(decodeMaintenanceDuplicateGroups({
      groups: [{ prefix: 'fixture', ids: ['V90001', 'EGS_90002'] }],
    })).toEqual([{ prefix: 'fixture', ids: ['v90001', 'egs_90002'] }]);
    expect(decodeMaintenanceStaleVns({
      rows: [{
        id: 'V90001',
        title: 'Fixture',
        fetched_at: 12,
        has_cover: true,
        has_egs: false,
      }],
    })).toEqual([{
      id: 'v90001',
      title: 'Fixture',
      fetched_at: 12,
      has_cover: true,
      has_egs: false,
    }]);
  });

  it('decodes completed import and restore summaries', () => {
    expect(decodeJsonImportSummary({
      ok: true,
      summary: {
        vns_upserted: 1,
        collection_upserted: 2,
        series_created: 3,
        series_links: 4,
        errors: ['skipped row'],
      },
    })).toEqual({
      vns_upserted: 1,
      collection_upserted: 2,
      series_created: 3,
      series_links: 4,
      errors: ['skipped row'],
    });
    expect(decodeDbRestoreSummary({
      ok: true,
      summary: {
        tables: [{ name: 'vn', rows_replaced: 8 }],
        skipped: [{ name: 'cache', reason: 'absent' }],
      },
    })).toEqual({
      tables: [{ name: 'vn', rows_replaced: 8 }],
      skipped: [{ name: 'cache', reason: 'absent' }],
    });
  });

  it('rejects malformed maintenance and operation payloads', () => {
    expect(decodeMaintenanceDuplicateGroups({ groups: [{ prefix: 'x', ids: ['bad'] }] })).toBeNull();
    expect(decodeMaintenanceStaleVns({ rows: [{ id: 'v1' }] })).toBeNull();
    expect(decodeJsonImportSummary({
      ok: true,
      summary: {
        vns_upserted: -1,
        collection_upserted: 0,
        series_created: 0,
        series_links: 0,
        errors: [],
      },
    })).toBeNull();
    expect(decodeDbRestoreSummary({
      ok: true,
      summary: { tables: [{ name: 'vn', rows_replaced: 1.5 }], skipped: [] },
    })).toBeNull();
  });
});
