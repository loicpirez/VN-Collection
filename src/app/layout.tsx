import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Library } from 'lucide-react';
import './globals.css';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { TutorialTour } from '@/components/TutorialTour';
import { GroupedNav } from '@/components/MoreNavMenu';
import { DownloadStatusBar } from '@/components/DownloadStatusBar';
import { getDict, getLocale } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import {
  CARD_DENSITY_MAX,
  CARD_DENSITY_MIN,
  DisplaySettingsProvider,
  type DisplaySettings,
} from '@/lib/settings/client';
import { CardDensityVarSetter } from '@/components/CardDensityVarSetter';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SettingsButton } from '@/components/SettingsButton';
import { SpoilerToggle } from '@/components/SpoilerToggle';
import { QuoteFooter } from '@/components/QuoteFooter';
import { ToastProvider } from '@/components/ToastProvider';
import { ConfirmProvider } from '@/components/ConfirmDialog';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  // Per-page titles use the `%s` template — child routes export their
  // own metadata with a short string, the template wraps it. e.g.
  // a VN detail page exports the VN's title, browser tab shows
  // "<title> · VN Collection". Pages that don't set metadata fall
  // back to the default ("VN Collection") via the `default` slot.
  return {
    title: {
      template: `%s · ${dict.app.title}`,
      default: dict.app.title,
    },
    description: dict.app.tagline,
  };
}

// Next 15 wants viewport in a separate export. Sets the mobile theme
// color to match the dark UI so the iOS / Android status bar bleeds
// into the chrome instead of staying white.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0b1220',
};

/**
 * Read the display-settings cookie set by the client provider. Lets us
 * server-render images already hidden / blurred when the user opted in —
 * fixes the "image flashes before hiding" gap between SSR and hydration.
 * Returns `undefined` (the provider uses its DEFAULTS) when the cookie is
 * absent or unparseable.
 */
async function readInitialDisplaySettings(): Promise<Partial<DisplaySettings> | undefined> {
  const store = await cookies();
  const raw = store.get('vn_display_settings_v1')?.value;
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<DisplaySettings>;
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // ignore — malformed cookie
  }
  return undefined;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = await getDict();
  const initialSettings = await readInitialDisplaySettings();
  // Seed the CSS custom property server-side so the first paint already
  // honours the user's saved card density. Clamped to the same bounds as
  // the slider so a tampered cookie can't blow up the grid.
  const seedDensity = (() => {
    const raw = initialSettings?.cardDensityPx;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 220;
    return Math.max(CARD_DENSITY_MIN, Math.min(CARD_DENSITY_MAX, Math.round(raw)));
  })();
  return (
    <html lang={locale} style={{ ['--card-density-px' as never]: `${seedDensity}px` }}>
      <body className="min-h-screen bg-bg text-white">
        <I18nProvider locale={locale} dict={dict}>
          <DisplaySettingsProvider initial={initialSettings}>
            <CardDensityVarSetter />
            <ToastProvider>
              <ConfirmProvider>
                {/*
                  Skip-to-content link for keyboard users. Visible only on
                  focus (sr-only otherwise), lands on the <main id> below
                  so Tab from the URL bar reaches content in one keystroke
                  instead of cycling through the entire nav each time.
                */}
                <a
                  href="#main-content"
                  className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[1300] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-bg focus:shadow-card"
                >
                  {dict.app.skipToContent}
                </a>
                <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
                  <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-3 sm:gap-4 sm:px-6">
                    <Link href="/" className="flex items-center gap-2">
                      <Library className="h-6 w-6 text-accent" aria-hidden />
                      <span className="text-base font-bold tracking-wide">{dict.app.title}</span>
                    </Link>
                    <GroupedNav />
                    <div className="ml-auto flex items-center gap-2">
                      <SpoilerToggle />
                      <SettingsButton />
                      <LanguageSwitcher />
                    </div>
                  </div>
                </header>
                <main
                  id="main-content"
                  className="mx-auto max-w-7xl px-3 pb-16 pt-6 sm:px-6 sm:pt-8"
                  tabIndex={-1}
                >
                  {children}
                </main>
                <QuoteFooter />
                <KeyboardShortcuts />
                <TutorialTour />
                <DownloadStatusBar />
              </ConfirmProvider>
            </ToastProvider>
          </DisplaySettingsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
