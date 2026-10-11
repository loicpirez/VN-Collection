BEGIN;

ALTER TABLE collection ADD COLUMN IF NOT EXISTS ai_playtime_minutes BIGINT;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS ai_playtime_lower_minutes BIGINT;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS ai_playtime_upper_minutes BIGINT;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS ai_playtime_confidence DOUBLE PRECISION;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS ai_playtime_model TEXT;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS ai_playtime_rationale TEXT;
ALTER TABLE collection ADD COLUMN IF NOT EXISTS ai_playtime_generated_at BIGINT;

ALTER TABLE collection DROP CONSTRAINT IF EXISTS collection_ai_playtime_consistency;
ALTER TABLE collection ADD CONSTRAINT collection_ai_playtime_consistency CHECK (
  (ai_playtime_minutes IS NULL
    AND ai_playtime_lower_minutes IS NULL
    AND ai_playtime_upper_minutes IS NULL
    AND ai_playtime_confidence IS NULL
    AND ai_playtime_model IS NULL
    AND ai_playtime_rationale IS NULL
    AND ai_playtime_generated_at IS NULL)
  OR
  (ai_playtime_minutes BETWEEN 1 AND 10000000
    AND ai_playtime_lower_minutes BETWEEN 1 AND 10000000
    AND ai_playtime_upper_minutes BETWEEN 1 AND 10000000
    AND ai_playtime_lower_minutes <= ai_playtime_minutes
    AND ai_playtime_minutes <= ai_playtime_upper_minutes
    AND (ai_playtime_confidence IS NULL OR (ai_playtime_confidence >= 0 AND ai_playtime_confidence <= 1))
    AND LENGTH(BTRIM(ai_playtime_model)) BETWEEN 1 AND 200
    AND (ai_playtime_rationale IS NULL OR LENGTH(ai_playtime_rationale) <= 2000)
    AND ai_playtime_generated_at >= 0)
);

COMMIT;
