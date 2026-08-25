# Round 14 full application audit - 2026-08-25

This is an independent audit of the current deployed application after Round
13. Earlier reports are evidence of prior work, not proof that the same
contracts still hold. A row remains `TODO` until the relevant source, tests,
database behavior, browser behavior, and production state have been checked.

Scope: all App Router pages and APIs; library, wishlist, search, VN detail,
shelves, compare, staff, releases, stock, shops, places, map, AliceNet,
settings, downloads, VNDB synchronization, PostgreSQL, loading/error states,
UI/UX, responsive behavior, Firefox/WebKit/Chromium interoperability,
accessibility, i18n, security, typing, performance, testing, documentation,
operations, providers, deployment, backup, and restore.

| ID | Severity | Finding and implementation direction | Location | Status |
| --- | --- | --- | --- | --- |
| R14-I18N-003 | MEDIUM | Producer refresh returned a stable VNDB-outage code, but non-English users saw only a generic error. Centralize code-specific localization with safe English diagnostics and map the producer refresh outage precisely. | producer refresh client and shared API error reader | DONE_WITH_DIFF |
| R14-I18N-002 | HIGH | Stock batch start failures exposed stable invalid-provider, queue-full, and unavailable codes, but the client discarded them and showed only a generic HTTP status outside English. Add the missing typed code, precise copy in all locales, and a localized client mapping. | stock batch API and client | DONE_WITH_DIFF |
| R14-VNDB-004 | HIGH | Wishlist mutations emitted an actionable `listwrite` permission failure, but the typed client contract omitted it and French/Japanese UI reduced it to a generic error. Add stable auth and permission codes, localize all three dictionaries, preserve useful unknown diagnostics in English, and cover both paths. | wishlist mutation API and client | DONE_WITH_DIFF |
| R14-TEST-001 | HIGH | Full coverage initially reported two untested fallback branches in a relation-group key even though each map group is structurally non-empty. Encode that invariant directly and test that replacing the terminal relation resets pagination; rerun the complete PostgreSQL-backed coverage suite until all four metrics are exactly 100%. | `src/components/RelationsSection.tsx`, `tests/RelationsSection.test.tsx` | DONE_WITH_DIFF |
| R14-UX-001 | HIGH | The VN loading cover pulsed as a translucent block over an overlapping translucent banner skeleton. Firefox can composite both animated opacities and make the banner appear as a brighter foreground rectangle. Keep the cover pulse but place it inside an opaque, correctly layered shell matching the final cover geometry. | `src/app/vn/[id]/loading.tsx`, route-loading tests | DONE_WITH_DIFF |
| R14-UX-002 | HIGH | Staff and seiyuu loading routes used a generic tall block or vertical cover grid that did not resemble the final search controls, profile, timeline, or horizontal VN/character credits. Mirror the actual responsive geometry so loading does not replace one page shape with another. | staff list/detail loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-003 | HIGH | Character, top-ranked, producer, and place loading routes used incorrect artwork ratios or unrelated generic card grids. Mirror each destination's real header, controls, card direction, density behavior, statistics, and actions so streamed transitions preserve the final responsive geometry. | character, top-ranked, producer, and place loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-004 | MEDIUM | Statistics flattened distinct summaries, goals, charts, and rankings into eight identical tiles, while Data replaced variable status, action, import, and maintenance surfaces with six identical rectangles. Preserve each page's actual information hierarchy and responsive column changes during loading. | statistics and data loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-005 | HIGH | EGS had two divergent fallbacks built from vertical cover cards, place detail omitted its seven counters and filtering workspace, and Stock omitted recent activity and batch tools. Share the EGS fallback and preserve the real horizontal cards, shop controls, stock history, and batch workspace while these routes stream. | EGS, place detail, and stock loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-006 | MEDIUM | Activity reduced three filters and two independently paginated logs to one generic block and one row list, while Brand overlap added thumbnails that do not exist in its two-column credit cards. Preserve both workflows' actual controls, hierarchy, and responsive row structure during navigation. | activity and brand-overlap loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-007 | MEDIUM | Dumped used vertical cover cards instead of its compact edition-progress rows, while Quotes used 2:3 thumbnails instead of square character avatars and citation text. Mirror their summaries, filters, progress, search, citations, and pagination without introducing unrelated geometry. | dumped and quotes loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-008 | HIGH | Year invented cover grids absent from the final review, Schema collapsed three data sources and a table browser into generic rows, and Steam used vertical VN cards instead of mapping workflows. Mirror the year heatmap/rankings, schema source panels/table, and Steam suggestion/link/search sections. | year, schema, and Steam loading boundaries and geometry tests | DONE_WITH_DIFF |
| R14-UX-009 | HIGH | Recommendations omitted its five modes, explanation, flags, and seed controls; Upcoming used generic rows that disagreed with both density-aware horizontal card variants; Wishlist omitted its final title hierarchy; and the seiyuu loader ignored saved section order while its streamed external covers used a different fixed width. Mirror all final controls and card geometry, share the Upcoming fallback, and honor staff layout order and visibility during loading. | recommendations, upcoming, wishlist, and staff loading boundaries | DONE_WITH_DIFF |
| R14-UX-010 | HIGH | Route placeholders for every density-adjustable surface inherited only the global density, so a page-specific override changed the column count and artwork width when loading resolved. The seiyuu placeholder also used a variable-height chart unlike the fixed 24-pixel timeline, omitted the streamed external-credit section, compacted touch geometry by width alone, and understated the density toolbar. Scope all 22 affected placeholders to their resolved surface, mirror the seiyuu timeline/profile/streaming geometry, and enforce the complete route-to-scope inventory. | shared skeleton boundary; library, people, discovery, place, list, shelf, tag, EGS, upcoming, search, and wishlist loading surfaces | DONE_WITH_DIFF |
| R14-UX-011 | HIGH | Index loading boundaries for Staff, Series, Lists, and Places sat above their `[id]` routes, so real client navigation to a detail page could show the index skeleton even though a correct detail skeleton existed and passed isolated render tests. Isolate each index page, loading state, and error boundary in a URL-transparent route group so detail transitions resolve directly to their own geometry. | nested Staff, Series, Lists, and Places App Router segments | DONE_WITH_DIFF |
| R14-UX-012 | HIGH | `SafeImage` animated every reserved image frame before its intersection observer initiated a request. Long staff and seiyuu pages therefore retained hundreds of off-screen pulse animations after the page itself had settled. Keep far-offscreen frames static, animate only after entering the preload margin, and remove the skeleton after image decoding while preserving the existing responsive lightbox frame. | shared SafeImage lifecycle, long credit pages, VN media lightbox | DONE_WITH_DIFF |
| R14-UX-013 | HIGH | Home navigation replaced its configurable strip composition with one unrelated cover grid and held the Library behind the reading-queue and anniversary queries. Mirror each saved section's order, visibility, collapsed state, and final responsive geometry; stream server feeds independently and do not query sections disabled in settings. | root route loading, home composition, configurable section fallbacks | DONE_WITH_DIFF |
| R14-UX-014 | HIGH | VN character, quote, release, route, and stock sections used different generic placeholders while loading their code and data, then replaced those placeholders with artwork, metadata, action, and price-card geometries. Share destination-shaped fallbacks across both loading phases so the section does not flash, stack, or change dimensions as each chunk resolves. | VN lazy sections, stock panel, shared section skeletons | DONE_WITH_DIFF |
| R14-UX-015 | HIGH | Search used four incompatible loading bodies: the route omitted source tabs and filters, the page Suspense boundary painted unrelated thumbnail rows, VNDB omitted the density toolbar, and EGS/local module loads used generic cover rows. Share source-specific geometry across route, shell, and request phases so tabs, input, filters, density, and each result type stay stable. | Search route, client shell, VNDB/EGS/local result loading | DONE_WITH_DIFF |
| R14-UX-016 | MEDIUM | Steam's route fallback mirrored its three workflows, but each hydrated section replaced that structure with generic text rows while suggestions, stored links, and unlinked games loaded. Reuse one skeleton per workflow so selection controls, link actions, and manual mapping inputs retain their final geometry. | Steam route and client data transitions | DONE_WITH_DIFF |
| R14-UX-017 | HIGH | The Similar seed picker reset its highlighted result in an effect after rendering each new result set. A pointer entering another row before that effect ran could be overwritten back to the first result, making hover and subsequent Enter selection nondeterministic. Reset the index atomically with the result update instead. | Similar VN seed picker | DONE_WITH_DIFF |
| R14-UX-018 | MEDIUM | Owned editions loaded as two generic 56 by 80 thumbnail rows, then expanded into an add toolbar and rich 96 by 144 release cards with metadata and three actions. Preserve the final toolbar, package-cover, metadata-grid, and action geometry while both ownership and release metadata resolve. | VN owned-editions section | DONE_WITH_DIFF |
| R14-UX-019 | HIGH | Shared image placeholders used a high-contrast diagonal gradient while structural skeletons used one restrained surface. Firefox composited the animated image layer more strongly over streamed profile, cover, and banner placeholders, making it appear like a second foreground skeleton. Use the same surface token for all image states, keep deferred off-screen frames static, and pulse only an in-flight visible image. | shared image loading, banners, covers, seiyuu credit artwork | DONE_WITH_DIFF |
| R14-UX-020 | MEDIUM | Trait detail loading painted an unrelated title, paragraph block, and generic thumbnail rows before replacing them with a bordered metadata header, density controls, scope selector, and density-aware horizontal character cards. Mirror the final route geometry and touch behavior. | trait detail loading | DONE_WITH_DIFF |
| R14-UX-021 | MEDIUM | Release detail loading represented direct inventory management as passive generic text rows. Preserve the linked VN identity, relation metadata, owned toggle, edit action, and destructive icon geometry so multi-VN releases do not reflow when they resolve. | release detail inventory loading | DONE_WITH_DIFF |
| R14-UX-022 | MEDIUM | VNDB tag hierarchy loading used three generic row lists before resolving into a two-column accordion tree plus Popular and Recently Added panels. Preserve group headers, tag-chip wraps, ranking cards, and responsive column changes during the request. | tag browser hierarchy loading | DONE_WITH_DIFF |
| R14-UX-023 | MEDIUM | The branch-assignment dialog loaded unassigned providers as three-line content cards, then collapsed each into one label and one assignment action. Preserve the bounded list, one-line identity, and touch-sized row action throughout the fetch. | place provider assignment dialog | DONE_WITH_DIFF |
| R14-UX-024 | HIGH | Lazy-loaded Layout and Integrations settings tabs used the same six generic text rows despite resolving into 26 per-page spacing/density controls or credential, proxy, provider, and quote sections. Preserve each destination hierarchy and the full scroll extent while its chunk loads. | Settings lazy-tab loading | DONE_WITH_DIFF |
| R14-UX-025 | MEDIUM | Seiyuu detail loading always reserved three aliases and a three-line biography although both profile fields are optional. Retain stable identity, credit counters, tools, scope, and credit sections without introducing a large conditional block that contracts after resolution. | staff detail profile loading | DONE_WITH_DIFF |
| R14-UX-026 | HIGH | Lazy-loading the destructive stock-cache confirmation injected two generic rows into the VN stock panel before replacing them with a modal. Keep loading in the modal layer and reserve the final title, message, and two-action geometry without shifting the underlying page. | VN stock clear-cache dialog loading | DONE_WITH_DIFF |
| R14-UX-027 | MEDIUM | Data maintenance loaded duplicate groups, stale VNs, and provider freshness as three identical generic lists despite their different identifiers, actions, and status metadata. Preserve the three-column responsive layout and each column's final row anatomy. | data maintenance loading | DONE_WITH_DIFF |
| R14-UX-028 | MEDIUM | Physical-bundle and selective-download dialogs loaded operational rows as passive three-line cards. Preserve bundle member metadata plus dissolve actions, and selective checkbox/title/id/year rows, including coarse-pointer action height. | bundle and selective-download dialog loading | DONE_WITH_DIFF |
| R14-UX-029 | MEDIUM | The VN route skeleton appended a generic passive-row card that did not map to any configurable detail section and changed unpredictably with collection and metadata state. Keep only guaranteed hero, synopsis, and media geometry at the route boundary; section components own their specific loading states after mount. | VN route loading | DONE_WITH_DIFF |
| R14-UX-030 | MEDIUM | Tag detail loading used an unstructured hero rectangle and detached bar before resolving into metadata, Local/VNDB modes, actions, density controls, and an encased VN result section. Preserve that hierarchy and touch geometry. | tag detail route loading | DONE_WITH_DIFF |
| R14-UX-031 | HIGH | Character browser loading represented its search, three source modes, four segmented filter groups, and six numeric/misc groups as one opaque rectangle. Preserve the complete responsive filter hierarchy before the 3:4 result grid resolves. | character browser route loading | DONE_WITH_DIFF |
| R14-UX-032 | HIGH | Compare loading assumed four covers and replaced the comparison body with one opaque rectangle. Preserve the picker, common-facet summary, two-item mobile card anatomy, and desktop comparison matrix without inventing four selected VNs. | compare route loading | DONE_WITH_DIFF |
| R14-UX-033 | MEDIUM | Printable-label loading invented a large panel and vertical cards although the destination is a return/print toolbar followed by compact horizontal QR labels. Preserve the 80 px QR frame, title/id/location text, and print-grid breakpoints. | printable labels route loading | DONE_WITH_DIFF |
| R14-UX-034 | MEDIUM | Series-index loading hid the three-field creation form behind an opaque panel and rendered result cards with nonexistent chips while omitting their delete action. Preserve creation columns, title/description identity, density grid, and action geometry. | series index route loading | DONE_WITH_DIFF |
| R14-UX-035 | MEDIUM | List-index loading hid the name, description, colour palette, and create action behind an opaque panel, then rendered generic taxonomy cards without list identity, count, or menu geometry. Preserve the wrapping form and the final responsive actionable-card grid. | list index route loading | DONE_WITH_DIFF |
| R14-UX-036 | HIGH | List-detail loading omitted the mobile return action, coloured identity card, density and metadata tools, add-item form, and per-card remove actions. Preserve the complete detail workflow and density-aware removable cover grid throughout navigation. | list detail route loading | DONE_WITH_DIFF |
| R14-UX-037 | HIGH | Series-detail loading invented a fixed cover, ignored its configurable section order/visibility/collapse state, and omitted layout tools, add-item controls, media editing, and remove actions. Preserve guaranteed hero identity, saved layout state, complete works workflow, and the cover/banner metadata editor. | series detail route loading | DONE_WITH_DIFF |
| R14-UX-038 | HIGH | Compare search reset its highlighted row in an effect after painting new results, so a mouse entering another option before that effect ran could be reset to the first row. Set the initial highlight atomically with each result replacement so pointer and keyboard selection remain deterministic under load. | compare VN picker | DONE_WITH_DIFF |
| R14-UX-039 | MEDIUM | Trait-browser route loading omitted page identity, refresh, collection scope, and density controls, then painted generic taxonomy cards with nonexistent chips. Preserve all browser controls and the actual title, optional R18 badge, description, and count card geometry. | trait browser route loading | DONE_WITH_DIFF |
| R14-UX-040 | MEDIUM | Tag route and filtered-query loading used generic taxonomy cards, while the route omitted source tabs, category filter, refresh, and the external VNDB action. Share one destination-shaped flat-result skeleton and preserve the complete browser shell during both navigation and client fetches. | tag browser route and query loading | DONE_WITH_DIFF |
| R14-UX-041 | HIGH | Similar loading always invented a selected seed and twelve results although the default route resolves to only a seed picker, and the loading boundary cannot know query state. Preserve the common mobile return, identity, subtitle, and seed input without fabricating result content. | similar route loading | DONE_WITH_DIFF |
| R14-UX-042 | MEDIUM | Recommendation seed derivation used one anonymous 40-pixel bar before resolving into a labelled TagPicker with chips, search, and help. Preserve the guaranteed control frame while server-derived seed names load. | recommendation seed-tag Suspense fallback | DONE_WITH_DIFF |
| R14-UX-043 | MEDIUM | Optional external seiyuu credits reserved eight ungrouped cards even though the response may be absent and resolved content always groups voice or production work. Use one compact neutral group and the card anatomy shared by both result types. | streamed staff external-credit fallback | DONE_WITH_DIFF |
| R14-UX-044 | HIGH | Opening the EGS cover source showed one opaque 192-pixel rectangle before replacing it with 2:3 candidate tiles and an automatic-cover action. Preserve a bounded candidate grid, labels, and footer action while image sources load. | VN cover source picker | DONE_WITH_DIFF |
| R14-UX-045 | HIGH | Trait route loading mirrored real cards, but every search or collection-scope request replaced them with eight generic compact blocks. Share the density-aware trait-card skeleton between the route boundary and internal query transitions. | trait browser route and client loading | DONE_WITH_DIFF |
| R14-UX-046 | HIGH | Place stock loading used featureless 384-pixel card blocks and 96-pixel row blocks, hiding the 2:3 artwork, status, metadata, producer, and action geometry that follows. Mirror both saved card and list views during every place-stock request. | place detail stock browser | DONE_WITH_DIFF |
| R14-UX-047 | HIGH | AliceNet's dedicated shop surface used the same featureless card and row rectangles despite its richer match status, artwork, price, title-normalization, provider, quick-link, and remap controls. Preserve its special card/list anatomy without moving its operations outside the AliceNet shop page. | AliceNet shop inventory | DONE_WITH_DIFF |
| R14-UX-048 | HIGH | The shop registry replaced full place cards, detailed list rows, and unassigned-branch actions with uniform height blocks. Preserve each active view's identity, metadata, badges, and 44-pixel actions while registry requests run. | place registry card/list/unassigned views | DONE_WITH_DIFF |
| R14-UX-049 | HIGH | Seiyuu detail loading still fabricated optional profile metadata and expanded every configured section even when the user had saved it as collapsed, causing large false blocks before the real profile appeared. Reserve only guaranteed profile controls and mirror persisted collapsed headers. | staff detail loading boundary | DONE_WITH_DIFF |
| R14-UX-050 | HIGH | Per-page layout settings reserved four featureless rows during client hydration although the resolved panel contains 26 route groups with five spacing choices, optional density presets, and three global reset actions. Share the complete destination-shaped placeholder between chunk loading and hydration. | Display settings per-page layout panel | DONE_WITH_DIFF |
| R14-UX-051 | MEDIUM | Recent stock activity represented recent VN checks and completed background batches as four identical bars in both route and hydrated loading states. Share a skeleton that preserves both headings, compact VN identity rows, batch timestamps, and summary lines. | stock recent activity route and client loading | DONE_WITH_DIFF |
| R14-UX-052 | MEDIUM | Cache loading reserved only four featureless blocks although its resolved body guarantees four labelled statistics, two freshness dates, and two maintenance actions. Preserve all guaranteed zones so expanding the panel during its request does not rebuild the layout. | cache statistics panel | DONE_WITH_DIFF |
| R14-UX-053 | HIGH | The prior seiyuu correction over-reduced the profile header even though the real cache shows that language is universal and original names, descriptions, gender, and external links occur on most profiles. Rich seiyuu pages therefore expanded by several rows after loading; the density toolbar and download action were also materially narrower than their resolved controls, and the external-credit fallback received the section gap twice. Restore one compact common-profile cluster, match real control widths, and let only one layout layer own vertical spacing. | staff detail and external-credit loading boundaries | DONE_WITH_DIFF |
| R14-UX-054 | HIGH | VN detail client islands still used unrelated generic lines for VNDB state, an EGS no-match lookup, and aspect controls. Rich EGS details also repeated a client request even though every linked production row already carries the complete raw snapshot, causing an avoidable skeleton and stale detail content after relinking. Mirror each guaranteed destination shape, hydrate rich details from the server snapshot, and revalidate them without replacing visible content after EGS link changes. | VNDB status, EGS, rich EGS, and aspect-ratio panels | DONE_WITH_DIFF |
| R14-UX-055 | HIGH | Several lazy chunks still changed the surrounding layout independently of data loading: Library advanced filters collapsed to one opaque bar, Eroge Price disappeared between its data skeleton and module resolution, Map reverted to a fixed normal height, and AliceNet's remapping dialog omitted its subtitle, close target, row actions, footer, portal, and loading announcement. Share destination-shaped lazy fallbacks and let the already-resolved parent own responsive dimensions. | Library filters, Eroge Price, Map, and AliceNet remapping lazy boundaries | DONE_WITH_DIFF |
| R14-UX-056 | HIGH | The shared image wrapper and hydrated VN banner still animated high-contrast diagonal gradients while route and `SafeImage` placeholders used one restrained surface. Firefox composited these gradients as a brighter foreground block, so a VN transition could still look like overlapping skeletons after the route-level fix. Use the same flat loading token across every audited native image path and enforce the inventory structurally. | `LoadingImage`, `HeroBanner`, and shared image-loading contract | DONE_WITH_DIFF |
| R14-UX-057 | HIGH | AliceNet's initial request rendered “no snapshot”, zero tab counts, and a missing selection action before replacing them with the real stock state. These were false empty values rather than loading UI. Reserve the timestamp, every count, the data-dependent action, and result geometry until the first snapshot resolves. | embedded AliceNet shop client | DONE_WITH_DIFF |
| R14-UX-058 | HIGH | Long seiyuu profiles paginate up to 60 rich voice or production credits, but each route-loading section reserved only four cards, less than one row on a wide display, and omitted the possible-profile-match section entirely. Reserve four cards on phone, eight on tablet, and twelve on wide layouts, and mirror the missing match-section anatomy without inflating the optional streamed external-credit fallback. | staff detail loading boundary | DONE_WITH_DIFF |
| R14-UX-059 | CRITICAL | Shared images remained transparent and kept pulsing after the browser had fired `load` because both wrappers awaited an unbounded `HTMLImageElement.decode()` promise before revealing the frame. Treat `load` as the authoritative ready signal, run decode only as a non-blocking best effort, and recover images that completed before hydration attached event handlers. | `SafeImage`, `LoadingImage`, every cover, card, logo, avatar, and media consumer | DONE_WITH_DIFF |
| R14-UX-060 | HIGH | A VN banner that failed before React hydration had its error state reset after the native error event had already passed, leaving the banner pulse mounted forever. Reconcile both successful and failed completed images from `complete` and `naturalWidth` so every pre-hydration outcome reaches a stable frame. | `HeroBanner` hydration lifecycle | DONE_WITH_DIFF |
| R14-UX-061 | HIGH | Wishlist route and client loading rendered cards directly below the title, then inserted search, sort, grouping, ownership, density, refresh, bulk actions, summary, and advanced filters above the resolved grid. Share one complete workspace placeholder across both loading phases so the full card grid no longer shifts down after hydration. | Wishlist route and initial API loading | DONE_WITH_DIFF |
| R14-UX-062 | HIGH | The staff detail route loader rendered every configured optional section even though it cannot know whether a profile has a timeline, sibling candidates, voice work, production work, or external credits. Sparse profiles therefore loaded as several invented screens and collapsed to one real section. Keep the representative rich profile header, but reserve exactly one responsive seiyuu credit grid; data-aware sections retain their own streamed fallbacks after the route resolves. | staff detail route loading | DONE_WITH_DIFF |
| R14-UX-063 | HIGH | Compare loading invented two selected VNs, a common-facet summary, mobile comparison cards, and a desktop matrix even though both the route and lazy-module boundaries can open with no selection and cannot read the eventual IDs. Share one guaranteed label-and-search placeholder and render comparison bodies only after the server has resolved at least two real items. | Compare route and picker lazy boundary | DONE_WITH_DIFF |
| R14-UX-064 | HIGH | Map loading used a different full-width container, reserved one header action instead of two, and omitted the privacy control, search action, and four size controls that always precede the canvas. Match the final constrained page shell and every guaranteed control before reserving the default map frame; leave data-dependent shop rows to the resolved page. | Map route loading | DONE_WITH_DIFF |
| R14-UX-065 | HIGH | VN navigation pulsed the banner, cover, identity, metadata, synopsis, and media as independent blocks, then used a visually unrelated banner placeholder after the server content arrived while the image decoded. This made the banner look detached and produced layered brightness changes. Let one composite hero container own the route animation, render its internal shapes statically, and keep the post-server banner image placeholder on the shared flat loading token. | VN route hero and hydrated banner image | DONE_WITH_DIFF |
| R14-UX-066 | HIGH | The default Search route resolves to source tabs, an empty query field, and filter controls, but both its route and Suspense fallback rendered a density toolbar plus eighteen fake VNDB result cards. Keep result placeholders inside active VNDB, EGS, and local request states only; the route-safe workspace skeleton must stop after the guaranteed controls. | Search route, Suspense shell, and source-specific result loading | DONE_WITH_DIFF |
| R14-UX-067 | HIGH | The hydrated VN banner was the only audited image placeholder using the shared loading colour without the shared pulse, so it appeared brighter and separate while covers and media continued animating. Reuse the exact restrained image-skeleton pulse and remove it immediately on the native load event. | hydrated VN banner image | DONE_WITH_DIFF |
| R14-UX-068 | HIGH | The nominally shared image placeholder was semi-transparent, so banners, covers, cards, and seiyuu credits produced different composite colours over their different parent surfaces. Deferred `SafeImage` frames were also static until intersection, making visible cards appear stalled during observer startup. Use one opaque two-colour pulse for every structural and image skeleton, retain one parent animation for the composite VN route hero, and keep long rendered lists bounded through their existing pagination or virtualization. | shared skeleton primitive, native image wrappers, VN banner, seiyuu external credits | DONE_WITH_DIFF |
| R14-UX-069 | MEDIUM | VN, release, shelf, and character-browser loading boundaries represented their guaranteed 44-pixel mobile return action as a 20-pixel line. The placeholder therefore looked like unrelated content and disappeared into a materially different control. Reserve the exact touch-control height, retain the same desktop breakpoint as the resolved link, and pin all four routes with a geometry contract. | mobile return placeholders on VN, release, shelf, and character browser routes | DONE_WITH_DIFF |
| R14-UX-070 | MEDIUM | The mobile VN return action was mandatory and its route skeleton always reserved space, even for operators who rely on the navbar. Add an immediate local VN-page preference and drive both the resolved action and its loading placeholder from the same server-seeded visibility state. | VN mobile return action, route loader, display settings | DONE_WITH_DIFF |
| R14-FEAT-002 | HIGH | Shelf `contain/cover` preference wrote `object-fit` to the outer `SafeImage` wrapper even though that property is not inherited by the nested image. The exposed setting therefore had no effect while unsafe `as never` casts hid the target mismatch. Add an explicit inner-image class contract, consume the CSS variable on the native image, retain scaling on the wrapper, and test both consumers. | spatial shelf cards, face-out displays, shared safe image contract | DONE_WITH_DIFF |
| R14-TYPE-002 | MEDIUM | Root density, scoped density, and page-spacing styles used six `as never` casts to bypass React's CSS property contract. Define one typed CSS-custom-property surface, remove every production `never` cast, and enforce the rule with a recursive source contract. | root layout, density provider, page-space helper | DONE_WITH_DIFF |
| R14-RES-001 | HIGH | Eight routes had dedicated loading UI but no segment-local error boundary, so failures discarded route context and fell through to root recovery. Add tested local recovery for labels, map, place list/detail, search, Steam, stock, and traits, then enforce both loading and error siblings for every page. | App Router route boundaries and route-boundary tests | DONE_WITH_DIFF |
| R14-UI-001 | HIGH | Re-audit all page layouts, navigation, dialogs, density controls, long lists, overflow, artwork controls, empty/error states, and workflow coherence at representative desktop, tablet, and mobile widths. Fix every reproducible inconsistency rather than relying on the Round 13 matrix. | all 40 pages and shared UI | TODO |
| R14-RESP-001 | HIGH | Run a new Firefox, WebKit, and Chromium responsive matrix, including loading transitions, navbar/category menus, shelves, VN artwork, map overlays, settings controls, and long localized strings. Check page overflow, local scrollers, focus reachability, stacking, and 44 px touch surfaces. | production browser matrix | TODO |
| R14-RESP-002 | HIGH | Seventy-nine route and component surfaces reduced 44-pixel controls at the 640-pixel width breakpoint without checking input capabilities, so landscape phones and tablets received desktop-sized links, tabs, filters, artwork tools, and destructive actions. Keep touch dimensions at every width and compact only when a fine pointer can hover; enforce that invariant across all TSX sources. | application-wide responsive controls | DONE_WITH_DIFF |
| R14-RESP-003 | HIGH | A second audit found residual width-only compaction in stock operations, release deletion, dump-ignore, saved-filter drag, platform overflow, Eroge Price removal, and five destination-shaped skeleton controls. These controls still fell below 44 px on wide touch devices while their surrounding surfaces followed the pointer-capability contract. Move every reduction behind `can-hover`, align loading and loaded geometry, and broaden the repository invariant beyond only `min-h-0`. | remaining compact controls and matching skeletons | DONE_WITH_DIFF |
| R14-A11Y-001 | HIGH | Recheck landmarks, headings, names, labels, focus order, keyboard operation, dialogs, announcements, image alternatives, color-independent state, reduced motion, and target sizing across every route and major interaction. | application-wide | TODO |
| R14-A11Y-002 | HIGH | The mobile navigation trigger rendered at 44 by 32 pixels and the expanded quote refresh action rendered at 12 by 12 pixels, despite pseudo-element helpers that did not change their layout boxes. Give the menu a permanent 44-pixel box and the quote action a 44-pixel box whenever it is interactive while preserving its compact, inert collapsed state. | `src/components/MoreNavMenu.tsx`, `src/components/QuoteFooter.tsx` | DONE_WITH_DIFF |
| R14-A11Y-003 | HIGH | Sixteen dialog, popover, batch-progress, map-search, and quick-menu components exposed icon-only close actions whose actual layout boxes remained below 44 pixels, sometimes using the tighter pseudo-element helper that only reached about 28 pixels. Give every icon-only close action a real 44-by-44 box and enforce the complete close-button inventory structurally. | shared dialogs, artwork pickers, AliceNet link dialog, map, download, shelf, and quick-action panels | DONE_WITH_DIFF |
| R14-A11Y-004 | HIGH | Typed confirmations relied on native `autoFocus`, captured focus after that transfer, included disabled submit buttons in their Tab loop, and rebuilt the focus effect when an inline close callback changed. This could lose the trigger for restoration, break wrapping while validation was incomplete, or move focus during an unrelated app rerender. Capture the trigger before moving focus, focus the required input explicitly, exclude disabled controls, and keep close callbacks behind a current ref. | `src/components/ConfirmDialog.tsx` | DONE_WITH_DIFF |
| R14-I18N-001 | HIGH | Recheck French, English, and Japanese dictionary parity, hardcoded visible strings, date/time and number formatting, platform names, plural/range text, metadata, error messages, and layout resilience under longer translations. | i18n dictionaries and all rendered surfaces | TODO |
| R14-I18N-002 | HIGH | Character birthdays forced day/month order, VN activity start/finish dates exposed ISO storage values, status changes exposed internal status keys, and playtime used a hardcoded `min` suffix. Route all four through locale-aware formatters and test French, English, and Japanese ordering and units. | `src/lib/locale-number.ts`, character detail, VN activity timeline | DONE_WITH_DIFF |
| R14-I18N-003 | HIGH | EGS only decoded a hand-maintained entity subset and AliceNet did not decode HTML entities at ingestion, leaving encoded producer and title text in the shop UI, EGS metadata, search, and filters. Use a standards-based single-pass decoder for future ingestion and migrate historical SQLite and PostgreSQL values. | EGS and AliceNet parsers, SQLite bootstrap, PostgreSQL migration 0010 | DONE_WITH_DIFF |
| R14-I18N-004 | MEDIUM | The character browser's voice-language filter exposed raw VNDB language codes while equivalent filters elsewhere used localized language names. Route every option through the shared `Intl.DisplayNames` helper while preserving the submitted code. | character browser filter and runtime test | DONE_WITH_DIFF |
| R14-I18N-005 | HIGH | The structured API error path localized stable codes, but 193 legacy client calls still surfaced each route's safe English fallback verbatim in French and Japanese documents. Preserve diagnostic detail for English UI, use the caller's translated fallback for every legacy error outside English, and retain precise code-based translations where available. | shared API error reader and all legacy client fetch failures | DONE_WITH_DIFF |
| R14-I18N-006 | MEDIUM | Release, edition, compare, VN, and producer surfaces mixed localized names with raw platform and language codes in tooltips, accessible names, filters, and metadata chips. Use the shared locale-aware name helpers for every presentation surface while retaining raw codes only in submitted values and URLs. | VN, producer, compare, release, owned-edition, shelf-popover, and platform-overflow UI | DONE_WITH_DIFF |
| R14-I18N-007 | MEDIUM | Shop list rows exposed GPS through the localized acronym glossary, but cards rendered a bare literal without its localized expansion. Reuse the shared acronym label for consistent visible and assistive naming. | place registry cards | DONE_WITH_DIFF |
| R14-SEC-001 | CRITICAL | Re-audit authentication gates, mutation authorization, CSRF/origin handling, SSRF and URL allowlists, uploads and path traversal, request size limits, secret/error exposure, CSP and headers, proxy behavior, dependencies, and production TLS/reverse-proxy configuration. | all APIs, middleware, Next and production configuration | TODO |
| R14-SEC-002 | CRITICAL | Production Nginx capped every request at 50 MiB while the authenticated PostgreSQL logical restore endpoint supports archives up to 4 GiB and current database backups already exceed 200 MiB. Add an exact authenticated restore location with the matching cap, streaming request forwarding, trusted-proxy proof, and bounded timeouts while retaining the lower global limit. | `ops/nginx/vndb-backup-restore.conf`, production Nginx, PostgreSQL operations docs | DONE_WITH_DIFF |
| R14-SEC-003 | MEDIUM | Production correctly enforced Basic Auth at Nginx and exposed Next only on loopback, but omitted `VN_PUBLIC_READ_AUTH=upstream`, so the application classified its personal-data reads as open despite the deployed proxy contract. Declare the upstream authentication mode in the root-managed runtime environment and verify page, API, SSE, and direct-port behavior. | production runtime environment and security verification | DONE_WITH_DIFF |
| R14-FEAT-001 | HIGH | Exercise complete library, wishlist, search, filter/group/sort, collection mutation, compare, shelf, release/edition, lists, series, staff, downloads, backups, and settings workflows, including immediate state refresh and failure recovery. | core product workflows | TODO |
| R14-FEAT-002 | HIGH | VN and staff detail preserved translator, editor, and QA credits in storage and URL parsing but collapsed all three into “Other”; the staff browser also hid editor and QA filters. Use the shared role contract on every credit surface, expose all supported filters, and localize the roles in French, English, and Japanese. | VN staff section, staff detail, staff browser, shared role labels | DONE_WITH_DIFF |
| R14-STOCK-001 | HIGH | Verify per-VN lookup, generic stock aggregation, cached/fresh semantics, aliases, provider diagnostics, background jobs, stale timestamps, place assignment, map integration, and every configured provider. Keep AliceNet mirror controls only on its linked shop detail page. | `/stock`, VN stock section, `/places`, `/map`, stock APIs | TODO |
| R14-STOCK-002 | HIGH | Provider maintenance inferred the last completed batch from progress rows that are intentionally deleted after one hour, so a successful older sync reverted to the misleading `no batch` state while provider statuses remained durable. Persist one bounded latest-completed summary per provider independently from progress history and use it for maintenance comparisons. | durable stock batch store, provider maintenance repository, SQLite and PostgreSQL schemas | DONE_WITH_DIFF |
| R14-STOCK-003 | HIGH | Bulk stock summaries used by VN cards read only the generic offer table, while AliceNet packages are stored separately and synthesized only for detail and place views. AliceNet-only availability and prices therefore disappeared from library cards. Union matched AliceNet packages into both database summary implementations with the same guarded yen parsing used by place views. | `src/lib/db.ts`, `src/lib/db/repositories/stock.ts`, stock database contracts | DONE_WITH_DIFF |
| R14-STOCK-004 | HIGH | AliceNet place and per-VN freshness used each row's general `updated_at`, which also changes when matching metadata is edited. A match could therefore make an old inventory snapshot appear freshly synchronized. Derive generic stock timestamps from `fetched_at` in both database engines and the synthesized VN offer so only an actual stock download changes freshness. | SQLite and PostgreSQL place repositories, per-VN stock synthesis | DONE_WITH_DIFF |
| R14-STOCK-005 | HIGH | A linked shop stock request returned every VN and every offer before the browser paginated locally; the production AliceNet shop therefore transferred more than one thousand VN rows for each visit and repeated the full payload for every filter. Validate bounded query parameters, filter and sort on the server, return stable page and producer metadata, restrict offer loading to the visible VN window, preserve legacy response decoding, and keep loaded results visible during background page changes. | place stock API, repository offer window, place stock browser, response decoder | DONE_WITH_DIFF |
| R14-STOCK-006 | HIGH | Batch stock controls could visually reselect providers disabled in Settings through the All, physical, online, or aggregator shortcuts, while the server silently omitted them. A narrow run could also be mistaken for a global refresh because the workspace did not state that freshness changes only for selected providers. Keep disabled providers unavailable through every shortcut, display the selected/active count, and explain the scope before launch. | batch stock provider selection and localized guidance | DONE_WITH_DIFF |
| R14-ALICE-001 | HIGH | Exercise the AliceNet shop-only control surface, detached progress, stop/retry, fetch, matching, VNDB/EGS enrichment, pagination, errors, manual links, cached generic offers, and migration compatibility without reintroducing a navbar or standalone mirror page. | linked AliceNet `/places/[id]`, `/api/alicenet/*` | DONE_WITH_DIFF |
| R14-VNDB-001 | HIGH | Verify local/VNDB status, rating, notes, wishlist, and label conflict behavior. Ensure preview/apply is field-specific, stale previews cannot overwrite newer changes, missing remote values do not silently erase local meaning, and every direction is explicit. | VN status panel, settings sync, VNDB APIs and sync library | DONE_WITH_DIFF |
| R14-VNDB-002 | CRITICAL | Conflict resolution previously submitted only field names, so an old browser preview could apply values that had changed locally or on VNDB since it was rendered. Submit the exact local/remote snapshot for every selected field, revalidate it against fresh data, use an atomic compare-and-set for local pulls, and reload the panel on conflict. | VN status panel, VNDB status API, SQLite and PostgreSQL collection repositories | DONE_WITH_DIFF |
| R14-VNDB-003 | MEDIUM | The VNDB conflict API emitted a stable code when the selected synchronization direction was unavailable, but the client error union and all three dictionaries omitted it, reducing a precise conflict to a generic error. Add the code to the typed localized contract and exercise it through the panel. | VNDB status conflict API and panel | DONE_WITH_DIFF |
| R14-VNDB-005 | MEDIUM | Optional automatic status writeback intentionally preserved a successful local mutation when VNDB failed, but it silently discarded both non-success HTTP responses and network failures while its caller claimed the failure was logged. Emit bounded diagnostics containing only the VN id and response class, without logging the token or upstream body. | automatic VNDB status writeback | DONE_WITH_DIFF |
| R14-PERF-001 | HIGH | Recheck bounded queries, pagination/virtualization, tag indexes, repeated repository calls, client polling, background jobs, multi-tab behavior, images, DOM size, bundle boundaries, memory, database pool pressure, and slow provider isolation. | application and production runtime | TODO |
| R14-PERF-002 | HIGH | AliceNet's ungrouped page query calculated `COUNT(*) OVER` even though the UI uses the independently queried page total, then joined every matching stock row to collection and VN metadata before applying `LIMIT/OFFSET`. The unused window and early enrichment forced PostgreSQL to process the complete result set and bypassed useful pagination plans. Emit a zero sentinel only for ungrouped pages, materialize the bounded stock window before enrichment, retain exact partition counts for grouped views, and keep PostgreSQL and SQLite behavior aligned. | AliceNet page repositories and production query plans | DONE_WITH_DIFF |
| R14-DATA-001 | CRITICAL | Validate PostgreSQL migrations, indexes, constraints, JSON quarantine, SQLite migration parity, current production data, transaction behavior, connection pooling, backup creation, restore verification, and operational documentation. | PostgreSQL repositories, migrations, production database | TODO |
| R14-TYPE-001 | HIGH | Re-scan production and test code for weakened types, unsafe casts, suppression directives, unvalidated external payloads, and exported contracts lacking useful documentation. | `src`, `tests`, `scripts` | TODO |
| R14-TEST-002 | HIGH | Run focused tests while fixing findings, then the complete unit, PostgreSQL, exact coverage, QA, interaction, sentinel, provider, browser, and production health gates. No ignored files, skipped new scenarios, or threshold workarounds. | all test and QA suites | TODO |
| R14-DOC-001 | MEDIUM | Reconcile README, FEATURES, CLAUDE, deployment and PostgreSQL docs, active TODO reports, route/provider claims, AliceNet naming, and final verification evidence with the shipped application. | project Markdown and operational docs | TODO |
| R14-OPS-001 | CRITICAL | Verify pushed and deployed SHA equality, release activation, health, PostgreSQL availability, service restarts, memory, journal errors, backups, restore readiness, and rollback artifacts after every feature deployment and at final closure. | production host and deployment tooling | TODO |
| R14-OPS-002 | CRITICAL | The release script sourced only the application environment for migrations, contradicting the documented least-privilege role split. DML-only migrations happened to work, but migration 0011 correctly failed on `CREATE TABLE`. Load the root-managed migrator environment only inside the migration subprocess and retain the application role for build, candidate health, and runtime. | release deployment script, production migration environment, PostgreSQL operations guide | DONE_WITH_DIFF |
| R14-OPS-003 | HIGH | EGS loaded from a workstation but timed out from the production data-center address and from the configured commercial proxy exit, while the UI incorrectly suggested checking the user's browser. Route only EGS through a loopback-bound reverse dynamic SSH relay on a supervised trusted egress host, preserve stale-cache fallback, link failures to the integration test, and document setup, security, verification, recovery, and rollback. | EGS provider proxy, top-ranked recovery UI, production network operations | DONE_WITH_DIFF |

## Evidence collected

- Structural blocks, lazy and priority images, hydrated VN banners, generic
  image wrappers, and streamed seiyuu credit cards now share one opaque
  two-colour pulse that is independent of the parent background. The VN route
  hero still owns one composite animation, so its internal banner and cover
  shapes do not stack animations. Deferred image frames pulse immediately and
  unmount on native load. The focused image, banner, staff, route-loading, and
  loading-contract suite passes all 166 scenarios together with the complete
  typecheck.
- Every loading boundary with a mobile return placeholder has a corresponding
  resolved return action at the same breakpoint. The four residual 20-pixel
  placeholders now reserve the final 44-pixel control height, including VN,
  release, shelf, and character-browser navigation, and the route-render suite
  enforces the shared geometry.
- The shelf fit preference now reaches the two native image consumers used by
  shelf cells and face-out displays. `contain` and `cover` no longer target the
  non-inheriting wrapper, the two unsafe casts are removed, and the preference
  consumption test now includes `--shelf-fit-mode`.
- VN page settings now expose a mobile Library-return toggle. Its root state is
  seeded from the validated display cookie, updates immediately in the current
  document, and hides both resolved links and the route placeholder through one
  visibility contract. Focused settings, route, i18n, and VN runtime suites pass.
- Production CSS variables now use a documented `CssCustomProperties` contract
  across the root, scoped density, and page-spacing surfaces. A recursive test
  confirms `src` contains no `as never` cast or TypeScript suppression directive;
  59 focused tests, strict typecheck, and the production build pass.
- Production plan recapture exposed an unused AliceNet window aggregate on
  ungrouped pages. PostgreSQL and SQLite now emit a zero group-count sentinel in
  that mode while retaining exact partition counts for every grouped view. A
  second plan pass showed that full collection and VN enrichment still preceded
  the page window, so ungrouped queries now materialize only the bounded stock
  rows and enrich that page afterward. The price-ordered production plan fell
  from 24.453 ms before either correction to 8.138 ms with the pagination index;
  title ordering remains a bounded sequential sort at the current 1,412-row
  cardinality. One hundred sixty-nine repository, client, and decoder tests,
  strict typecheck, and build pass.

- At the Round 14 baseline, production served commit `d4b356fd0675e59f17f89b6202e1b78d3dae3a5e`
  with PostgreSQL ready, pool maximum 10, and zero service restarts.
- The complete coverage suite passes 9,707 tests (three skipped historical
  cases) across 931 test files and reports exactly 100% statements, branches,
  functions, and lines after commit `d4b356fd`.
- The independent PostgreSQL suite passes all 93 integration scenarios.
- The production-dependency audit reports zero vulnerabilities across 296
  audited packages.
- Commit `57b48f7d` prevents Firefox from compositing the translucent VN cover
  pulse with the overlapping banner pulse. Forty-seven focused loading/image
  tests, typecheck, and production build pass; production activates the commit
  with PostgreSQL ready and zero service restarts.
- Every one of the 40 App Router pages now has both a route-matched loading
  skeleton and a segment-local error boundary. The shared recovery test covers
  retry, digest, logging, and route-aware return behavior, while a structural
  contract prevents future pages from omitting either boundary.
- Character birthdays, VN activity dates, activity status transitions, and
  minute durations now use the active locale rather than fixed display tokens.
  Forty-four focused i18n, page, and component tests pass together with the
  complete typecheck and production build.
- Production database archives exceed the previous reverse-proxy upload limit.
  The exact restore route now has a tested 4 GiB streaming allowance while
  every other route keeps the lower general cap and the restore remains behind
  Basic Auth plus the trusted-proxy proof.
- Production now explicitly declares its upstream read-authentication policy.
  HTTP redirects to HTTPS, unauthenticated HTTPS returns 401, authenticated
  pages, health checks, and the status stream return 200, and Next listens only
  on loopback with its public port unreachable. The certificate verifies, HSTS
  and the expected CSP/security headers are present, and 390 focused security
  scenarios plus the 297-package production dependency audit pass without a
  vulnerability finding.
- EGS and AliceNet HTML ingestion now share a standards-based, single-pass
  entity decoder. SQLite and PostgreSQL migrations clean historical title and
  producer fields without recursively decoding escaped text. The focused suite
  passes 188 scenarios, PostgreSQL passes all 94 integration scenarios, and
  the complete typecheck and production build pass.
- The voice-language filter now presents localized names while retaining VNDB
  codes as form values. The complete i18n-focused suite passes 84 scenarios,
  and a production matrix covers 144 FR/EN/JA renders across Chromium,
  Firefox, and WebKit at 1440 and 390 pixels. Every render has the requested
  document language, localized metadata, no unresolved translation token or
  raw status key, no fatal browser error, and no horizontal overflow.
- Provider maintenance no longer depends on one-hour progress retention. One
  durable latest-completed row per provider survives progress cleanup, rejects
  older jobs finishing late, and feeds the existing updated/missed/no-batch UI.
  Fifty-one focused behavior tests, 94 real PostgreSQL integration scenarios,
  the complete typecheck, and targeted 100/100/100/100 coverage pass.
- A production batch exercised one dynamically selected collection item against
  Sofmap and finished 1/1 without cancellation, interruption, or provider
  errors. The durable provider row remains available after the transient job,
  the maintenance API reports 416 status rows and a completed batch, and the
  UI reports that Sofmap was updated after that batch. Chromium, Firefox, and
  WebKit confirm the same state at 1440 and 390 pixels with HTTP 200, no browser
  errors, no fatal content, and no horizontal overflow.
- The production VN loading skeleton was rendered with production CSS in
  Firefox, WebKit, and Chromium at 1440 and 390 pixels. In all six cases the
  opaque 260 by 390 cover shell exactly contains its pulse, remains above the
  banner across the full 176-pixel overlap, and creates no horizontal overflow.
- Deployment migrations now run with the root-managed migrator environment in
  an isolated subprocess, while build, candidate validation, and the activated
  service retain the restricted application environment. The first deployment
  correctly exposed that the active, older release was still orchestrating its
  own replacement; bootstrapping the updated release script applied the new
  contract. Production now serves commit `cccc3ceb`, migrations 0001 through
  0011 are recorded, PostgreSQL is ready, and the service restart count remains
  zero.
- VNDB conflict actions now bind each selected field to the exact local and
  remote values shown in the preview. Malformed, duplicate, stale-local,
  stale-remote, removed-row, and compare-and-set race cases are rejected; the
  panel refreshes conflict data after a 409 response. Focused decoder, route,
  UI, SQLite, and PostgreSQL tests pass with exact branch coverage, together
  with typecheck and the production build.
- Staff loading now mirrors its complete search/filter/sort header and compact
  result cards. Seiyuu detail loading mirrors the variable profile header,
  scope selector, timeline, density-aware horizontal VN credits, and character
  thumbnails instead of painting unrelated vertical cover cards. It follows
  the saved section order and visibility, and its streamed extra-credit
  fallback uses the same density-aware cover width as the final card while
  exposing an accessible busy status. Structural render tests pin the
  responsive dimensions, saved order, visibility, and card counts.
- Character loading now uses the final 2:3 portrait and horizontal appearance
  rows; top-ranked loading preserves rank rows and its filter controls;
  producer loading includes the logo, aliases, tools, and both role sections;
  place loading presents its statistics, filters, and shop actions instead of
  unrelated VN covers. Focused route, runtime, and component suites pass 62
  scenarios, and the complete 9,758-test suite reports exactly 100% statements,
  branches, functions, and lines together with typecheck and the production
  build.
- Statistics loading now separates the personal summary, reading goal,
  histogram, and responsive ranking grid. Data loading mirrors its descriptive
  header, Activity action, four status cards, export/import controls,
  three-column maintenance surface, and tool groups. Focused route and page
  suites pass 18 scenarios, and the complete 9,760-test suite reports exactly
  100% statements, branches, functions, and lines together with the complete
  typecheck.
- EGS route and Suspense loading now use one context-independent fallback with
  sync tools and density-aware horizontal cards. Place detail loading mirrors
  the shop header, source tabs, seven counters, filters, and stock grid used by
  both AliceNet and ordinary branches. Stock loading retains its picker,
  recent activity, and batch workspace. Eighty-one focused EGS, place, stock,
  sentinel, and geometry scenarios pass, and the complete 9,763-test suite
  reports exactly 100% statements, branches, functions, and lines together
  with the complete typecheck.
- Activity loading now retains its search, kind, and entity controls plus both
  paginated journals. Brand-overlap loading mirrors the two producer pickers
  and paired credit columns without introducing unrelated cover thumbnails.
  Fifty-three focused route, activity, loading-sentinel, and geometry scenarios
  pass, and the complete 9,765-test suite reports exactly 100% statements,
  branches, functions, and lines together with the complete typecheck.
- Dumped loading now preserves its three-part summary, progress bar, five
  status filters, density control, and compact edition-progress cards. Quotes
  loading mirrors the search header, citation text, 28-pixel square character
  avatars, score, and pagination. Fifty-seven focused route, page,
  loading-sentinel, and geometry scenarios pass, and the complete 9,767-test
  suite reports exactly 100% statements, branches, functions, and lines with
  the complete typecheck.
- Year loading now mirrors navigation, three statistics, goal progress,
  activity heatmap, tags, and ranked titles without fake covers. Schema loading
  separates local, EGS, and VNDB data and preserves the four-column browser.
  Steam loading mirrors suggestions, current mappings, and unlinked-game search
  rows. One hundred five focused route, schema, Steam, sentinel, and geometry
  scenarios pass, and the complete 9,770-test suite reports exactly 100%
  statements, branches, functions, and lines together with the complete
  typecheck.
- Recommendations loading now retains all five modes, its explanation, option
  toggles, and seed control. Upcoming route and streamed loading share the same
  density-aware horizontal release geometry as both final variants. Wishlist
  retains its title and subtitle before the real cover grid. Together with the
  saved-layout-aware seiyuu correction, 167 focused scenarios pass; the full
  suite passes 9,774 tests and reports exactly 100% statements (44,699/44,699),
  branches (37,973/37,973), functions (9,095/9,095), and lines
  (38,163/38,163).
- At a 390 by 844 viewport, the mobile menu trigger now measures exactly 44 by
  44 pixels. The quote refresh action remains a compact inert 12-pixel icon
  while collapsed and measures 44 by 44 pixels as soon as the footer opens.
  The interaction leaves document width at 390 of 390 pixels. Seventy-eight
  focused navigation, quote, responsive-target, and portal scenarios pass.
  The full suite passes 9,774 tests with exactly 100% statements, branches,
  functions, and lines, together with the complete typecheck and production
  build.
- Touch-target compaction across 79 route and component surfaces now depends
  on both the desktop width and a fine pointer that can hover. Landscape
  phones, tablets, and coarse-pointer windows therefore retain their 44-pixel
  links, filters, tabs, artwork tools, and actions. A source-wide invariant
  rejects future width-only height or width resets, and 95 focused responsive,
  navigation, density, lightbox, and safe-area scenarios pass. The full suite
  passes 9,775 tests with exactly 100% statements, branches, functions, and
  lines, together with the complete typecheck.
- All 30 close buttons now expose a real touch-sized layout box, including the
  16 previously undersized icon actions in confirmations, artwork pickers,
  AliceNet matching, map search, downloads, shelf options, quick actions, and
  integration panels. A source-wide AST invariant pins both the inventory and
  sizing contract. Four hundred seventeen focused component, interaction, and
  responsive scenarios pass. The full suite passes 9,776 tests with exactly
  100% statements, branches, functions, and lines, together with the complete
  typecheck.
- Typed confirmations now capture their launcher before explicitly focusing
  the required input, exclude disabled controls from their Tab loop, keep focus
  stable across parent rerenders, and return it to the launcher after closing.
  Prompt and confirm Escape handling now reads the latest close callback
  without rebuilding the focus lifecycle. Seventeen focused runtime, server,
  portal, and root-composition scenarios pass. The full suite passes 9,776
  tests with exactly 100% statements, branches, functions, and lines, together
  with the complete typecheck.
- All 22 route-level placeholders for density-adjustable surfaces now inherit
  the exact page-specific density, including root Library, search, wishlist,
  people, discovery, lists, shelves, places, tags, EGS, and Upcoming. The
  seiyuu placeholder now uses the final fixed-height timeline columns, retains
  the streamed external-credit section, reserves the complete density toolbar,
  and preserves touch geometry on coarse pointers. Chromium and Firefox at
  390 pixels render the settled staff page without browser errors or horizontal
  overflow, every sourced image resolves, and no stale busy surface remains.
  The full suite passes 9,777 tests and reports exactly 100% statements
  (44,710/44,710), branches (37,979/37,979), functions (9,097/9,097), and lines
  (38,173/38,173).
- Real client navigation exposed a boundary-selection defect hidden by isolated
  skeleton renders: the Staff index fallback replaced the seiyuu detail page
  during loading. Staff, Series, Lists, and Places now keep their index page,
  loading state, and error state in URL-transparent route groups, leaving each
  `[id]` transition under its own detail fallback. A fresh mobile transition
  to a seiyuu renders the profile, timeline, and two credit-grid skeletons,
  with no Staff-list skeleton and no horizontal overflow. The focused route,
  geometry, error-boundary, and structure suites pass 113 scenarios together
  with the complete typecheck. The full suite passes 9,785 tests and reports
  exactly 100% statements (44,717/44,717), branches (37,988/37,988), functions
  (9,098/9,098), and lines (38,178/38,178).
- Settled long credit pages no longer run an animation for every image that has
  not entered the preload margin. A representative seiyuu page reserves 177
  off-screen frames with zero pulse animations; scrolling activates skeletons
  only for the next image batch, and no animated skeleton remains in the
  viewport after decoding. The VN media lightbox retains its native-ratio frame
  and animated in-flight skeleton. Eighty-one focused SafeImage, gallery,
  rotation, cache, and image-lifecycle scenarios pass with the complete
  typecheck. The full suite passes 9,785 tests and reports exactly 100%
  statements (44,717/44,717), branches (37,988/37,988), functions
  (9,098/9,098), and lines (38,178/38,178).
- Legacy client failures now retain safe route diagnostics only in English UI.
  French and Japanese documents consistently display the translated fallback
  already supplied by each of the 193 call sites, while modern stable error
  codes continue to resolve to their precise localized reason. English,
  French, Japanese, canonical, legacy, malformed, and protected database
  payloads are covered. The full suite passes 9,780 tests and reports exactly
  100% statements (44,717/44,717), branches (37,988/37,988), functions
  (9,098/9,098), and lines (38,178/38,178).
- Platform and language codes now remain internal filter and URL values while
  VN, producer, compare, release, owned-edition, shelf-popover, and overflow
  surfaces expose locale-aware full names in visible text, tooltips, options,
  and accessible names. The focused suite passes 114 component and page
  scenarios together with the complete typecheck. The full suite passes 9,780
  tests and reports exactly 100% statements (44,717/44,717), branches
  (37,988/37,988), functions (9,098/9,098), and lines (38,178/38,178).
- Home loading now follows the saved order, visibility, collapsed state, strip
  geometry, Library controls, and density-aware card grid instead of painting
  an unrelated generic grid. Reading queue and anniversary data stream behind
  isolated fallbacks, while hidden sections skip their server reads entirely.
  A real 390-pixel client transition exposes the Library heading immediately,
  keeps only the unresolved grid busy, and has zero horizontal overflow. The
  full suite passes 9,791 tests and reports exactly 100% statements
  (44,746/44,746), branches (38,042/38,042), functions (9,112/9,112), and lines
  (38,202/38,202).
- VN character, quote, release, tracking-route, and stock transitions now use
  the same destination-shaped geometry while their code and data resolve.
  Portraits reserve the final 80 by 112 frame, quotes include citation avatars,
  releases retain their metadata rows, tracking routes retain their checkbox
  and five-action layout, and stock retains its summary, setup controls, price
  groups, and responsive two-column offer cards. A real 390-pixel VN render
  settles without a busy surface or horizontal overflow. The focused suite
  passes 195 scenarios, the production build passes, and the full suite passes
  9,797 tests with exactly 100% statements (44,756/44,756), branches
  (38,062/38,062), functions (9,122/9,122), and lines (38,212/38,212).
- Search loading now preserves its three source tabs, query field, advanced
  filter action, scoped density toolbar, and destination-specific result body
  across route, Suspense, chunk, and request loading. VNDB retains its
  density-aware cover grid, EGS retains compact metadata rows and add actions,
  and Local retains its bordered text-result panel without invented artwork.
  Real VNDB, EGS, and Local transitions at 390 pixels settle without a busy
  surface or horizontal overflow. The focused suite passes 119 scenarios and
  the full suite passes 9,800 tests with exactly 100% statements
  (44,762/44,762), branches (38,070/38,070), functions (9,128/9,128), and lines
  (38,218/38,218).
- Steam route and data loading now share the same three workflow geometries.
  Pending playtime rows retain their selection and batch-action structure,
  stored mappings retain their responsive two-column labels and unlink action,
  and unlinked games retain their metadata plus manual-search field. The real
  local Steam page resolves to 16 mappings at 390 pixels with no residual busy
  surface or horizontal overflow. The focused suite passes 66 scenarios and
  the full suite passes 9,802 tests with exactly 100% statements
  (44,765/44,765), branches (38,076/38,076), functions (9,131/9,131), and lines
  (38,221/38,221).
- Similar seed results now reset their keyboard highlight in the same update as
  the new result list, so a pointer hover can no longer be overwritten by a
  later effect. The previously failing hover scenario passes ten consecutive
  complete runs, and the full suite subsequently passes without the race.
- Owned-edition loading now retains the add action, 96 by 144 package covers,
  release metadata, summary fields, and three row actions instead of expanding
  from two unrelated compact rows. The suspended-fetch integration test pins
  this state. Sixty-two focused scenarios pass, the production build passes,
  and the full suite passes 9,804 tests with exactly 100% statements
  (44,768/44,768), branches (38,080/38,080), functions (9,134/9,134), and lines
  (38,224/38,224).
- Visible image requests now use the same restrained skeleton surface as route
  and section placeholders instead of a high-contrast diagonal gradient.
  Deferred off-screen frames remain static, visible in-flight frames pulse,
  and decoded frames remove the placeholder entirely. Forty-five focused image
  and gallery scenarios pass, the production build passes, and the full suite
  passes 9,804 tests with exactly 100% statements (44,768/44,768), branches
  (38,080/38,080), functions (9,134/9,134), and lines (38,224/38,224).
- Trait-detail loading now retains its metadata card, responsive density
  toolbar, All/Collection scope control, and density-aware horizontal
  character cards with 2:3 portraits. Thirty-seven focused route and geometry
  scenarios pass, the production build passes, and the full suite passes 9,805
  tests with exactly 100% statements (44,769/44,769), branches
  (38,080/38,080), functions (9,135/9,135), and lines (38,225/38,225).
- Release inventory loading now uses the same linked-VN identity, relation
  metadata, ownership toggle, edit action, and touch-sized remove action as
  the resolved direct-management rows. Forty-one focused loading and release
  scenarios pass, the production build passes, and the full suite passes 9,806
  tests with exactly 100% statements (44,770/44,770), branches
  (38,082/38,082), functions (9,136/9,136), and lines (38,226/38,226).
- VNDB tag loading now retains its responsive accordion tree, wrapped tag
  chips, and separate Popular and Recently Added list panels instead of
  repainting three generic row stacks. Forty-seven focused tag scenarios pass,
  the production build passes, and the full suite passes 9,807 tests with
  exactly 100% statements (44,773/44,773), branches (38,082/38,082),
  functions (9,139/9,139), and lines (38,229/38,229).
- Provider assignment loading now retains the final bounded list, one-line
  provider identity, and one touch-sized assignment action per row instead of
  painting four multi-line content cards. Twenty-seven focused place-dialog
  scenarios pass, the production build passes, and the full suite passes 9,807
  tests with exactly 100% statements (44,774/44,774), branches
  (38,082/38,082), functions (9,140/9,140), and lines (38,230/38,230).
- Lazy-loaded settings chunks now preserve the three layout subtabs, all 26
  per-page route groups, credential fields, four proxy sections, provider
  controls, and quote preference instead of showing six unrelated text rows.
  Sixty-eight focused settings scenarios pass, the production build passes,
  and the full suite passes 9,809 tests with exactly 100% statements
  (44,784/44,784), branches (38,082/38,082), functions (9,147/9,147), and
  lines (38,240/38,240).
- Seiyuu loading no longer reserves a fixed three-alias list and three-line
  biography for optional profile data. Stable identity, metadata counters,
  tools, scope controls, saved section order, timeline, and credit cards remain
  represented. The focused loading and staff suites pass 116 scenarios, the
  production build passes, and the full suite remains at 9,809 tests with
  exactly 100% statements (44,784/44,784), branches (38,082/38,082),
  functions (9,147/9,147), and lines (38,240/38,240).
- Stock cache confirmation loading now stays in the modal layer and reserves
  the final compact panel, message, and two actions without shifting the VN
  stock page. One hundred twenty-three focused stock and dialog scenarios
  pass, the production build passes, and the full suite passes 9,810 tests with
  exactly 100% statements (44,785/44,785), branches (38,082/38,082),
  functions (9,147/9,147), and lines (38,241/38,241).
- Data maintenance loading now retains three distinct responsive columns:
  duplicate identifier chips, stale-title refresh actions, and provider
  freshness metadata. Sixty-six focused maintenance and support-page scenarios
  pass, the production build passes, and the full suite passes 9,810 tests with
  exactly 100% statements (44,787/44,787), branches (38,088/38,088),
  functions (9,149/9,149), and lines (38,243/38,243).
- Physical-bundle loading now retains member metadata and a coarse-pointer-safe
  dissolve action; selective-download loading retains checkbox, title, VNDB id,
  and year columns. One hundred thirty-one focused dialog, shelf, responsive,
  and selection scenarios pass, the production build passes, and the full
  suite passes 9,811 tests with exactly 100% statements (44,789/44,789),
  branches (38,088/38,088), functions (9,151/9,151), and lines
  (38,245/38,245).
- VN route loading no longer appends an invented passive-row section beneath
  the guaranteed hero, synopsis, and media geometry. Configurable sections keep
  their own destination-specific fallbacks when they mount. Sixty-six focused
  route and loading scenarios pass, the production build passes, and the full
  suite remains at 9,811 tests with exactly 100% statements (44,789/44,789),
  branches (38,088/38,088), functions (9,151/9,151), and lines
  (38,245/38,245).
- Tag detail loading now retains its back action, metadata and status chips,
  Local/VNDB mode controls, primary actions, density control, and framed VN
  results instead of using an opaque hero rectangle. Seventy-one focused route,
  density, and loading scenarios pass, the production build passes, and the
  full suite passes 9,812 tests with exactly 100% statements (44,789/44,789),
  branches (38,088/38,088), functions (9,151/9,151), and lines
  (38,245/38,245).
- Character browser loading now retains its search row, three source modes,
  four segmented filter groups, six numeric/misc groups, responsive columns,
  and 3:4 result grid instead of one opaque panel. Eighty-two focused browser,
  route, density, and loading scenarios pass, the production build passes, and
  the full suite passes 9,813 tests with exactly 100% statements
  (44,793/44,793), branches (38,090/38,090), functions (9,155/9,155), and
  lines (38,249/38,249).
- Compare loading now retains the picker, common-facet summary, two-item mobile
  card rows, and desktop comparison matrix instead of assuming four selected
  covers plus an opaque body. Seventy-three focused route, comparison, and
  loading scenarios pass, the production build passes, and the full suite
  passes 9,814 tests with exactly 100% statements (44,797/44,797), branches
  (38,090/38,090), functions (9,159/9,159), and lines (38,253/38,253).
- Printable-label loading now retains its return/print toolbar and compact
  horizontal labels with 80 px QR, title, id, and location geometry at the
  final print-grid breakpoints. Seventy-five focused route, label, QR-origin,
  and loading scenarios pass, the production build passes, and the full suite
  passes 9,815 tests with exactly 100% statements (44,797/44,797), branches
  (38,090/38,090), functions (9,159/9,159), and lines (38,253/38,253).
- Series-index loading now retains the name/description/create form and
  density-aware title/description cards with their delete actions. Eighty-six
  focused route, manager, density, and loading scenarios pass, the production
  build passes, and the full suite passes 9,816 tests with exactly 100%
  statements (44,798/44,798), branches (38,090/38,090), functions
  (9,160/9,160), and lines (38,254/38,254).
- List-index loading now retains the wrapping name/description form, colour
  palette, create action, and responsive cards with identity, count, and menu
  geometry. Ninety-four focused route, form, action, and loading scenarios
  pass, the production build passes, and the full suite passes 9,817 tests with
  exactly 100% statements (44,800/44,800), branches (38,090/38,090),
  functions (9,162/9,162), and lines (38,256/38,256).
- List-detail loading now retains mobile return, list identity, density and
  metadata tools, the add-item form, and remove actions on every density-aware
  cover placeholder. Sixty-nine focused route, reorder, metadata, removal, and
  runtime scenarios pass, the production build passes, and the full suite
  passes 9,818 tests with exactly 100% statements (44,802/44,802), branches
  (38,090/38,090), functions (9,164/9,164), and lines (38,258/38,258).
- Series-detail loading now follows the saved section order, visibility, and
  collapsed state while retaining layout tools, guaranteed hero identity, the
  add-item workflow, removable density-aware covers, and the complete media
  editor. Eighty-one focused route, layout, and runtime scenarios pass, the
  production build passes, and the full suite passes 9,820 tests with exactly
  100% statements (44,817/44,817), branches (38,096/38,096), functions
  (9,169/9,169), and lines (38,271/38,271).
- Compare result highlighting now resets in the same render transaction as a
  result replacement, so a later effect cannot overwrite pointer intent. The
  race scenario passes ten consecutive isolated iterations and all 25 picker
  scenarios; the production build passes, and the full suite passes 9,820
  tests with exactly 100% statements (44,817/44,817), branches
  (38,096/38,096), functions (9,168/9,168), and lines (38,271/38,271).
- Trait-browser loading now retains page identity, refresh, search, collection
  scope, density control, and the real title/optional-rating/description/count
  card anatomy. Sixty-eight focused route, browser, wrapper, and refresh
  scenarios pass, the production build passes, and the full suite passes 9,821
  tests with exactly 100% statements (44,818/44,818), branches
  (38,098/38,098), functions (9,169/9,169), and lines (38,272/38,272).
- Tag-browser route and filtered-query loading now share the same category and
  external-action card anatomy, while route navigation retains identity,
  refresh, source tabs, search, and category controls. One hundred five focused
  route, browser, wrapper, and refresh scenarios pass, the production build
  passes, and the full suite passes 9,822 tests with exactly 100% statements
  (44,820/44,820), branches (38,100/38,100), functions (9,171/9,171), and
  lines (38,274/38,274).
- Similar loading now retains only the mobile return and seed-picker header
  shared by empty, invalid, and selected-seed states, instead of fabricating a
  cover and twelve recommendations. One hundred eight focused route, picker,
  runtime, and loading scenarios pass, the production build passes, and the
  full suite passes 9,823 tests with exactly 100% statements (44,820/44,820),
  branches (38,100/38,100), functions (9,171/9,171), and lines
  (38,274/38,274).
- Recommendation seed derivation now retains the complete labelled chip,
  search, and hint frame instead of one anonymous bar. Ninety-three focused
  recommendation, seed-control, route, and loading scenarios pass, the
  production build passes, and the full suite passes 9,824 tests with exactly
  100% statements (44,821/44,821), branches (38,100/38,100), functions
  (9,172/9,172), and lines (38,275/38,275).
- Streamed external seiyuu loading now reserves one neutral subgroup and four
  cards with the geometry shared by voice and production credits, avoiding a
  large eight-card block when the optional payload resolves empty. Ninety-one
  focused staff, route, runtime, and loading scenarios pass, the production
  build passes, and the full suite remains at 9,824 tests with exactly 100%
  statements (44,821/44,821), branches (38,100/38,100), functions
  (9,172/9,172), and lines (38,275/38,275).
- The EGS cover-source picker now reserves three 2:3 candidate cards plus the
  real automatic-cover action instead of one opaque rectangle, preventing the
  picker from changing both structure and height when candidates arrive.
  Seventy focused picker, image-loading, and lazy-artwork scenarios pass, the
  production build passes, and the full suite passes 9,825 tests with exactly
  100% statements (44,822/44,822), branches (38,100/38,100), functions
  (9,173/9,173), and lines (38,276/38,276).
- Trait route and filtered-query loading now share one density-aware result
  skeleton with the real title, optional R18 marker, description, and count
  geometry. Seventy-one focused browser, route-loading, image-loading, and
  wrapper scenarios pass, the production build passes, and the full suite
  passes 9,825 tests with exactly 100% statements (44,823/44,823), branches
  (38,102/38,102), functions (9,174/9,174), and lines (38,277/38,277).
- Place-stock loading now follows the persisted view: cards retain their 2:3
  artwork, status, metadata, producer, and action zones, while list mode keeps
  its thumbnail, text, status, and VN action row. Eighty focused place-browser,
  route-loading, and image-loading scenarios pass, the production build passes,
  and the full suite passes 9,826 tests with exactly 100% statements
  (44,827/44,827), branches (38,096/38,096), functions (9,176/9,176), and
  lines (38,281/38,281).
- AliceNet shop loading now preserves its dedicated card or list layout,
  including artwork, match status, metadata, provider, normalized-title, link,
  and remap zones, without relocating any AliceNet operation. One hundred
  thirty-five focused client, branch, SSR, branding, and image-loading
  scenarios pass, the production build passes, and the full suite passes 9,827
  tests with exactly 100% statements (44,831/44,831), branches
  (38,090/38,090), functions (9,178/9,178), and lines (38,285/38,285).
- The shop registry now keeps the exact active result family while requests
  run: actionable place cards, metadata-rich list rows, or assignable branch
  rows. Ninety-one focused registry, place-card, route-loading, and
  image-loading scenarios pass, the production build passes, and the full
  suite passes 9,828 tests with exactly 100% statements (44,839/44,839),
  branches (38,086/38,086), functions (9,182/9,182), and lines
  (38,293/38,293).
- Shop cards now expose the localized expansion of `GPS` through the same
  acronym glossary as list rows. Focused place-card and i18n tests pass, the
  production build passes, and the PostgreSQL-backed suite passes 9,828 tests
  with exactly 100% statements (44,839/44,839), branches (38,086/38,086),
  functions (9,182/9,182), and lines (38,293/38,293).
- Staff detail loading now reserves only guaranteed profile controls and
  renders persisted collapsed sections as the same compact 44-pixel header
  used by the resolved page. Fifty-two focused loading and staff scenarios
  pass, the production build passes, and the PostgreSQL-backed suite passes
  9,828 tests with exactly 100% statements (44,842/44,842), branches
  (38,088/38,088), functions (9,183/9,183), and lines (38,296/38,296).
- Per-page layout settings now share one complete 26-row placeholder across
  lazy chunk loading and client hydration, including spacing presets, optional
  density controls, and reset actions. Thirty-six focused settings scenarios
  pass, the production build passes, and the PostgreSQL-backed suite passes
  9,828 tests with exactly 100% statements (44,846/44,846), branches
  (38,103/38,103), functions (9,185/9,185), and lines (38,300/38,300).
- Recent stock activity now shares one route/client placeholder with four VN
  identity rows and two completed-batch rows carrying timestamp and summary
  geometry. Fifty-three focused stock and route-loading scenarios pass, the
  production build passes, and the PostgreSQL-backed suite passes 9,828 tests
  with exactly 100% statements (44,847/44,847), branches (38,114/38,114),
  functions (9,186/9,186), and lines (38,301/38,301).
- Cache loading now preserves four labelled statistic cards, two freshness
  date rows, and both maintenance actions instead of four unrelated blocks.
  Fifty-seven focused cache, lifecycle, and touch-target scenarios pass, the
  production build passes, and the PostgreSQL-backed suite passes 9,828 tests
  with exactly 100% statements (44,849/44,849), branches (38,114/38,114),
  functions (9,188/9,188), and lines (38,303/38,303).
- Unavailable per-field VNDB synchronization directions now flow through the
  typed API error contract and precise French, English, and Japanese copy.
  One hundred sixteen focused panel, mutation, and i18n scenarios pass, the
  production build passes, and the PostgreSQL-backed suite passes 9,829 tests
  with exactly 100% statements (44,849/44,849), branches (38,114/38,114),
  functions (9,188/9,188), and lines (38,303/38,303).
- VNDB wishlist mutations now expose stable token and `listwrite` permission
  codes. French and Japanese users receive an actionable localized message,
  while English retains useful diagnostics for unknown failures. Fifty-nine
  focused wishlist and i18n scenarios pass, the production build passes, and
  the PostgreSQL-backed suite passes 9,830 tests with exactly 100% statements
  (44,850/44,850), branches (38,116/38,116), functions (9,188/9,188), and
  lines (38,305/38,305).
- Stock batch startup now translates invalid-provider, saturated-queue, and
  unavailable-run codes in all three locales. Unknown safe diagnostics remain
  visible in English and become a localized fallback elsewhere. Seventy-three
  focused stock and i18n scenarios pass, the production build passes, and the
  PostgreSQL-backed suite passes 9,832 tests with exactly 100% statements
  (44,858/44,858), branches (38,122/38,122), functions (9,189/9,189), and
  lines (38,312/38,312).
- Producer refresh now translates its coded VNDB outage instead of collapsing
  it to a generic non-English error. The shared reader preserves safe unknown
  diagnostics only for English across producer and stock mutations. Sixty-six
  focused reader, producer, and stock scenarios pass, the production build
  passes, and the PostgreSQL-backed suite passes 9,836 tests with exactly 100%
  statements (44,857/44,857), branches (38,122/38,122), functions
  (9,189/9,189), and lines (38,311/38,311).
- Library and grid stock summaries now include matched AliceNet packages stored
  outside the generic offer table. SQLite and PostgreSQL share the guarded yen
  parsing and price fallback used by shop views, while excluding any legacy
  materialized AliceNet offer to prevent double counting. The engine contract
  verifies multiple packages, sale-price preference, and list-price fallback;
  the production build passes, and the PostgreSQL-backed suite passes 9,838
  tests with exactly 100% statements (44,860/44,860), branches
  (38,122/38,122), functions (9,189/9,189), and lines (38,314/38,314).
- Staff detail loading now reserves the common rich-profile anatomy seen in the
  real cache instead of collapsing a typical seiyuu header to two counters.
  Original-name, metadata, alias, description, and link rows match the final
  responsive flow; density and action controls use their resolved widths, and
  external credits receive exactly one section gap. Sixty-four focused staff
  and loading scenarios pass, the production build passes, and the
  PostgreSQL-backed suite passes 9,839 tests with exactly 100% statements
  (44,860/44,860), branches (38,125/38,125), functions (9,189/9,189), and
  lines (38,314/38,314).
- VN detail client loaders now preserve the final VNDB actions, collapsed
  editor, label controls, EGS no-match actions, and aspect button geometry.
  Rich EGS details hydrate from the stored server snapshot instead of issuing
  a duplicate request; all 476 linked production rows have that payload, and
  relinking revalidates it in place with stale-request protection. The
  production build passes, and the PostgreSQL-backed suite passes 9,841 tests
  with exactly 100% statements (44,880/44,880), branches (38,147/38,147),
  functions (9,188/9,188), and lines (38,333/38,333).
- Lazy module boundaries now retain all thirteen advanced Library flags, the
  complete Eroge Price card, the selected responsive map height, and the full
  portalled AliceNet remapping dialog. The same Eroge Price placeholder is
  shared by data and module loading, eliminating the intermediate blank frame.
  Fifty-nine focused scenarios and the production build pass; the complete
  PostgreSQL-backed suite passes 9,844 tests with exactly 100% statements
  (44,887/44,887), branches (38,147/38,147), functions (9,193/9,193), and
  lines (38,340/38,340).
- VNDB synchronization now has a verified field-specific contract for local
  status, rating, dates, notes, wishlist, and labels. Both per-item and global
  flows revalidate preview snapshots before applying them, local pulls use an
  atomic compare-and-set, and absent remote status cannot erase a local value.
  A read-only production probe confirmed an authenticated entry, eight labels,
  and explicit pull and push directions for the detected difference.
  Automatic status writeback keeps local mutations authoritative but now logs
  bounded HTTP-class or network diagnostics instead of silently discarding
  failures. One hundred eighty-nine focused scenarios, typecheck, and the
  production build pass; the complete PostgreSQL-backed suite passes 9,844
  tests with exactly 100% statements (44,890/44,890), branches
  (38,149/38,149), functions (9,193/9,193), and lines (38,343/38,343).
- Every audited native image path now uses the same restrained loading surface:
  `SafeImage`, `LoadingImage`, and the hydrated VN banner no longer introduce
  high-contrast animated gradients that Firefox can composite above the route
  placeholder. The structural inventory still confirms that no unaudited
  native image implementation exists outside those three components. Eighty-nine
  focused scenarios, typecheck, and the production build pass; the complete
  PostgreSQL-backed suite passes 9,846 tests with exactly 100% statements
  (44,890/44,890), branches (38,149/38,149), functions (9,193/9,193), and
  lines (38,343/38,343).
- AliceNet no longer paints a false empty timestamp, eight zero counters, or a
  missing data-dependent action while its first bounded page resolves. Browser
  inspection confirmed that the real shop holds 1,412 rows and replaces the
  complete placeholder without moving controls outside the linked shop page.
  Place and per-VN stock timestamps now use the inventory `fetched_at` rather
  than metadata `updated_at`; the dual-engine contract intentionally separates
  those values and still reports the fetch timestamp. Production read-only
  evidence shows one common completed snapshot across all 1,412 rows and a
  matching durable `alicenet_last_fetch`. One hundred ninety-six focused
  scenarios, all 95 PostgreSQL integration scenarios, typecheck, and the
  production build pass; the complete PostgreSQL-backed suite passes 9,846
  tests with exactly 100% statements (44,890/44,890), branches
  (38,155/38,155), functions (9,193/9,193), and lines (38,343/38,343).
- Production-credit roles now use one shared contract across VN detail, staff
  detail, staff search, comparison, overlap, and external-credit surfaces.
  Translator, editor, and quality-assurance credits retain their own localized
  groups in French, English, and Japanese; editor and QA are also available as
  staff-search filters. Browser inspection on a real cached VN confirms all
  four relevant group labels, the production build passes, and the complete
  PostgreSQL-backed suite passes 9,846 tests with exactly 100% statements
  (44,886/44,886), branches (38,155/38,155), functions (9,193/9,193), and
  lines (38,339/38,339).
- Long seiyuu route loading now reserves four, eight, or twelve rich credit
  cards at phone, tablet, and wide breakpoints instead of presenting less than
  one desktop row before a 60-item page appears. It also mirrors the possible
  profile-match section and encodes the complete section map as a total typed
  record, removing an obsolete unreachable fallback. Fifty-three focused
  loading scenarios, typecheck, and the production build pass; the complete
  PostgreSQL-backed suite passes 9,846 tests with exactly 100% statements
  (44,888/44,888), branches (38,157/38,157), functions (9,195/9,195), and
  lines (38,341/38,341).
- Shared image wrappers now reveal on the browser's authoritative load event
  and run `decode()` only as a guarded non-blocking optimization. A hydration
  reconciliation checks `complete` and `naturalWidth`, so locally cached images
  that finish before React attaches handlers no longer remain transparent under
  a permanent pulse; early failures resolve to the accessible image fallback.
  Mobile browser evidence on a real VN changed the same cover from persistent
  `opacity-0` to visible `opacity-100`. Fifty-four focused scenarios, typecheck,
  and the production build pass; the complete PostgreSQL-backed suite passes
  9,852 tests with exactly 100% statements (44,900/44,900), branches
  (38,165/38,165), functions (9,199/9,199), and lines (38,348/38,348).
- The VN hero banner now reconciles both outcomes when its native image request
  finishes before React hydration. A cached success reveals immediately, while
  an early failure replaces the pulse with the stable image fallback instead
  of waiting for an event that cannot fire again. Fifty-six focused scenarios,
  typecheck, and the production build pass; the complete PostgreSQL-backed
  suite passes 9,853 tests with exactly 100% statements (44,902/44,902),
  branches (38,164/38,164), functions (9,199/9,199), and lines
  (38,350/38,350).
- Residual compact controls now preserve their 44-pixel hit areas on every
  coarse-pointer device, including wide touch screens. Stock operations,
  edition removal, dump ignore, saved-filter dragging, platform overflow, and
  Eroge Price candidate removal only compact for a fine pointer that supports
  hover. Their Stock, Dumped, Top Ranked, and list-picker placeholders follow
  the same rule, and a repository-wide invariant rejects width-only minimum
  size reductions. Three hundred four focused scenarios, typecheck, and the
  production build pass; the complete PostgreSQL-backed suite passes 9,854
  tests with exactly 100% statements (44,902/44,902), branches
  (38,164/38,164), functions (9,199/9,199), and lines (38,350/38,350).
- Wishlist now shares one complete workspace placeholder between App Router
  streaming and its first client request. Search, sorting, grouping,
  ownership, density, refresh, bulk actions, summary, advanced filters, and
  the card grid retain their destination geometry instead of inserting the
  entire control stack after hydration. Browser comparison confirms that the
  first grid begins at the same part of the viewport as the resolved page.
  One hundred seventy-three focused scenarios, typecheck, and the production
  build pass; the complete PostgreSQL-backed suite passes 9,854 tests with
  exactly 100% statements (44,903/44,903), branches (38,164/38,164),
  functions (9,200/9,200), and lines (38,351/38,351).
- AliceNet remains a specialized embedded surface on its linked shop detail
  page, with no standalone route or navigation entry. A live production stock
  run exercised detached startup, indeterminate fetch progress, determinate
  completion at 1,412 of 1,412 rows, and zero errors. The resulting timestamp
  immediately changed the shop freshness label to today and propagated to its
  synthesized per-VN offers. Initial request failures now remain visible with
  an explicit retry, while refresh failures preserve the previously loaded
  stock instead of displaying a false empty state. Pagination, all match and
  ownership filters, grouping, sorting, search, background stop and retry,
  manual linking, both database engines, and migration compatibility are
  covered by 387 passing focused scenarios. Final complete-suite coverage
  verification remains tracked by R14-TEST-002.
- Production provider diagnostics prove that the latest durable generic stock
  batch selected only Sofmap; its rows were updated after that run, while the
  other 21 sources still hold older snapshots and therefore correctly remain
  stale. Batch controls now expose the active selection count, state that only
  selected sources are renewed, and cannot visually re-enable a provider that
  Settings disabled. Thirty-one focused stock and dictionary scenarios pass,
  together with typecheck; the complete stock audit remains R14-STOCK-001.
