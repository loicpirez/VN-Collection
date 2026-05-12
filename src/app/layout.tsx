import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { Award, BarChart3, Bookmark, CalendarRange, Database, Heart, Library, Quote, Search, Sparkles, Tags, Trophy, Wand2 } from 'lucide-react';
import './globals.css';
import { KeyboardShortcuts } from '@/components/KeyboardShortcuts';
import { TutorialTour } from '@/components/TutorialTour';
import { MoreNavMenu } from '@/components/MoreNavMenu';
import { getDict, getLocale } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import { DisplaySettingsProvider, type DisplaySettings } from '@/lib/settings/client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SettingsButton } from '@/components/SettingsButton';
import { QuoteFooter } from '@/components/QuoteFooter';
import { ToastProvider } from '@/components/ToastProvider';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return {
    title: dict.app.title,
    description: dict.app.tagline,
  };
}

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
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-bg text-white">
        <I18nProvider locale={locale} dict={dict}>
          <DisplaySettingsProvider initial={initialSettings}>
            <ToastProvider>
            <header className="sticky top-0 z-30 border-b border-border bg-bg/90 backdrop-blur">
              <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
                <Link href="/" className="flex items-center gap-2">
                  <Library className="h-6 w-6 text-accent" aria-hidden />
                  <span className="text-base font-bold tracking-wide">{dict.app.title}</span>
                </Link>
                <nav className="flex flex-wrap gap-1">
                  <NavLink href="/" icon={<Library className="h-4 w-4" />}>{dict.nav.library}</NavLink>
                  <NavLink href="/wishlist" icon={<Heart className="h-4 w-4" />}>{dict.nav.wishlist}</NavLink>
                  <NavLink href="/search" icon={<Search className="h-4 w-4" />}>{dict.nav.search}</NavLink>
                  <NavLink href="/recommendations" icon={<Wand2 className="h-4 w-4" />}>{dict.nav.recommend}</NavLink>
                  <NavLink href="/upcoming" icon={<CalendarRange className="h-4 w-4" />}>{dict.nav.upcoming}</NavLink>
                  <NavLink href="/stats" icon={<BarChart3 className="h-4 w-4" />}>{dict.nav.stats}</NavLink>
                  <NavLink href="/data" icon={<Database className="h-4 w-4" />}>{dict.nav.data}</NavLink>
                  <MoreNavMenu />
                </nav>
                <div className="ml-auto flex items-center gap-2">
                  <SettingsButton />
                  <LanguageSwitcher />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">{children}</main>
              <QuoteFooter />
              <KeyboardShortcuts />
              <TutorialTour />
            </ToastProvider>
          </DisplaySettingsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

function NavLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-bg-card hover:text-white"
    >
      {icon}
      {children}
    </Link>
  );
}
