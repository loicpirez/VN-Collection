# checklist-integrity-audit — agent aa3a33bd9d76578f8 — FAILED/PARTIAL

Agent hit context limit before completing. Partial findings below.

Now let me check the AUD-* rows specifically mentioned in the audit task by reading the actual source files:

---

Good. Now let me check the AUD-* specific items. Let me look at the AUD checklist rows in the master checklist:

---

Now I have all the checklist rows. Let me now systematically verify each of the claimed fixes in the actual source code. Let me start with the most critical security and DB rows:

---

Now let me check AUD-DB-002: the claimed 4 indexes for vn.released, vn.fetched_at, collection.finished_date, collection.custom_order:

---

I see idx_vn_released and idx_vn_fetched_at are present, and idx_collection_finished_date is at line 156. But the checklist says `idx_collection_custom_order` is added via `db.exec after ensureColumn`. Let me check for that:

---

Good. The `idx_collection_custom_order` index is at line 694. Now let me check AUD-DB-003 (transaction hygiene) for a few of the named functions:

---

Good, `addToCollection` uses `db.transaction`. Now let me check the TypeScript-related rows. Let me look at VnDetailLayout.tsx:

---

The `sections` prop is `sectionNodes: Partial<Record<VnSectionId, React.ReactNode>>` but this is used in a map - it's the `sectionNodes` mapping. Let me check whether `React.ReactNode` is in a plain prop array (the claim is it's NOT in sections prop array):

The `sectionNodes` prop is `Partial<Record<VnSectionId, React.ReactNode>>` - this is a Record (object map), not a plain array of objects. The claim says "ReactNode not in sections prop array" - the sectionNodes is indeed a Record not an array with ReactNode inline. Let me check SeriesDetailLayout:

---

Good - `sectionNodes` in both layouts is `Partial<Record<..., React.ReactNode>>` not an array-of-objects with ReactNode in it. The AUD-TS-001 claim is confirmed - ReactNode is in a `Record` (object), not in a "sections prop array" (which the old design had as `{ id, node: ReactNode }[]`). This is CONFIRMED.

Now let me check AUD-TS-002: UpcomingCard:

---

For AUD-TS-002: The checklist claims `UpcomingCardData.meta` was removed from the interface. Looking at the `UpcomingCardData` interface (lines 29-54), there is NO `meta` field in the interface. The `meta` is passed as a **separate JSX prop** (`meta?: React.ReactNode` at line 63), not inside `UpcomingCardData`. This confirms the claim.

Now let me check AUD-TS-003 (characters page type guard):

---

The type guard is at line 78: `if (typeof p?.id !== 'string' || typeof p?.name !== 'string') return [];`. This is a structural validation, confirming AUD-TS-003.

Now let me check AUD-TS-004 (error.tsx for 8 routes):

---

All 8 error.tsx files exist. Now let me check the UX rows. Let me look at EgsPanel.tsx line 502, HomeLayoutEditorTrigger.tsx line 182:

---

Good. AUD-UX-019 and AUD-UX-020 confirmed.

Now let me check AUD-UX-023 (similar page seed cover on mobile):

---

No `hidden` class on the `SafeImage` wrapper - confirmed AUD-UX-023.

Now let me check AUD-UX-024 (GameLog.tsx line 262), AUD-UX-025 (ListCardActions.tsx line 87):

---

The checklist says lines 346, 357, 368. The current file shows lines 346, 357, 368 all have `tap-target`. But wait: AUD-UX-027 says lines 346, 357, 368. Current file is at lines 346, 357, 368. The checklist says "(pre-existing fix verified by reading current file) | Lines 346, 357, 368". 

Wait - the checklist says "Lines 346, 357, 368" for the rotate buttons. But what I see here is that line 351 has `<span>{t.coverActions.rotateLeft}</span>` - the label is VISIBLE as a span (not hidden). But the OLD AUD-UX-012 row says "removed hidden sm:inline from both rotate labels". Let me verify line 351 doesn't have `hidden sm:inline`:

The code at line 351 shows: `<span>{t.coverActions.rotateLeft}</span>` - no hidden class. Good.

Now AUD-UX-028 (ShelfReadOnlyControls):

---

AUD-UX-028 confirmed: `aria-label={dict.title}` at line 313, and the second trigger at line 324. Now let me check AUD-UX-031 (details elements with chevrons) - the checklist says there are 9:

The AUD-UX-031 claim says it was verified by finding `group-open:rotate-90` in various elements. I already confirmed this at line 374 of the checklist reading. Let me verify a couple of the specifics:

---

Good. AUD-UX-032 confirmed for PomodoroTimer.

Now let me check AUD-UX-039 (CoverSourcePicker/BannerSourcePicker × buttons):

---

Good. AUD-UX-042 confirmed - stats section always pushed unconditionally.

Now let me check AUD-UX-047 (ShelfSpatialView fitMode CSS var):

---

AUD-UX-049 confirmed: Line 48 shows `useState<number>(() => Date.now())` - lazy initializer (not initialized to `lastUpdatedAt`), and line 74 sets `refreshedAt` on success.

Now AUD-UX-050 (ListsPickerButton overlay):

---

AUD-UX-050 confirmed: Line 135 shows `${open ? ' !opacity-100' : ''}` which forces full opacity when the popover is open.

Now let me check the dead code rows:

**AUD-DEAD-001** (stale comment in vndb-sync.ts):

---

The old stale comment said "wiring gated" and the new one says "is called from `updateCollection` in `db.ts` when the app-setting `vndb_writeback = '1'` is enabled". The stale comment has been updated. AUD-DEAD-001 confirmed.

**AUD-DEAD-002** (dead components deleted):

---

All four dead component files are deleted. AUD-DEAD-002 confirmed.

**AUD-DEAD-003** (top-ranked-layout.ts, staff-extras.ts deleted):

---

The file is now 79 lines. The claimed dead exports `parseCharacterSearchParams`, `characterSearchFilters`, and `staffSearchFilters` are not present. The file only exports `StaffSearchTab`, `StaffSearchScope`, `StaffSort`, `StaffSearchParams`, and `parseStaffSearchParams`. AUD-DEAD-004 confirmed.

**AUD-DEAD-005** (series stub sections hidden):

---

The `sectionNodes` has only `hero`, `works`, `metadata`. The old stub sections `relatedSection` and `statsSection` are NOT present. AUD-DEAD-005 confirmed.

**AUD-DEAD-006** (brand-overlap in nav):

---

AUD-DEAD-006 confirmed: `/brand-overlap` appears in `insights` at line 113.

**AUD-DEAD-007** (error logged in BulkDownloadButton):

---

AUD-DEAD-007 confirmed: Line 163 shows `.catch((e: unknown) => { console.error('[BulkDownloadButton] global refresh failed:', e); })` - error is logged, not swallowed.

**AUD-DEAD-008** (formatMinutes wrapper removed from activity page):

---

AUD-DEAD-008 confirmed: Line 7 imports `formatMinutes` directly from `@/lib/format` - no local wrapper function. There's no local `formatMinutes` defined at line 10 or 27.

**AUD-DEAD-009** (db.backup() in GET /api/backup):

---

AUD-DEAD-009 confirmed: `db.backup(tmpPath)` at line 22.

**AUD-DEAD-010** (RecentActivityStrip removed from /data):

---

`RecentActivityStrip` is not imported in the data/page.tsx. AUD-DEAD-010 confirmed.

Now let me check AUD-TS-005 (safeJsonParse in producerToRow at lines 6522-6523) and AUD-TS-006 (safeJsonParse in exportData at line 7425):

---

The key is `key={e}` (the error message string itself), not `key={index}`. Let me check the broader context - the claim is about index keys being replaced with stable keys:

---

`key` is used from the object's explicit `key` property. AUD-TS-009 confirmed.

Now let me check AUD-DB-010 (defer_foreign_keys):

---

Wait - this is a potential issue for AUD-DB-010. The checklist says `defer_foreign_keys` instead of `foreign_keys OFF` was used. But the code at line 2310 still shows `db.pragma('foreign_keys = OFF')` and line 2314 shows `db.pragma('foreign_keys = ON')`. The AUD-DB-010 checklist claim says:

> "replaced PRAGMA foreign_keys=OFF/ON wrapper with PRAGMA defer_foreign_keys=ON inside db.transaction()"

But the current code uses `PRAGMA foreign_keys = OFF` / `ON` pattern! This is a potential FALSE_CLOSURE.

Let me check what the checklist claims more carefully. It says "AUD-DB-010: `egs_colon_to_underscore_v1` uses session-level `PRAGMA foreign_keys = OFF`" - so this was specifically about the migration named `egs_colon_to_underscore_v1`, not the `migrateVnId` function. Let me find that migration:

---

AUD-DB-010 confirmed: `db.pragma('defer_foreign_keys = ON')` at line 828 inside the `egs_colon_to_underscore_v1` migration, inside a `db.transaction()`. The `migrateVnId` function uses the old pattern but that's a different function and isn't mentioned in AUD-DB-010.

Now AUD-DB-011 (UNIQUE indexes on vn_staff_credit / vn_va_credit):

Already confirmed at lines 631-637 - `CREATE UNIQUE INDEX IF NOT EXISTS idx_vn_staff_credit_unique ON vn_staff_credit(vn_id, sid, role)` and `CREATE UNIQUE INDEX IF NOT EXISTS idx_vn_va_credit_unique ON vn_va_credit(vn_id, c_id, sid)`.

AUD-DB-012 (JSON.stringify → SQL identifier escaping in schema-local.ts):

---

AUD-DB-012 confirmed: Line 27 uses `"${table.name.replace(/"/g, '""')}"` - SQL-standard double-quote escaping.

Now let me check AUD-DB-001 (materializeReleaseMetaForCollectionVns):

---

AUD-DB-001 confirmed: `materializeReleaseMetaForCollectionVns(vnIds)` exists and does a single scan of `vndb_cache`.

Now let me check AUD-DB-004 (collection POST is transactional):

---

AUD-DB-004 confirmed: `db.transaction(() => { ... isInCollection ... addToCollection ... recordActivity ... })()` at lines 165-176.

Now let me check AUD-DB-005 (LIMIT on listCollection):

---

Good - `listCollection` has `limit = 10_000` as default. AUD-DB-005 for listCollection is confirmed.

Now let me check AUD-DB-006 (try/catch in 7 routes). The checklist says 7 routes. I already see try/catch in `/api/collection/[id]/route.ts`. Let me spot-check the collection GET:

---

AUD-DB-006 confirmed for collection GET having try/catch at line 98. I've now verified the key claims. Let me now check AUD-DB-007 (placeShelfItem transaction):

---

AUD-DB-007 confirmed: `getShelf` is called inside `db.transaction()` at line 5465/5469.

Now let me check AUD-DB-008 (createShelf/createRoute/createSavedFilter in transaction):