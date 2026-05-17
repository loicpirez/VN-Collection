/**
 * Shared section-layout factory.
 *
 * Several detail pages (VN, series, staff, character, producer) each
 * carry a stack of customizable below-the-header sections. Every one
 * uses the same versioned-config shape:
 *
 *   { order: SectionId[], sections: Record<SectionId, SectionState> }
 *
 * `vn-detail-layout.ts` and `series-detail-layout.ts` were each
 * hand-written copies of that shape; this module factors the logic
 * out so adding a new scope (staff / character / producer / future
 * pages) is a 5-line module.
 *
 * Operator's "app-wide section ordering" contract (item 15 of the
 * round-4-followup-continuation):
 *   - order
 *   - hidden/visible
 *   - collapsed/expanded default
 *   - reset
 *   - versioned config
 *   - i18n labels (caller-owned)
 *   - accessible controls (caller-owned)
 *
 * The factory is intentionally pure / no React so the contract can
 * be unit-tested in `environment: 'node'`.
 */

export interface SectionState {
  /** false hides the section entirely; restorable from a Settings panel. */
  visible: boolean;
  /** true keeps the header visible but collapses the body by default. */
  collapsedByDefault: boolean;
}

export interface SectionLayoutV1<Id extends string> {
  order: Id[];
  sections: Record<Id, SectionState>;
}

export function defaultSectionState(): SectionState {
  return { visible: true, collapsedByDefault: false };
}

/**
 * Build a small module-like bundle of validator + parser + default
 * + event name for a fixed list of section ids. The returned shape
 * mirrors the long-form vn-detail-layout.ts API so swapping one for
 * another is a search-and-replace.
 */
export function createSectionLayoutModule<Id extends string>(opts: {
  /** Canonical render order; also the source of "valid id" detection. */
  sectionIds: readonly Id[];
  /** Settings-key suffix (the full key adds the `_section_layout_v1` tail). */
  scope: string;
  /** Custom-event name used to broadcast changes to other mounted instances. */
  eventName: string;
}): {
  SECTION_IDS: readonly Id[];
  defaultLayout: () => SectionLayoutV1<Id>;
  validate: (input: unknown) => SectionLayoutV1<Id>;
  parse: (raw: string | null) => SectionLayoutV1<Id>;
  LAYOUT_EVENT: string;
  SETTINGS_KEY: string;
} {
  const { sectionIds, scope, eventName } = opts;

  function defaultLayout(): SectionLayoutV1<Id> {
    const sections = {} as Record<Id, SectionState>;
    for (const id of sectionIds) sections[id] = defaultSectionState();
    return { order: [...sectionIds], sections };
  }

  function validate(input: unknown): SectionLayoutV1<Id> {
    const fallback = defaultLayout();
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
    const obj = input as Record<string, unknown>;

    // Order: dedupe + drop-unknown + append-missing-in-canonical.
    const rawOrder = Array.isArray(obj.order) ? (obj.order as unknown[]) : [];
    const seen = new Set<Id>();
    const order: Id[] = [];
    for (const item of rawOrder) {
      if (typeof item !== 'string') continue;
      if (!(sectionIds as readonly string[]).includes(item)) continue;
      const id = item as Id;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
    for (const id of sectionIds) {
      if (!seen.has(id)) order.push(id);
    }

    // Per-section state. Missing → default visible/expanded.
    const sections = {} as Record<Id, SectionState>;
    const rawSections =
      obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections)
        ? (obj.sections as Record<string, unknown>)
        : {};
    for (const id of sectionIds) {
      const raw = rawSections[id];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const s = raw as Record<string, unknown>;
        sections[id] = {
          visible: s.visible !== false,
          collapsedByDefault: s.collapsedByDefault === true,
        };
      } else {
        sections[id] = defaultSectionState();
      }
    }
    return { order, sections };
  }

  function parse(raw: string | null): SectionLayoutV1<Id> {
    if (!raw) return defaultLayout();
    try {
      return validate(JSON.parse(raw));
    } catch {
      return defaultLayout();
    }
  }

  return {
    SECTION_IDS: sectionIds,
    defaultLayout,
    validate,
    parse,
    LAYOUT_EVENT: eventName,
    SETTINGS_KEY: `${scope}_section_layout_v1`,
  };
}
