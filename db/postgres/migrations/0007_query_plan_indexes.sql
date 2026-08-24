BEGIN;

CREATE INDEX IF NOT EXISTS idx_collection_status_updated_vn
  ON collection(status, updated_at DESC, vn_id);

CREATE INDEX IF NOT EXISTS idx_vn_tag_index_tag_vn
  ON vn_tag_index(tag_id, vn_id)
  INCLUDE (spoiler, category, tag_name);

CREATE INDEX IF NOT EXISTS idx_vn_staff_credit_sid_vn
  ON vn_staff_credit(sid, vn_id)
  INCLUDE (role, name, original, lang);

CREATE INDEX IF NOT EXISTS idx_vn_va_credit_sid_vn
  ON vn_va_credit(sid, vn_id)
  INCLUDE (c_id, c_name, va_name, va_lang);

CREATE INDEX IF NOT EXISTS idx_collection_place_index_place_vn
  ON collection_place_index(place, vn_id);

CREATE INDEX IF NOT EXISTS idx_stock_status_provider_fetched_vn
  ON vn_stock_provider_status(provider, fetched_at DESC, vn_id);

CREATE INDEX IF NOT EXISTS idx_alicenet_page_title
  ON alicenet_stock(
    (app_search_normalize(COALESCE(NULLIF(egs_title, ''), title)) COLLATE "C"),
    code
  );

CREATE INDEX IF NOT EXISTS idx_alicenet_page_updated
  ON alicenet_stock(
    updated_at DESC,
    (app_search_normalize(COALESCE(NULLIF(egs_title, ''), title)) COLLATE "C"),
    code
  );

CREATE INDEX IF NOT EXISTS idx_alicenet_page_release
  ON alicenet_stock(
    (REPLACE(COALESCE(NULLIF(release_date, ''), NULLIF(egs_release_date, ''), ''), '/', '-')),
    (app_search_normalize(COALESCE(NULLIF(egs_title, ''), title)) COLLATE "C"),
    code
  );

CREATE INDEX IF NOT EXISTS idx_alicenet_page_price
  ON alicenet_stock(
    (CASE
      WHEN (NULLIF(regexp_replace(COALESCE(sale_price, ''), '[^0-9]', '', 'g'), '')::BIGINT) IS NULL THEN 1
      ELSE 0
    END),
    ((NULLIF(regexp_replace(COALESCE(sale_price, ''), '[^0-9]', '', 'g'), ''))::BIGINT),
    (app_search_normalize(COALESCE(NULLIF(egs_title, ''), title)) COLLATE "C"),
    code
  );

INSERT INTO schema_migration (version, applied_at)
VALUES ('0007_query_plan_indexes', (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::BIGINT)
ON CONFLICT(version) DO NOTHING;

COMMIT;
