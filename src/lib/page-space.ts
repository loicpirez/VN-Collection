import type { CSSProperties } from 'react';

/**
 * Fixed page-spacing presets exposed in Settings. Each preset controls
 * the outer content max width and responsive side gutters; it is
 * intentionally discrete so the settings UI can use buttons, not a
 * precision slider.
 */
export const PAGE_SPACE_PRESETS = {
  compact: {
    maxWidth: '56rem',
    gutterBase: '0.75rem',
    gutterSm: '1rem',
    gutterLg: '1.25rem',
  },
  standard: {
    maxWidth: '80rem',
    gutterBase: '0.75rem',
    gutterSm: '1.5rem',
    gutterLg: '2rem',
  },
  wide: {
    maxWidth: '96rem',
    gutterBase: '0.75rem',
    gutterSm: '1.25rem',
    gutterLg: '2.5rem',
  },
  canvas: {
    maxWidth: '112rem',
    gutterBase: '0.5rem',
    gutterSm: '1rem',
    gutterLg: '1.5rem',
  },
} as const;

/** Identifier for one of the fixed page-spacing presets. */
export type PageSpacePreset = keyof typeof PAGE_SPACE_PRESETS;

/** Stable display order for page-spacing preset controls. */
export const PAGE_SPACE_PRESET_IDS = ['compact', 'standard', 'wide', 'canvas'] as const satisfies readonly PageSpacePreset[];

/**
 * Route groups that can carry their own page-spacing override. These
 * are user-facing surface groups, not one entry per filesystem route.
 */
export const PAGE_SPACE_SCOPES = [
  'library',
  'wishlist',
  'search',
  'vn',
  'release',
  'staff',
  'character',
  'producer',
  'series',
  'lists',
  'shelf',
  'compare',
  'recommendations',
  'topRanked',
  'upcoming',
  'similar',
  'tags',
  'data',
  'brandOverlap',
  'activity',
  'stats',
  'quotes',
  'steam',
  'egs',
  'labels',
] as const;

/** User-configurable route group for page-spacing preferences. */
export type PageSpaceScope = (typeof PAGE_SPACE_SCOPES)[number];
/** Persisted per-scope page-spacing overrides. */
export type PageSpaceOverrides = Partial<Record<PageSpaceScope, PageSpacePreset>>;

/** Default preset per route group when the user has not overridden it. */
export const PAGE_SPACE_SCOPE_DEFAULTS: Record<PageSpaceScope, PageSpacePreset> = {
  library: 'standard',
  wishlist: 'standard',
  search: 'standard',
  vn: 'wide',
  release: 'standard',
  staff: 'wide',
  character: 'standard',
  producer: 'wide',
  series: 'standard',
  lists: 'standard',
  shelf: 'canvas',
  compare: 'canvas',
  recommendations: 'wide',
  topRanked: 'standard',
  upcoming: 'standard',
  similar: 'wide',
  tags: 'standard',
  data: 'compact',
  brandOverlap: 'wide',
  activity: 'wide',
  stats: 'wide',
  quotes: 'compact',
  steam: 'standard',
  egs: 'wide',
  labels: 'standard',
};

/** Minimal settings shape needed by the page-spacing helpers. */
export interface PageSpaceSettings {
  pageSpace: PageSpaceOverrides;
}

/**
 * Validate persisted preset ids before they influence layout.
 *
 * @param value Persisted or URL-derived preset id.
 * @returns True when `value` is one of the supported preset ids.
 */
export function isPageSpacePreset(value: string | null | undefined): value is PageSpacePreset {
  return value === 'compact' || value === 'standard' || value === 'wide' || value === 'canvas';
}

/**
 * Report whether a scope has a saved spacing override.
 *
 * @param settings Settings object containing page-space overrides.
 * @param scope Route group being inspected.
 * @returns True when the scope has a valid explicit preset.
 */
export function hasPageSpaceOverride(
  settings: Pick<PageSpaceSettings, 'pageSpace'> | null | undefined,
  scope: PageSpaceScope,
): boolean {
  return isPageSpacePreset(settings?.pageSpace?.[scope]);
}

/**
 * Clear all per-page spacing overrides.
 *
 * @returns A fresh empty override map ready to persist.
 */
export function clearPageSpaceOverrides(): PageSpaceOverrides {
  return {};
}

/**
 * Resolve the active spacing preset for a route group.
 *
 * @param settings Settings object containing page-space overrides.
 * @param scope Route group being rendered.
 * @returns The explicit override when valid, otherwise the scope default.
 */
export function resolvePageSpacePreset(
  settings: Pick<PageSpaceSettings, 'pageSpace'> | null | undefined,
  scope: PageSpaceScope,
): PageSpacePreset {
  const scoped = settings?.pageSpace?.[scope];
  if (isPageSpacePreset(scoped)) return scoped;
  return PAGE_SPACE_SCOPE_DEFAULTS[scope];
}

/**
 * Convert a preset into CSS variables consumed by `.page-space-frame`.
 *
 * @param preset Fixed spacing preset to emit.
 * @returns React style object containing page-spacing CSS variables.
 */
export function pageSpaceStyle(preset: PageSpacePreset): CSSProperties {
  const config = PAGE_SPACE_PRESETS[preset];
  return {
    ['--page-space-max-width' as never]: config.maxWidth,
    ['--page-space-gutter-base' as never]: config.gutterBase,
    ['--page-space-gutter-sm' as never]: config.gutterSm,
    ['--page-space-gutter-lg' as never]: config.gutterLg,
  };
}

/**
 * Map a Next.js pathname to the user-facing route group whose spacing
 * preference should apply.
 *
 * @param pathname Current route pathname.
 * @returns Route group used for page-spacing resolution.
 */
export function resolvePageSpaceScope(pathname: string): PageSpaceScope {
  if (pathname === '/' || pathname === '') return 'library';
  if (pathname.startsWith('/wishlist')) return 'wishlist';
  if (pathname.startsWith('/search')) return 'search';
  if (pathname.startsWith('/vn/')) return 'vn';
  if (pathname.startsWith('/release/')) return 'release';
  if (pathname.startsWith('/staff')) return 'staff';
  if (pathname.startsWith('/character') || pathname.startsWith('/characters')) return 'character';
  if (pathname.startsWith('/producer') || pathname.startsWith('/producers')) return 'producer';
  if (pathname.startsWith('/series')) return 'series';
  if (pathname.startsWith('/lists')) return 'lists';
  if (pathname.startsWith('/shelf')) return 'shelf';
  if (pathname.startsWith('/compare')) return 'compare';
  if (pathname.startsWith('/recommendations')) return 'recommendations';
  if (pathname.startsWith('/top-ranked')) return 'topRanked';
  if (pathname.startsWith('/upcoming')) return 'upcoming';
  if (pathname.startsWith('/similar')) return 'similar';
  if (pathname.startsWith('/tag') || pathname.startsWith('/trait')) return 'tags';
  if (pathname.startsWith('/data') || pathname.startsWith('/schema')) return 'data';
  if (pathname.startsWith('/brand-overlap')) return 'brandOverlap';
  if (pathname.startsWith('/activity') || pathname.startsWith('/dumped')) return 'activity';
  if (pathname.startsWith('/stats') || pathname.startsWith('/year')) return 'stats';
  if (pathname.startsWith('/quotes')) return 'quotes';
  if (pathname.startsWith('/steam')) return 'steam';
  if (pathname.startsWith('/egs')) return 'egs';
  if (pathname.startsWith('/labels')) return 'labels';
  return 'library';
}
