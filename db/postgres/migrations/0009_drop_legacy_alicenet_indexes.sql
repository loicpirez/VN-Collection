BEGIN;

DROP INDEX IF EXISTS idx_alicesoft_kobe_vn;
DROP INDEX IF EXISTS idx_alicesoft_kobe_unmatched;
DROP INDEX IF EXISTS idx_alicesoft_kobe_no_vndb;
DROP INDEX IF EXISTS idx_alicesoft_kobe_title;
DROP INDEX IF EXISTS idx_alicesoft_kobe_egs_resolve;

COMMIT;
