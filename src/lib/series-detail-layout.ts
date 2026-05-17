/**
 * Versioned layout config for the customizable sections on `/series/[id]`.
 *
 * Mirrors `src/lib/vn-detail-layout.ts` exactly — same validator
 * strategy, same `parse…V1` wrapper, same `…_LAYOUT_EVENT` constant,
 * same drop-unknown / append-missing / dedupe rules. Centralising the
 * shape lets the Settings panel "Reset" buttons share a single PATCH
 * code path against `/api/settings`.
 *
 * Stored in `app_setting.series_detail_section_layout_v1` as JSON.
 */

export const SERIES_DETAIL_SECTION_IDS = [
  'hero',
  'works',
  'metadata',
  'related',
  'stats',
] as const;

export type SeriesSectionId = (typeof SERIES_DETAIL_SECTION_IDS)[number];

export interface SeriesSectionState {
  /** false hides the section entirely; restorable from the Settings modal. */
  visible: boolean;
  /** true keeps the header visible but collapses the body until expanded. */
  collapsedByDefault: boolean;
}

export interface SeriesDetailLayoutV1 {
  /** Canonical render order, top-to-bottom. */
  order: SeriesSectionId[];
  /** Per-section visibility / default-collapsed state. */
  sections: Record<SeriesSectionId, SeriesSectionState>;
}

function defaultState(): SeriesSectionState {
  return { visible: true, collapsedByDefault: false };
}

export function defaultSeriesDetailLayoutV1(): SeriesDetailLayoutV1 {
  const sections = {} as Record<SeriesSectionId, SeriesSectionState>;
  for (const id of SERIES_DETAIL_SECTION_IDS) sections[id] = defaultState();
  return { order: [...SERIES_DETAIL_SECTION_IDS], sections };
}

/**
 * Coerce arbitrary input into a valid layout. Strategy:
 *   - Ignore unknown section ids in `order` and `sections`.
 *   - Append every known id missing from `order` in canonical order.
 *   - Fill missing per-section state with defaults.
 *   - Reject Arrays / nulls / primitives at the top level — fall back
 *     to defaults entirely.
 *   - Tolerates a v0 flat shape `{ [id]: SectionState }` too, so an
 *     older persisted blob from a future migration won't blank the
 *     page. v0 sections promote to v1 with the canonical order.
 */
export function validateSeriesDetailLayoutV1(input: unknown): SeriesDetailLayoutV1 {
  const fallback = defaultSeriesDetailLayoutV1();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const obj = input as Record<string, unknown>;

  // Detect v0 flat shape: top-level keys are section ids whose values
  // are `{ visible, collapsedByDefault }`. v1 keys are `order` /
  // `sections`. If neither is present, treat as v0 best-effort.
  const hasV1Keys = 'order' in obj || 'sections' in obj;
  const rawSections =
    hasV1Keys && obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections)
      ? (obj.sections as Record<string, unknown>)
      : !hasV1Keys
        ? obj // v0 — section ids at the top level
        : {};

  // Order
  const rawOrder = hasV1Keys && Array.isArray(obj.order) ? (obj.order as unknown[]) : [];
  const seen = new Set<SeriesSectionId>();
  const order: SeriesSectionId[] = [];
  for (const item of rawOrder) {
    if (typeof item !== 'string') continue;
    if (!(SERIES_DETAIL_SECTION_IDS as readonly string[]).includes(item)) continue;
    const id = item as SeriesSectionId;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of SERIES_DETAIL_SECTION_IDS) {
    if (!seen.has(id)) order.push(id);
  }

  // Per-section state
  const sections = {} as Record<SeriesSectionId, SeriesSectionState>;
  for (const id of SERIES_DETAIL_SECTION_IDS) {
    const raw = rawSections[id];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const s = raw as Record<string, unknown>;
      sections[id] = {
        visible: s.visible !== false,
        collapsedByDefault: s.collapsedByDefault === true,
      };
    } else {
      sections[id] = defaultState();
    }
  }

  return { order, sections };
}

export function parseSeriesDetailLayoutV1(raw: string | null): SeriesDetailLayoutV1 {
  if (!raw) return defaultSeriesDetailLayoutV1();
  try {
    return validateSeriesDetailLayoutV1(JSON.parse(raw));
  } catch {
    return defaultSeriesDetailLayoutV1();
  }
}

/**
 * Custom event broadcast after a successful PATCH against
 * `/api/settings` so sibling consumers (Settings modal "Restore hidden
 * series sections" panel, another tab) can re-sync without a full
 * router.refresh().
 */
export const SERIES_DETAIL_LAYOUT_EVENT = 'series:detail-layout-changed';
