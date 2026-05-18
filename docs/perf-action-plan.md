# Performance Action Plan (Round 5 carry-over)

The audit identified several P0/P1 hot paths whose proper fix is a
substantial refactor and would benefit from a dedicated follow-up
branch with isolated perf measurements. This document is the
acknowledged carry-over scope for round 5 (referenced by checklist
rows R5-132/133/138/144).

## R5-132 — `/api/collection` aspect path

**Symptom**: when the request carries any aspect filter OR
`?group=aspect`, the route runs `materializeReleaseAspectsForVn` +
`materializeReleaseMetaForVn` per VN in the collection. The latter
has no short-circuit and runs a full-scan `LIKE '% /release|%'` over
`vndb_cache` per VN.

**Plan**:

1. Anchor the `LIKE` pattern (`'POST /release|%'`) so the
   `cache_key` PRIMARY KEY index serves it.
2. Add a short-circuit to `materializeReleaseMetaForVn` mirroring
   the existing one in `materializeReleaseAspectsForVn`: skip when
   `release_meta_cache` already has rows newer than the latest
   matching `vndb_cache` row.
3. (Bigger) invert the loop in the route handler: read every
   cached `POST /release` body once, iterate `results[]`, dispatch
   to right VN via `vns[]`, batch upsert in a single transaction.
   One scan instead of N.

**Risk**: aspect filter accuracy depends on cache freshness. The
existing pattern is correct; only the cost is wrong. Steps 1+2 are
safe drop-in fixes; step 3 requires regression testing against the
aspect-derivation logic.

## R5-133 — `/api/refresh/global` per-VN release jobs

Same root cause as R5-132. The global-refresh route enqueues a
per-VN `materializeReleaseMetaForVn` job and emits one SSE tick
per job. After R5-132 step 3 lands, this collapses to one cache-
wide pass.

## R5-138 — `listCollection` JSON filters

**Symptom**: aspect / producer / publisher / tag / place filters
use `EXISTS (SELECT 1 FROM json_each(...) WHERE …)` — full row-by-
row JSON traversal. The new `staff_credit_index` /
`character_vn_index` derived tables set the precedent: do the
same for tags + developers + publishers + places.

**Plan**:

1. Schema: add `vn_tag_index (vn_id, tag_id, spoiler, category)`,
   `vn_developer_index (vn_id, producer_id)`,
   `vn_publisher_index (vn_id, producer_id)`,
   `vn_place_index (vn_id, place)`.
2. Populate them in the `upsertVn` transaction (rebuild on every
   upsert, same way `rebuildStaffVaCredits` does).
3. Backfill via a marker-gated one-shot migration that scans
   existing rows.
4. Rewrite the WHERE clauses in `listCollection` to
   `EXISTS (SELECT 1 FROM vn_tag_index WHERE vn_id = c.vn_id AND
   tag_id = ?)` etc.
5. Update `computeAggregateStats` (`topTags`, `byYear`,
   `byPlatform`, `byLanguage`) to read from the derived tables.

**Risk**: schema migration affects every cold start once. The
backfill is idempotent and gated by `app_setting`.

## R5-144 — `listCollectionForCards()` slim projection

**Symptom**: `listCollection` selects 25 columns per row including
15 heavy JSON columns (`tags`, `relations`, `staff`, `va` …). Per
row: 30-80 KB of JSON parsed in `rowToItem`. At 1000 rows: 30-80
MB of JSON parse work per `/api/collection` request, dominating
CPU.

**Plan**:

1. Add a new `listCollectionForCards()` helper that selects only
   the card-relevant columns (`id`, `title`, `alttitle`, `poster`,
   `rating`, `length_minutes`, `developers`, `publishers`,
   `playtime_minutes`, `status`, `favorite`, `list_count`).
2. Switch `/api/collection` to call it when the request does NOT
   carry an aspect filter, list-membership filter, or
   `?detail=full` flag.
3. Keep `listCollection` for callers that need the full payload
   (`/api/collection/export`, `/lists/[id]`, `/labels`).

**Risk**: the wide projection is currently the only path. The
new helper is additive; the existing surface stays intact.

## Carry-over priority

These items have measurable cost on a 1000+ VN library but are
not user-blocking on the operator's current snapshot (which is
smaller). The remaining round 5 implementation work and final
QA gates take priority. Schedule for the next perf sprint.
