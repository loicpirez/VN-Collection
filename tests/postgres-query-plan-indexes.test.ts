import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../db/postgres/migrations/0007_query_plan_indexes.sql', import.meta.url),
  'utf8',
);

describe('PostgreSQL representative query-plan indexes', () => {
  it('is one transactional, idempotent migration with a version marker', () => {
    expect(migration.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(migration.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(migration).toContain("VALUES ('0007_query_plan_indexes'");
    expect(migration).toContain('ON CONFLICT(version) DO NOTHING');
    expect((migration.match(/CREATE INDEX IF NOT EXISTS/g) ?? [])).toHaveLength(10);
  });

  it('covers collection, tag, staff, seiyuu, place, and stock access paths', () => {
    expect(migration).toContain('ON collection(status, updated_at DESC, vn_id)');
    expect(migration).toContain('ON vn_tag_index(tag_id, vn_id)');
    expect(migration).toContain('ON vn_staff_credit(sid, vn_id)');
    expect(migration).toContain('ON vn_va_credit(sid, vn_id)');
    expect(migration).toContain('ON collection_place_index(place, vn_id)');
    expect(migration).toContain('ON vn_stock_provider_status(provider, fetched_at DESC, vn_id)');
  });

  it('matches every AliceNet production pagination expression exactly', () => {
    expect(migration).toContain('idx_alicenet_page_title');
    expect(migration).toContain('idx_alicenet_page_updated');
    expect(migration).toContain('idx_alicenet_page_release');
    expect(migration).toContain('idx_alicenet_page_price');
    expect(migration).toContain("app_search_normalize(COALESCE(NULLIF(egs_title, ''), title)) COLLATE \"C\"");
    expect(migration).toContain("REPLACE(COALESCE(NULLIF(release_date, ''), NULLIF(egs_release_date, ''), ''), '/', '-')");
    expect(migration).toContain("NULLIF(regexp_replace(COALESCE(sale_price, ''), '[^0-9]', '', 'g'), '')");
    expect(migration).toContain("WHEN (NULLIF(regexp_replace(COALESCE(sale_price, ''), '[^0-9]', '', 'g'), '')::BIGINT) IS NULL THEN 1");
  });
});
