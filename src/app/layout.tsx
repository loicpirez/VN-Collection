import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, Bookmark, Database, Heart, Library, Search, Sparkles, Tags, Trophy } from 'lucide-react';
import './globals.css';
import { getDict, getLocale } from '@/lib/i18n/server';
import { I18nProvider } from '@/lib/i18n/client';
import { DisplaySettingsProvider } from '@/lib/settings/client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { SettingsButton } from '@/components/SettingsButton';
import { QuoteFooter } from '@/components/QuoteFooter';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return {
    title: dict.app.title,
    description: dict.app.tagline,
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const dict = await getDict();
  return (
    <html lang={locale}>
      <body className="min-h-screen bg-bg text-white">
        <I18nProvider locale={locale} dict={dict}>
          <DisplaySettingsProvider>
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
                  <NavLink href="/producers" icon={<Trophy className="h-4 w-4" />}>{dict.nav.producers}</NavLink>
                  <NavLink href="/series" icon={<Bookmark className="h-4 w-4" />}>{dict.nav.series}</NavLink>
                  <NavLink href="/tags" icon={<Tags className="h-4 w-4" />}>{dict.nav.tags}</NavLink>
                  <NavLink href="/traits" icon={<Sparkles className="h-4 w-4" />}>{dict.nav.traits}</NavLink>
                  <NavLink href="/stats" icon={<BarChart3 className="h-4 w-4" />}>{dict.nav.stats}</NavLink>
                  <NavLink href="/data" icon={<Database className="h-4 w-4" />}>{dict.nav.data}</NavLink>
                </nav>
                <div className="ml-auto flex items-center gap-2">
                  <SettingsButton />
                  <LanguageSwitcher />
                </div>
              </div>
            </header>
            <main className="mx-auto max-w-7xl px-6 pb-16 pt-8">{children}</main>
            <QuoteFooter />
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
