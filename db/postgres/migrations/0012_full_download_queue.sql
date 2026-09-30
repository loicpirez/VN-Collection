BEGIN;

CREATE TABLE IF NOT EXISTS full_download_queue (
  id               TEXT PRIMARY KEY,
  vn_id            TEXT NOT NULL UNIQUE,
  state            TEXT NOT NULL CHECK(state IN ('queued', 'running', 'completed', 'failed')),
  phase_index      BIGINT NOT NULL DEFAULT 0 CHECK(phase_index BETWEEN 0 AND 3),
  attempts         BIGINT NOT NULL DEFAULT 0,
  errors_json      TEXT NOT NULL DEFAULT '[]',
  enqueued_at      BIGINT NOT NULL,
  started_at       BIGINT,
  updated_at       BIGINT NOT NULL,
  finished_at      BIGINT,
  lease_owner      TEXT,
  lease_expires_at BIGINT
);

CREATE INDEX IF NOT EXISTS idx_full_download_queue_claim
  ON full_download_queue(state, lease_expires_at, enqueued_at);

COMMIT;
