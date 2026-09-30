# Credit-table identity audit

## Production evidence from 2026-10-01

All checks were aggregate, read-only PostgreSQL queries. No names, notes, identifiers, credentials, or row payloads were returned.

`vn_staff_credit` contains 42,443 rows. The required `(vn_id, sid, role)` columns contain no nulls, no duplicate group exists, and the maximum multiplicity is one. PostgreSQL already enforces the same identity with the valid unique index `idx_vn_staff_credit_unique`. SQLite uses the same unique identity and its writer deletes a VN's credit rows before inserting the refreshed rows. Migration `0013_vn_staff_credit_primary_key.sql` therefore promotes the existing PostgreSQL index to a primary-key constraint without building a second index. It is transactional, refuses unexpected duplicate data, and is safe to run again after the constraint exists.

`vn_va_credit` contains 21,793 rows. The three-column candidate `(vn_id, c_id, sid)` has 515 duplicate groups and a maximum multiplicity of two, so it cannot be a primary key. Adding `aid` makes the current production rows unique and `aid` currently has no nulls, but the application and existing unique index intentionally include normalized `note` and `va_lang` in row identity. `note` is null in 19,216 current rows. A PostgreSQL primary key cannot contain nullable expression values, and narrowing the key to the currently unique subset would reject valid future credits that differ by note or language.

No `vn_va_credit` primary key is added in this scope. A safe later change requires an application contract decision, a writer update that normalizes identity fields to non-null values, matching SQLite behavior, and an idempotent PostgreSQL migration. The existing expression unique index continues to prevent duplicates under the current identity contract:

```sql
(vn_id, c_id, sid, COALESCE(aid, -1), COALESCE(note, ''), COALESCE(va_lang, ''))
```

## Deployment verification

Before applying the migration, rerun the staff proof:

```sql
SELECT COUNT(*)
FROM (
  SELECT 1
  FROM vn_staff_credit
  GROUP BY vn_id, sid, role
  HAVING COUNT(*) > 1
) AS duplicate_groups;
```

The result must be zero. Apply migrations through the reviewed release command, then verify:

```sql
SELECT conname, contype, convalidated
FROM pg_constraint
WHERE conrelid = 'vn_staff_credit'::regclass
  AND contype = 'p';
```

The expected row is `vn_staff_credit_pkey`, type `p`, validated.
