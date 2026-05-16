/**
 * Versioned layout config for the customizable sections below the
 * main identity card on `/vn/[id]`.
 *
 * The "main identity card" (title, cover/banner, synopsis, media
 * gallery) is intentionally NOT in this list — those are immutable
 * and live above the layout host.
 *
 * Stored in `app_setting.vn_detail_section_layout_v1` as JSON. The
 * validator silently drops unknown ids and fills missing defaults,
 * so an older / corrupted config never blanks the page.
 *
 * `order` is implicit: it's the position of the id in the array. Any
 * `VN_SECTION_IDS` value not present in the persisted config is
 * appended (visible, not collapsed) in canonical order — that way
 * future sections show up automatically without a migration.
 */

export const VN_SECTION_IDS = [
  'notes',
  'series-suggest',
  'routes',
  'session-activity',
  'relations',
  'vndb-status',
  'egs-panel',
  'egs-details',
  'characters',
  'cast',
  'staff',
  'tag-overlap',
  'similar',
  'aspect-override',
  'my-editions',
  'releases',
  'quotes',
  'cover-banner-tools',
  'edit-form',
] as const;

export type VnSectionId = (typeof VN_SECTION_IDS)[number];

export interface VnSectionState {
  /** false hides the section entirely; restorable from the Settings modal. */
  visible: boolean;
  /** true keeps the header visible but collapses the body until the user expands. */
  collapsedByDefault: boolean;
}

export interface VnDetailLayoutV1 {
  /** Canonical render order, top-to-bottom. */
  order: VnSectionId[];
  /** Per-section visibility / default-collapsed state. */
  sections: Record<VnSectionId, VnSectionState>;
}

function defaultState(): VnSectionState {
  return { visible: true, collapsedByDefault: false };
}

export function defaultVnDetailLayoutV1(): VnDetailLayoutV1 {
  const sections = {} as Record<VnSectionId, VnSectionState>;
  for (const id of VN_SECTION_IDS) sections[id] = defaultState();
  return {
    order: [...VN_SECTION_IDS],
    sections,
  };
}

/**
 * Coerce arbitrary input into a valid layout. Strategy:
 *   - Ignore unknown section ids in `order` and `sections`.
 *   - Append every known id missing from `order` in canonical order.
 *   - Fill missing per-section state with defaults.
 *   - Reject Arrays / nulls / primitives at the top level — fall back
 *     to defaults entirely.
 */
export function validateVnDetailLayoutV1(input: unknown): VnDetailLayoutV1 {
  const fallback = defaultVnDetailLayoutV1();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  const obj = input as Record<string, unknown>;

  // Order
  const rawOrder = Array.isArray(obj.order) ? (obj.order as unknown[]) : [];
  const seen = new Set<VnSectionId>();
  const order: VnSectionId[] = [];
  for (const item of rawOrder) {
    if (typeof item !== 'string') continue;
    if (!(VN_SECTION_IDS as readonly string[]).includes(item)) continue;
    const id = item as VnSectionId;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  for (const id of VN_SECTION_IDS) {
    if (!seen.has(id)) order.push(id);
  }

  // Per-section state
  const sections = {} as Record<VnSectionId, VnSectionState>;
  const rawSections =
    obj.sections && typeof obj.sections === 'object' && !Array.isArray(obj.sections)
      ? (obj.sections as Record<string, unknown>)
      : {};
  for (const id of VN_SECTION_IDS) {
    const raw = rawSections[id];
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const s = raw as Record<string, unknown>;
      sections[id] = {
        visible: s.visible !== false, // missing/undefined → visible
        collapsedByDefault: s.collapsedByDefault === true,
      };
    } else {
      sections[id] = defaultState();
    }
  }

  return { order, sections };
}

export function parseVnDetailLayoutV1(raw: string | null): VnDetailLayoutV1 {
  if (!raw) return defaultVnDetailLayoutV1();
  try {
    return validateVnDetailLayoutV1(JSON.parse(raw));
  } catch {
    return defaultVnDetailLayoutV1();
  }
}

/** Custom event broadcast after a successful PATCH so sibling
 *  consumers (Settings modal "Restore hidden VN sections" panel,
 *  another tab) can re-sync without a full router.refresh(). */
export const VN_LAYOUT_EVENT = 'vn:detail-layout-changed';
