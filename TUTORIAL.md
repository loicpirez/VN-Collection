# Tutorial — a 5-minute tour of the app

Written for someone who just cloned the repo and hit `npm run dev`. Pair
with the in-app guided tour (auto-opens on first visit; rerun anytime
from `/data → Tour`). For the full feature catalogue see
[FEATURES.md](FEATURES.md).

The shortcut overview below is also reachable in-app via `?`.

---

## 1. Start: the library `/`

You land on your collection grid.

- **Status chips** at the top filter by Planning / Playing / Completed /
  On hold / Dropped.
- **Filter row** below: free-text title search, language, year, tag,
  place. Click any chip to remove the filter.
- **More filters** drawer opens a tri-state panel (matched VNDB,
  matched EGS, fan disc, favourite, has notes, NSFW, nukige…).
- **Saved filter chips** appear above the status row once you've pinned
  any combination via the `+ Save this filter` chip.
- **Sort dropdown** + **arrow** for direction, plus a **Reorder** button
  that switches to `sort=custom` and unlocks drag-to-reorder.
- **Density toggle** (LayoutGrid icon) switches between comfortable and
  dense grid layouts.
- **Random pick** (dice icon) jumps to a random entry from the current
  filter set.
- **Bulk download** (cloud arrow) refreshes VNDB + EGS for every VN.
  Two modes: missing-only (fast, default) and full re-download.

### Cards (everywhere — library, search, wishlist, series, lists)

Every VN poster carries three always-tappable hover affordances:

- **Heart (top-left)** — favorite toggle. Filled red when on, hover-revealed
  when off. Tappable on mobile / tablet too (no `hidden sm:inline` traps).
  If the VN isn't in your collection yet (e.g. a search hit), the first
  click auto-adds it with `status=planning` before flipping the favorite.
- **Bookmark (top-right, second row)** — opens the **Lists picker**. Lazy
  popover with a search filter, every existing list as a checkbox, an
  inline "create new list" input, and a live count chip when the VN is
  already in any list.
- **Right-click context menu** — change status, toggle favourite, open the
  producer, filter by this producer. No drag, no modal.

**Anniversaries** — if today is the release-date anniversary for any
VN in your collection, a small accent strip appears above the grid.

---

## 2. Search `/search`

VNDB search by title, language, year, length, rating, anime
availability, tags. Each hit shows whether it's already in your
collection. Click + to add (sets `status='planning'` by default).

If a VN isn't on VNDB, the **ErogameScape Search** affordance lets you
add an `egs_NNN` synthetic entry — the rest of the app treats it like a
normal VN with reduced VNDB-side data.

Shortcut: press `/` anywhere → focuses the library filter. Press
`g s` → opens this page.

---

## 3. Detail page `/vn/[id]`

Click any tile to open the detail page. The hero banner is editable —
hit **Adjust** to pick a focal point with a drag pin. The cover is
fully swappable via the **Cover source picker** (see step 4 below).

The top identity card is stable: title, cover / banner, synopsis,
core metadata, media, and the main action row stay in place. Everything
below that is a customizable layout block. Use **Customize layout** on
the VN page to reorder sections by drag-and-drop, hide/show optional
sections, choose which ones start collapsed, or reset to the default
order. The same layout can also be restored from Settings → **VN page**.

Default sections:

1. **Headline**: title, alttitle, rating, year, length, languages,
   platforms, developer. The length row carries the **Reading speed
   estimator** ("VNDB: 16h · EGS: 12h · You: ≈14h") and the
   **Playtime compare** — four columns (VNDB / EGS / Mine / All)
   where you pick which one is canonical for this VN. "All" is the
   average of every populated source; pinning a source writes to
   `source_pref.playtime` and drives every downstream display.
   **List-membership chips** appear right under the title — one chip
   per list the VN belongs to, colored by the list, click to open
   the list, X to remove.
2. **Cover & banner**: tap the **Change cover** pill on the cover
   image itself (or the matching pill in the action bar) to open
   the source picker — opens to the Custom tab so the upload /
   URL / in-VN gallery picker is on screen immediately. Same for
   the banner via the **Change banner** picker (Custom by default).
3. **Action buttons**: external VNDB link, optional extlinks, your
   personal download URL, **Change cover** / **Change banner**,
   Download all data, Add to reading queue, **Favorite** inline
   toggle, **Lists** picker inline pill, Anime adaptation chip.
4. **Smart status hint** appears below when your `playtime` ≥ VNDB
   length and you're still marked Playing — one click flips to
   `completed`.
5. **Cover source picker** modal (opens on Custom by default):
    - **Custom** — file upload, paste a URL, *or* pick from a
      thumbnail grid built from every screenshot + per-release
      artwork attached to this VN.
    - **VNDB** — revert to the upstream default.
    - **EGS** — pick from **every** cover source EGS knows about,
      side-by-side: banner_url, the linked VNDB poster, EGS's own
      `image.php`, plus shop covers (Suruga-ya / DMM / DLsite /
      Gyutto). Click a tile to pin that exact source as your
      custom cover — survives refresh. A separate "Use EGS auto"
      button keeps the original priority-fallback behavior.
6. **Pomodoro timer** + **Game log** — `SessionPanel` hosts both side
   by side. Start a 25-min reading session; on stop, prompt to merge
   the elapsed minutes into `playtime_minutes`. The Pomodoro publishes
   the live elapsed-minute count to the game log, which is a free-form
   timestamped journal ("Great pacing in act 2", "started the main
   route") with day-grouped rendering, hover-revealed edit/delete,
   ⌘/Ctrl+Enter to submit, optional "attach 23m of session" chip.
7. **Synopsis**: source-comparison panel (VNDB ↔ EGS) plus a "Write
   your own" override that replaces both with your custom text.
8. **Tags & co-occurrence** — non-spoiler tags inline. Below: tags
   from other VNs in your collection that frequently co-occur with
   these.
9. **More like this** → `/similar?vn=…` for tag-seeded recommendations
   centred on this VN.
10. **Series auto-suggest** if VNDB relations match in-collection VNs.
11. **Cast / Staff / Routes / Activity log** — each its own section.
12. **Releases & owned editions** — track physical / digital copies.
    Each edition records location, box type, condition, price paid,
    currency, **acquired date**, and **purchase place** (the store
    name, URL, or second-hand seller — full provenance per copy).
13. **Quotes section** at the bottom for VNDB-cached quotes.

---

## 4. Stats `/stats`

- Card row: total VNs, played hours, average rating, favourites count.
- **Yearly reading goal** card just below: set a target, see progress.
- **Ratings histogram**: 10-point bins of your scores beside the VNDB
  community average for the same VNs.
- **Best ROI** ranking: VNs with highest `user_rating / playtime`.
- **Genre evolution**: stacked bars per year showing your top tags.

`g t` opens this page.

---

## 5. Year recap `/year?y=YYYY`

- Completion count, total hours, average rating cards.
- Optional goal progress ring.
- **Activity heatmap** — GitHub-style 12-month calendar of activity.
- Top recurring tags + top-5 rated of the year.
- Navigate years with the ← / → buttons.

`g y` opens this page.

---

## 6. Discovery surfaces

- `/recommendations` (`g r`) — tag-seeded picks weighted by your top
  ratings. Toggle whether to include ero tags.
- `/upcoming` (`g u`) — three tabs of "what's next":
    1. **My collection** — future releases from developers already in
       your collection (default).
    2. **EGS anticipated** — top games on ErogameScape ranked by user
       purchase intent (`必ず購入 / 多分購入 / 様子見`), each cross-linked
       to its VNDB entry when EGS records one. Cards render **2-per-row
       with big 128×192 covers** (152×224 on sm+) so the cover is
       actually visible. For rows linked to VNDB, the cover comes
       directly from `t.vndb.org` in one batched call; everything else
       falls through the EGS resolver chain (banner_url → linked VNDB
       cover → EGS image → shop URL), which now **proxies image bytes
       server-side** so cross-origin / referer mitigations don't break
       the browser fetch.
    3. **All VNDB** — every upcoming release VNDB tracks for the next
       12 months.
  Tab bodies stream in with a skeleton placeholder. The header carries
  a **Data Xh ago** chip + Refresh button (see §15).
- `/quotes` (`g q`) — every cached quote across your library with a
  free-text filter.
- `/wishlist` (`g w`) — mirrors your VNDB wishlist labels. Filter / sort
  / group controls + a hover-only **remove** button on entries already
  in your collection. The heart/lists overlays from §1 work here too —
  favorites and lists span the whole app, wishlist included.
  Loading shows a skeleton card grid.
- `/lists` (top-nav) — your custom user lists. See §7.

---

## 7. Universal Lists `/lists`

Lists are free-form user-curated groupings — anything you want to call
out across your library independent of status / series / tags. Common
patterns: "GOAT", "Want to replay", "For when I'm sad", "Comfy SoL",
"Sci-fi binge"…

A VN can be in any number of lists. Lists also accept anticipated and
wishlist VN ids, so you can curate before a game is fully in your
collection.

### Overview page `/lists`

- **Create form** at the top: name + optional description + color picker
  (8 presets + "no color"). One click and the list appears.
- **Grid of lists** below, each card showing color, name, description,
  VN count, and a pin indicator if pinned. Hover any card for the
  **⋮ menu**: Pin / Rename / Delete.

### Detail page `/lists/[id]`

- Header with the list color, name, description, count, and an inline
  metadata editor (rename + recolor + delete).
- **Add VN form** — paste a `v123` or `egs_456` id, hit Enter.
- **Grid of member VNs** rendered with the regular `VnCard` (so the
  hover heart + bookmark + status badge / context menu all work). The
  hover X removes the VN from the list (the VN itself stays in your
  collection).
- VNs not yet mirrored locally render as a stub card with the id; click
  through to fetch.

### Quick assignment from anywhere

- **Card hover** — bookmark icon at the top-right of any poster.
- **VN detail action bar** — "Lists" pill next to Favorite.
- **VN detail title row** — colored chips for every list this VN is
  in, each with an X to remove.

The `/api/lists`, `/api/lists/[id]`, `/api/lists/[id]/items` and
`/api/vn/[id]/lists` routes are the wire format if you need to script
it.

---

## 8. Compare 2-4 VNs

In the library, hit **Sélectionner** (CheckSquare icon) to enter
multi-select mode. Click tiles to add to the selection. When you have
2-4 selected, the bulk action bar exposes a **Compare** button →
opens `/compare?ids=…` rendering them side-by-side with shared values
highlighted (languages, platforms, developers, tags, staff).

---

## 9. Data hub `/data` (`g d`)

Tabbed-style sections:

- **VNDB token** — paste your token, validate.
- **Exports** — JSON (round-trippable), CSV (spreadsheet flat),
  ICS (calendar of started/finished dates).
- **Imports** — file picker or page-wide drag-and-drop a `.json` (merge)
  or `.db` (full replace).
- **Maintenance** — duplicates detector + stale-data wizard with
  per-row Refresh.
- **Recent activity** — last 10 actions across the whole collection.
- **Steam / EGS sync** — paste credentials, pull playtime + scores
  into local rows. Sync shows up as a tracked job in the download bar.
  Dedicated landing pages live at `/steam` and `/egs` — same UX
  pattern (manage links, see linked games at a glance). The
  `/data` EGS section has "Open EGS" CTA that jumps to the
  dedicated page.
- **Dumped** — `/dumped` shows your archival-completion ratio
  globally and per-VN (mini progress bars + fully-dumped chips).
  Companion to the editor / producer completion pages.
- **Shelf layout (drag-and-drop)** — `/shelf?view=layout` is a
  2-D grid editor. Create one or more shelves (give them a name
  like "Living room — left bookcase"), set each shelf's own
  columns × rows independently, then drag editions from the
  *Unplaced* pool into specific slots to mirror your real physical
  setup. Drag from slot to slot to move; drop onto an occupied
  slot to **swap** atomically; drop back into the pool to
  unplace. Page between shelves with `←` / `→` arrow keys or the
  chevron buttons either side of the tab strip — like flipping
  through a Pokémon box. Touch + keyboard friendly. Resizing a
  shelf smaller surfaces an "N editions evicted" warning and
  sends them safely to the pool — nothing lost.
  Use fullscreen for a larger visual view. Toggle **Front display**
  rows to place editions face-out between normal rows, like display
  stands/risers; one edition can still live in only one place.
- **Aspect ratio** — VNDB release resolutions are normalized into
  4:3 / 16:9 / 16:10 / 21:9 / other / unknown. The library can
  filter/group by aspect, and **My editions** lets you manually
  override the resolution/aspect when VNDB data is missing or wrong.
- **Selective full download** — checkbox picker with Select all /
  Select none / Invert. Pick which VNs to fan-out staff /
  characters / developers for. Rate-limited by the global throttle.
- **QR labels** — `/labels` prints sticker-sheet QRs that link to each
  VN's detail page.
- **Tour** — `Run the tour again` if you closed it.
- **Cache panel** — inspect / purge VNDB cache entries.
- **Schema browser** — `/schema` (linked from the Data & Stats
  nav group) renders the VNDB `/schema` endpoint as a filterable
  tree. Useful when you need to know "what language codes does
  VNDB support" or "what does devstatus=2 mean".

---

## 10. Producer / staff / character pages

- `/producer/[id]` — every VN in your collection from this producer,
  plus a **completion %** card showing missing entries you can add in
  one click.
- `/staff/[id]` — production credits grouped by role + voice credits
  with character thumbs. **VA timeline heatmap** above the credit list
  charts credit count per year, with collection ownership highlighted.
  The Voice section renders each VN as a full library-style card
  (with owned-chip + VNDB / EGS external links) and embeds the
  thumbnails of the **characters** this seiyuu voiced inline
  underneath — one click on a face jumps to `/character/[id]`.
  On first visit the page auto-fetches the **full VNDB credit list** for
  this person (cached 30 days) and adds a "More credits (outside your
  collection)" section streamed in behind a skeleton.
- `/character/[id]` — character info, trait list, VNs they appear in,
  and an "Also voiced by" panel cross-referencing other VAs of the
  same character.

---

## 11. Keyboard shortcuts

| Key | Action |
| --- | --- |
| `/` | Focus the library filter |
| `?` | Open / close the shortcut help dialog |
| `g h` | Library |
| `g s` | Search |
| `g w` | Wishlist |
| `g r` | Recommendations |
| `g u` | Upcoming |
| `g q` | Quotes |
| `g y` | Year recap |
| `g t` | Stats |
| `g d` | Data |
| `Esc` | Close menus / dialogs |

`g` arms for ~1 second; ignored inside text inputs / textareas.

---

## 12. Series pages

- `/series` lists every series you've created.
- `/series/[id]` — every VN in the series + an inline editor for name,
  description, cover, and banner. Uploads are 15 MB max; the page header
  renders the banner as a hero strip plus the cover thumbnail.
- "Series auto-detect" on a VN detail page walks the VNDB relation graph
  transitively (`seq / preq / set / fan / alt / orig`), so volume 1 of a
  3-volume series sees volumes 2 and 3 even when they don't directly link
  each other. Joining or creating a series via that card adds every
  transitively-related VN in your collection in one shot.

---

## 13. Navbar layout

The top nav has four always-visible primary links plus three category
dropdowns:

- **Primary** — Library, Wishlist, Lists, Search
- **Discover** — Upcoming, For you, Quotes
- **Browse** — Producers, Series, Tags, Traits, Characters, Staff, Year, Labels
- **Data & Stats** — Stats, Shelf, Steam, EGS, Schema, Data

On phones / narrow windows the whole nav collapses into a single
hamburger sheet. The **closed-eye icon** (content-controls hub),
**language pill**, and **gear icon** (full settings) live on the right
edge and never collapse — they're reachable at every screen width.

---

## 14. Settings — two entry points

### Closed-eye icon (content-controls hub)

Click the closed-eye icon in the navbar for a quick popover that
exposes every "what shows on screen" setting in one place:

- **Spoiler level** (None / Minor / All — matches VNDB's site preference,
  filters tags / traits / character meta everywhere).
- **Hide all images** globally.
- **Blur R18** imagery.
- **Hide sexual images** as a hard filter (drops entries above the
  threshold rather than blurring them).
- **NSFW threshold** slider (0 → 2, 0.1 steps).
- **Show sexual traits** on character pages.
- "All settings…" link → opens the full gear-icon modal.

The icon lights up (`Eye` filled) when any non-default safety gate is
active so you always know your current posture at a glance.

### Gear icon (full settings modal)

The top-right gear opens the canonical settings modal. It is split
into tabs: **Display**, **Content / Spoilers**, **Library defaults**,
**Home layout**, **VN page layout**, **Data / accounts**,
**Integrations**, and **Downloads / automation**. Every content-
controls toggle is mirrored, plus:

- **VNDB token** — pasted from [vndb.org/u/tokens](https://vndb.org/u/tokens).
  Required for the wishlist + ulist write features.
- **VNDB writeback** — local status changes also `PATCH /ulist/<id>`.
- **Pull statuses from VNDB** — reverse direction, see the diff before
  applying.
- **Auto-download staff / characters / developers** (fan-out toggle).
- **Backup URL** — alternate VNDB API endpoint.
- **Steam** — Web API key + 64-bit SteamID.
- **Random quote source** — all VNDB or only from your collection.
- **Default sort / order / group** — library opens with these defaults
  when the URL does not already specify its own state.
- **Home layout** — restore hidden Recently viewed / Reading queue /
  Anniversaries sections.
- **VN page layout** — restore hidden VN sections and choose which
  sections start collapsed.
- **Prefer native title** — swaps `title` / `alttitle` in the headline
  for VNs with both.

All client-side prefs are localStorage-backed and cookie-mirrored for
SSR — they apply before first paint, no flash on hydration.

---

## 15. Download status, refresh & rate limiting

The right-side pill at top-1/3 of the viewport is the **download
status indicator**. It's hidden when idle and lights up when the app
is fetching from VNDB:

- **Active downloads count + queued count** on the badge.
- Click to expand: per-job progress bars (Staff, Characters,
  Developers, VNDB pull, EGS sync) with the current `done/total`
  and the current entity being downloaded. Per-item error lines appear
  when something fails.
- **429 countdown** — when VNDB asks us to slow down, a banner
  appears above the pill: "VNDB returned 429, retrying in Ns",
  ticking every second until the retry fires.

The global throttle (`lib/vndb-throttle.ts`) caps everything at
1 req/s and honors VNDB's `Retry-After` header per request. You can
queue 200 VNs into the selective full download without spamming the
server — they just drain through the queue at the throttled pace.

### Per-page Refresh + freshness chip

The Refresh button with the **Data Xh ago** chip lives on the pages
whose render genuinely depends on a remote cache: **`/upcoming`**,
**`/tags`**, **`/traits`**. Pages that compute from local SQL only
(`/stats`, `/data`, `/producers`) intentionally don't show the chip —
a freshness reading there would be meaningless.

The chip:
- Reads the most-recent `fetched_at` from cache rows matching the
  page's LIKE patterns (computed server-side via `getCacheFreshness()`).
- Renders a tiered relative time — just now (< 1 m) → minute (< 1 h)
  → hour (< 24 h) → day (< 7 d) → week (< 30 d) → month (< 365 d) →
  year.
- Turns red when stale (never downloaded or > 7 days).
- Ticks every 30 s, deterministic on SSR (initial server render uses
  `lastUpdatedAt` as `now` so the first paint reads "just now"
  instead of a raw timestamp).

Clicking Refresh runs `/api/refresh/global`:

1. **Bust** every cache row this refresh is supposed to re-populate
   (egs cover resolver, anticipated, VNDB stats / schema / authinfo /
   release / producer / tag / trait). Without this step the helpers
   below would just read the still-fresh cache and `fetched_at`
   wouldn't move — which is why the button felt like a no-op before.
2. **Re-fetch**: EGS anticipated top 100, VNDB stats / schema /
   authinfo, upcoming collection + all VNDB, default tag/trait
   searches. Each is a separate tracked job in the download status
   bar.

---

## 16. Pop quiz — try these

- Find a random Japanese-only VN you marked "Planning": chip filter
  Planning + Lang JP, then 🎲.
- Pin "ja completed ≥ 85" as a saved filter so you can revisit your
  favourites in one click.
- Open the producer of your favourite VN, see how many of their other
  works you don't own.
- Create a list called "GOAT" from the closed-eye-icon-adjacent path
  (`/lists` in the nav), then hover-bookmark your top three favorites
  to add them. Open `/lists/<id>` to see the curated grid.
- On a VN detail page, click **Cover source** and switch between VNDB,
  EGS, and a screenshot from the in-VN gallery to feel the picker.
- Open the closed-eye icon in the navbar and lower the NSFW threshold
  to 0.5 — non-explicit covers should still load, R18 ones should blur
  or hide based on your toggles.
- Drag a `.json` file onto `/data` — confirm the import.
- From any page: `?` to see all shortcuts.

Welcome.
