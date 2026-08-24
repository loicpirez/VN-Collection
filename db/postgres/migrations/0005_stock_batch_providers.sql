BEGIN;

ALTER TABLE stock_batch_job
  ADD COLUMN IF NOT EXISTS providers_json TEXT;

COMMIT;
