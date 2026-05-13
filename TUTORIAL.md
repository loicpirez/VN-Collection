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

**Right-click any tile** for a context menu: change status, toggle
favourite, open the producer, filter by this producer. No drag, no
modal.

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
hit **Adjust** to pick a focal point with a drag pin. The cover can be
replaced with a custom upload via the small pill at the bottom of the
poster slot (or the full uploader card further down).

Sections from top to bottom:

1. **Headline**: title, alttitle, rating, year, length, languages,
   platforms, developer. The length row carries the **Reading speed
   estimator** ("VNDB: 16h · EGS: 12h · You: ≈14h").
2. **Action buttons**: external VNDB link, optional extlinks, your
   personal download URL, Download all data, Add to reading queue,
   Anime adaptation chip.
3. **Smart status hint** appears below when your `playtime` ≥ VNDB
   length and you're still marked Playing — one click flips to
   `completed`.
4. **Pomodoro timer** — start a 25-minute reading session; on stop,
   merge the elapsed minutes into your playtime.
5. **Synopsis**: source-comparison panel (VNDB ↔ EGS) plus a "Write
   your own" override that replaces both with your custom text.
6. **Tags & co-occurrence** — non-spoiler tags inline. Below: tags
   from other VNs in your collection that frequently co-occur with
   these.
7. **More like this** → `/similar?vn=…` for tag-seeded recommendations
   centred on this VN.
8. **Series auto-suggest** if VNDB relations match in-collection VNs.
9. **Cast / Staff / Routes / Activity log** — each its own section.
10. **Releases & owned editions** — track physical / digital copies.
    Each edition records location, box type, condition, price paid,
    currency, **acquired date**, and **purchase place** (the store
    name, URL, or second-hand seller — full provenance per copy).
11. **Quotes section** at the bottom for VNDB-cached quotes.

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
    1. **My collection** — future releases from publishers already in
       your collection (default).
    2. **EGS anticipated** — top games on ErogameScape ranked by user
       purchase intent (`必ず購入 / 多分購入 / 様子見`), each cross-linked
       to its VNDB entry when EGS records one.
    3. **All VNDB** — every upcoming release VNDB tracks for the next
       12 months.
  Tab bodies stream in with a skeleton placeholder.
- `/quotes` (`g q`) — every cached quote across your library with a
  free-text filter.
- `/wishlist` (`g w`) — mirrors your VNDB wishlist labels. Filter / sort
  / group controls + a hover-only **remove** button on entries already
  in your collection. Loading shows a skeleton card grid.

---

## 7. Compare 2-4 VNs

In the library, hit **Sélectionner** (CheckSquare icon) to enter
multi-select mode. Click tiles to add to the selection. When you have
2-4 selected, the bulk action bar exposes a **Compare** button →
opens `/compare?ids=…` rendering them side-by-side with shared values
highlighted (languages, platforms, developers, tags, staff).

---

## 8. Data hub `/data` (`g d`)

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
- **Selective full download** — checkbox picker with Select all /
  Select none / Invert. Pick which VNs to fan-out staff /
  characters / developers for. Rate-limited by the global throttle.
- **QR labels** — `/labels` prints sticker-sheet QRs that link to each
  VN's detail page.
- **Tour** — `Run the tour again` if you closed it.
- **Cache panel** — inspect / purge VNDB cache entries.

---

## 9. Producer / staff / character pages

- `/producer/[id]` — every VN in your collection from this producer,
  plus a **completion %** card showing missing entries you can add in
  one click.
- `/staff/[id]` — production credits grouped by role + voice credits
  with character thumbs. **VA timeline heatmap** above the credit list
  charts credit count per year, with collection ownership highlighted.
  On first visit the page auto-fetches the **full VNDB credit list** for
  this person (cached 30 days) and adds a "More credits (outside your
  collection)" section streamed in behind a skeleton.
- `/character/[id]` — character info, trait list, VNs they appear in,
  and an "Also voiced by" panel cross-referencing other VAs of the
  same character.

---

## 10. Keyboard shortcuts

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

## 11. Series pages

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

## 12. Navbar layout

The top nav has three always-visible primary links plus three category
dropdowns:

- **Discover** — Upcoming, For you, Quotes
- **Browse** — Producers, Series, Tags, Traits, Year, Labels
- **Data & Stats** — Stats, Shelf, Steam, Data

On phones / narrow windows the whole nav collapses into a single
hamburger sheet.

---

## 13. Settings (`/data` top section)

- **VNDB token** — pasted from
  [vndb.org/u/tokens](https://vndb.org/u/tokens). Required for the
  wishlist + list-write features.
- **NSFW threshold** + **Hide R18 images** + **Blur R18** + **Hide
  images entirely** — all client-side, cookie-backed so they apply
  before first paint.
- **Default sort** — library opens with this sort by default.
- **Prefer native title** — swaps `title` / `alttitle` in the headline
  for VNs with both.

---

## 14. Download status + rate limiting

The right-side pill at top-1/3 of the viewport is the **download
status indicator**. It's hidden when idle and lights up when the app
is fetching from VNDB:

- **Active downloads count + queued count** on the badge.
- Click to expand: per-job progress bars (Staff, Characters,
  Developers, VNDB pull, EGS sync) with the current `done/total`
  and per-item error lines when something fails.
- **429 countdown** — when VNDB asks us to slow down, a banner
  appears above the pill: "VNDB returned 429, retrying in Ns",
  ticking every second until the retry fires.

The global throttle (`lib/vndb-throttle.ts`) caps everything at
1 req/s and honors VNDB's `Retry-After` header per request. You can
queue 200 VNs into the selective full download without spamming the
server — they just drain through the queue at the throttled pace.

---

## 15. Pop quiz — try these

- Find a random Japanese-only VN you marked "Planning": chip filter
  Planning + Lang JP, then 🎲.
- Pin "ja completed ≥ 85" as a saved filter so you can revisit your
  favourites in one click.
- Open the producer of your favourite VN, see how many of their other
  works you don't own.
- Drag a `.json` file onto `/data` — confirm the import.
- From any page: `?` to see all shortcuts.

Welcome.
