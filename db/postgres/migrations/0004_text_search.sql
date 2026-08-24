BEGIN;

CREATE INDEX IF NOT EXISTS idx_collection_notes_search_trgm
  ON collection USING GIN (app_search_normalize(notes) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_collection_custom_description_search_trgm
  ON collection USING GIN (app_search_normalize(custom_description) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_vn_quote_text_search_trgm
  ON vn_quote USING GIN (app_search_normalize(quote) gin_trgm_ops);

COMMIT;
