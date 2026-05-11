'use client';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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
}

const DEFAULTS: DisplaySettings = {
  hideImages: false,
  blurR18: true,
  nsfwThreshold: 1.5,
  preferLocalImages: true,
  preferNativeTitle: false,
  hideSexual: false,
};

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

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<DisplaySettings>(DEFAULTS);
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
