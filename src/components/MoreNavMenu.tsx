'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useDialogA11y } from './Dialog';
import Link from 'next/link';
import {
  Award,
  BarChart3,
  Bookmark,
  CalendarRange,
  ChevronDown,
  Cog,
  Database,
  FileCode2,
  Globe,
  Heart,
  Library,
  ListChecks,
  type LucideIcon,
  Menu,
  Mic,
  Quote,
  Search as SearchIcon,
  Sparkles,
  Tag,
  Tags,
  Trophy,
  UserSquare,
  Wand2,
  X,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Top-level navigation. Built as a grouped, responsive layout:
 *
 *   ▸ Desktop (≥ md): three primary always-visible links (Library / Wishlist /
 *     Search) plus three category dropdowns (Discover / Browse / Insights)
 *     that collect the secondary destinations. No more "More" catch-all bin.
 *   ▸ Mobile (< md): a single hamburger button slides open a sheet that lists
 *     everything grouped by category.
 *
 * Categories are stable so the structure is predictable: top-level always
 * means "core daily-use", dropdowns always mean "infrequent destinations
 * grouped by purpose".
 */
export function GroupedNav() {
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);

  // i18n labels live here so they update under the same render cycle as the
  // rest of the layout — duplicating into a static const would force a full
  // reload to translate.
  const primary: NavItem[] = [
    { href: '/', label: t.nav.library, icon: Library },
    { href: '/wishlist', label: t.nav.wishlist, icon: Heart },
    { href: '/lists', label: t.nav.lists, icon: ListChecks },
    { href: '/search', label: t.nav.search, icon: SearchIcon },
  ];

  const discover: NavItem[] = [
    { href: '/upcoming', label: t.nav.upcoming, icon: CalendarRange },
    { href: '/recommendations', label: t.nav.recommend, icon: Wand2 },
    { href: '/quotes', label: t.nav.quotes, icon: Quote },
  ];

  const browse: NavItem[] = [
    { href: '/producers', label: t.nav.producers, icon: Trophy },
    { href: '/series', label: t.nav.series, icon: Bookmark },
    { href: '/tags', label: t.nav.tags, icon: Tags },
    { href: '/traits', label: t.nav.traits, icon: Sparkles },
    { href: '/characters', label: t.nav.characters, icon: UserSquare },
    { href: '/staff', label: t.nav.staff, icon: Mic },
    { href: `/year?y=${new Date().getFullYear()}`, label: t.nav.year, icon: Award },
    { href: '/labels', label: t.nav.labels, icon: Tag },
  ];

  const insights: NavItem[] = [
    { href: '/stats', label: t.nav.stats, icon: BarChart3 },
    { href: '/shelf', label: t.nav.shelf, icon: Library },
    { href: '/steam', label: t.nav.steam, icon: Globe },
    { href: '/egs', label: t.nav.egs, icon: Sparkles },
    { href: '/schema', label: t.nav.schema, icon: FileCode2 },
    { href: '/data', label: t.nav.data, icon: Database },
  ];

  return (
    <>
      <nav className="hidden flex-wrap items-center gap-1 md:flex">
        {primary.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
        <NavGroup label={t.nav.groupDiscover} items={discover} />
        <NavGroup label={t.nav.groupBrowse} items={browse} />
        <NavGroup label={t.nav.groupInsights} items={insights} icon={Cog} />
      </nav>
      <button
        type="button"
        className="md:hidden inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-bg-card hover:text-white"
        onClick={() => setMobileOpen(true)}
        aria-label={t.nav.openMenu}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      {mobileOpen && (
        <MobileSheet
          onClose={() => setMobileOpen(false)}
          t={t}
          groups={[
            { title: t.nav.groupPrimary, items: primary },
            { title: t.nav.groupDiscover, items: discover },
            { title: t.nav.groupBrowse, items: browse },
            { title: t.nav.groupInsights, items: insights },
          ]}
        />
      )}
    </>
  );
}

function NavLink({ href, label, icon: Icon }: NavItem) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-bg-card hover:text-white"
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function NavGroup({ label, items, icon: Icon }: { label: string; items: NavItem[]; icon?: LucideIcon }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-bg-card hover:text-white"
      >
        {Icon && <Icon className="h-4 w-4" aria-hidden />}
        {label}
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-56 rounded-lg border border-border bg-bg-card p-1 text-sm shadow-card">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-muted hover:bg-bg-elev hover:text-white"
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileSheet({
  onClose,
  groups,
  t,
}: {
  onClose: () => void;
  groups: { title: string; items: NavItem[] }[];
  t: ReturnType<typeof useT>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useDialogA11y({ open: true, onClose, panelRef });
  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-bg/80 backdrop-blur" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute right-0 top-0 h-full w-72 max-w-[85vw] overflow-y-auto border-l border-border bg-bg-card shadow-card outline-none"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span id={titleId} className="text-sm font-bold tracking-wide">
            {t.nav.openMenu}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:text-white"
            aria-label={t.common.close}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="px-2 py-2 text-sm">
          {groups.map((g) => (
            <div key={g.title} className="mb-3">
              <div className="px-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted/80">{g.title}</div>
              {g.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-2 rounded-md px-2 py-2 text-muted hover:bg-bg-elev hover:text-white"
                >
                  <item.icon className="h-4 w-4" aria-hidden />
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Kept for backwards compatibility — re-exported as the same component. */
export { GroupedNav as MoreNavMenu };
