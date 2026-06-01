'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDialogA11y } from './Dialog';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Award,
  Activity,
  BarChart3,
  Bookmark,
  CalendarRange,
  ChevronDown,
  Compass,
  Crown,
  Database,
  FileCode2,
  Gamepad2,
  GitCompare,
  GitMerge,
  Globe,
  HardDriveDownload,
  Heart,
  LayoutGrid,
  Library,
  ListChecks,
  type LucideIcon,
  Map,
  MapPin,
  Menu,
  Mic,
  PackageSearch,
  Quote,
  Search as SearchIcon,
  Sparkles,
  Tag,
  Tags,
  Trophy,
  UserSquare,
  Wand2,
  X,
  ShoppingBag,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Optional href matcher for active state. Defaults to startsWith(href)
   * — used by Library since its href "/" would otherwise match every
   * route. When set, the link is active only when the pathname is
   * exactly this value.
   */
  exact?: boolean;
}

/**
 * Top-level navigation. Built as a grouped, responsive layout:
 *
 *   ▸ Mobile (< md): single hamburger → right-slide sheet, grouped flat list.
 *   ▸ md – lg (768 – 1023): icon-only primary links + grouped dropdowns
 *     identified by icon + chevron. Tooltips and aria-labels preserve a11y.
 *     Keeps FR labels (Bibliothèque, Personnages, Rechercher) from
 *     overflowing the header on the most-used breakpoint.
 *   ▸ lg+ (≥ 1024): icon + label primary + icon + label + chevron groups.
 *
 * Active route gets an accent background plus `aria-current="page"` so
 * screen readers and the visual layer agree. The "More" catch-all bin
 * is gone — every item lives in a named category.
 */
export function GroupedNav({ alicenetEnabled = false }: { alicenetEnabled?: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileSheetId = useId();
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  // i18n labels live here so they update under the same render cycle as the
  // rest of the layout — duplicating into a static const would force a full
  // reload to translate.
  // Primary nav: kept TIGHT so the French labels fit at lg. We dropped
  // /lists out of primary into Discover — wishlist + search are the
  // truly daily-use entries, and the FR string "Liste de souhaits"
  // is already a wide label so we avoid stacking another similarly-
  // named entry next to it. Lists are one extra click away in
  // Discover but every NavGroup item is also surfaced in the mobile
  // sheet for parity.
  const primary: NavItem[] = [
    { href: '/', label: t.nav.library, icon: Library, exact: true },
    { href: '/wishlist', label: t.nav.wishlist, icon: Heart },
    { href: '/search', label: t.nav.search, icon: SearchIcon },
  ];

  const discover: NavItem[] = [
    { href: '/upcoming', label: t.nav.upcoming, icon: CalendarRange },
    { href: '/top-ranked', label: t.nav.topRanked, icon: Crown },
    { href: '/recommendations', label: t.nav.recommend, icon: Wand2 },
    { href: '/similar', label: t.nav.similar, icon: Sparkles },
    { href: '/compare', label: t.nav.compare, icon: GitCompare },
    { href: '/quotes', label: t.nav.quotes, icon: Quote },
    { href: '/lists', label: t.nav.lists, icon: ListChecks },
  ];

  const browse: NavItem[] = [
    { href: '/producers', label: t.nav.producers, icon: Trophy },
    { href: '/series', label: t.nav.series, icon: Bookmark },
    { href: '/tags', label: t.nav.tags, icon: Tags },
    { href: '/traits', label: t.nav.traits, icon: Sparkles },
    { href: '/characters', label: t.nav.characters, icon: UserSquare },
    { href: '/staff', label: t.nav.staff, icon: Mic },
  ];

  // /shelf used to share the Library icon, which was visually
  // identical to the home link — replaced with LayoutGrid (a more
  // shelf-like grid metaphor). /egs used to share Sparkles with
  // /traits — Gamepad2 disambiguates it as a games database.
  const insights: NavItem[] = [
    { href: '/brand-overlap', label: t.nav.brandOverlap, icon: GitMerge },
    { href: '/stats', label: t.nav.stats, icon: BarChart3 },
    { href: '/shelf', label: t.nav.shelf, icon: LayoutGrid },
    { href: `/year?y=${currentYear}`, label: t.nav.year, icon: Award },
    { href: '/labels', label: t.nav.labels, icon: Tag },
    { href: '/dumped', label: t.nav.dumped, icon: HardDriveDownload },
    { href: '/activity', label: t.nav.activity, icon: Activity },
    { href: '/steam', label: t.nav.steam, icon: Globe },
    { href: '/egs', label: t.nav.egs, icon: Gamepad2 },
    { href: '/stock', label: t.nav.stock, icon: PackageSearch },
    { href: '/places', label: t.nav.places, icon: MapPin },
    { href: '/map', label: t.nav.map, icon: Map },
    { href: '/schema', label: t.nav.schema, icon: FileCode2 },
    { href: '/data', label: t.nav.data, icon: Database },
    ...(alicenetEnabled ? [{ href: '/alicenet', label: t.nav.alicenet, icon: ShoppingBag }] : []),
  ];

  // Active when any item in the group matches the current route — the
  // dropdown trigger lights up so the user knows roughly where they are
  // even though the destination is inside a collapsed menu.
  const groupActive = (items: NavItem[]) =>
    items.some((item) => isActive(pathname, item));

  return (
    <>
      <nav
        className="hidden flex-wrap items-center gap-0.5 md:flex lg:gap-1"
        aria-label={t.nav.mainNavLabel}
      >
        {primary.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
        <NavGroup
          label={t.nav.groupDiscover}
          items={discover}
          icon={Compass}
          pathname={pathname}
          active={groupActive(discover)}
        />
        <NavGroup
          label={t.nav.groupBrowse}
          items={browse}
          icon={Tags}
          pathname={pathname}
          active={groupActive(browse)}
        />
        <NavGroup
          label={t.nav.groupInsights}
          items={insights}
          icon={BarChart3}
          pathname={pathname}
          active={groupActive(insights)}
        />
      </nav>
      <button
        type="button"
        className="tap-target md:hidden inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted hover:bg-bg-card hover:text-white"
        onClick={() => setMobileOpen(true)}
        aria-label={t.nav.openMenu}
        aria-expanded={mobileOpen}
        aria-haspopup="dialog"
        aria-controls={mobileSheetId}
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>
      {mobileOpen && (
        <MobileSheet
          id={mobileSheetId}
          onClose={() => setMobileOpen(false)}
          t={t}
          pathname={pathname}
          groups={[
            { title: t.nav.groupPrimary, icon: Library, items: primary },
            { title: t.nav.groupDiscover, icon: Compass, items: discover },
            { title: t.nav.groupBrowse, icon: Tags, items: browse },
            { title: t.nav.groupInsights, icon: BarChart3, items: insights },
          ]}
        />
      )}
    </>
  );
}

function isActive(pathname: string | null, item: NavItem): boolean {
  if (!pathname) return false;
  // Strip any query / hash before comparing.
  const path = pathname.split('?')[0].split('#')[0];
  if (item.exact) return path === item.href;
  // Strip query from the item's href too (e.g. /year?y=2026 → /year).
  const itemPath = item.href.split('?')[0];
  if (itemPath === '/') return path === '/';
  return path === itemPath || path.startsWith(`${itemPath}/`);
}

function NavLink({ item, pathname }: { item: NavItem; pathname: string | null }) {
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      title={item.label}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={`tap-target inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors 2xl:px-2.5 ${
        active
          ? 'bg-accent/15 text-accent hover:bg-accent/20'
          : 'text-muted hover:bg-bg-card hover:text-white'
      }`}
    >
      <item.icon className="h-4 w-4" aria-hidden />
      {/* Text label is hidden md→2xl-1 (768-1535px) and only shows
          at 2xl (1536px+). Earlier breakpoints (lg, xl) overflowed
          on realistic laptop widths (1366×768 = ~1280-1300px) with
          French labels like "Bibliothèque" / "Rechercher" /
          "Découvrir" / "Données & Stats" + the right-side controls
          (Spoiler / Settings / Language). The aria-label + title
          attributes preserve a11y + tooltips while icons are alone. */}
      <span className="hidden 2xl:inline">{item.label}</span>
    </Link>
  );
}

function NavGroup({
  label,
  items,
  icon: Icon,
  pathname,
  active,
}: {
  label: string;
  items: NavItem[];
  icon?: LucideIcon;
  pathname: string | null;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
  const menuId = useId();

  function updateMenuPosition() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gutter = 8;
    const width = 224;
    setMenuPosition({
      left: Math.max(gutter, Math.min(rect.left, window.innerWidth - width - gutter)),
      top: rect.bottom + 4,
    });
  }

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus({ preventScroll: true });
    function outside(e: MouseEvent) {
      const target = e.target as Node;
      if (!ref.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      const menuItems = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
      );
      if (menuItems.length === 0) return;
      const idx = menuItems.indexOf(document.activeElement as HTMLElement);
      let next: HTMLElement | undefined;
      if (e.key === 'Home') next = menuItems[0];
      else if (e.key === 'End') next = menuItems[menuItems.length - 1];
      else if (e.key === 'ArrowDown') next = menuItems[(idx + 1 + menuItems.length) % menuItems.length] ?? menuItems[0];
      else next = menuItems[(idx - 1 + menuItems.length) % menuItems.length] ?? menuItems[menuItems.length - 1];
      e.preventDefault();
      next?.focus();
    }
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', key);
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', key);
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updateMenuPosition();
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        aria-label={label}
        title={label}
        className={`tap-target inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold transition-colors 2xl:gap-1.5 2xl:px-2.5 ${
          active
            ? 'bg-accent/15 text-accent hover:bg-accent/20'
            : 'text-muted hover:bg-bg-card hover:text-white'
        }`}
      >
        {Icon && <Icon className="h-4 w-4" aria-hidden />}
        {/* Group label hidden md→2xl-1, shown only at 2xl+ (1536px)
            to match the NavLink primary-nav breakpoint and avoid
            French overflow on laptop displays. */}
        <span className="hidden 2xl:inline">{label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="fixed z-[1100] w-56 overflow-y-auto rounded-lg border border-border bg-bg-card p-1 text-sm shadow-card"
          style={{
            left: menuPosition.left,
            top: menuPosition.top,
            maxHeight: `calc(100vh - ${menuPosition.top + 8}px)`,
          }}
        >
          {items.map((item) => {
            const itemActive = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={itemActive ? 'page' : undefined}
                className={`tap-target flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                  itemActive
                    ? 'bg-accent/15 text-accent font-semibold'
                    : 'text-muted hover:bg-bg-elev hover:text-white'
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

function MobileSheet({
  id,
  onClose,
  groups,
  pathname,
  t,
}: {
  id: string;
  onClose: () => void;
  groups: { title: string; icon: LucideIcon; items: NavItem[] }[];
  pathname: string | null;
  t: ReturnType<typeof useT>;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useDialogA11y({ open: true, onClose, panelRef });
  return createPortal(
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 bg-bg/80 backdrop-blur" onClick={onClose} aria-hidden />
      <div
        id={id}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 h-full w-full max-w-[30rem] overflow-y-auto border-l border-border bg-bg-card shadow-card outline-none"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex min-h-14 items-center justify-between border-b border-border px-4 py-3">
          <span id={titleId} className="text-sm font-bold tracking-wide">
            {t.nav.openMenu}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md p-1 text-muted hover:text-white"
            aria-label={t.common.close}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div className="px-3 py-3 text-sm">
          {groups.map((g, gi) => (
            <div key={g.title} className={gi > 0 ? 'mt-4 border-t border-border/60 pt-4' : 'mb-4'}>
              <div className="inline-flex items-center gap-1 px-2 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted/80">
                <g.icon className="h-3 w-3" aria-hidden />
                {g.title}
              </div>
              {g.items.map((item) => {
                const active = isActive(pathname, item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                      active
                        ? 'bg-accent/15 text-accent border-l-2 border-accent'
                        : 'text-muted hover:bg-bg-elev hover:text-white'
                    }`}
                  >
                    <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Kept for backwards compatibility — re-exported as the same component. */
export { GroupedNav as MoreNavMenu };
