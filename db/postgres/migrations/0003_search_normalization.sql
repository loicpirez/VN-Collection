BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION app_search_normalize(value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
PARALLEL SAFE
STRICT
RETURN lower(normalize(value, NFKC));

CREATE INDEX IF NOT EXISTS idx_vn_title_search_trgm
  ON vn USING GIN (app_search_normalize(title) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vn_alttitle_search_trgm
  ON vn USING GIN (app_search_normalize(alttitle) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alicenet_search_trgm
  ON alicenet_stock USING GIN (
    app_search_normalize(
      title || ' ' ||
      COALESCE(egs_title, '') || ' ' ||
      COALESCE(egs_brand, '') || ' ' ||
      COALESCE(search_title, '') || ' ' ||
      code || ' ' ||
      COALESCE(vn_id, '') || ' ' ||
      COALESCE(egs_id::TEXT, '')
    ) gin_trgm_ops
  );

COMMIT;
