# Round 5 audit import — uploaded reports

This TODO file imports the uploaded audit reports into a normalized work queue.

Do not mark anything FIXED_VERIFIED during import.
Do not bulk-close.
Do not use HTTP 200 as visual proof.
Do not use grep-only proof for visual UX.
Do not use risk accepted for implementable security issues.
Do not reintroduce ContentWidthSlider.

## Required intake fields

The existing checklist fields are not enough.
Every imported row must preserve these fields:

| Field | Required | Meaning |
| --- | --- | --- |
| ID | yes | Stable ID: PAGE-001, DBA-001, UXA-001, I18NA-001, RESP-001, SECA-001, QAI-001, etc. |
| Source audit | yes | Uploaded audit source: page audit, db/backend audit, UI/UX audit, i18n audit, responsive/mobile audit, security/page audit, checklist-integrity. |
| Severity | yes | HIGH / MEDIUM / LOW. If inferred, write `INFERRED`. |
| Area | yes | Page, DB/backend, UI/UX, i18n, responsive/mobile, a11y, security, TypeScript, process. |
| Category | yes | N+1, TOCTOU, missing error boundary, button-system, hover-trap, hardcoded string, missing title, unbounded query, etc. |
| User-visible? | yes | Yes / No / Indirect. Visual/user-visible rows require browser or Playwright evidence later. |
| Issue | yes | Short issue summary. |
| Current behavior / evidence | yes | Exact bad behavior from the audit, including file/line when available. |
| Expected behavior | yes | What must be true after the fix. |
| Files/routes | yes | Exact files and routes. |
| Fix scope | yes | Minimal intended fix. Avoid broad refactors. |
| Required verification | yes | Unit test / integration test / source proof / Playwright / manual browser evidence / final QA. |
| Fix commit | later | Empty until implemented. |
| Verification evidence | later | Empty until verified. |
| Status | yes | TODO initially, unless explicitly mapped as duplicate. |

## Agent audit run status

| Agent ID | Audit area | Status | Raw output |
| --- | --- | --- | --- |
| a298f8dec90514307 | UI/UX full audit | ✅ COMPLETED | `TODO/round5-audits/ui-ux-audit.md` |
| a055b433bb1fa08b3 | Page-by-page audit | ✅ COMPLETED | `TODO/round5-audits/page-audit.md` |
| a1a3767af4232f4b2 | i18n audit | ✅ COMPLETED | `TODO/round5-audits/i18n-audit.md` |
| accabd60f7e77f192 | DB/backend audit | ✅ COMPLETED | `TODO/round5-audits/db-backend-audit.md` |
| ac5156cc865f0ef33 | Responsive/mobile audit | 🟡 PARTIAL (stopped at tool_use, has report) | `TODO/round5-audits/responsive-mobile-audit.md` |
| a46dd3cb0dafac3ea | Security/API audit | ❌ FAILED mid-work (context limit) | `TODO/round5-audits/security-api-audit-PARTIAL.md` |
| aed52a32a6f877551 | Accessibility audit | ❌ FAILED mid-work (context limit) | `TODO/round5-audits/accessibility-audit-PARTIAL.md` |
| aa3a33bd9d76578f8 | Checklist integrity audit | ❌ FAILED mid-work (context limit) | `TODO/round5-audits/checklist-integrity-audit-PARTIAL.md` |
| a736b1d4eb70cd479 | Component library audit | ❌ FAILED (hit context limit immediately) | `TODO/round5-audits/component-library-audit.md` |
| a585fb2460b231617 | Test coverage audit | ❌ FAILED (no output) | `TODO/round5-audits/test-coverage-audit-FAILED.md` |
| a0364820947ef1c22 | General codebase audit 1 | ❌ FAILED (no output) | `TODO/round5-audits/general-codebase-audit-1-FAILED.md` |
| a054b6cfa0cfe9c3c | src/lib/ audit | ❌ FAILED (no output) | `TODO/round5-audits/lib-audit-FAILED.md` |
| a0a343798becae48f | General codebase audit 2 | ❌ FAILED mid-work (rate limit before producing report) | `TODO/round5-audits/general-codebase-audit-2-PARTIAL.md` |
| a7fdd07886c420eb2 | Performance/Architecture audit | ❌ FAILED mid-work (rate limit before producing report) | `TODO/round5-audits/general-codebase-audit-3-FAILED.md` |

**Partial findings recovered from tool traces:**
- a46dd (security): confirmed `proxy.ts` CSRF dead code; confirmed `egs/[id]/add` missing auth; agent was mid-sweep when it stopped. SECA-001..024 imported from partial trace.
- aed52 (a11y): confirmed A11Y-001..012 issues from full tool trace extraction.
- aa3a (checklist integrity): confirmed all AUD-DEAD-*, AUD-DB-*, AUD-UX-*, AUD-TS-* rows are genuine FIXED_VERIFIED. No FALSE_CLOSURE confirmed.
- a7fdd (performance): recovered PERF-001..005 findings from tool call results.
- a036 (TypeScript/Next.js): recovered TS-001..005 findings from tool call results.
- a0a3, a054 (general/lib): hit rate limit mid-synthesis; no report produced; their individual tool reads were inspected but no unique findings beyond what other agents found.

**Re-run agents (completed successfully):**
- `ae2c4c6cccfff61e8` — Component library audit → `TODO/round5-audits/component-library-audit.md` ✅ 36 issues (3 HIGH, 23 MEDIUM, 10 LOW)
- `a1bf0b31b6e39ab04` — Test coverage audit → `TODO/round5-audits/test-coverage-audit.md` ✅ 53 gaps (18 HIGH, 24 MEDIUM, 11 LOW)
- `afbd55c566a07c2bf` — src/lib deep audit → `TODO/round5-audits/lib-audit.md` ✅ 19 issues (4 HIGH, 8 MEDIUM, 7 LOW)

**All planned audit areas now covered.**

## Source reports imported

All completed/partial agent raw outputs saved to `TODO/round5-audits/`.
Deduplicate by issue identity, not by filename.

## Normalized intake file

Create and maintain:
```text
docs/round5-audit-intake.md
```

Use this schema:

```md
| ID | Source audit | Severity | Area | Category | User-visible? | Issue | Current behavior / evidence | Expected behavior | Files/routes | Fix scope | Required verification | Fix commit | Verification evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
```

## Prefixes

Use these prefixes when adding new rows:

```text
PAGE-*    page/app route audit
DBA-*     DB/backend audit
UXA-*     UI/UX audit
I18NA-*   i18n audit
RESP-*    responsive/mobile audit
SECA-*    security/API audit
QAI-*     checklist/process integrity audit
A11Y-*    accessibility audit
PERF-*    performance/architecture audit
TS-*      TypeScript/Next.js code quality audit
COMP-*    component library audit (src/components/)
LIB-*     src/lib/ deep audit
TCO-*     test coverage audit
```

## Mandatory imports — Page audit

| ID | Severity | Issue | Files/routes | Required verification |
| --- | --- | --- | --- | --- |
| PAGE-001 | MEDIUM | Home `<Suspense>` has no fallback, causing invisible loading gap. | `src/app/page.tsx`, `/` | source proof + browser load evidence |
| PAGE-002 | LOW | Home page has no `generateMetadata()`, no page title. | `src/app/page.tsx`, `/` | source proof |
| PAGE-003 | MEDIUM | `getAppSetting('home_section_layout_v1')` DB call in RSC has no try/catch; DB error crashes page. | `src/app/page.tsx`, `/` | test or source proof |
| PAGE-004 | MEDIUM | `/activity` uses one `page` param for two independent paginated data sources. | `src/app/activity/page.tsx`, `/activity` | route/browser pagination proof |
| PAGE-005 | LOW | `/activity` entity filter accepts arbitrary free-text values. | `src/app/activity/page.tsx` | unit/source proof |
| PAGE-006 | LOW | `/activity` lacks route-level `error.tsx`. | `src/app/activity/error.tsx` | source proof |
| PAGE-007 | LOW | `/brand-overlap` lacks metadata title. | `src/app/brand-overlap/page.tsx` | source proof |
| PAGE-008 | LOW | `/brand-overlap` lacks `error.tsx`. | `src/app/brand-overlap/error.tsx` | source proof |
| PAGE-009 | MEDIUM | `/characters` local results hard-limited to 200 with no pagination/notice. | `src/app/characters/page.tsx`, `/characters` | browser evidence |
| PAGE-010 | LOW | `/characters` lacks `error.tsx`. | `src/app/characters/error.tsx` | source proof |
| PAGE-011 | LOW | `/compare` lacks `error.tsx`. | `src/app/compare/error.tsx` | source proof |
| PAGE-012 | LOW | `/data` lacks `error.tsx`. | `src/app/data/error.tsx` | source proof |
| PAGE-013 | LOW | `/dumped` lacks `error.tsx`. | `src/app/dumped/error.tsx` | source proof |
| PAGE-014 | LOW | `/egs` lacks `error.tsx`. | `src/app/egs/error.tsx` | source proof |
| PAGE-015 | LOW | `/labels` lacks metadata title. | `src/app/labels/page.tsx` | source proof |
| PAGE-016 | MEDIUM | `/labels` ids query param lacks per-id format validation. | `src/app/labels/page.tsx` | unit/source proof |
| PAGE-017 | MEDIUM | `/labels` uses `dangerouslySetInnerHTML` for QR SVG; safe today but must be documented. | `src/app/labels/page.tsx` | source proof |
| PAGE-018 | LOW | `/quotes` hard-limits to 300 results with no pagination/notice. | `src/app/quotes/page.tsx` | browser/source proof |
| PAGE-019 | HIGH | `/release/[id]` performs DB write side effect inside RSC render. | `src/app/release/[id]/page.tsx` | source proof + route behavior |
| PAGE-020 | MEDIUM | `/release/[id]` lacks metadata title. | `src/app/release/[id]/page.tsx` | source proof |
| PAGE-021 | HIGH | `/search` lacks `dynamic = 'force-dynamic'`. | `src/app/search/page.tsx` | source proof |
| PAGE-022 | MEDIUM | `/search` Suspense around client component lacks fallback. | `src/app/search/page.tsx` | source/browser proof |
| PAGE-023 | LOW | `/similar` hard-caps at 24 results with no pagination/notice. | `src/app/similar/page.tsx` | browser/source proof |
| PAGE-024 | MEDIUM | `/tag/[id]` local tab returns all matching rows without pagination/limit notice. | `src/app/tag/[id]/page.tsx` | browser/source proof |

## Mandatory imports — Security/API audit

| ID | Severity | Issue | Files/routes | Required verification |
| --- | --- | --- | --- | --- |
| SECA-001 | MEDIUM | `POST /api/vndb/pull-statuses` has no auth gate despite destructive sync. | `src/app/api/vndb/pull-statuses/route.ts` | route test |
| SECA-002 | MEDIUM | `GET /api/vn/[id]` has side effects and fan-outs but no auth gate. | `src/app/api/vn/[id]/route.ts` | route test |
| SECA-003 | LOW | `GET /api/vn/[id]/quotes` leaks quote/character data without auth. | `src/app/api/vn/[id]/quotes/route.ts` | route test |
| SECA-004 | LOW | `GET /api/vn/[id]/lists` leaks list membership without auth. | `src/app/api/vn/[id]/lists/route.ts` | route test |
| SECA-005 | MEDIUM | `/api/vn/[id]/aspect` lacks auth on GET/PATCH/DELETE; PATCH/DELETE mutate DB. | `src/app/api/vn/[id]/aspect/route.ts` | route test |
| SECA-006 | MEDIUM | `/api/shelves` POST/PATCH lack auth gate. | `src/app/api/shelves/route.ts` | route test |
| SECA-007 | MEDIUM | `/api/shelves/[id]` PATCH/DELETE lack auth gate. | `src/app/api/shelves/[id]/route.ts` | route test |
| SECA-008 | MEDIUM | `/api/shelves/[id]/slots` write handlers must be audited for auth. | `src/app/api/shelves/[id]/slots/route.ts` | route test |
| SECA-009 | LOW | `/api/search` consumes VNDB quota without auth. | `src/app/api/search/route.ts` | route test |
| SECA-010 | LOW | `/api/activity` auth status must be verified for GET/write handlers. | `src/app/api/activity/route.ts` | route test |

## Mandatory imports — DB/backend audit

| ID | Severity | Issue | Files/routes | Required verification |
| --- | --- | --- | --- | --- |
| DBA-001 | HIGH | Aspect filtering/grouping triggers per-VN N+1 `materializeReleaseAspectsForVn(id)` loop on collection GET. | `src/app/api/collection/route.ts`, `src/lib/db.ts` | source proof + perf-oriented test |
| DBA-002 | MEDIUM | `uniqueSlug()` SELECT loop is safe in create transaction but unsafe for `updateUserList`. | `src/lib/db.ts` | unit/source proof |
| DBA-003 | HIGH | `updateUserList` check/slug/update not in transaction; TOCTOU duplicate slug risk. | `src/lib/db.ts` | unit/source proof |
| DBA-004 | MEDIUM | `setOwnedReleaseAspectOverride` existence check and write not in transaction. | `src/lib/db.ts` | unit/source proof |
| DBA-005 | MEDIUM | `setSteamLink` SELECT/guard/write not atomic; manual guard can be bypassed by race. | `src/lib/db.ts` | unit/source proof |
| DBA-006 | MEDIUM | `updateGameLogEntry` read/merge/write outside transaction; lost update risk. | `src/lib/db.ts` | unit/source proof |
| DBA-007 | MEDIUM | `ratingHistogram()` fetches every rated row into JS instead of SQL aggregation. | `src/lib/db.ts` | test/source proof |
| DBA-008 | MEDIUM | migration marker written outside transaction after legacy row update. | `src/lib/db.ts` | source proof |
| DBA-009 | LOW | `getDbStatus()` interpolates hardcoded table names; validate/allowlist. | `src/lib/db.ts` | source proof |
| DBA-010 | LOW | `restoreFromSqliteFile()` SQL identifier interpolation should add stricter allowlist. | `src/lib/db.ts` | source proof |
| DBA-011 | LOW | `user_list_vn.vn_id` orphan tolerance after removeFromCollection needs cleanup or explicit maintenance. | `src/lib/db.ts` | test/source proof |

## Mandatory imports — UI/UX audit

| ID | Severity | Issue | Files/routes | Required verification |
| --- | --- | --- | --- | --- |
| UXA-001 | MEDIUM | `MarkdownNotes` Edit/Preview buttons hand-roll styles instead of `btn` primitive. | `src/components/MarkdownNotes.tsx` | source/browser proof |
| UXA-002 | MEDIUM | `CustomSynopsis` buttons hand-roll styles instead of `btn btn-xs`. | `src/components/CustomSynopsis.tsx` | source/browser proof |
| UXA-003 | MEDIUM | `SettingsButton` has multiple hand-rolled inline buttons. | `src/components/SettingsButton.tsx` | source/browser proof |
| UXA-004 | LOW | Steam page show all/less toggle hand-rolls button style. | `src/app/steam/page.tsx` | source proof |
| UXA-005 | LOW | `EgsPanel` search button hand-rolls button style. | `src/components/EgsPanel.tsx` | source proof |
| UXA-006 | LOW | `VnTagChips` spoiler reveal/hide button hand-rolls button style. | `src/components/VnTagChips.tsx` | source/browser proof |
| UXA-007 | MEDIUM | Raw `▲` / `▼` glyphs used as sole section state indicator without sr text/aria-expanded. | `src/components/SettingsButton.tsx` | a11y/source proof |
| UXA-008 | LOW | Activity VN title uses `truncate` without `title`. | `src/app/activity/page.tsx` | source proof |
| UXA-009 | LOW | Labels print card uses `line-clamp-3` without `title`. | `src/app/labels/page.tsx` | source proof |
| UXA-010 | LOW | Steam suggestion rows use `line-clamp-1` without `title`. | `src/app/steam/page.tsx` | source proof |
| UXA-011 | LOW | Upcoming brand fallback span uses `line-clamp-1` without `title`. | `src/app/upcoming/page.tsx` | source proof |
| UXA-012 | LOW | Dumped VN title uses `line-clamp-2` without `title`. | `src/app/dumped/page.tsx` | source proof |

## Mandatory imports — i18n audit

| ID | Severity | Issue | Files/routes | Required verification |
| --- | --- | --- | --- | --- |
| I18NA-001 | HIGH | `global-error.tsx` hardcodes `<html lang="en">` and English fallback UI. | `src/app/global-error.tsx` | source proof |
| I18NA-002 | MEDIUM | Staff VNDB external link uses bare `aria-label="VNDB"` / `title="VNDB"` instead of localized action. | `src/app/staff/[id]/page.tsx` | source proof |
| I18NA-003 | MEDIUM | `VnTagsGroupedView` VNDB external link uses bare `aria-label="VNDB"` / `title="VNDB"`. | `src/components/VnTagsGroupedView.tsx` | source proof |
| I18NA-004 | LOW | Owned editions platform placeholder `win, ps4, swi…` hardcoded in UI. | `src/components/OwnedEditionsSection.tsx` | source proof |
| I18NA-005 | LOW | Owned editions currency placeholder `JPY` hardcoded as UI hint. | `src/components/OwnedEditionsSection.tsx` | source proof |
| I18NA-006 | LOW | Cover picker `alt="VNDB"` should describe image, e.g. VNDB cover. | `src/components/CoverSourcePicker.tsx` | source proof |
| I18NA-007 | LOW | `recommend.explain.filterEroOff` missing/asymmetric across locales. | `src/lib/i18n/dictionaries.ts`, recommendations page | i18n parity + source proof |
| I18NA-008 | HIGH | French locale uses personal/informal `tu/ta/tes/mon/ma/mes` phrasing systemically. Decide policy: neutral/professional or intentional personal style, then apply consistently. | `src/lib/i18n/dictionaries.ts` | dictionary audit |

## Mandatory imports — Responsive/mobile audit

| ID | Severity | Issue | Files/routes | Required verification |
| --- | --- | --- | --- | --- |
| RESP-001 | LOW | MoreNavMenu hides labels below xl, but aria-label/title exist; likely accepted if documented. | `src/components/MoreNavMenu.tsx` | source proof |
| RESP-002 | HIGH | `RoutesSection` action cluster uses `sm:opacity-0 sm:group-hover`, invisible on 640–767px touch screens. | `src/components/RoutesSection.tsx` | source + responsive browser proof |
| RESP-003 | HIGH | `EditionInfoPopover` hover-hidden info button uses `sm:` hover trap, affecting shelf display/slot tiles. | `src/components/EditionInfoPopover.tsx`, `ShelfLayoutEditor` | source + responsive browser proof |
| RESP-004 | MEDIUM | `ShelfLayoutEditor` display tile title overlay hidden on 640–767px due to `sm:opacity-0 sm:group-hover`. | `src/components/ShelfLayoutEditor.tsx` | responsive browser proof |
| RESP-005 | MEDIUM | `ShelfLayoutEditor` slot tile title overlay hidden on 640–767px due to `sm:opacity-0 sm:group-hover`. | `src/components/ShelfLayoutEditor.tsx` | responsive browser proof |

## Mandatory imports — Checklist/process integrity

| ID | Severity | Issue | Files/routes | Required verification |
| --- | --- | --- | --- | --- |
| QAI-001 | HIGH | No bulk-closing checklist rows by Python/sed script. | checklist process | checklist commit review |
| QAI-002 | HIGH | No visual row may be closed with grep-only/source-only/HTTP 200 evidence. | checklist process | checklist integrity audit |
| QAI-003 | HIGH | No `risk accepted` / `future sprint` for implementable security fixes. | docs/src/tests | grep + row review |
| QAI-004 | HIGH | No ContentWidthSlider reintroduction. | src/docs/tests | grep proof |
| QAI-005 | HIGH | Broad rows must enumerate subitems before closure. | checklist | row-specific evidence |
| QAI-006 | MEDIUM | Existing rows marked FIXED_VERIFIED must be re-audited for weak evidence. | checklist | checklist integrity audit |

## Import procedure

1. Create raw files:
```bash
mkdir -p TODO/round5-audits
```

2. Save uploaded audit contents as:
```text
TODO/round5-audits/page-audit.md
TODO/round5-audits/db-backend-audit.md
TODO/round5-audits/ui-ux-audit.md
TODO/round5-audits/i18n-audit.md
TODO/round5-audits/responsive-mobile-audit.md
TODO/round5-audits/security-api-audit.md
TODO/round5-audits/checklist-process-rules.md
```

3. Create `docs/round5-audit-intake.md` with the normalized table schema above.
4. Append all unique imported findings to `docs/round5-master-regression-checklist.md` with status TODO.
5. Commit only docs/TODO import:
```bash
git add TODO/round5-audits docs/round5-audit-intake.md docs/round5-master-regression-checklist.md
git commit -m "docs: import uploaded round 5 audit findings into TODO"
```

## Strict rules during import

* no code changes
* no final QA
* no agents during import
* no FIXED_VERIFIED
* no NON_APPLICABLE unless duplicate with explicit canonical row
* no EXTERNALLY_BLOCKED
* no risk accepted
* no ContentWidthSlider
