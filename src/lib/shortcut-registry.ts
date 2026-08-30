import type { Dictionary } from './i18n/dictionaries';

/** Route-independent row shown in shortcut help tables. */
export interface ShortcutRow {
  key: string;
  label: string;
}

/** Definition for a global `g <key>` navigation shortcut. */
export interface RouteShortcut {
  key: string;
  href: string | ((year: number) => string);
  label: (t: Dictionary) => string;
}

/** Labelled group of shortcuts rendered by help and settings panels. */
export interface ShortcutSection {
  id: 'vn' | 'library' | 'tags' | 'shelf' | 'map' | 'compare' | 'search' | 'stock';
  label: string;
  rows: ShortcutRow[];
}

/** Global route shortcuts shared by keyboard handling and help displays. */
export const ROUTE_SHORTCUTS: RouteShortcut[] = [
  { key: 'h', href: '/', label: (t) => t.nav.library },
  { key: 's', href: '/search', label: (t) => t.nav.search },
  { key: 'w', href: '/wishlist', label: (t) => t.nav.wishlist },
  { key: 'l', href: '/lists', label: (t) => t.nav.lists },
  { key: 'r', href: '/recommendations', label: (t) => t.nav.recommend },
  { key: 'u', href: '/upcoming', label: (t) => t.nav.upcoming },
  { key: 'o', href: '/top-ranked', label: (t) => t.nav.topRanked },
  { key: 'm', href: '/similar', label: (t) => t.nav.similar },
  { key: 'c', href: '/compare', label: (t) => t.nav.compare },
  { key: 'q', href: '/quotes', label: (t) => t.nav.quotes },
  { key: 'y', href: (year) => `/year?y=${year}`, label: (t) => t.nav.year },
  { key: 'p', href: '/producers', label: (t) => t.nav.producers },
  { key: 'g', href: '/tags', label: (t) => t.nav.tags },
  { key: 'i', href: '/traits', label: (t) => t.nav.traits },
  { key: 'k', href: '/characters', label: (t) => t.nav.characters },
  { key: 'f', href: '/staff', label: (t) => t.nav.staff },
  { key: 'j', href: '/seiyuu', label: (t) => t.nav.seiyuu },
  { key: 'e', href: '/shelf', label: (t) => t.nav.shelf },
  { key: 'b', href: '/dumped', label: (t) => t.nav.dumped },
  { key: 'a', href: '/activity', label: (t) => t.nav.activity },
  { key: 't', href: '/stats', label: (t) => t.nav.stats },
  { key: 'v', href: '/steam', label: (t) => t.nav.steam },
  { key: 'x', href: '/egs', label: (t) => t.nav.egs },
  { key: 'd', href: '/data', label: (t) => t.nav.data },
];

/** Returns the resolved route for a `g <key>` navigation shortcut. */
export function routeForShortcutKey(key: string, year: number): string | null {
  const row = ROUTE_SHORTCUTS.find((shortcut) => shortcut.key === key.toLowerCase());
  if (!row) return null;
  return typeof row.href === 'function' ? row.href(year) : row.href;
}

/** Returns display rows for every global route shortcut. */
export function routeShortcutRows(t: Dictionary, year: number): ShortcutRow[] {
  return ROUTE_SHORTCUTS.map((shortcut) => ({
    key: `g ${shortcut.key}`,
    label: shortcut.label(t),
  }));
}

/** Returns the global non-navigation shortcuts. */
export function globalShortcutRows(t: Dictionary): ShortcutRow[] {
  return [
    { key: '/', label: t.shortcuts.focusSearch },
    { key: '?', label: t.shortcuts.help },
    { key: 'Esc', label: t.shortcuts.close },
  ];
}

/** Returns every page-scoped shortcut section shown in settings/help. */
export function pageShortcutSections(t: Dictionary): ShortcutSection[] {
  return [
    {
      id: 'vn',
      label: t.shortcuts.vnPage,
      rows: [
        { key: 'f', label: t.shortcuts.vnToggleFavorite },
        { key: 'e', label: t.shortcuts.vnJumpEdit },
        { key: 'n', label: t.shortcuts.vnJumpNotes },
      ],
    },
    {
      id: 'library',
      label: t.shortcuts.libPage,
      rows: [
        { key: 'f', label: t.shortcuts.libOpenFilter },
      ],
    },
    {
      id: 'tags',
      label: t.shortcuts.tagsPage,
      rows: [
        { key: '1', label: t.shortcuts.tagsTabLocal },
        { key: '2', label: t.shortcuts.tagsTabVndb },
      ],
    },
    {
      id: 'shelf',
      label: t.shortcuts.shelfPage,
      rows: [
        { key: 'f', label: t.shortcuts.shelfFullscreen },
        { key: 'o', label: t.shortcuts.shelfOptions },
      ],
    },
    {
      id: 'map',
      label: t.shortcuts.mapPage,
      rows: [
        { key: 'a', label: t.shortcuts.mapAddPlace },
        { key: 'r', label: t.shortcuts.mapResetView },
      ],
    },
    {
      id: 'compare',
      label: t.shortcuts.comparePage,
      rows: [
        { key: 'a', label: t.shortcuts.compareAddVn },
        { key: 'c', label: t.shortcuts.compareRun },
      ],
    },
    {
      id: 'search',
      label: t.shortcuts.searchPage,
      rows: [
        { key: '1', label: t.shortcuts.searchTabVndb },
        { key: '2', label: t.shortcuts.searchTabEgs },
        { key: '3', label: t.shortcuts.searchTabLocal },
      ],
    },
    {
      id: 'stock',
      label: t.shortcuts.stockPage,
      rows: [
        { key: 'r', label: t.shortcuts.stockRefresh },
        { key: 'b', label: t.shortcuts.stockBatch },
      ],
    },
  ];
}
