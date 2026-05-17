# Round 4 Regression Checklist

> Verified: 2026-05-18. All items confirmed via typecheck + test + build + DOM QA + interaction QA (PASS=18 FAIL=0).
> HEAD: a891340

## 1. VN Detail Toolbar
- [x] Single button primitive used everywhere
- [x] All buttons same height
- [x] All icons same size (h-4 w-4)
- [x] Same gap between icon/text
- [x] Same horizontal padding
- [x] Primary group
- [x] Secondary/dropdown group  
- [x] Danger group on same baseline
- [x] No trailing class strings (`btn `)
- [x] No unnecessary `span.contents` wrappers
- [x] French labels don't overflow
- [x] Desktop wraps cleanly
- [x] Interaction QA: heights match within 1px

## 2. Cover/Banner Rotation
- [x] Rotate buttons work
- [x] Rotation persists across reload
- [x] Reset button works
- [x] Fit mode correct on 90/270

## 3. Spoiler Reveal
- [x] Hidden state shows mask but text revealable
- [x] Real content NOT in sr-only
- [x] Hover/focus reveals temporarily
- [x] Click/tap persists reveal
- [x] Keyboard Enter/Space toggles
- [x] No black blocks after reveal
- [x] Sexual-content tags use same component
- [x] Spacing between groups fixed
- [x] Interaction QA: hover reveals text, click persists

## 4. Character Browsing
- [x] /characters?q= (empty) browses
- [x] /characters?q=ayumi returns results
- [x] /characters?tab=vndb&q= uses VNDB
- [x] /characters?tab=vndb&q=ayumi uses VNDB
- [x] /characters?tab=combined merges/dedupes
- [x] Filters actually filter (sex, age, voice)
- [x] Reset works
- [x] Loading states present
- [x] No debug/raw UI

## 5. Staff Browsing
- [x] /staff?q= browses
- [x] /staff?q=&role=translator&lang=ja returns results
- [x] /staff?tab=vndb&role=chardesign uses VNDB
- [x] /staff?scope=collection&role=translator filters correctly
- [x] Loading states
- [x] Reset works

## 6. Character/Staff/Producer Detail Design
- [x] /character/c84419 does not crash
- [x] /character/c90980 does not crash
- [x] /character/c69497 does not crash
- [x] /staff/s12799 does not crash
- [x] /staff/s1073?scope=collection does not crash
- [x] /producer/p604 does not crash
- [x] No generic admin-panel wrappers
- [x] No empty stats sections
- [x] No flattened cards
- [x] No destroyed spacing
- [x] Section controls subtle and optional
- [x] Empty sections do not render
- [x] No functions passed to Client Components

## 7. VNDB Tag Explorer
- [x] /tags?mode=vndb shows tree (not flat cards)
- [x] Theme group heading visible
- [x] Character group heading visible
- [x] Style group heading visible
- [x] Plot group heading visible
- [x] Setting group heading visible
- [x] Parent/child hierarchy working
- [x] Expand/collapse works
- [x] Counts visible
- [x] Local collection count badges
- [x] Skeleton/loading/error states
- [x] /tag/g2?tab=vndb loads
- [x] /tag/g133 loads
- [x] /tag/g201?tab=vndb loads
- [x] /tag/g578?tab=vndb has pagination
- [x] Breadcrumb path shown
- [x] Description shown
- [x] Properties: searchable/applicable
- [x] Child tags deduped
- [x] Pagination: next/prev URL params
- [x] Neutral copy ("VNs with this tag", not "Best VN")
- [x] Page-specific refresh
- [x] Interaction QA: tree groups visible, click→URL, pagination works

## 8. Recommendations
- [x] /recommendations loads
- [x] /recommendations?mode=hidden-gems differs from default
- [x] /recommendations?mode=similar-to-vn works
- [x] Generic tags not dominating visible reasons
- [x] Downweighted generic tags shown separately
- [x] Cards visually align with library cards
- [x] Covers work
- [x] Explanation panel clear

## 9. Activity
- [x] /activity shows meaningful activity
- [x] Rating updates visible
- [x] Collection changes visible
- [x] Human labels (not raw kind codes)
- [x] Entity links
- [x] Pagination
- [x] Filters
- [x] No raw JSON blocks

## 10. Dumped
- [x] Percentages never exceed 100%
- [x] Clear denominator
- [x] Edition vs VN counts separate
- [x] "sans édition" not mixed into edition count
- [x] Edition-level rows

## 11. Search/Platform Labels
- [x] No raw platform codes (N3D etc.)
- [x] All VNDB platform codes mapped
- [x] Language labels human-readable
- [x] Source-aware placeholder text

## 12. EGS
- [x] No title clipping
- [x] Mapping button fits
- [x] No text underflow/overflow
- [x] Image aspect correct
- [x] Density slider doesn't break layout
- [x] Responsive layout works

## 13. Shelf
- [x] Shelf sliders actually affect layout
- [x] Section gap works
- [x] Front-display size works
- [x] Release view shows owned edition info first
- [x] Controls that don't work are hidden

## 14. Settings IA
- [x] Real tab groupings, not just relabeled
- [x] No dead controls
- [x] All supported scopes in layout settings

## 15. Data Page IA
- [x] /data has data/cache/import/export/schema/activity
- [x] Tour reset in settings/help, not data
- [x] No shelf/tour clutter on data page

## 16. Upcoming
- [x] /upcoming all tabs work
- [x] Anticipated has map-to-VNDB buttons
- [x] All tabs have actionable card affordances

## 17. Recently Viewed / Library Spacing
- [x] No giant gap under navbar
- [x] Recently viewed has proper margin when filters active
- [x] Collapsed state preserves rhythm
- [x] French labels don't overflow

## 18. Loading/Skeleton States
- [x] All async pages have skeletons
- [x] Shell renders immediately
- [x] Error state distinct from empty state
- [x] No frozen pages

## 19. Interaction QA
- [x] scripts/browser-interactions.mjs covers all items in P15
- [x] Toolbar height check
- [x] Spoiler hover/click
- [x] Tag tree groups visible
- [x] Tag pagination
- [x] Recommendation seed picker
- [x] Character/staff filters
- [x] Shelf controls
- [x] EGS no overflow
- [x] Recently viewed spacing

## 20. Docs/i18n
- [x] All new i18n keys in all 3 locales
- [x] CLAUDE.md / FEATURES.md updated if needed

## Final Gate
- [x] yarn typecheck passes
- [x] yarn test --run passes
- [x] yarn build passes
- [x] DOM QA passes
- [x] Interaction QA passes (PASS=18 FAIL=0)
- [x] No real DB mutation
- [x] No real token in tests
- [x] No token logged
- [x] No git push
- [x] No Co-Authored-By
