BEGIN;

CREATE TABLE IF NOT EXISTS vn_relation_index (
  vn_id TEXT NOT NULL REFERENCES vn(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  related_vn_id TEXT NOT NULL,
  PRIMARY KEY (vn_id, relation, related_vn_id)
);

CREATE INDEX IF NOT EXISTS idx_vn_relation_index_relation_vn
  ON vn_relation_index(relation, vn_id);

CREATE TABLE IF NOT EXISTS release_platform_index (
  release_id TEXT NOT NULL REFERENCES release_meta_cache(release_id) ON DELETE CASCADE,
  vn_id TEXT,
  platform TEXT NOT NULL,
  position BIGINT NOT NULL,
  PRIMARY KEY (release_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_release_platform_index_vn_release
  ON release_platform_index(vn_id, release_id);

CREATE OR REPLACE FUNCTION app_sync_vn_relation_index()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parsed jsonb;
BEGIN
  DELETE FROM vn_relation_index WHERE vn_id = NEW.id;
  IF NEW.relations IS NULL OR BTRIM(NEW.relations) = '' OR NOT pg_input_is_valid(NEW.relations, 'jsonb') THEN
    RETURN NEW;
  END IF;
  parsed := NEW.relations::jsonb;
  IF jsonb_typeof(parsed) <> 'array' THEN
    RETURN NEW;
  END IF;
  INSERT INTO vn_relation_index (vn_id, relation, related_vn_id)
  SELECT NEW.id, entry->>'relation', entry->>'id'
  FROM jsonb_array_elements(parsed) AS entry
  WHERE jsonb_typeof(entry) = 'object'
    AND NULLIF(entry->>'relation', '') IS NOT NULL
    AND NULLIF(entry->>'id', '') IS NOT NULL
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_sync_release_platform_index()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parsed jsonb;
BEGIN
  DELETE FROM release_platform_index WHERE release_id = NEW.release_id;
  IF NEW.platforms IS NULL OR BTRIM(NEW.platforms) = '' OR NOT pg_input_is_valid(NEW.platforms, 'jsonb') THEN
    RETURN NEW;
  END IF;
  parsed := NEW.platforms::jsonb;
  IF jsonb_typeof(parsed) <> 'array' THEN
    RETURN NEW;
  END IF;
  INSERT INTO release_platform_index (release_id, vn_id, platform, position)
  SELECT DISTINCT ON (platform)
    NEW.release_id,
    NEW.vn_id,
    platform,
    position
  FROM (
    SELECT NULLIF(value #>> '{}', '') AS platform, ordinality::BIGINT AS position
    FROM jsonb_array_elements(parsed) WITH ORDINALITY AS item(value, ordinality)
    WHERE jsonb_typeof(value) = 'string'
  ) normalized
  WHERE platform IS NOT NULL
  ORDER BY platform, position
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_vn_relation_index ON vn;
CREATE TRIGGER trg_sync_vn_relation_index
AFTER INSERT OR UPDATE OF relations ON vn
FOR EACH ROW EXECUTE FUNCTION app_sync_vn_relation_index();

DROP TRIGGER IF EXISTS trg_sync_release_platform_index ON release_meta_cache;
CREATE TRIGGER trg_sync_release_platform_index
AFTER INSERT OR UPDATE OF platforms, vn_id ON release_meta_cache
FOR EACH ROW EXECUTE FUNCTION app_sync_release_platform_index();

DELETE FROM vn_relation_index;
INSERT INTO vn_relation_index (vn_id, relation, related_vn_id)
SELECT vn.id, entry->>'relation', entry->>'id'
FROM vn
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN pg_input_is_valid(vn.relations, 'jsonb') THEN
      CASE WHEN jsonb_typeof(vn.relations::jsonb) = 'array' THEN vn.relations::jsonb ELSE '[]'::jsonb END
    ELSE '[]'::jsonb
  END
) AS entry
WHERE jsonb_typeof(entry) = 'object'
  AND NULLIF(entry->>'relation', '') IS NOT NULL
  AND NULLIF(entry->>'id', '') IS NOT NULL
ON CONFLICT DO NOTHING;

DELETE FROM release_platform_index;
INSERT INTO release_platform_index (release_id, vn_id, platform, position)
SELECT DISTINCT ON (release.release_id, platform)
  release.release_id,
  release.vn_id,
  platform,
  position
FROM release_meta_cache AS release
CROSS JOIN LATERAL (
  SELECT NULLIF(value #>> '{}', '') AS platform, ordinality::BIGINT AS position
  FROM jsonb_array_elements(
    CASE
      WHEN pg_input_is_valid(release.platforms, 'jsonb') THEN
        CASE WHEN jsonb_typeof(release.platforms::jsonb) = 'array' THEN release.platforms::jsonb ELSE '[]'::jsonb END
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS item(value, ordinality)
  WHERE jsonb_typeof(value) = 'string'
) normalized
WHERE platform IS NOT NULL
ORDER BY release.release_id, platform, position
ON CONFLICT DO NOTHING;

COMMIT;
