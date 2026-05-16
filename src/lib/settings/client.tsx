'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const COOKIE_NAME = 'vn_display_settings_v1';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

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
   * Min cell width in px for the shared multi-VN card grids on /wishlist,
   * /recommendations, /top-ranked, /upcoming, /dumped, /egs, /similar, etc.
   * Clamped to [140, 320]. Smaller value -> more columns -> denser display.
   * Mobile viewports cap their own columns via CSS regardless of this pref.
   */
  cardDensityPx: number;
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
  spoilerLevel: 0,
  showSexualTraits: false,
};

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
export function clampCardDensity(px: number): number {
  if (!Number.isFinite(px)) return 220;
  return Math.max(CARD_DENSITY_MIN, Math.min(CARD_DENSITY_MAX, Math.round(px)));
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
  const [settings, setSettings] = useState<DisplaySettings>({ ...DEFAULTS, ...(initial ?? {}) });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
        setSettings({ ...DEFAULTS, ...parsed });
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
