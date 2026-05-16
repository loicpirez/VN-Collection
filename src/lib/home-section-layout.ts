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

/** Strip ids registered on the home page, in the canonical render order. */
export const HOME_SECTION_IDS = [
  'recently-viewed',
  'reading-queue',
  'anniversary',
  'library',
] as const;

export type HomeSectionId = (typeof HOME_SECTION_IDS)[number];

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
    library: { visible: true, collapsed: false },
  },
  order: ['recently-viewed', 'reading-queue', 'anniversary', 'library'],
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
  const out: HomeSectionLayoutV1 = {
    sections: {
      'recently-viewed': { ...DEFAULT_HOME_LAYOUT.sections['recently-viewed'] },
      'reading-queue': { ...DEFAULT_HOME_LAYOUT.sections['reading-queue'] },
      anniversary: { ...DEFAULT_HOME_LAYOUT.sections.anniversary },
      library: { ...DEFAULT_HOME_LAYOUT.sections.library },
    },
    order: [...DEFAULT_HOME_LAYOUT.order],
  };
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return out;
  }
  const obj = input as Record<string, unknown>;
  // Detect shape: if `sections` is an object we're on v1; else assume
  // the old flat layout where each key is a section id.
  const sectionsBlob = (typeof obj.sections === 'object' && obj.sections !== null && !Array.isArray(obj.sections))
    ? (obj.sections as Record<string, unknown>)
    : obj;
  for (const id of HOME_SECTION_IDS) {
    const raw = sectionsBlob[id];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const s = raw as Record<string, unknown>;
    out.sections[id] = {
      // Default to visible when the field is missing or unset; only an
      // explicit `false` hides a section so a typo can't blank the home
      // page.
      visible: s.visible !== false,
      collapsed: s.collapsed === true,
    };
  }
  // Order: keep ids that are known, dedupe, append missing ids from the
  // canonical order. Unknown ids are silently dropped — same forward-
  // compat rule the validator already uses elsewhere.
  if (Array.isArray(obj.order)) {
    const seen = new Set<HomeSectionId>();
    const cleaned: HomeSectionId[] = [];
    for (const candidate of obj.order) {
      if (typeof candidate !== 'string') continue;
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
