/**
 * Home page section layout config (versioned).
 *
 * Stored in `app_setting.home_section_layout_v1` as JSON. The shape is
 * forward-compatible: new section ids can be added without breaking
 * older clients, and the validator silently drops unknown fields.
 *
 * Read by `src/app/page.tsx` (server) to gate which strips render and
 * whether each is collapsed; mutated by the per-strip menu and by the
 * settings modal, both via `PATCH /api/settings`. After mutation the
 * caller fires a `vn:home-layout-changed` CustomEvent so client
 * subscribers can update without a full router.refresh().
 */

/**
 * Strip ids registered on the home page, in the canonical render order.
 *
 * 'library' was a single block that bundled the Library toolbar
 * (chips/search/filters/sort/group/density/actions) with the Library
 * grid. The user wanted to hide/reorder/collapse those two parts
 * independently — see the migration logic in `validateHomeSectionLayoutV1`
 * below which rewrites legacy 'library' into the split pair.
 */
export const HOME_SECTION_IDS = [
  'recently-viewed',
  'reading-queue',
  'anniversary',
  'library-controls',
  'library-grid',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

/** Legacy id retained ONLY for migration from older stored layouts. */
type LegacyHomeSectionId = 'library';

export interface HomeSectionState {
  /** false hides the entire strip (no header, no body). Restorable via Settings. */
  visible: boolean;
  /** true keeps the header visible but hides the body. Data is preserved. */
  collapsed: boolean;
}

export interface HomeSectionLayoutV1 {
  /** Per-section state keyed by section id. */
  sections: Record<HomeSectionId, HomeSectionState>;
  /** Render order — first id renders first. */
  order: HomeSectionId[];
}

export const DEFAULT_HOME_LAYOUT: HomeSectionLayoutV1 = {
  sections: {
    'recently-viewed': { visible: true, collapsed: false },
    'reading-queue': { visible: true, collapsed: false },
    anniversary: { visible: true, collapsed: false },
    'library-controls': { visible: true, collapsed: false },
    'library-grid': { visible: true, collapsed: false },
  },
  order: [
    'recently-viewed',
    'reading-queue',
    'anniversary',
    'library-controls',
    'library-grid',
  ],
};

/**
 * Coerce arbitrary input into a valid layout, filling missing sections
 * with defaults and dropping unknown ids. Returns the default layout for
 * any unparseable / corrupted input — important because the JSON lives
 * in `app_setting`, which is user-editable via the future settings
 * import path.
 *
 * Two shapes are accepted for back-compat with the v0 layout that was
 * shipped before the `order` field existed:
 *   1. v0 shape: { 'recently-viewed': {...}, 'reading-queue': {...}, … }
 *      — sections-only, no order; rebuild order from HOME_SECTION_IDS.
 *   2. v1 shape: { sections: {...}, order: [...] }
 *      — current canonical shape.
 */
export function validateHomeSectionLayoutV1(input: unknown): HomeSectionLayoutV1 {
  // Start from the canonical defaults so every required id is populated
  // even when the stored layout is older / partially missing.
  const out: HomeSectionLayoutV1 = {
    sections: HOME_SECTION_IDS.reduce((acc, id) => {
      acc[id] = { ...DEFAULT_HOME_LAYOUT.sections[id] };
      return acc;
    }, {} as Record<HomeSectionId, HomeSectionState>),
    order: [...DEFAULT_HOME_LAYOUT.order],
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return out;
  }
  const obj = input as Record<string, unknown>;
  const sectionsBlob = (typeof obj.sections === 'object' && obj.sections !== null && !Array.isArray(obj.sections))
    ? (obj.sections as Record<string, unknown>)
    : obj;

  // Migration: rewrite the legacy 'library' single-section state to the
  // split pair so users on a pre-split stored layout get a deterministic
  // upgrade without losing their hidden/collapsed preferences. Both new
  // ids inherit the legacy state.
  const legacyLibrary = sectionsBlob['library' satisfies LegacyHomeSectionId];
  if (legacyLibrary && typeof legacyLibrary === 'object' && !Array.isArray(legacyLibrary)) {
    const s = legacyLibrary as Record<string, unknown>;
    const migrated: HomeSectionState = {
      visible: s.visible !== false,
      collapsed: s.collapsed === true,
    };
    out.sections['library-controls'] = { ...migrated };
    out.sections['library-grid'] = { ...migrated };
  }

  for (const id of HOME_SECTION_IDS) {
    const raw = sectionsBlob[id];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const s = raw as Record<string, unknown>;
    out.sections[id] = {
      visible: s.visible !== false,
      collapsed: s.collapsed === true,
    };
  }

  // Order: keep known ids, dedupe, then rewrite legacy 'library' →
  // ['library-controls', 'library-grid'] inline, then append any
  // remaining canonical ids that didn't appear. Unknown ids are
  // silently dropped (same forward-compat rule as before).
  if (Array.isArray(obj.order)) {
    const seen = new Set<HomeSectionId>();
    const cleaned: HomeSectionId[] = [];
    for (const candidate of obj.order) {
      if (typeof candidate !== 'string') continue;
      if (candidate === 'library') {
        // Insert the split pair in place of the legacy id.
        for (const id of ['library-controls', 'library-grid'] as const) {
          if (!seen.has(id)) {
            seen.add(id);
            cleaned.push(id);
          }
        }
        continue;
      }
      if (!(HOME_SECTION_IDS as readonly string[]).includes(candidate)) continue;
      const id = candidate as HomeSectionId;
      if (seen.has(id)) continue;
      seen.add(id);
      cleaned.push(id);
    }
    for (const id of HOME_SECTION_IDS) {
      if (!seen.has(id)) cleaned.push(id);
    }
    out.order = cleaned;
  }
  return out;
}

/**
 * Parse the raw `app_setting.home_section_layout_v1` string into a
 * validated layout. Server-side helper; the route handler and `page.tsx`
 * both call this so failures fall back to defaults uniformly.
 */
export function parseHomeSectionLayoutV1(raw: string | null): HomeSectionLayoutV1 {
  if (!raw) return validateHomeSectionLayoutV1(null);
  try {
    return validateHomeSectionLayoutV1(JSON.parse(raw));
  } catch {
    return validateHomeSectionLayoutV1(null);
  }
}

/** Custom event name dispatched after `PATCH /api/settings` returns OK. */
export const HOME_LAYOUT_EVENT = 'vn:home-layout-changed';
