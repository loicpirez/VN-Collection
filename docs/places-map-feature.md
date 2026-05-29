# Places & Map feature

## Purpose

Link the `location_branch` strings that appear in `vn_stock_offer` to
user-defined places (physical shops / locations). Each place has a lat/lng so
it can appear on an OpenStreetMap tile layer. Per-place, the user can browse
which VNs are currently in stock there — the same VN browser pattern as the
AliceNet Kobe client.

---

## DB table — `place_registry`

```sql
CREATE TABLE IF NOT EXISTS place_registry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  name_ja     TEXT,
  address     TEXT,
  lat         REAL,
  lng         REAL,
  url         TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

Linking stock `location_branch` values to a place is done via a separate
join table:

```sql
CREATE TABLE IF NOT EXISTS place_provider_link (
  place_id        INTEGER NOT NULL REFERENCES place_registry(id) ON DELETE CASCADE,
  provider_label  TEXT    NOT NULL,
  PRIMARY KEY (place_id, provider_label)
);
```

`provider_label` matches `vn_stock_offer.location_branch` (the free-text branch
name emitted by the stock scrapers, e.g. "Sofmap AKIBA アミューズメント館").

---

## API surface

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/places` | List all places with linked provider_labels |
| POST | `/api/places` | Create a place `{ name, name_ja?, address?, lat?, lng?, url?, notes? }` |
| GET | `/api/places/[id]` | Get one place + its linked provider_labels |
| PATCH | `/api/places/[id]` | Update place fields |
| DELETE | `/api/places/[id]` | Delete a place (cascades provider links) |
| POST | `/api/places/[id]/link` | Link a `provider_label` to a place |
| DELETE | `/api/places/[id]/link` | Unlink a `provider_label` from a place |
| GET | `/api/places/provider-map` | Returns `Record<provider_label, place_id>` for all linked labels |
| GET | `/api/places/[id]/stock` | VNs currently in stock at this place |

---

## Pages

### `/places`

AliceNet Kobe-style browser with tabs:

- **All** — every registered place as cards
- **Linked** — places with at least one `provider_label` mapped
- **Unlinked** — places with no links yet
- **Unassigned branches** — `location_branch` values in stock DB not yet assigned to any place

Each **PlaceCard** shows: name, name_ja, address, linked branch count, in-stock VN count, lat/lng chip, link to `/places/[id]`.

**Assign provider dialog** — same pattern as AliceNet Kobe manual-link dialog:
shows a list of unassigned `location_branch` strings with a "Link" button.

### `/places/[id]`

Per-place VN browser. Shows all VNs that have at least one `in_stock` or
`limited` offer at this place (joined via `vn_stock_offer.location_branch IN
(SELECT provider_label FROM place_provider_link WHERE place_id = ?)`).

Features:
- Sort (title, price, availability)
- Group (none, series)
- Grid / list / density slider
- Each VN card links to `/vn/[id]`

### `/map`

OpenStreetMap (Leaflet, SSR-disabled) showing every place in `place_registry`
that has `lat IS NOT NULL AND lng IS NOT NULL` as a marker.

Clicking a marker opens a popup with name, branch count, in-stock VN count,
link to `/places/[id]`.

Tile layer: CartoDB Dark Matter (`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`)
to match the app's dark theme. No API key required.

Geocoding (optional, for the Add/Edit modal): Nominatim
`https://nominatim.openstreetmap.org/search?q=...&format=jsonv2`

---

## Integration

### `StockPhysicalLocations.tsx`

Each branch heading that matches a known place (via the `placeMap` prop) becomes
a `<Link href="/places/[id]">` instead of a plain `<span>`.

### `StockPanel.tsx`

Accepts a `placeMap?: Record<string, number>` prop (provider_label → place_id).
Passes it down to `StockPhysicalLocations`.

### `/app/vn/[id]/page.tsx`

Fetches `getPlaceProviderMap()` server-side and threads it into `StockPanel`.

### `/app/stock/page.tsx` / `StockLookupClient.tsx`

Fetches `GET /api/places/provider-map` client-side and passes into
`StockPhysicalLocations`.

---

## Implementation steps

1. `place_registry` + `place_provider_link` tables in `db.ts`
2. CRUD helpers in `db.ts`
3. `src/lib/place-registry.ts` — wrapper with typed helpers
4. `GET/POST /api/places` route
5. `GET/PATCH/DELETE /api/places/[id]` route
6. `POST/DELETE /api/places/[id]/link` route
7. `GET /api/places/provider-map` route
8. `GET /api/places/[id]/stock` route
9. i18n keys (fr/en/ja)
10. `PlaceBrowser.tsx` + `PlaceCard.tsx`
11. `AssignProviderDialog.tsx`
12. `AddEditPlaceModal.tsx` (Nominatim search + mini-map preview)
13. `/app/places/page.tsx`
14. `PlaceVnBrowser.tsx`
15. `/app/places/[id]/page.tsx`
16. `StockPhysicalLocations.tsx` — placeMap prop + links
17. `StockPanel.tsx` — placeMap prop pass-through
18. `/app/vn/[id]/page.tsx` — server-side placeMap fetch
19. `StockLookupClient.tsx` — client-side placeMap fetch
20. `MapCanvas.tsx` + `MapPageClient.tsx` (Leaflet, SSR-disabled)
21. `/app/map/page.tsx`
22. Nav entries + i18n (`map`, `places`)
23. Install `react-leaflet`, `leaflet`, `@types/leaflet`
24. Tests for DB helpers
