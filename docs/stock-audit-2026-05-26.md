# Stock System Architecture Audit — 2026-05-26

Baseline: commit `f65b02ba` · 1958/1958 tests · TypeScript EXIT:0

---

## 1. End-to-end data flow

```
User                Browser               Next.js server               SQLite
 │                     │                        │                         │
 │  /vn/[id] load      │                        │                         │
 │─────────────────────▶  RSC: getStockForVn()  │                         │
 │                     │───────────────────────▶│  listVnStockOffers()    │
 │                     │                        │────────────────────────▶│
 │                     │                        │◀────────────────────────│
 │                     │                        │  listKobeStockForVn()   │
 │                     │                        │────────────────────────▶│
 │                     │                        │◀────────────────────────│
 │  initialSnapshot    │◀───────────────────────│                         │
 │  StockPanel hydrate │                        │                         │
 │                     │                        │                         │
 │  Press "Check"      │                        │                         │
 │─────────────────────▶  POST /stock {providers:[p1]}                    │
 │                     │───────────────────────▶│  refreshProvider(p1)    │
 │                     │                        │──── HTTP → shop ──────▶ │
 │                     │                        │◀─── HTML ────────────── │
 │                     │                        │  replaceSnapshot()      │
 │                     │                        │────────────────────────▶│
 │  StockSnapshot      │◀───────────────────────│  getStockForVn()        │
 │  setSnapshot()      │                        │────────────────────────▶│
```

Key asymmetry: the VN detail page gets an `initialSnapshot` from SSR (no loading state). The `/stock` standalone page starts with a loading state and fetches via GET on mount.

---

## 2. File map

| File | Role |
|---|---|
| `src/lib/stock.ts` | All provider logic: parsers, refresh functions, `getStockForVn`, provider metadata |
| `src/lib/stock-classify.ts` | Pure offer classification (no I/O): `classifyOffer`, `classificationToFields` |
| `src/lib/url-allowlist.ts` | SSRF gate: `isAllowedHttpTarget`, `assertNoPrivateIpRebind` |
| `src/app/api/vn/[id]/stock/route.ts` | GET (read cache) + POST (refresh) |
| `src/app/api/vn/[id]/stock/aliases/route.ts` | GET + POST alias management |
| `src/app/stock/page.tsx` | `/stock` RSC shell, passes `initialVnId` from `?vn=` |
| `src/components/StockLookupClient.tsx` | VN search box + panel on `/stock` page |
| `src/components/StockPanel.tsx` | Provider grid, offer groups, alias editor, refresh loop |
| `src/lib/db.ts` (lines 698–755, 9016–9200) | Schema: `vn_stock_offer`, `vn_stock_provider_status`, `vn_stock_alias`; all stock DB functions |
| `src/lib/i18n/dictionaries.ts` | `t.stock.*` block (FR/EN/JA) |
| `tests/stock-aliases.test.ts` | 65 lines — alias CRUD |
| `tests/stock-classify.test.ts` | 136 lines — `classifyOffer`, `normalizeTitle`, `seriesNumberMismatch` |
| `tests/stock-providers.test.ts` | 509 lines — provider metadata helpers |
| `tests/stock-surugaya.test.ts` | 200 lines — `parseSurugayaSearch`, `buildSurugayaSearchUrl` |
| `tests/stock-trader-chuko.test.ts` | 405 lines — `encodeEucJpQuery`, `traderSearchVariants`, list+detail parsers |

---

## 3. Database model

### `vn_stock_offer`
- PK: `(vn_id, provider, provider_offer_id)` — one row per unique offer per provider per VN.
- Classification columns added via `ensureColumn` migrations: `location_branch`, `content_kind`, `platform`, `edition_kind`, `series_relation`, `match_confidence`, `match_score`, `match_warnings_json`, `marketplace_price`, `marketplace_count`, `list_price`, `category`, `store_code`, `product_id`, `page_kind`.
- Two indexes: `(vn_id, availability, price)` for sorted reads; `(provider, fetched_at)` for housekeeping.
- **No TTL column** — offers never expire automatically. They are only removed by the next `replaceVnStockProviderSnapshot` call for the same `(vn_id, provider)` pair. Old offers for a provider remain indefinitely if that provider is never re-checked for a VN.
- **No FK on `vn_id`** — stock can be pre-fetched for VNs not yet in the `vn` table (though this path is not exercised today).

### `vn_stock_provider_status`
- PK: `(vn_id, provider)` — one row per provider per VN.
- No historical log — status is overwritten on each refresh.

### `vn_stock_alias`
- PK: `(vn_id, alias_term)`.
- No FK on `vn_id`.
- `created_at` defaults to 0 on old rows (pre-migration).

### Notable DB function
`listRecentVnStockOffers(limit)` — defined at line 9117 in db.ts but **never called from any route or component**. Dead code.

---

## 4. AliceSoft Kobe cached stock

- `alicesoft_kobe` is a `kind: 'cached'` provider — it is never POSTed by the refresh loop.
- `getStockForVn` merges `listKobeStockForVn(vnId)` directly, bypassing the `vn_stock_offer` table entirely.
- Kobe offers always have `availability: 'in_stock'` — the Kobe stock page only lists items currently for sale; sold items are deleted on full-sync.
- Kobe offers have `content_kind: 'game_package'` hardcoded, `match_confidence: null`.
- `location_branch: null` — Kobe is a single physical store; a future improvement would set `location_branch: 'AliceSoft Kobe'` and flip `confirmedPhysicalUsable: true` if desired (it already is `true`).

---

## 5. Provider taxonomy

### 5.1 `PhysicalStockMode` values in use

| Mode | Providers | Meaning |
|---|---|---|
| `none` | eroge_price | Online aggregate only |
| `online_only` | melonbooks, ebten, getchu, gamers, gamecity, asakusa_mach, amazon_jp, amiami, otakarasouko, bikkuri_takarajima, neowing | Online-only shop |
| `single_shop` | hgame1 | One physical location, exact stock known |
| `store_locator_only` | wondergoo | Has stores but locator is browser-JS only |
| `phone_only` | trader, joshin | Per-store stock requires phone query |
| `store_name_online` | mandarake | Online listing shows branch name |
| `exact_online` | sofmap | Per-branch stock available via product_list_parts |
| `exact_online_possible_not_implemented` | animate, geo, yodobashi | Parser not yet written |
| `exact_online_browser_required` | surugaya | Cloudflare blocks automated access |
| `exact_cached` | alicesoft_kobe | Single-store, confirmed by operator sync |

### 5.2 List coherence

- `PHYSICAL_CAPABLE_PROVIDER_IDS` (12): sofmap, surugaya, hgame1, mandarake, wondergoo, trader, animate, otakarasouko, geo, joshin, yodobashi, bikkuri_takarajima
- `CONFIRMED_PHYSICAL_PROVIDER_IDS` (2): sofmap, hgame1
- `USELESS_FOR_CONFIRMED_PHYSICAL_STOCK` (14): wondergoo, trader, otakarasouko, bikkuri_takarajima, joshin, melonbooks, ebten, getchu, gamers, gamecity, asakusa_mach, amazon_jp, amiami, neowing

**Gap**: `animate`, `geo`, `yodobashi`, `surugaya`, `mandarake` are in `PHYSICAL_CAPABLE_PROVIDER_IDS` but absent from both `CONFIRMED_PHYSICAL_PROVIDER_IDS` and `USELESS_FOR_CONFIRMED_PHYSICAL_STOCK`. This is intentional (they're "pending implementation") but not explicitly documented.

---

## 6. Provider implementation audit

### Sofmap
- Two-pass: `product_list_parts` (list) → optional `product_detail` (detail). Up to 12 targets.
- Adult bypass: `?aac=on` URL param + `cookie: UCAA=on`.
- `parseSofmapList` correctly extracts `location_branch` from the store anchor link.
- `parseSofmapDetail` sets `location_label` to stockText only — may be empty string if no stock table found.
- **Bug**: `releaseTargetsForProvider` line 388–389: `PROVIDER_HOSTS['sofmap']?.test(host)` matches `/(^|\.)sofmap\.com$/`, then line 389 adds the same URL again with `if (provider === 'sofmap' && /sofmap\.com$/.test(host))`. Duplicate before `uniqTargets` dedup. Same pattern for surugaya, melonbooks, mandarake, wondergoo, trader.
- Classification: **not applied** — all Sofmap offers have `match_confidence: null`.

### Suruga-ya
- Two-pass: page 1 → optional pages 2–3. Up to 3 queries × 3 pages = 9 requests.
- `parseSurugayaSearch` is a full two-pass (unique links collection → context slice). Context bleeding bug was fixed (ctxStart = pos, not pos-600).
- `cloudflare: true` — normal for this provider; UI shows amber lock badge.
- Classification: **applied** via `surugayaCardToOffer` → `classifyOffer`.
- `storeCode` and `branchNumber` extracted from query string but `location_branch` is only set to `Store {code}` — not a human-readable branch name.

### Trader / chuko-tsuhan
- List + detail: up to 3 queries × 16 variants × optional detail page = 48 list requests + up to 10 detail pages.
- EUC-JP encoding via `iconv-lite`.
- `location_branch: null` always — correct since "秋葉原トレーダー通販" is an online shop, not a branch name.
- Classification: **applied** via `classifyOffer`.
- **Dead export**: `parseTraderList` (legacy HTML parser, never called from `refreshTrader`).

### Hgame1 (PC Shop Unoya)
- Direct JAN-based URL: `hgame1.com/item/{jan}.html`.
- Stock code `1/2/3` mapped to `out_of_stock/limited/in_stock`.
- Classification: **not applied**.
- Age gate: `cookie: age_verified=1`.

### Melonbooks
- Direct product page parser.
- Classification: **not applied**.

### Mandarake
- Search list → optional detail pages (up to 5 per list result).
- `location_label: 'Mandarake'` — not branch-specific despite `physicalStockMode: 'store_name_online'`. The parser would need to extract the branch name from the listing title/description.
- Classification: **not applied**.

### WonderGOO
- Direct page parser. `availability: 'unknown'` always — the parser can't determine stock status from the page structure.
- Classification: **not applied**.

### Generic providers (animate, ebten, getchu, gamers, geo, joshin, yodobashi, amazon_jp, asakusa_mach, otakarasouko, bikkuri_takarajima, neowing)
- `parseKnownProviderList` per-provider → `providerListPatterns` fallback → `genericTitle`+`parsePriceYen` catch-all.
- Classification: **not applied** for any of these.

### Eroge Price
- JSON-LD `Offer` nodes + `<tr>` table fallback.
- **Convention violation**: `source` field is set to the seller name (`seller ?? 'Eroge Price'`) instead of `'direct'` or `'search'`. The `source` column is logically meant for provenance (`direct` = from a release link, `search` = from a title query). The seller name is already in `location_label` and `availability_label`.

---

## 7. Classification audit

`classifyOffer` (in `stock-classify.ts`) is a pure scoring function:

| Step | Signal | Score effect |
|---|---|---|
| Content kind | Goods category → related_goods | −50 |
| | Figure category | −50 |
| | Soundtrack/Artbook | −40 |
| | Software category | +40 |
| | `[単品]` prefix | −60 |
| Platform | Any platform known | +10 |
| | Platform matches target | +15 |
| Edition | Known edition suffix | +10 |
| Title match | Contains target title | +50 (game_package) or +30 |
| | Series number mismatch | −40 |
| | Unrelated | −40 |

Confidence bands: `exact` ≥ 100 · `high` ≥ 70 · `medium` ≥ 40 · `low` ≥ 10 · `reject` < 10.

**Gap**: Only `surugaya` and `trader` call `classifyOffer`. All other providers store `match_confidence: null`, so their offers fall into the "game" group in `OffersGrouped` by the `content_kind === null → 'game'` default. Users see no relevance signal for ~18 of 22 providers.

**Classification is not applied to `eroge_price`** despite having a `title` field. This could produce useful filtering (bonus items vs game packages) for titles with many ErogePrice rows.

---

## 8. Alias system

- Aliases are stored in `vn_stock_alias(vn_id, alias_term)`.
- Used in `titleQueries(vn, extraTerms)` to expand search queries.
- Applied to: surugaya, trader, and all providers using `allTargetsForProvider` → `releaseTargetsForProvider` → `titleQueries`.
- Aliases also feed into `ClassifyTarget.aliases` for `classifyOffer` title matching (the normalized alias is checked against the offer title).
- **No alias length validation** at the API layer — `term` is only checked to be a non-empty string. A very long alias term could produce a nonsensical search URL.
- **No alias deduplication** at the API layer (only DB PK dedup via `INSERT OR REPLACE`).

---

## 9. API audit

### GET `/api/vn/[id]/stock`
- Returns `getStockForVn(id)` — reads DB only, no network.
- **No staleness check** — returns whatever is in the DB regardless of age.
- **Missing**: A `stale: boolean` field in the response indicating whether any provider was last checked > N hours ago.

### POST `/api/vn/[id]/stock`
- Body: `{ providers?: string[] }`. Unknown provider IDs silently filtered out.
- Returns full `StockSnapshot` after refresh.
- Error: `500` with `{ error: message }`. A Cloudflare challenge throws `'cloudflare_challenge'` which the route re-throws as a 500. **The route should return 200 with the snapshot even on provider errors** — individual provider errors are already captured in `vn_stock_provider_status`. The current behavior means the frontend gets a 500 if any provider throws unexpectedly outside the try/catch in `refreshStockForVn`.
  - Actually, looking more carefully: `refreshStockForVn` wraps each provider in a try/catch and writes an error status. The outer `refreshStockForVn` function itself can only throw if `loadVnForStock` fails (VN not found) or `getReleasesForVn` fails. In practice, provider network errors are caught per-provider. So the 500 path is only for VN-not-found or catastrophic failures. This is acceptable.

### GET `/api/vn/[id]/stock/aliases`
- Returns `{ aliases: string[] }`.

### POST `/api/vn/[id]/stock/aliases`
- Body: `{ term: string, action: 'add' | 'delete' }`.
- No max alias count enforcement.
- No alias content validation (length, character set).

---

## 10. VN detail page integration

- `<StockPanel vnId={vn.id} title={displayTitle} initialSnapshot={getStockForVn(vn.id)} />`
- `initialSnapshot` is synchronous — `getStockForVn` is a DB-only function, no I/O.
- **Issue**: On first visit to a VN page, `initialSnapshot` contains empty offers (no refreshes done yet). The StockPanel shows the "No stock data — press Check to search" message immediately. This is correct but could be confusing: the user must manually press Check even on the detail page.
- **Issue**: `physicalDefaultRef` fires immediately because `providers.length > 0` (from `initialSnapshot.providers`). This auto-selects physical providers as the initial selection on the VN detail page. For a detail page, defaulting to "All" might be more intuitive — the physical-first default makes more sense on the `/stock` page.

---

## 11. `/stock` page audit

- Server RSC: passes `initialVnId` from `?vn=` querystring.
- `StockLookupClient`: debounced search via `GET /api/search?q=`.
- `StockPanel` receives `title={selected?.title}` where `selected` is `hits.find(hit => hit.id === initialVnId)`.
- **Issue**: If the user navigates to `/stock?vn=v123` directly (no search query typed), `hits` is empty and `selected` is null → `title` is undefined → no VN title shown in the panel header. Fix: load VN title from `GET /api/vn/v123` when `initialVnId` is set but `selected` is null.
- **Missing**: No "recently checked" or "search history" on the `/stock` page.
- **Missing**: No way to run a stock check across all VNs in the library simultaneously.

---

## 12. Library/wishlist integration

- `VnCard` has no stock indicator chip.
- Library (`/`) has no stock filter or sort.
- Wishlist (`/wishlist`) has no stock status column.
- `listRecentVnStockOffers` exists in `db.ts` but is never called from any route.

---

## 13. UI/UX audit

### StockPanel

**Strengths:**
- Sequential per-provider refresh with progress counter is correct and avoids overloading shops.
- Stop button uses `AbortController` — correctly terminates in-flight requests.
- Provider grid with `aria-pressed` on each tile — accessible toggle.
- Cloudflare amber badge clearly communicates non-actionable failures.
- `OffersGrouped` with collapsible `series` / `related` / `rejected` groups — correct default behavior.
- `ConfidenceChip` shown only for medium/low/reject (not cluttering exact/high results).
- `OfferCard` shows `location_branch` with MapPin icon when available.

**Issues:**
- No per-offer staleness indicator. Offers can be days old with no visual signal.
- `physicalDefaultRef` auto-selection on VN detail page is surprising. Users may not notice that only 2 of 22 providers are selected when they press Check.
- "No stock data" empty state does not suggest pressing Check explicitly (only `t.stock.empty` text).
- `OffersGrouped` calls `classifyGroup(offer)` for every render pass — no memoization. For VNs with many offers this is fine (it's a cheap pure function), but a `useMemo` on the group arrays would be cleaner.

### StockLookupClient

**Issues:**
- Title not loaded when navigating directly to `/stock?vn=v123`.
- 12-result cap on search hits may miss some VNs. Fine for typical use.

---

## 14. Accessibility audit

- Provider tiles use `aria-pressed` correctly.
- Group buttons (`GroupBtn`) use `aria-pressed`.
- Alias input has a label via `placeholder` only — should have an explicit `<label>` or `aria-label`.
- The `handleAddAlias` form uses `onSubmit` — keyboard submit (Enter) works.
- `OfferCard` external link has `rel="noopener noreferrer"` — correct.
- Stop button: no `aria-label` beyond the text — adequate.
- `AvailabilityChip`: text-only (no icon), color contrast depends on Tailwind classes — not audited for WCAG ratio here.

---

## 15. i18n audit

All keys in `t.stock.*` are present in FR/EN/JA:
- Core: title, pageTitle, pageSubtitle, searchLabel, searchPlaceholder, pickVn
- Refresh: check, checkPhysical, checkingProviders, stop
- Providers: all provider status keys
- Offer: availability, source, jan, openShop, bestPrice, noPrice, noPriceShort
- Groups: groupGame, groupSameSeries, groupRelated, groupRejected, groupExpand, groupCollapse
- Classification: matchConfidence (exact/high/medium/low/reject)
- Marketplace: offerMarketplace, offerMarketplaceCount, offerListPrice
- Aliases: aliases, aliasAdd, aliasPlaceholder, aliasRemoveTerm, aliasHint
- Physical: groupPhysical, physicalCapable

**Missing (desirable future keys):**
- A "last checked N ago" per-offer indicator label
- A "check all" vs "physical only" tooltip/hint explaining the difference
- `providerDetails` section heading for the diagnostics block

---

## 16. Test coverage audit

| Test file | Covers | Gap |
|---|---|---|
| `stock-classify.test.ts` | `classifyOffer`, `normalizeTitle`, `seriesNumberMismatch`, `editionFromTitle`, `platformFromCategory`, `platformFromTitle` | No test for `classificationToFields` |
| `stock-surugaya.test.ts` | `parseSurugayaSearch` (pagination, cards, bleeding prevention), `buildSurugayaSearchUrl` | No test for `refreshSurugaya` (network, requires mock) |
| `stock-trader-chuko.test.ts` | `encodeEucJpQuery`, `traderSearchVariants`, list+detail parsers (17 describe blocks, 56 tests) | No test for `refreshTrader` (network) |
| `stock-providers.test.ts` | `PHYSICAL_CAPABLE_PROVIDER_IDS`, `CONFIRMED_PHYSICAL_PROVIDER_IDS`, `USELESS_FOR_CONFIRMED_PHYSICAL_STOCK`, `getProviderMeta`, `canProduceConfirmedPhysicalStock`, `canProducePotentialPhysicalLead`, `shouldShowInConfirmedPhysicalResults`, `shouldShowAsPhysicalLead` | No test for `getStockForVn`, `refreshStockForVn` |
| `stock-aliases.test.ts` | `listStockAliases`, `upsertStockAlias`, `deleteStockAlias` via DB; GET/POST API route | No test for alias length limits |

**Not tested (no test file):**
- `parseSofmapList`, `parseSofmapDetail`
- `parseHgame1Detail`
- `parseMelonbooksDetail`
- `parseMandarakeDetail`
- `parseWondergooDetail`
- `parseErogePrice`
- `parseGenericProviderPage`
- `parseAnimateList`, `parseEbtenList`, `parseGetchuList`, `parseGamersList`, `parseGeoList`, `parseJoshinList`, `parseAmazonList`, `parseYahooList`, `parseMakeshopList`, `parseYodobashiList`
- `titleQueries`, `releaseTargetsForProvider`, `allTargetsForProvider`
- `availabilityFromText`, `parsePriceYen`
- `shouldShowInConfirmedPhysicalResults` edge cases (location_label = 'Online stock')
- `parseTraderList` (dead code — should be deleted before adding test coverage)

---

## 17. Performance audit

| Provider | Max requests (sequential) | Notes |
|---|---|---|
| eroge_price | 1 | Fast |
| sofmap | 12 targets × (1 list + up to 5 detail) = up to 72 | Bounded by target count |
| hgame1 | 20 targets × 1 | JAN lookups are fast |
| melonbooks | 12 targets × 1 | Direct product pages |
| surugaya | 3 queries × 3 pages = 9 | Cloudflare often fails → usually 1 failed request |
| mandarake | 8 targets × (1 list + 5 detail) = up to 48 | Can be slow |
| wondergoo | 12 targets × 1 | Direct pages |
| trader | 3 queries × 16 variants = 48 list + 10 detail = 58 | Slowest provider by request count |
| generic (×12) | 8 targets × 1 each | Varies |

The UI serializes providers: one POST per provider, waits for response before starting the next. This means checking all 22 providers can take several minutes in the worst case. The progress bar `{done}/{total}` at provider granularity helps, but there's no intra-provider progress.

`allTargetsForProvider` is called twice per provider: once in `hasInputs` and once inside `refreshProvider`. This is a minor duplication — computing targets twice.

---

## 18. Security / privacy audit

| Area | Status |
|---|---|
| SSRF prevention | **Good** — `isAllowedHttpTarget` called in `fetchShopText` before every outbound request |
| URL allowlist completeness | **Good** — all provider hosts in `PROVIDER_HOSTS` are covered in `ALLOWED_HTTP_HOSTS`; chuko-tsuhan.com added |
| Redirect-to-private-IP | **Accepted risk LIB-011** — noted in url-allowlist.ts |
| Proxy support for shop providers | **None** — `fetchShopText` uses raw `fetch()`, not `providerFetch()`. No proxy config for any stock provider. By design. |
| EUC-JP encoding | **Correct** — uses `iconv-lite`, not `TextEncoder` (UTF-8 only) |
| Credential leakage | **N/A** — no credentials used for any shop provider |
| HTML injection via offer data | **N/A** — offer data is stored as text, rendered via React (escaped) |
| User-controlled URL construction | **Low risk** — `releaseTargetsForProvider` uses VNDB API data (not direct user input); all resulting URLs go through `isAllowedHttpTarget` |
| Alias term injection | **Low risk** — stored as text, used in URL query strings via `encodeURIComponent` / `encodeEucJpQuery` |

---

## 19. Known dead code

| Symbol | Location | Note |
|---|---|---|
| `parseTraderList` | stock.ts:777 | Exported, JSDoc says "legacy", never called from `refreshTrader` or anywhere else |
| `listRecentVnStockOffers` | db.ts:9117 | DB function, never exposed via any route or component |
| `providerListPatterns` for animate/gamers/amazon_jp/yodobashi | stock.ts:1299 | Patterns exist but `parseKnownProviderList` returns first for these providers; patterns only activate as fallback if dedicated parser returns empty — arguably intentional, not dead |

---

## 20. Prioritized roadmap

### P0 — Correctness bugs (fix before next feature)

1. **Remove `parseTraderList`** — dead export. Deleting it simplifies the module and eliminates confusion about which parser is active for Trader.

2. **Fix double-target bug in `releaseTargetsForProvider`** — the generic `PROVIDER_HOSTS[provider]?.test(host)` check at line 388 and the explicit per-provider checks at lines 389–394 both add the same URL for sofmap/surugaya/melonbooks/mandarake/wondergoo/trader. `uniqTargets` deduplicates them, but the redundant code is misleading. Remove the explicit per-provider checks (lines 389–394) since `PROVIDER_HOSTS` already covers them.

3. **`eroge_price` source field** — `offerInput(vnId, 'eroge_price', seller ?? 'Eroge Price', now, ...)` passes the seller name as `source`. The `source` column convention is `'direct' | 'search' | 'alicesoft_kobe'`. Change to `'search'` (eroge_price results come from a search by EGS id, not a direct release link).

### P1 — UX correctness

4. **Load VN title on `/stock` page without search query** — when `initialVnId` is set but `selected` is null (direct navigation), fetch `GET /api/vn/{id}` to populate the title for the StockPanel header.

5. **`physicalDefaultRef` should not auto-select on VN detail page** — when `initialSnapshot` is provided (detail page context), default `selectedProviders` to null (all), not physical-only. Physical-first default is appropriate only on the standalone `/stock` page.

6. **Per-offer staleness indicator** — add a relative-time chip on each `OfferCard` showing how old the data is (use the shared `time-ago.ts` util). This helps users know whether to trust an "in stock" result.

7. **Alias input accessibility** — add an explicit `aria-label` to the alias `<input>` (current `placeholder` is not sufficient for screen readers).

### P2 — Classification coverage

8. **Apply `classifyOffer` to remaining providers** — Sofmap, hgame1, melonbooks, mandarake, wondergoo, and all generic providers. Each `refreshXxx` function and `refreshGenericProvider` should call `classifyOffer` and merge `classificationToFields(cl)` into the offer via `offerInput`. This gives the `OffersGrouped` component meaningful data for 18 more providers.

9. **Expose `listRecentVnStockOffers`** via `GET /api/stock/recent?limit=N` for a "recently checked stock" dashboard widget or `/stock` page history.

### P3 — Feature gaps

10. **Library/wishlist stock indicator** — `VnCard` should show a small chip (e.g., `PackageSearch` icon + count) when any in-stock offer exists for a VN. Requires a lightweight `listStockSummaryForVns(vnIds)` DB query (min-availability + offer count per vn_id). Never block card rendering on this.

11. **`officialRetailerSourceUrls` expansion** — currently only follows Entergram official page links. Extend to `kadokawa.co.jp`, `key.visualarts.gr.jp`, and other major publishers to discover retailer links not in VNDB extlinks.

12. **Intra-provider progress indication** — for high-request providers (trader: 58 requests, mandarake: up to 48), surface a per-request counter in the UI. This requires threading a callback into `refreshTrader`/`refreshMandarake` and the route returning progress via SSE or a polling endpoint.

13. **Stock TTL policy** — add an offer `expires_at` column or a `last_refreshed_at` column on `vn_stock_provider_status` to allow automatic staleness detection and cache-invalidation hints.

### P4 — Test coverage

14. **Add tests for parsers without coverage**: `parseSofmapList`, `parseSofmapDetail`, `parseHgame1Detail`, `parseMelonbooksDetail`, `parseMandarakeDetail`, `parseWondergooDetail`, `parseErogePrice`, `parseGenericProviderPage`.

15. **Add tests for `titleQueries` and `releaseTargetsForProvider`** — these are pure/near-pure functions that determine which URLs get fetched.

16. **Add tests for `availabilityFromText` and `parsePriceYen`** — these utility functions are exercised indirectly by many parsers but never directly.

---

*Audit complete. All findings are analysis-only — no code changes made.*
