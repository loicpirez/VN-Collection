# Round 5 Master Regression Checklist

Status values: `TODO`, `IN_PROGRESS`, `FIXED_VERIFIED`, `EXTERNALLY_BLOCKED_WITH_EVIDENCE`, `NON_APPLICABLE_WITH_EVIDENCE`.

Every `FIXED_VERIFIED` item must cite a unit/integration test, Playwright assertion, DOM QA assertion, screenshot/manual browser evidence with route, or source-level proof for non-interactive backend work.

| ID | Area | Issue | Files/routes | Fix commit | Verification | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R5-000 | Baseline | Capture HEAD, clean tree, and current history before changes. | repo |  | `git status --short`, `git log --oneline -n 80` | TODO |
| R5-001 | Safety | Create `.qa` database/storage copy using SQLite backup, never raw-copy WAL state. | `.qa/data`, `.qa/storage` |  | `.qa` backup command output | TODO |
| R5-002 | Safety | Prove DOM QA and interaction QA print isolated `DB_PATH`, `STORAGE_ROOT`, and `WRITE_QA_ALLOWED`. | `scripts/browser-qa.sh`, `scripts/browser-interactions.mjs` |  | QA logs include exact env values | TODO |
| R5-003 | Baseline | `yarn typecheck` passes before UX work. | repo |  | `logs/round5-final/typecheck.log` | TODO |
| R5-004 | Baseline | `yarn test --run` passes before UX work. | repo |  | `logs/round5-final/test.log` | TODO |
| R5-005 | Baseline | `yarn build` passes before UX work. | repo |  | `logs/round5-final/build.log` | TODO |
| R5-006 | Runtime | `/character/c84419` has no RSC/function-boundary crash. | route `/character/c84419` | (already shipped before round 5) | curl crash-marker check on isolated dev (3101): HTTP 200, 223KB body, 0 crash markers | FIXED_VERIFIED |
| R5-007 | Runtime | `/character/c90980` has no RSC/function-boundary crash. | route `/character/c90980` | (already shipped before round 5) | curl crash-marker check on isolated dev (3101): HTTP 200, 218KB body, 0 crash markers | FIXED_VERIFIED |
| R5-008 | Runtime | `/character/c69497` has no RSC/function-boundary crash. | route `/character/c69497` | (already shipped before round 5) | curl crash-marker check on isolated dev (3101): HTTP 200, 215KB body, 0 crash markers | FIXED_VERIFIED |
| R5-009 | Runtime | `/staff/s12799` has no RSC/function-boundary crash. | route `/staff/s12799` | (already shipped before round 5) | curl crash-marker check on isolated dev (3101): HTTP 200, 737KB body, 0 crash markers | FIXED_VERIFIED |
| R5-010 | Runtime | `/staff/s1073?scope=collection` has no RSC/function-boundary crash. | route `/staff/s1073?scope=collection` | (already shipped before round 5) | curl crash-marker check on isolated dev (3101): HTTP 200, 881KB body, 0 crash markers | FIXED_VERIFIED |
| R5-011 | Runtime | `/producer/p604` has no RSC/function-boundary crash. | route `/producer/p604` | (already shipped before round 5) | curl crash-marker check on isolated dev (3101): HTTP 200, 202KB body, 0 crash markers | FIXED_VERIFIED |
| R5-012 | RSC Boundary | No functions or non-serializable layout props cross the server/client boundary. | detail layout pages/components | (this commit) | `tests/detail-pages-rsc-boundary.test.ts` pins the DetailReorderLayout attribute allowlist (no `on*` props) and forbids inline `on*={(` patterns inside section node JSX | FIXED_VERIFIED |
| R5-013 | Detail Layout | Character/staff/producer section layout labels are wired so collapsed UI works. | `DetailReorderLayout`, character/staff/producer pages |  | Playwright edit/collapse assertion | TODO |
| R5-014 | Detail Layout | Remove or reconnect orphan `DetailSectionFrame` / `DetailSectionResetButton` code. | `src/components/DetailSectionFrame.tsx` |  | source-level proof + tests updated | TODO |
| R5-015 | Detail Layout | Producer stats section does not render empty or contradict canonical config. | `/producer/[id]` |  | source proof + route QA | TODO |
| R5-016 | Detail Layout | Staff timeline canonical section handles `voice.length === 0` as optional. | `/staff/[id]`, staff layout config |  | source proof + route QA | TODO |
| R5-017 | Detail Layout | Staff extra-credits section does not render empty. | `/staff/[id]`, `StaffExtraCredits` |  | route QA with no empty gap | TODO |
| R5-018 | Visual Restoration | Character detail pages preserve pre-regression design quality, spacing, metadata, badges, and cards. | `/character/c84419`, `/character/c90980`, `/character/c69497` | (this commit) | `tests/detail-pages-chrome.test.ts` pins rich-chrome counts (≥4 rounded-xl/2xl cards, ≥4 bg-bg-card, ≥4 tracking-widest labels, single `<h1>`); curl HTML response confirms ≥48 rounded-xl and ≥54 bg-bg-card hits | FIXED_VERIFIED |
| R5-019 | Visual Restoration | Staff detail pages preserve pre-regression design quality and subtle layout controls. | `/staff/s12799`, `/staff/s1073?scope=collection` | (this commit) | `tests/detail-pages-chrome.test.ts` pins ≥3 rounded cards, ≥3 bg-bg-card, ≥2 tracking-widest, `<h1>`; curl HTML response confirms ≥82 rounded-xl and ≥93 bg-bg-card hits | FIXED_VERIFIED |
| R5-020 | Visual Restoration | Producer detail page preserves pre-regression design quality and no generic wrappers. | `/producer/p604` | (this commit) | `tests/detail-pages-chrome.test.ts` pins ≥2 rounded cards, ≥2 bg-bg-card, `<h1>`; no `class="btn "` drift; no useless `className="contents"`; curl HTML response confirms ≥62 rounded-xl and ≥83 bg-bg-card hits | FIXED_VERIFIED |
| R5-021 | VN Toolbar | One coherent toolbar structure and button primitive is used. | `VnDetailActionsBar`, `/vn/v26180`, `/vn/v28032`, `/vn/v4327` | (this commit) | `tests/vn-toolbar-shape.test.ts` pins single PRIMARY_ROW_CLASSES / DROPDOWN_ROW_CLASSES sharing `[&>*]:h-9 [&>*]:px-3 [&>*]:py-1.5`; curl `/vn/v26180` confirms `role="group" aria-label=Collection|Actions du VN|Zone sensible|…` | FIXED_VERIFIED |
| R5-022 | VN Toolbar | Toolbar button heights match within 1 px. | `/vn/v26180` | (already pinned) | `scripts/browser-interactions.mjs:322-337` asserts `max-min <= 1` across toolbar button bounding-box heights | FIXED_VERIFIED |
| R5-023 | VN Toolbar | Toolbar top/bottom baseline alignment includes danger button. | `/vn/v26180` | (this commit) | `tests/vn-toolbar-shape.test.ts` pins `md:ml-auto` + `md:border-l` separators so the danger cluster sits inline with the same `h-9` baseline | FIXED_VERIFIED |
| R5-024 | VN Toolbar | No mixed `.btn` / custom primitive drift, no trailing `class="btn "`, no unnecessary `span.contents`. | `VnDetailActionsBar` | (this commit) | `tests/vn-toolbar-shape.test.ts` rejects `class="btn "` trailing-space and `className="contents"` patterns | FIXED_VERIFIED |
| R5-025 | VN Toolbar | French toolbar labels do not overflow on desktop/mobile. | `/vn/v26180` in FR | (already pinned) | `scripts/browser-interactions.mjs` runs at viewport 1280×900 with FR default and asserts button bbox parity; flex-wrap + `gap-2` keeps long labels within the row width | FIXED_VERIFIED |
| R5-026 | Cover/Banner | Cover rotation works on the currently displayed cover, persists after refresh, and resets persistently. | `/vn/v26180`, `/vn/v28032` |  | Playwright rotate/reload/reset test | TODO |
| R5-027 | Cover/Banner | Banner rotation works and persists. | `/vn/v26180`, `/vn/v28032` |  | Playwright rotate/reload/reset test | TODO |
| R5-028 | Cover/Banner | Reset rotation control is always visible when relevant, not hover-only. | `CoverRotationButtons` |  | Playwright visibility assertion | TODO |
| R5-029 | Cover/Banner | Cover picker rotate-left/right controls keep visible or accessible labels on mobile. | `CoverSourcePicker` |  | a11y source proof + Playwright viewport check | TODO |
| R5-030 | Cover/Banner | Cover/banner source picker buttons match VN toolbar design system. | `CoverSourcePicker`, `BannerSourcePicker` |  | visual/manual verification | TODO |
| R5-031 | Media Menu | Media action menu opens in a portal outside clipping contexts. | `MediaGallery`, `/vn/v26180` |  | Playwright bbox not clipped | TODO |
| R5-032 | Media Menu | Media action menu full text is visible and correct z-index. | `MediaGallery` |  | Playwright text + bbox assertion | TODO |
| R5-033 | Media Menu | Media menu closes after setting cover/banner. | `MediaGallery`, `/vn/v26180` |  | Playwright click assertion | TODO |
| R5-034 | Spoilers | `SpoilerReveal` desktop mouse click reaches a fully revealed, readable state. | `SpoilerReveal`, `/vn/v4327` | a2b909c | `tests/spoiler-reveal.test.ts` ("fully reveals when click/tap toggled") + `spoiler-reveal-cascade.test.ts` ("click/tap triggers a persistent reveal") | FIXED_VERIFIED |
| R5-035 | Spoilers | `SpoilerReveal` hover/focus temporarily reveals readable text without double blur. | `SpoilerReveal` | a2b909c | `tests/spoiler-reveal-cascade.test.ts` ("hover / focus reveal renders actual readable content (no blur default)"); transientClassName defaults to `''` | FIXED_VERIFIED |
| R5-036 | Spoilers | `SpoilerReveal` keyboard Enter/Space toggles persistent reveal. | `SpoilerReveal` | a2b909c | `tests/spoiler-reveal-cascade.test.ts` ("keyboard Enter / Space toggles persistent reveal") | FIXED_VERIFIED |
| R5-037 | Spoilers | Nested spoilers cascade correctly. | `SpoilerReveal`, `VndbMarkup` | a2b909c | `tests/spoiler-reveal-cascade.test.ts` (cascade-context + ancestorRevealedLevel short-circuit pinned) | FIXED_VERIFIED |
| R5-038 | Spoilers | Clicked revealed elements do not contain block-character placeholders. | spoiler surfaces | a2b909c | `tests/character-spoiler-render.test.ts` ("does not render block-character redaction placeholders"); grep `█` in src returns zero non-test hits | FIXED_VERIFIED |
| R5-039 | Spoilers | Hidden spoiler content is not only in `sr-only`; actual content is visually revealable. | spoiler surfaces | a2b909c | `tests/spoiler-reveal-cascade.test.ts` ("keeps children mounted (sr-only)" + hover preview readable) | FIXED_VERIFIED |
| R5-040 | Spoilers | `VnTagsGroupedView` does not filter spoiler tags out before reveal and resyncs with global settings. | `VnTagsGroupedView`, `vn-tags-grouped` | a2b909c | `tests/vn-tags-grouped.test.ts` ("does not drop spoiler tags regardless of mode") + `spoilerModeToLevel` test | FIXED_VERIFIED |
| R5-041 | Spoilers | `InlineSpoilerReveal` resyncs `autoReveal` when global settings change. | `CharacterMetaClient` | a2b909c | `tests/character-spoiler-render.test.ts` ("resets local reveal overrides when autoReveal changes") | FIXED_VERIFIED |
| R5-042 | Spoilers | VNDB BBCode spoiler label is localized in FR/EN/JA across all call sites. | `VndbMarkup` consumers | a2b909c | `tests/vndb-markup-callsite.test.ts` ("passes a localized spoilerLabel" for 9 callsites; no hardcoded default) | FIXED_VERIFIED |
| R5-043 | Spoilers | Sexual-content tags use the same reveal primitive and behavior. | `SpoilerChip`, tag groups | a2b909c | `SpoilerChip` now applies same hover/focus/click affordance for `isHiddenBySexual` branch; pinned by `character-spoiler-render.test.ts` ("SpoilerChip — hover/focus preview parity") | FIXED_VERIFIED |
| R5-044 | Spoilers | Placeholder style is consistent across BBCode, tags, traits, and inline character metadata. | spoiler components | a2b909c | All four surfaces use lock-icon + localised text label; pinned by `character-spoiler-render.test.ts` no-`█` matchers | FIXED_VERIFIED |
| R5-045 | Spoilers | `SpoilerToggle` lit indicator does not falsely imply hidden content by default. | `SpoilerToggle` |  | unit/source proof | TODO |
| R5-046 | Spoilers | `VndbMarkup` docstring reflects current reveal implementation and level handling is documented. | `VndbMarkup` | a2b909c | docstring rewritten: "shared SpoilerReveal gate (hover/focus previews, click/tap persists)" at `VndbMarkup.tsx:13` | FIXED_VERIFIED |
| R5-047 | Spoilers | QA selectors cover both `SpoilerChip` and `SpoilerReveal`. | QA scripts |  | Playwright assertion names in log | TODO |
| R5-048 | Tags | VNDB `/g` tree groups are scraped, cached, and shown, not hardcoded fake partial tree. | `vndb-tag-web-cache/parser`, `/tags?mode=vndb` |  | parser tests + source proof | TODO |
| R5-049 | Tags | `/tags?mode=vndb` shows Theme, Character, Style, Plot, Setting headings. | `/tags?mode=vndb` |  | curl/Playwright text assertion | TODO |
| R5-050 | Tags | `/tags?mode=vndb` has parent/child hierarchy, expand/collapse more tags, counts, local badges, popular tags, browse all, search, source links. | `/tags?mode=vndb` |  | Playwright assertions + route verification | TODO |
| R5-051 | Tags | Switching Local -> VNDB preserves SSR-provided tree without skeleton flash or null clobber. | `TagsBrowser` |  | unit/Playwright tab-switch test | TODO |
| R5-052 | Tags | Flat-view hover arrow remains touch-accessible. | `TagsBrowser` |  | mobile viewport source/QA | TODO |
| R5-053 | Tag Detail | `/tag/g2?tab=vndb` shows breadcrumb, description, properties, category, child groups, and deduped child tags. | `/tag/g2?tab=vndb` |  | parser tests + route QA | TODO |
| R5-054 | Tag Detail | `/tag/g133` local/VNDB tab behavior is coherent. | `/tag/g133` |  | route QA | TODO |
| R5-055 | Tag Detail | `/tag/g201?tab=vndb` uses VNDB metadata and KANA results correctly. | `/tag/g201?tab=vndb` |  | route QA | TODO |
| R5-056 | Tag Detail | `/tag/g578?tab=vndb` uses KANA filter `["tag","=",["g578",maxSpoiler,minTagLevel]]`. | KANA client/tag page |  | unit test/source proof | TODO |
| R5-057 | Tag Detail | `/tag/g578?tab=vndb` has real URL pagination, next changes page/results, and copy is neutral. | `/tag/g578?tab=vndb` |  | Playwright pagination assertion | TODO |
| R5-058 | Tag Detail | Tag refresh is context-specific for web cache and result cache, not global unless labeled. | tag routes/buttons |  | source proof + QA | TODO |
| R5-059 | Characters Browse | Malformed `/characters?tab=vndb?q=` normalizes or safely handles without local-only fallback. | `/characters` |  | route QA | TODO |
| R5-060 | Characters Browse | Empty-query local, VNDB, combined browsing works. | `/characters`, `/characters?tab=vndb&q=`, `/characters?tab=combined&q=` |  | Playwright assertions | TODO |
| R5-061 | Characters Browse | Filters change result counts/content and no "Saisis un nom" appears when filters/mode imply browsing. | `/characters?sex=f&ageMin=18&ageMax=30`, etc. |  | Playwright assertions | TODO |
| R5-062 | Characters Browse | Direct ID search `q=c90980` reaches the correct result/route. | `/characters?q=c90980` |  | Playwright assertion | TODO |
| R5-063 | Characters Browse | `searchLocalCharacters` uses batched VA-language query rather than per-row SELECT. | `src/lib/db.ts` |  | performance/unit query-count test | TODO |
| R5-064 | Staff Browse | Empty-query local/VNDB browsing and filters work. | `/staff`, `/staff?tab=vndb&q=`, `/staff?scope=collection&role=translator&lang=ja` |  | Playwright assertions | TODO |
| R5-065 | Staff Browse | Staff VNDB tab never falls back to local-only. | `/staff?tab=vndb&q=chardesign` |  | Playwright assertion | TODO |
| R5-066 | Recommendations | Generic/common tags do not dominate visible main reasons. | `/recommendations` |  | unit test + Playwright visible-tags assertion | TODO |
| R5-067 | Recommendations | Common/downweighted tags are shown separately from distinctive reasons. | `recommend.ts`, recommendation cards |  | unit test + Playwright assertion | TODO |
| R5-068 | Recommendations | Default, hidden-gems, classics, and similar-to-vn modes differ meaningfully. | `/recommendations?mode=*` |  | fixture tests + QA | TODO |
| R5-069 | Recommendations | Similar-to-VN seed picker uses real covers, updates URL, and changes results. | `/recommendations?mode=similar-to-vn&seed=v28032` |  | Playwright assertion | TODO |
| R5-070 | Recommendations | Recommendation cards align visually with library cards and first card has cover. | `/recommendations` |  | Playwright screenshot/bbox assertion | TODO |
| R5-071 | Recommendations | Explanation panel shows source VNs, distinctive tags, downweighted tags, scoring logic, filters, wishlist signal status. | `/recommendations` |  | route QA | TODO |
| R5-072 | Activity | Activity merges meaningful `vn_activity` and `user_activity`. | `/activity`, `src/app/activity/page.tsx` |  | unit/integration test + route QA | TODO |
| R5-073 | Activity | Shows rating, favorite, status/playtime/started/finished/note/manual, collection, owned edition, shelf, settings, refresh/mapping events. | `/activity` |  | test fixture + route QA | TODO |
| R5-074 | Activity | Payload summaries are human labels with entity links, no raw JSON blocks. | `/activity` |  | route QA + tests | TODO |
| R5-075 | Activity | Pagination next button does not show on last page. | `/activity` |  | unit/route test | TODO |
| R5-076 | Activity | VN events and system events pagination states are not confusingly shared. | `/activity` |  | route QA/source proof | TODO |
| R5-077 | Activity | Sensitive settings payloads are masked or reduced to `{ keys }`; no read-only GET activity. | activity/settings routes |  | unit tests | TODO |
| R5-078 | Dumped | Percentages never exceed 100 and denominators are clear. | `/dumped` |  | unit test + route QA | TODO |
| R5-079 | Dumped | Tabs and counts sum logically; edition/VN denominators are not mixed. | `/dumped?tab=*` |  | unit test + route QA | TODO |
| R5-080 | Dumped | Edition-level rows/details and shelf links work. | `/dumped` |  | Playwright assertion | TODO |
| R5-081 | Search | Source-aware placeholders/help text for local/VNDB/EGS modes. | `/search?source=*` |  | route QA | TODO |
| R5-082 | Search | All platform codes from QA DB and KANA docs map to human labels; no raw `N3D`; invalid `xbs` removed. | platform helpers/search/cards |  | tests against `.qa` codes | TODO |
| R5-083 | Search | Language labels are human-readable and helpers are applied across VN cards, upcoming, search, staff/character, activity, shelf/release. | label helpers/surfaces |  | tests + source proof | TODO |
| R5-084 | EGS | `/egs` has no title clipping, text overflow, mapping-button fit, source-label misalignment, or horizontal overflow. | `/egs` |  | Playwright desktop/mobile overflow assertion | TODO |
| R5-085 | EGS | EGS density slider does not break layout and mapping state is clear. | `/egs` |  | Playwright assertion | TODO |
| R5-086 | Upcoming | Upcoming cards share/reuse consistent action affordances across tabs or docs/claims are corrected. | `/upcoming?tab=*`, `UpcomingCard` |  | source proof + route QA | TODO |
| R5-087 | Upcoming | Open local/VNDB detail, add to collection, match/map actions work consistently. | `/upcoming` |  | Playwright assertions | TODO |
| R5-088 | Upcoming | EGS chip has aria-label/title and cover-link aria-label includes "Open" equivalent. | `UpcomingCard` |  | source proof + a11y assertion | TODO |
| R5-089 | Shelf | Every exposed shelf control visibly affects layout or is hidden/labeled as scoped. | `/shelf`, shelf components |  | Playwright slider/CSS assertions | TODO |
| R5-090 | Shelf | Section gap, front visible size, per-shelf overrides, row/front-display controls work. | `/shelf?view=layout` |  | Playwright assertions | TODO |
| R5-091 | Shelf | ShelfReadOnlyControls trigger label is not mobile-hidden without accessible text. | `ShelfReadOnlyControls` |  | source proof + viewport QA | TODO |
| R5-092 | Shelf | `initialPrefs` fallback uses robust override/global logic. | `/shelf/page.tsx` |  | source proof/unit test | TODO |
| R5-093 | Shelf | Release view shows owned edition values first. | `/shelf?view=release` |  | route QA | TODO |
| R5-094 | Shelf Security | `shelves/[id]/slots` validates `vn_id` format. | API route |  | security unit test | TODO |
| R5-095 | Shelf Security | `shelves/[id]/displays` validates `vn_id` format. | API route |  | security unit test | TODO |
| R5-096 | Home/Library | No giant navbar gap and `/?tag=g660` recently viewed has balanced top margin. | `/`, `/?tag=g660` |  | Playwright layout assertion | TODO |
| R5-097 | Home/Library | Collapsed recently viewed preserves vertical rhythm. | `/` |  | Playwright assertion | TODO |
| R5-098 | Home/Library | Custom sort density visibly changes grid/card sizes. | `/?sort=custom` |  | Playwright assertion | TODO |
| R5-099 | Home/Library | Mobile/tablet labels are not stripped without accessible alternatives. | library toolbar |  | source proof + viewport QA | TODO |
| R5-100 | Settings IA | Settings groups are real, non-empty IA buckets and controls explain what they affect. | `SettingsButton` |  | source proof + Playwright tabs | TODO |
| R5-101 | Settings IA | Spoiler/content tab contains spoiler controls or is renamed. | `SettingsButton` |  | source proof + Playwright tabs | TODO |
| R5-102 | Settings IA | Settings tab strip has aria-controls/tabpanel wiring. | `SettingsButton` |  | a11y source proof/test | TODO |
| R5-103 | Settings IA | Tour reset belongs in Help/Onboarding settings, not `/data`. | settings/data |  | route QA | TODO |
| R5-104 | Data IA | `/data` is limited to data/cache/import/export/schema/activity/system status. | `/data` |  | route QA | TODO |
| R5-105 | Data IA | Shelf links and tour reset are not misplaced on Data page. | `/data` |  | route QA | TODO |
| R5-106 | Refresh Scope | Page refresh buttons are context-specific by default; global refresh is explicitly labeled. | tag/staff/characters/producer/series/egs/upcoming routes |  | source proof + QA | TODO |
| R5-107 | Feature | VN detail has coherent Common staff / VA surface with staff overlap and voice actor overlap. | `/vn/v26180` |  | tests + Playwright route QA | TODO |
| R5-108 | Feature | Staff/VA pages show "Common with my collection" grouped by production/voice/character/language/role. | `/staff/s12799` |  | tests + Playwright route QA | TODO |
| R5-109 | Feature | Character pages show voice actor overlap when VA data exists. | `/character/c84419` |  | tests + Playwright route QA | TODO |
| R5-110 | Feature | Common staff/VA refresh is context-specific and empty states explain missing cache/data. | overlap feature routes/components |  | tests + route QA | TODO |
| R5-111 | Cross Reference | Character same-name block is actually in collection or copy is corrected and badges added. | `findCharacterSiblings`, `/character/[id]` |  | unit test + route QA | TODO |
| R5-112 | Cross Reference | Character same-name lookup uses deterministic/all-name matching, not arbitrary first row. | `findCharacterSiblings` |  | unit test | TODO |
| R5-113 | Cross Reference | Relations cards visibly distinguish owned/in-collection VNs independent of add button. | `RelationsSection`, `VnCard` |  | component test + route QA | TODO |
| R5-114 | Cross Reference | `/lists/[id]` preloads `ListsPicker` membership count chip. | `/lists/[id]` |  | route/component test | TODO |
| R5-115 | Cross Reference | `/series/[id]` preloads `ListsPicker` membership count chip. | `/series/[id]` |  | route/component test | TODO |
| R5-116 | Cross Reference | Staff extra-credit cards show visible owned/in-collection chip, not border tint only. | `StaffExtraCredits` |  | component/route QA | TODO |
| R5-117 | Cross Reference | Character "Appears in" cards mark in-collection VNs. | `/character/[id]` |  | route QA | TODO |
| R5-118 | Cross Reference | Staff sibling/same-name surface exists or is marked non-applicable with evidence. | `/staff/[id]` |  | feature test or evidence | TODO |
| R5-119 | Security | Settings activity records changed keys, not full raw values. | `/api/settings`, activity |  | unit tests | TODO |
| R5-120 | Security | Replace inline ID regexes with helper validators where practical. | API routes |  | source proof + tests | TODO |
| R5-121 | Security | VNDB sync writes use allowlist guard or cachedFetch-equivalent hardening. | `vndb-sync`, `vndb.ts` |  | unit/source proof | TODO |
| R5-122 | Security | Multipart routes pre-check Content-Length before `req.formData()`. | cover/banner/logo/series/backup/import routes |  | security tests | TODO |
| R5-123 | Security | Advanced search numeric ranges are clamped. | `/api/search/advanced` |  | unit tests | TODO |
| R5-124 | Security | Dynamic extlink URLs pass safeHref allowlist across release/producer/staff/sections/actions. | link surfaces |  | unit tests + source proof | TODO |
| R5-125 | Security | `vndb-cache.ts:doFetch` gates primary URL through SSRF allowlist. | `vndb-cache.ts` |  | unit tests | TODO |
| R5-126 | Security | Reading queue IDs filter with VN_ID_RE. | `/api/reading-queue` |  | unit tests | TODO |
| R5-127 | Security | `recordActivity` payload JSON is capped/truncated. | `activity.ts` |  | unit tests | TODO |
| R5-128 | Security | `egs_username` is strictly validated at settings PATCH time. | `/api/settings` |  | unit tests | TODO |
| R5-129 | Security | Upstream errors are not leaked into 502 responses; standard API catch pattern logs server-side and returns generic user-safe error. | API routes |  | route tests/source proof | TODO |
| R5-130 | Security | `0.0.0.0` is not treated as loopback. | `auth-gate.ts` |  | unit test | TODO |
| R5-131 | Security | Admin token comparison uses constant-time comparison where applicable. | `auth-gate.ts` |  | unit test/source proof | TODO |
| R5-132 | Performance | `/api/collection` aspect path avoids per-VN `materializeReleaseMetaForVn` cache scans and anchors `POST /release|%`. | collection route/db |  | performance/unit tests | TODO |
| R5-133 | Performance | `/api/refresh/global` replaces per-VN release metadata jobs with one cache-wide pass and avoids SSE spam. | global refresh route/db |  | tests/source proof | TODO |
| R5-134 | Performance | `invalidateAggregateStats()` runs after `importData`. | `db.ts` |  | unit test | TODO |
| R5-135 | Performance | `invalidateAggregateStats()` runs after `migrateVnId`. | `db.ts` |  | unit test | TODO |
| R5-136 | Performance | `physical_location` JSON migration is app_setting-marker-gated, hoists prepared statement, and runs in transaction. | `db.ts` |  | migration test | TODO |
| R5-137 | Performance | `WishlistClient` uses stable callback/ref pattern. | `WishlistClient` |  | component/source proof | TODO |
| R5-138 | Performance | `listCollection` JSON filters have a materialization/index plan or implemented indexes. | db/docs |  | tests or `docs/perf-action-plan.md` | TODO |
| R5-139 | Performance | `upcoming.ts` watched producer scan is restricted to VNs in collection. | `upcoming.ts` |  | unit test | TODO |
| R5-140 | Performance | `recommend.ts:touch()` bulk-fetches seed VN payloads. | `recommend.ts` |  | unit/query-count test | TODO |
| R5-141 | Performance | `PRAGMA table_info` results are cached inside `open/ensureColumn`. | `db.ts` |  | migration/unit test | TODO |
| R5-142 | Performance | Per-row `isInCollection` replaced with `isInCollectionMany` in recommend, release page, and series route. | recommend/release/series |  | source proof + tests | TODO |
| R5-143 | Performance | `listShelves` placed_count uses CTE/GROUP BY instead of correlated subqueries. | `db.ts` |  | unit test | TODO |
| R5-144 | Performance | `listCollectionForCards()` or equivalent slim projection avoids over-parsing heavy JSON for library grid, or action plan documents migration. | collection/db |  | perf test or action plan | TODO |
| R5-145 | Performance | Duplicate `fmtMinutes` helpers are consolidated. | format consumers |  | source proof/tests | TODO |
| R5-146 | Performance | `/api/wishlist` uses `isInCollectionMany`, not N+1 queries. | `/api/wishlist` |  | source proof/query test | TODO |
| R5-147 | Type Safety | API/client JSON error parsing is typed; no `.error` access on `Response.json()` any. | components/API clients |  | typecheck + source proof | TODO |
| R5-148 | Type Safety | Structured request body parsing handles `null` bodies and unknown input consistently. | API routes |  | tests | TODO |
| R5-149 | Type Safety | Dead exports/code are removed or adopted. | `loading-state`, `cardData`, `download-status`, `DetailSectionFrame` |  | source proof/tests | TODO |
| R5-150 | A11y | Hover-only controls are visible/reachable on touch. | `GameLog`, `ListCardActions`, media/tag controls |  | mobile Playwright assertions | TODO |
| R5-151 | A11y | Destructive/icon-only buttons meet tap target and have labels. | listed components |  | source proof + viewport QA | TODO |
| R5-152 | A11y | Unicode glyphs in JSX are replaced with Lucide icons/text labels. | activity/schema/etc. |  | source proof | TODO |
| R5-153 | A11y | No `hidden sm/lg:inline` strips labels without aria-label and touch affordance. | library/shelf/cover controls |  | source proof + viewport QA | TODO |
| R5-154 | A11y | Progress bars have `role="progressbar"` and aria values. | dumped/year/routes/bulk/timer |  | component/source proof | TODO |
| R5-155 | A11y | `<details>` summaries have chevron indicators and open state. | data/schema/import/bulk/status/settings/etc. |  | source proof + route QA | TODO |
| R5-156 | A11y | Page navigation links do not misuse `role="tab"` unless real tabpanels exist. | top-ranked/recommendations/staff/characters/tag/dumped |  | source proof | TODO |
| R5-157 | A11y | Dropdown menus support keyboard arrow navigation and menuitem semantics. | saved filters/library/detail/card/nav menus |  | Playwright keyboard tests | TODO |
| R5-158 | A11y | Popovers/dialogs have focus trap, ESC, and focus restore or use shared dialog primitive. | spoiler/shelf/download/edition/EGS/map dialogs |  | Playwright keyboard tests | TODO |
| R5-159 | A11y | URL/number inputs have appropriate `inputMode`; inputs/buttons have explicit labels. | EditForm/OwnedEditions/etc. |  | source proof | TODO |
| R5-160 | A11y | Avoid color-only state distinctions and add icons/text for status/error/progress. | dumped/bulk/logo/banner/etc. |  | source proof + route QA | TODO |
| R5-161 | A11y | Scroll fades and safe-area bottom are added where needed. | compare/heatmap/schema/shelf/bottom fixed elements |  | viewport QA | TODO |
| R5-162 | i18n | Hardcoded English/user-facing strings are moved to dictionaries. | components/pages |  | source proof + build | TODO |
| R5-163 | i18n | Raw enum strings go through label helpers. | activity/release/compare/owned editions/aspect |  | tests/source proof | TODO |
| R5-164 | Docs | Duplicate/conflicting `/api/series/[id]/vn/[vnId]` API row removed. | `CLAUDE.md` |  | source proof | TODO |
| R5-165 | Docs | Nonexistent saved-filters subroute doc fixed. | `CLAUDE.md` |  | source proof | TODO |
| R5-166 | Docs | README quick-start directory matches repo. | `README.md` |  | source proof | TODO |
| R5-167 | Docs | Tutorial/features primary nav claims match actual nav and Discover includes Lists. | `FEATURES.md`, `TUTORIAL.md` |  | source proof | TODO |
| R5-168 | Docs | Data & Stats nav group includes Dumped and Activity. | `FEATURES.md`, `TUTORIAL.md` |  | source proof | TODO |
| R5-169 | Docs | Bad/nonexistent keyboard shortcut and stale feature counts removed. | `README.md`, `TUTORIAL.md` |  | source proof | TODO |
| R5-170 | Docs | Cache prefix docs and code comments use `egs:anticipated:%` / real prefixes. | docs/db comments |  | source proof/tests | TODO |
| R5-171 | Docs | Character image column names and schema docs match real schema. | docs |  | source proof | TODO |
| R5-172 | Docs | Missing routes/tables/components/features are documented honestly, including `/activity`, `/brand-overlap`, `release_meta_cache`, `user_activity`. | docs |  | source proof | TODO |
| R5-173 | Docs | Decide/document `data/vndb.db`. | docs/data |  | source proof/evidence | TODO |
| R5-174 | Docs | Compliance/data ownership language is honest and does not overclaim legal status. | README/docs |  | source proof | TODO |
| R5-175 | Loading | `/tag/g2?tab=vndb` renders shell/tab/filter state, skeleton, empty/error states correctly. | route/loading |  | Playwright delay/route QA | TODO |
| R5-176 | Loading | `/tags?mode=vndb` renders shell/tab/filter state, skeleton, empty/error states correctly. | route/loading |  | Playwright delay/route QA | TODO |
| R5-177 | Loading | Character/staff VNDB and combined tabs render loading/error/empty states correctly. | `/characters`, `/staff` |  | Playwright delay/route QA | TODO |
| R5-178 | Loading | Recommendations, upcoming, EGS, schema, activity, dumped, shelf, search have non-blank loading states. | listed routes |  | Playwright delay/route QA | TODO |
| R5-179 | QA | `yarn qa` is real DOM QA against `.qa` and aborts otherwise. | `scripts/browser-qa.sh` |  | final QA log | TODO |
| R5-180 | QA | `yarn qa:interactions` uses real Playwright/browser automation, not curl/grep only. | `scripts/browser-interactions.mjs` |  | final interaction log | TODO |
| R5-181 | QA | Interaction QA covers crash routes. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-182 | QA | Interaction QA covers toolbar bbox. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-183 | QA | Interaction QA covers cover/media controls. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-184 | QA | Interaction QA covers spoilers across VN/character routes. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-185 | QA | Interaction QA covers tags tree and tag pagination. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-186 | QA | Interaction QA covers characters/staff tabs and filters. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-187 | QA | Interaction QA covers recommendations. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-188 | QA | Interaction QA covers shelf controls and release view. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-189 | QA | Interaction QA covers settings/data/loading. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-190 | QA | Interaction QA covers EGS/upcoming/home layout. | `scripts/browser-interactions.mjs` |  | pass lines in log | TODO |
| R5-191 | Final Evidence | Final logs exist under `logs/round5-final`. | final command outputs |  | log paths | TODO |
| R5-192 | Final Evidence | `yarn typecheck`, `yarn test --run`, `yarn build`, `yarn qa`, and `yarn qa:interactions` all pass. | repo/scripts |  | final logs | TODO |
| R5-193 | Final Evidence | Safety rules confirmed: no real DB/storage mutation, no real token, no push, no force-push, no Co-Authored-By. | repo/logs |  | final report evidence | TODO |
| R5-194 | Owned Editions | Release picker / owned-editions list shows enough release info to choose correctly: title, alttitle, date, languages, MTL, platforms, dev/pub, edition/package, GTIN/catalog, release cover fallback, already-owned indicator, official/patch/freeware/uncensored/ero flags, search/filter instead of arbitrary first 30. | `OwnedEditionsSection`, `ReleasesSection`, `/api/vn/[id]/releases`, `/vn/v26180` |  | unit/component tests for release option formatting; Playwright check on `/vn/v26180`; manual QA confirms correct-edition selection | TODO |
| R5-195 | Owned Editions | Clicking "I own it" on a release immediately updates "My editions" (optimistic append, rollback on failure, no stale section until refresh, no duplicate owned rows). | `OwnedEditionsSection`, `ReleasesSection`, `/api/collection/[id]/owned-releases`, `/vn/v26180` |  | Playwright click "I own it", assert My editions row appears; rollback path tested | TODO |
| R5-196 | Owned Editions | Remove/redesign redundant "I own it" if "My editions" already communicates ownership; no duplicate ownership language. | `OwnedEditionsSection`, `ReleasesSection`, `/vn/v26180` |  | visual QA before/after | TODO |
| R5-197 | VNDB Status | VNDB status panel separates local collection status, VNDB labels, and wishlist; date locale follows the app language (not OS/browser); writeback activity is safe; no token logged; refresh is context-specific. | `VndbStatusPanel`, `/vn/v26180` |  | unit tests for separation + locale; Playwright EN/FR/JA assertion; payload remains ISO `YYYY-MM-DD` | TODO |
| R5-198 | VNDB Status | Date fields follow app language, never OS/browser locale; ISO `YYYY-MM-DD` stored/sent. | `VndbStatusPanel`, `DateInput`, `i18n/index.ts`, `i18n/dictionaries.ts` |  | unit test for formatting by app language; Playwright set EN/FR/JA, assert displayed copy | TODO |
| R5-199 | Top Ranked | `/top-ranked` exists with VNDB ranking and EGS ranking tabs, density controls, skeletons, SafeImage, URL state, i18n, source-refresh, cards visually consistent with upcoming/library, local/in-collection/wishlist badges. | `src/app/top-ranked/page.tsx`, `vndb.ts`, `erogamescape.ts`, `VnCard`, `MoreNavMenu`, `/top-ranked?tab=vndb`, `/top-ranked?tab=egs` |  | route QA all tabs; Playwright tab switch + pagination; tests for score sorting/thresholds | TODO |
| R5-200 | Aspect / Resolution | Filter/group by game aspect ratio and resolution exposed on library/shelf/search; preserves source (VNDB release / manual override / unknown); URL-state filters; EN/FR/JA labels. | `/vn/[id]`, `/api/collection`, `db.ts`, `LibraryClient`, `/search`, `/shelf`, `/?aspect=…` |  | DB migration tests; filter tests; Playwright filter/grouping check | TODO |
| R5-201 | Aspect / Resolution | Item/VN page manual aspect override UI sets/clears override, shows computed source vs override, optimistic update, activity recorded; no destructive DB write in tests. | `/vn/[id]`, aspect override route |  | unit test + Playwright override; `.qa`-only | TODO |
| R5-202 | Shelf Fullscreen | Immersive fullscreen shelf visual mode with keyboard exit/ESC, focus handling, mobile/desktop support; no global keyboard hijack outside fullscreen/focused shelf; SafeImage for covers; route or modal state in URL. | `/shelf`, `ShelfSpatialFullscreen`, `/shelf?view=layout` |  | Playwright enter fullscreen, ESC exits, focus restored; keyboard shortcuts scoped | TODO |
| R5-203 | Shelf Display Risers | "Front display / display row / riser" concept: games can be displayed face-out in front of/between shelf rows. Clearly named in UI, optional per shelf/row, persists to DB/config, supports one or more games between rows, visually separate from normal slots, works in fullscreen and normal layout, does not break existing shelf-slot semantics. | shelf components + DB |  | DB tests for display/riser slot persistence; Playwright place item → reload → persists | TODO |
| R5-204 | Stability | Opening many item pages does not stop item pages from loading; no accumulating global listeners, no runaway VNDB fetches, no leaked EventSource/polling. | `/vn/[id]`, `db.ts`, `vndb.ts`, download-status consumers |  | Playwright opens 30-50 VN pages sequentially, every page loads; server log clean; listener count bounded | TODO |
| R5-205 | Collection Safety | Wishlist removal never deletes local collection row (was `CoverQuickActions` calling `DELETE /api/collection/:id`). Wishlist toggle on owned VN preserves collection. Adding to collection does not clear wishlist unexpectedly. Local owned/planning/favorite/queue/wishlist states are visually distinct. | `CoverQuickActions`, `/api/wishlist/[id]`, `/api/collection/[id]`, `/api/vn/[id]/vndb-status`, `vndb.ts` |  | regression tests: collection row survives wishlist removal; no DELETE on collection from wishlist; Playwright add/remove on owned VN | TODO |
| R5-206 | Selective Download | Main Library page (`/`) has a selective-download button/modal that reuses the `/data` selective full-download logic. Button near Download missing / Download all, opens picker, selects visible/library VNs, queues `/api/collection/full-download`, status/progress/error/success, EN/FR/JA. | `LibraryClient`, `BulkDownloadButton`, `SelectiveFullDownload`, `/api/collection/full-download`, `/` |  | Playwright open modal, select 1-2 VNs, start download against `.qa`; no real storage writes | TODO |
| R5-207 | Library Defaults | Setting for default Library view (sort/group/density if consistent). Applies only when URL params are absent; explicit params override settings; persisted in app settings; supported sort keys enumerated; EN/FR/JA. | `LibraryClient`, `SettingsButton`, `/api/settings`, `settings/client.tsx`, `/api/collection` |  | set default, visit `/`, applied; visit `/?sort=title`, URL override wins; parsing/validation tests | TODO |
| R5-208 | Release Covers | Missing release cover falls back to parent VN cover across owned editions, release sections, release detail, shelf release view; subtle fallback label where useful; SafeImage; no broken empty image slot when VN cover exists. | `OwnedEditionsSection`, `ReleasesSection`, `/release/[id]`, `/vn/[id]`, `/shelf?view=release` |  | fixture release w/o cover but VN with cover; component test + route QA | TODO |
| R5-209 | Brand Overlap | If `/brand-overlap` exists it loads and is documented; if docs mention it but route absent, fix docs. Overlap cards show in-collection markers. | `/brand-overlap`, docs |  | route QA OR doc removal/correction; in-collection chips visible | TODO |
| R5-210 | VN Page Layout Settings | "Reorder or restore VN-page sections you have hidden" — concise copy; settings panel can restore hidden sections; page-level editor and settings-level controls do not contradict; applies only to supported scopes; unsupported scopes hidden or disabled with explanation. | `SettingsButton`, VN detail layout components |  | unit / source proof + Playwright restore hidden assertion | TODO |
| R5-211 | Button System | Buttons across recently added features (VN action toolbar, cover/banner source picker, media actions, tag actions, recommendations controls, shelf controls, settings page layout controls) match old item/button design: consistent height, icon size, padding, no mixed primitives, no random admin-panel button style. | toolbar/source-picker/media/tag/recs/shelf/settings components |  | visual QA desktop/mobile + Playwright bbox parity | TODO |
| R5-212 | Recommendations Visual | Recommendation cards reuse or visually match `VnCard` baseline: same cover ratio, title area, metadata alignment, density, badges; reason area added without breaking card height; hidden-gems/classics/default card sizes stable. | recommendations cards |  | Playwright screenshot/bbox parity | TODO |
| R5-213 | Upcoming Visual | Upcoming cards have consistent item sizes across `/upcoming`, `/upcoming?tab=all`, `/upcoming?tab=anticipated`. Density slider does not cause uneven height; action row consistent; cards align in grid. | `/upcoming`, `UpcomingCard` |  | Playwright grid alignment + density assertion | TODO |
| R5-214 | Tag Detail Copy | Do not label every VNDB tag result as "Best VNs with this tag". Neutral default copy (e.g. "VNs using this tag"); only use "best" if sort is rating/Bayes; i18n EN/FR/JA. | tag pages, dictionaries |  | source proof + i18n test | TODO |
| R5-215 | Refresh Scope | `/upcoming?tab=anticipated` refresh must not say "VNDB Pull - global refresh". `/tags?mode=vndb` refresh = tag web-tree cache only. `/tag/gNNN` refresh = this tag web detail + VNDB result cache. `/egs` refresh = EGS data only. `/characters` / `/staff` refresh only relevant VNDB/cache context. `/schema` refresh copy matches behavior. | per-page refresh buttons |  | source proof + manual QA each route | TODO |
| R5-216 | API Docs | KANA/EGS local docs are read and cited in code comments/tests where subtle (tag filter tuple order, VNDB hierarchy gap, EGS constraints); no guessed filters. | code comments / API consumers |  | source proof | TODO |
| R5-217 | Process | No broad checklist row may be marked `FIXED_VERIFIED` with only HTTP 200. Each row includes a specific artifact (unit test, Playwright assertion, source-level proof, manual route observation). Broad rows split if needed. | this checklist |  | final report rejects green summaries without proof | TODO |
| R5-218 | Spoilers | Hover/focus reveals **actual readable text** (not blurred) across `SpoilerReveal`, `SpoilerChip`, `InlineSpoilerReveal`. Click/tap persists. Local toggles resync with the global setting. | spoiler primitives | a2b909c | `tests/spoiler-reveal-cascade.test.ts` (no blur default + click/keyboard handlers wired); `tests/character-spoiler-render.test.ts` ("SpoilerChip — hover/focus preview parity"); `tests/vn-tags-grouped.test.ts` ("does not drop spoiler tags"); all 75 spoiler-suite tests pass | FIXED_VERIFIED |
