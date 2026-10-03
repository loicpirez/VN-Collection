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

type SplitLibrarySectionId = 'library-controls' | 'library-grid';

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
  order: [
    'recently-viewed',
    'reading-queue',
    'anniversary',
    'library',
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

  const splitStates = (['library-controls', 'library-grid'] as const)
    .map((id) => sectionsBlob[id])
    .filter((value): value is Record<string, unknown> => (
      typeof value === 'object' && value !== null && !Array.isArray(value)
    ));
  if (splitStates.length > 0) {
    out.sections.library = {
      visible: splitStates.some((state) => state.visible !== false),
      collapsed: splitStates.every((state) => state.collapsed === true),
    };
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

  // Order: keep known ids, dedupe, rewrite either split-library id to
  // the unified library position, then append missing canonical ids.
  if (Array.isArray(obj.order)) {
    const seen = new Set<HomeSectionId>();
    const cleaned: HomeSectionId[] = [];
    for (const candidate of obj.order) {
      if (typeof candidate !== 'string') continue;
      const normalized = (['library-controls', 'library-grid'] as readonly SplitLibrarySectionId[])
        .includes(candidate as SplitLibrarySectionId)
        ? 'library'
        : candidate;
      if (!(HOME_SECTION_IDS as readonly string[]).includes(normalized)) continue;
      const id = normalized as HomeSectionId;
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

let lastParseRaw: string | null = null;
let lastParseResult: HomeSectionLayoutV1 | null = null;

/**
 * Parse the raw `app_setting.home_section_layout_v1` string into a
 * validated layout. Server-side helper; the route handler and `page.tsx`
 * both call this so failures fall back to defaults uniformly.
 */
export function parseHomeSectionLayoutV1(raw: string | null): HomeSectionLayoutV1 {
  if (raw === lastParseRaw && lastParseResult !== null) return lastParseResult;
  let parsed: HomeSectionLayoutV1;
  if (!raw) {
    parsed = validateHomeSectionLayoutV1(null);
  } else {
    try {
      parsed = validateHomeSectionLayoutV1(JSON.parse(raw));
    } catch {
      parsed = validateHomeSectionLayoutV1(null);
    }
  }
  lastParseRaw = raw;
  lastParseResult = parsed;
  return parsed;
}

/** Custom event name dispatched after `PATCH /api/settings` returns OK. */
export const HOME_LAYOUT_EVENT = 'vn:home-layout-changed';
