BEGIN;

CREATE TABLE IF NOT EXISTS stock_provider_batch_run (
  provider    TEXT PRIMARY KEY,
  started_at  BIGINT NOT NULL,
  finished_at BIGINT NOT NULL,
  CONSTRAINT stock_provider_batch_run_time_order
    CHECK (finished_at >= started_at)
);

COMMIT;
