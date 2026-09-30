BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'vn_staff_credit'::regclass
      AND contype = 'p'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM vn_staff_credit
      GROUP BY vn_id, sid, role
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION 'vn_staff_credit contains duplicate (vn_id, sid, role) identities';
    END IF;

    ALTER TABLE vn_staff_credit
      ADD CONSTRAINT vn_staff_credit_pkey
      PRIMARY KEY USING INDEX idx_vn_staff_credit_unique;
  END IF;
END
$$;

COMMIT;
