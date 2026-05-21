'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const COOKIE_NAME = 'vn_display_settings_v1';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

/**
 * Canonical list of card-density scopes. One entry per surface where
 * the slider is mounted; the value in `DisplaySettings.density` is
 * keyed by these strings.
 *
 * Adding a new scope: extend this union, add an i18n label under
 * `display.densityScope.<scope>` (all three locales), then mount
 * `<CardDensitySlider scope="<scope>" />` on the page.
 */
export const DENSITY_SCOPES = [
  'library',
  'wishlist',
  'search',
  'recommendations',
  'topRanked',
  'upcoming',
  'dumped',
  'egs',
  'staffWorks',
  'producerWorks',
  'characterWorks',
  'seriesWorks',
  'lists',
  'vnSimilar',
  'vnMedia',
  'shelf',
  'tagPage',
] as const;

export type DensityScope = (typeof DENSITY_SCOPES)[number];

/**
 * Per-surface density overrides. Missing keys fall back to
 * `DisplaySettings.cardDensityPx` so users that haven't touched any
 * surface still see a consistent value everywhere.
 */
export type DensityScopes = Partial<Record<DensityScope, number>>;

export interface DisplaySettings {
  hideImages: boolean;
  blurR18: boolean;
  nsfwThreshold: number;
  preferLocalImages: boolean;
  /**
   * When true, swap the main title with the alternative title:
   * shows the original (e.g. 日本語) as the headline and the romaji/translation as the subtitle.
   * VNDB returns romaji as `title` by default; this flips the display.
   */
  preferNativeTitle: boolean;
  /**
   * Hard-hide cards / list rows whose image is flagged as sexual past the NSFW
   * threshold. Stronger than `blurR18` — those entries don't render at all.
   */
  hideSexual: boolean;
  /** Library grid density: false = comfortable (default), true = dense. */
  denseLibrary: boolean;
  /**
   * Legacy / default density used when a scope has no entry in
   * `density`. Kept for backwards compatibility with the cookie /
   * localStorage payload that older builds wrote — and as the fallback
   * each scope reads when the user hasn't customised it.
   *
   * Clamped to [120, 480]; see `clampCardDensity`.
   */
  cardDensityPx: number;
  /**
   * Per-surface density overrides. Keys are taken from
   * `DENSITY_SCOPES`; values are clamped on read. Setting a value here
   * affects ONLY that surface — `/library` resizing no longer changes
   * `/staff`, `/recommendations`, etc.
   */
  density: DensityScopes;
  /**
   * Spoiler level shown by default across the app.
   *   0 = none (default — like VNDB out of the box)
   *   1 = minor spoilers
   *   2 = major spoilers
   * Tags / traits / characters honor this in the same way VNDB does.
   */
  spoilerLevel: 0 | 1 | 2;
  /** When true, sexual traits / NSFW-flagged traits are revealed. */
  showSexualTraits: boolean;
}

const DEFAULTS: DisplaySettings = {
  hideImages: false,
  blurR18: true,
  nsfwThreshold: 1.5,
  preferLocalImages: true,
  preferNativeTitle: false,
  hideSexual: false,
  denseLibrary: false,
  cardDensityPx: 220,
  density: {},
  spoilerLevel: 0,
  showSexualTraits: false,
};

/**
 * Legacy-migration marker. Set in localStorage once we've consumed a
 * pre-existing `cardDensityPx` and seeded `density.library` from it.
 * Without the guard, a user that explicitly resets `density.library`
 * back to "fallback" would have it re-seeded from the old key on the
 * next reload — that would silently undo their reset.
 */
const LEGACY_LIBRARY_MIGRATED_KEY = 'vn_display_settings_legacy_library_seeded_v1';

/** Clamp helper exported so callers (Settings, slider) share the same bounds.
 *
 * Range widened from the original [140, 320]:
 * - Min 120 lets power users pack ~8 columns on a normal 1200px
 *   viewport (still readable on a desktop monitor; mobile is capped
 *   by responsive breakpoints elsewhere).
 * - Max 480 lets the user genuinely get "~2 cards per row" on a
 *   1200px viewport, which is what poster-mode browsing wants.
 *   The previous 320 max made the slider feel like it did
 *   nothing on the high end — at 1200px / 320 = 3.75 columns,
 *   only barely different from default 220 (1200/220 = 5.45). */
export const CARD_DENSITY_MIN = 120;
export const CARD_DENSITY_MAX = 480;
/**
 * Project-wide default the slider Reset button restores. Matches the
 * fallback value baked into every listing-grid template
 * (`var(--card-density-px, 220px)`) so a freshly-reset slider keeps
 * the grids on their canonical column count.
 */
export const CARD_DENSITY_DEFAULT = 220;
export function clampCardDensity(px: number): number {
  if (!Number.isFinite(px)) return CARD_DENSITY_DEFAULT;
  return Math.max(CARD_DENSITY_MIN, Math.min(CARD_DENSITY_MAX, Math.round(px)));
}

/**
 * Pure helper: does a settings object carry an explicit per-scope
 * override for the given scope? Exported so the Settings panel can
 * label a row as "Suit la valeur par défaut" vs "Personnalisé"
 * without re-implementing the predicate against the typed `density`
 * map. Returns `false` for `undefined`, `null`, non-finite, and for
 * the absence of the `density` map entirely — anything else counts
 * as an override.
 */
export function hasScopeOverride(
  settings: Pick<DisplaySettings, 'density'> | null | undefined,
  scope: DensityScope,
): boolean {
  const v = settings?.density?.[scope];
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Pure helper: produce a `density` map with every per-scope override
 * cleared. The legacy `cardDensityPx` is intentionally NOT touched
 * here — Settings → Display surfaces two distinct reset buttons
 * (per-page only vs everything) so the helper can be reused for the
 * narrower of the two without clobbering the user's preferred
 * default. Returns a fresh empty object so callers can pass it
 * straight into `set('density', …)` without aliasing.
 */
export function clearAllScopeDensities(
  _settings: Pick<DisplaySettings, 'density'> | null | undefined,
): DensityScopes {
  // The current contract is "clear everything" so the input is
  // unused; signature keeps it for parity with future "clear except
  // pinned" variants without forcing a call-site refactor.
  void _settings;
  return {};
}

/**
 * Resolve the active density value for a scope.
 *   1. URL override (`?density=N`, snapped to clamp range).
 *   2. Persisted per-scope value (`density[scope]`).
 *   3. Legacy global fallback (`cardDensityPx`).
 *   4. CARD_DENSITY_DEFAULT.
 *
 * Returned value is always within `[CARD_DENSITY_MIN, CARD_DENSITY_MAX]`.
 * The URL parameter is a string-or-null because both `URLSearchParams.get`
 * and `searchParams.get` return that shape from Next.js.
 */
export function resolveScopedDensity(
  settings: Pick<DisplaySettings, 'density' | 'cardDensityPx'>,
  scope: DensityScope,
  urlOverride?: string | number | null,
): number {
  if (urlOverride != null && urlOverride !== '') {
    const raw = typeof urlOverride === 'number' ? urlOverride : Number(urlOverride);
    if (Number.isFinite(raw)) return clampCardDensity(raw);
  }
  const scoped = settings.density?.[scope];
  if (typeof scoped === 'number' && Number.isFinite(scoped)) return clampCardDensity(scoped);
  if (Number.isFinite(settings.cardDensityPx)) return clampCardDensity(settings.cardDensityPx);
  return CARD_DENSITY_DEFAULT;
}

const STORAGE_KEY = 'vn_display_settings_v1';

export interface TitlePair {
  main: string;
  sub: string | null;
}

/**
 * Resolve the title pair given user preference. If both fields exist and the user
 * prefers the native (original) title, swap them. Otherwise return as-is.
 */
export function resolveTitles(
  title: string,
  alttitle: string | null | undefined,
  preferNative: boolean,
): TitlePair {
  if (!preferNative || !alttitle || alttitle === title) {
    return { main: title, sub: alttitle && alttitle !== title ? alttitle : null };
  }
  return { main: alttitle, sub: title };
}

interface Ctx {
  settings: DisplaySettings;
  set: <K extends keyof DisplaySettings>(key: K, value: DisplaySettings[K]) => void;
  reset: () => void;
}

const SettingsContext = createContext<Ctx | null>(null);

/**
 * Pure helper exported for unit tests: takes a parsed payload from
 * storage (or the default seed) and returns the migrated settings
 * along with a boolean indicating whether the legacy migration ran.
 *
 * Migration semantics: if the persisted payload has a `cardDensityPx`
 * but no `density.library` and the caller hasn't already seeded
 * the library scope, we lift the legacy value into `density.library`
 * so existing users don't get surprised by `/library` suddenly
 * snapping back to 220 the first time scope handling lands. We only
 * run this once per profile — guarded by the `alreadyMigrated` flag
 * the provider tracks in localStorage.
 */
export function migrateLegacyCardDensity(
  parsed: Partial<DisplaySettings>,
  alreadyMigrated: boolean,
): { settings: DisplaySettings; migrated: boolean } {
  const merged: DisplaySettings = {
    ...DEFAULTS,
    ...parsed,
    density: { ...(parsed.density ?? {}) },
  };
  if (
    !alreadyMigrated &&
    merged.density.library == null &&
    typeof parsed.cardDensityPx === 'number' &&
    Number.isFinite(parsed.cardDensityPx) &&
    clampCardDensity(parsed.cardDensityPx) !== CARD_DENSITY_DEFAULT
  ) {
    merged.density.library = clampCardDensity(parsed.cardDensityPx);
    return { settings: merged, migrated: true };
  }
  return { settings: merged, migrated: false };
}

export function DisplaySettingsProvider({
  children,
  initial,
}: {
  children: ReactNode;
  /**
   * Server-supplied seed read from the `vn_display_settings_v1` cookie.
   * Lets the server render images already hidden / blurred when the user
   * has those opted in — no flash of unhidden content before localStorage
   * loads on the client.
   */
  initial?: Partial<DisplaySettings>;
}) {
  const [settings, setSettings] = useState<DisplaySettings>(() => {
    // Seed from the server-supplied initial without running the legacy
    // migration here — the migration must consult localStorage to know
    // whether it has run before, which we can't do during SSR.
    const merged: DisplaySettings = {
      ...DEFAULTS,
      ...(initial ?? {}),
      density: { ...(initial?.density ?? {}) },
    };
    return merged;
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Partial<DisplaySettings>) : {};
      const alreadyMigrated = localStorage.getItem(LEGACY_LIBRARY_MIGRATED_KEY) === '1';
      const { settings: next, migrated } = migrateLegacyCardDensity(parsed, alreadyMigrated);
      setSettings(next);
      if (migrated) {
        // Mark BEFORE the storage write below so a refresh mid-write
        // doesn't re-seed the library scope on the next mount.
        localStorage.setItem(LEGACY_LIBRARY_MIGRATED_KEY, '1');
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      // Mirror to a cookie so the server can pre-hydrate on next navigation
      // and avoid the "image flashes before hiding" issue.
      const value = encodeURIComponent(JSON.stringify(settings));
      document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
    } catch {
      // ignore
    }
  }, [settings, hydrated]);

  const value = useMemo<Ctx>(
    () => ({
      settings,
      set: (k, v) => setSettings((s) => ({ ...s, [k]: v })),
      reset: () => setSettings(DEFAULTS),
    }),
    [settings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useDisplaySettings(): Ctx {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useDisplaySettings must be used within DisplaySettingsProvider');
  return ctx;
}

export function isExplicit(sexual: number | null | undefined, threshold: number): boolean {
  if (sexual == null) return false;
  return sexual >= threshold;
}
