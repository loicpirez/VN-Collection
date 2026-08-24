import { describe, expect, it } from 'vitest';
import {
  POSTGRES_JSON_COLUMNS,
  POSTGRES_JSON_TEXT_POLICY,
  POSTGRES_TABLE_ORDER,
  quotePostgresIdentifier,
} from '@/lib/db/postgres-migration-manifest';

describe('PostgreSQL migration manifest', () => {
  it('contains each application table once and keeps parent tables before children', () => {
    expect(new Set(POSTGRES_TABLE_ORDER).size).toBe(POSTGRES_TABLE_ORDER.length);
    expect(POSTGRES_TABLE_ORDER.length).toBe(53);
    expect(POSTGRES_TABLE_ORDER.indexOf('vn')).toBeLessThan(POSTGRES_TABLE_ORDER.indexOf('collection'));
    expect(POSTGRES_TABLE_ORDER.indexOf('series')).toBeLessThan(POSTGRES_TABLE_ORDER.indexOf('series_vn'));
    expect(POSTGRES_TABLE_ORDER.indexOf('shelf_unit')).toBeLessThan(POSTGRES_TABLE_ORDER.indexOf('shelf_slot'));
    expect(POSTGRES_TABLE_ORDER.indexOf('owned_release')).toBeLessThan(POSTGRES_TABLE_ORDER.indexOf('physical_bundle'));
    expect(POSTGRES_TABLE_ORDER.indexOf('physical_bundle')).toBeLessThan(POSTGRES_TABLE_ORDER.indexOf('physical_bundle_member'));
    expect(POSTGRES_TABLE_ORDER.indexOf('place_registry')).toBeLessThan(POSTGRES_TABLE_ORDER.indexOf('place_provider_link'));
  });

  it('quotes safe identifiers and rejects non-manifest-shaped input', () => {
    expect(quotePostgresIdentifier('vn_stock_offer')).toBe('"vn_stock_offer"');
    expect(() => quotePostgresIdentifier('vn; DROP TABLE vn')).toThrow('Unsafe SQL identifier');
    expect(() => quotePostgresIdentifier('Uppercase')).toThrow('Unsafe SQL identifier');
  });

  it('keeps JSON validation columns attached to manifest tables and safe identifiers', () => {
    for (const [table, columns] of Object.entries(POSTGRES_JSON_COLUMNS)) {
      expect(POSTGRES_TABLE_ORDER).toContain(table);
      for (const column of columns ?? []) expect(quotePostgresIdentifier(column)).toBe(`"${column}"`);
    }
    expect(POSTGRES_JSON_TEXT_POLICY).toEqual({ storage: 'text', empty: 'preserve', malformed: 'quarantine' });
    expect(POSTGRES_JSON_COLUMNS.stock_batch_job).toContain('providers_json');
  });
});
