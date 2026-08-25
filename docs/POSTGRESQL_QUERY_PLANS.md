# PostgreSQL query plans

This report records the representative plans used to close `PG-024`. It is a
measured baseline, not a promise that PostgreSQL must always choose the same
node. Re-capture the plans after material data growth, a PostgreSQL upgrade, or
a material query change.

## Migration rehearsal

The capture was made on 2026-08-24 with PostgreSQL 16.15 after applying ordered
migrations `0001` through `0007` to a new database. The source was the installed
1.1 GB SQLite collection opened read-only. The controlled copy inserted 405,242
rows across the 53-table migration manifest, and the independent verifier
confirmed the same 405,242 rows.

Verification included SQLite `quick_check` and foreign-key checks, destination
constraint validation, per-table row counts, primary-key shape and SHA-256 key
checksums, 28 contractual JSON-column checks, quarantine counts, and six
representative aggregate checks. The source predates the optional
`physical_bundle`, `physical_bundle_member`, and `app_job_lock` tables and the
`stock_batch_job.providers_json` column. The verifier proved their destination
rows or values were empty instead of treating absence as migrated data.

Representative rehearsal source sizes were:

| Surface | Rows or selected cardinality |
| --- | ---: |
| `vn` | 3,317 |
| `collection` | 167 |
| `vn_tag_index` | 101,050; the sampled tag matched about 2,300 rows |
| `vn_staff_credit` | 41,588; the sampled staff record matched 140 rows |
| `vn_va_credit` | 21,341; the sampled voice record matched 223 rows |
| `shelf_slot` | 88 across 3 shelves |
| `vn_stock_offer` | 8,145; the sampled VN matched 125 offers |
| `vn_stock_provider_status` | 9,152 |
| `collection_place_index` | 87 |
| `alicenet_stock` | 1,412 |

`ANALYZE` ran after the copy and before every plan below.

## Rehearsal plans

| Query surface | Selected plan | Actual result | Buffers | Execution |
| --- | --- | ---: | --- | ---: |
| Library status, newest first | Sequential scan plus quicksort | 18 rows | 9 hits | 0.037 ms |
| Tag filter and VN order | Index-only scan on `idx_vn_tag_index_tag_vn` | first 100 rows | 95 hits, 4 reads | 0.210 ms |
| Staff credits by `sid` | Bitmap scan on existing `idx_vn_staff_credit_sid`, then quicksort | 140 matched, first 100 returned | 117 hits, 7 reads | 0.227 ms |
| Seiyuu credits by `sid` | Index-only scan on `idx_vn_va_credit_sid_vn` | first 100 of 223 | 87 hits, 3 reads | 0.152 ms |
| One shelf in spatial order | Sequential scan plus quicksort | 28 of 88 rows | 4 hits | 0.036 ms |
| Offers for one VN | Bitmap scan on `idx_vn_stock_offer_vn`, then quicksort | 125 matched, first 100 returned | 26 hits, 1 read | 0.116 ms |
| Provider freshness queue | Index scan on `idx_stock_status_provider_fetched_vn` | first 100 rows | 12 hits, 1 read | 0.053 ms |
| Collection place filter | Sequential scan plus quicksort | 87 rows | 4 hits | 0.045 ms |
| AliceNet title page at offset 500 | Index scan on `idx_alicenet_page_title` | 550 visited, 50 returned | 266 hits, 11 reads | 1.064 ms |
| AliceNet numeric-price page at offset 500 | Index scan on `idx_alicenet_page_price` | 550 visited, 50 returned | 503 hits, 8 reads | 1.660 ms |

The index-only plans still reported heap fetches immediately after the bulk
copy because `ANALYZE` updates statistics but does not mark freshly loaded heap
pages all-visible. Normal vacuum maintenance can reduce those fetches. This
does not affect the measured result or ordering.

## Index decisions

Migration `0007_query_plan_indexes.sql` adds:

- a library status/update/VN ordering index;
- covering tag, staff, and seiyuu lookup indexes;
- place and provider-freshness ordering indexes;
- four AliceNet pagination indexes matching the production title, update,
  release-date, and numeric-price expressions exactly.

No extra shelf index was added. The shelf primary key already starts with
`(shelf_id, row, col)` and the uniqueness constraint covers `(vn_id,
release_id)`. At 88 rows PostgreSQL correctly preferred a one-page sequential
scan. The same cost principle explains the library and place plans: scanning
one to three cached pages is cheaper than traversing an index. Their indexes
remain useful as cardinality and selectivity increase.

The AliceNet price index must match both the cast and null-group expression in
`orderSql`. An earlier semantically equivalent expression produced a
sequential scan; the clean migration replay above proved the corrected
expression selects `idx_alicenet_page_price`.

## Current production recapture

The plans were recaptured on 2026-08-26 from the bounded, read-only statements
used by the deployed application. Production had ordered migrations `0001`
through `0011`, PostgreSQL reported ready, the connection pool maximum was 10,
and the service had zero restarts. Each statement had a five-second timeout.

Current table cardinalities were:

| Surface | Rows |
| --- | ---: |
| `vn` | 3,332 |
| `collection` | 167 |
| `vn_tag_index` | 101,263 |
| `vn_staff_credit` | 41,769 |
| `vn_va_credit` | 21,428 |
| `shelf_slot` | 88 |
| `vn_stock_offer` | 8,052 |
| `vn_stock_provider_status` | 9,152 |
| `collection_place_index` | 87 |
| `alicenet_stock` | 1,412 |

The ungrouped AliceNet query now obtains the independent total, materializes
the bounded stock page, and only then joins that page to collection and VN
metadata. Grouped modes retain their full partition count because the UI uses
that count for group navigation.

| Query surface | Selected plan | Actual result | Buffers | Execution |
| --- | --- | ---: | --- | ---: |
| AliceNet title page at offset 500 | Sequential scan plus top-N heapsort for 1,412 stock rows; primary-key VN enrichment for the page | 596 visited, 96 returned | 371 hits | 15.003 ms |
| AliceNet numeric-price page at offset 500 | Index scan on `idx_alicenet_page_price`; primary-key VN enrichment for the page | 596 visited, 96 returned | 778 hits | 9.818 ms |

Before pagination preceded enrichment, the complete application-shaped title
and price statements took 18.593 ms and 24.453 ms respectively. Removing the
unused ungrouped window count alone did not improve those plans because the
joins still ran before the page window. The materialized page shape reduced
the price path by about 60 percent. PostgreSQL still prefers a sequential scan
for title ordering at 1,412 rows; forcing the title index would be unjustified
without evidence from larger cardinality or higher measured latency.

## Production staff-page verification

After the PostgreSQL cutover, the highest-cardinality local staff record was
measured through the complete server-rendered route and with the exact
repository statements. This supplements the migration-rehearsal plans above;
it does not replace them.

| Surface | Production cardinality/result | Execution |
| --- | ---: | ---: |
| Complete staff route, first sample | HTTP 200 | 0.424 s |
| Complete staff route, four warm samples | HTTP 200 | 0.270-0.294 s |
| Production-credit query | 5 rows | 0.434 ms |
| Voice-credit query | 223 rows | 9.315 ms |
| Alias/sibling resolution | 8 names, no sibling match | 11.197 ms |

The credit lookups selected their `sid` indexes, VN lookups used the primary
key or a small in-memory hash, collection joins stayed in memory, and every
sort used quicksort without a spill. The sibling lookup deliberately begins
from the 167-row collection for production credits and scans the 21,341-row
voice-credit table in memory; at 11.197 ms this was cheaper and simpler than an
additional broad name index. No timeout, lock wait, temporary-file sort, or
unbounded row estimate appeared. Reconsider that decision only when measured
latency or cardinality materially changes.

## Recapture procedure

Use a restored non-production database with production-like cardinality:

1. Apply the exact ordered migration set and run the independent migration
   verifier.
2. Run `ANALYZE`; use `VACUUM (ANALYZE)` only when that maintenance action is
   appropriate for the isolated copy.
3. Execute each production-shaped statement with `EXPLAIN (ANALYZE, BUFFERS)`
   and realistic parameters, limits, offsets, joins, expressions, and ordering.
4. Record actual rows, loops, sort spill, heap fetches, shared reads/hits,
   planning time, and execution time.
5. Investigate plan drift from measured latency and cardinality. Do not force
   index scans or raise timeouts merely because a small-table sequential scan
   appears in the plan.

Never run `EXPLAIN ANALYZE` for a mutating statement against production. For a
read query on production, obtain operator approval and use bounded parameters
and statement timeouts.
