import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, Box, Coins, Eye, Layers, LayoutGrid, Library, Package } from 'lucide-react';
import {
  listAllOwnedReleases,
  listShelves,
  listUnplacedOwnedReleases,
  type ShelfEntry,
} from '@/lib/db';
import { getDict, getLocale } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { ShelfLayoutEditor } from '@/components/ShelfLayoutEditor';
import { ShelfSpatialView } from '@/components/ShelfSpatialView';

export const dynamic = 'force-dynamic';

// Four view modes:
// - `spatial` (default): polished read-only browse of every shelf
//   rendered as a visual grid with Top/Bottom/Between display rows.
//   No drag, no mutation. Has a fullscreen toggle.
// - `release` / `item`: read-only flat grouped grids by physical
//   location tag / by VN. Useful for power users who track
//   `physical_location` text tags independent of the spatial layout.
// - `layout`: the drag-and-drop editor (`<ShelfLayoutEditor>`).
type ShelfView = 'spatial' | 'release' | 'item' | 'layout';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.nav.shelf };
}

function bucketKey(e: ShelfEntry): string {
  // physical_location is a TEXT[] (the user can tag a single edition
  // with multiple location strings: "Étage 2", "Rangée 3", "Étagère
  // gauche"…). The first non-empty entry is the "primary" location
  // we group by. Everything else renders as a secondary tag on the
  // card. The empty case falls into the explicit "Unsorted" bucket.
  if (e.physical_location.length === 0) return '__unsorted__';
  return e.physical_location[0];
}

function fmtMoneyLocale(amount: number | null, currency: string | null, locale: string): string {
  if (amount == null) return '—';
  if (currency && /^[A-Z]{3}$/i.test(currency)) {
    try {
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency.toUpperCase(),
      }).format(amount);
    } catch {
      // Bad currency code — fall through to manual format.
    }
  }
  const cur = currency || '';
  return `${amount.toFixed(2)} ${cur}`.trim();
}

function boxTypeLabel(value: string, dict: Awaited<ReturnType<typeof getDict>>): string {
  const k = value as keyof typeof dict.boxTypes;
  return (dict.boxTypes as Record<string, string>)[k] ?? value;
}

function conditionLabel(value: string, dict: Awaited<ReturnType<typeof getDict>>): string {
  const k = value as keyof typeof dict.inventory.conditions;
  return (dict.inventory.conditions as Record<string, string>)[k] ?? value;
}

export default async function ShelfPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const t = await getDict();
  const locale = await getLocale();
  const { view: viewRaw } = await searchParams;
  const view: ShelfView =
    viewRaw === 'item' ? 'item' :
    viewRaw === 'layout' ? 'layout' :
    viewRaw === 'release' ? 'release' :
    'spatial';
  // Only load the flat owned-release list when one of the flat
  // views is requested. The spatial view reads shelf_unit/slot/
  // display_slot tables; loading every owned_release on every
  // shelf page render is wasteful and was the most expensive
  // query on /shelf before this split.
  const items = view === 'release' || view === 'item' ? listAllOwnedReleases() : [];

  // Per-item view collapses multiple owned releases for the same VN
  // into one card. The card surfaces "N editions" so the user keeps
  // the count, then clicking the card lands on /vn/[id] where every
  // edition is listed in the OwnedEditionsSection.
  type ItemBucket = {
    vn_id: string;
    vn_title: string;
    vn_image_thumb: string | null;
    vn_image_url: string | null;
    vn_local_image_thumb: string | null;
    vn_image_sexual: number | null;
    editions: ShelfEntry[];
    locations: Set<string>;
    totalByCurrency: Record<string, number>;
    anyDumped: boolean;
  };
  const itemBuckets = new Map<string, ItemBucket>();
  for (const e of items) {
    let b = itemBuckets.get(e.vn_id);
    if (!b) {
      b = {
        vn_id: e.vn_id,
        vn_title: e.vn_title,
        vn_image_thumb: e.vn_image_thumb,
        vn_image_url: e.vn_image_url,
        vn_local_image_thumb: e.vn_local_image_thumb,
        vn_image_sexual: e.vn_image_sexual,
        editions: [],
        locations: new Set(),
        totalByCurrency: {},
        anyDumped: false,
      };
      itemBuckets.set(e.vn_id, b);
    }
    b.editions.push(e);
    for (const loc of e.physical_location) b.locations.add(loc);
    if (e.price_paid != null) {
      const cur = e.currency || '?';
      b.totalByCurrency[cur] = (b.totalByCurrency[cur] ?? 0) + e.price_paid;
    }
    if (e.dumped) b.anyDumped = true;
  }

  // Group releases by primary location for the release view.
  const releaseBuckets = new Map<string, ShelfEntry[]>();
  for (const e of items) {
    const k = bucketKey(e);
    const cur = releaseBuckets.get(k);
    if (cur) cur.push(e);
    else releaseBuckets.set(k, [e]);
  }
  const sortedKeys = Array.from(releaseBuckets.keys()).sort((a, b) => {
    if (a === '__unsorted__') return 1;
    if (b === '__unsorted__') return -1;
    return a.localeCompare(b);
  });

  const totals = items.reduce(
    (acc, e) => {
      if (e.price_paid != null) {
        const cur = e.currency || '?';
        acc[cur] = (acc[cur] ?? 0) + e.price_paid;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Library className="h-6 w-6 text-accent" /> {t.shelf.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.shelf.subtitle}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted">
          <span>
            {items.length} {t.shelf.editionsCount}
          </span>
          <span>
            · {itemBuckets.size} {t.shelf.uniqueVnCount}
          </span>
          {Object.entries(totals).map(([cur, total]) => (
            <span key={cur} className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3 text-accent" /> {fmtMoneyLocale(total, cur === '?' ? null : cur, locale)}
            </span>
          ))}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-card p-4 sm:p-6">
          <p className="text-sm font-semibold">{t.shelf.empty}</p>
          <p className="mt-2 text-[12px] text-muted">{t.shelf.emptyHint}</p>
          <Link href="/" className="mt-3 inline-flex items-center gap-1 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent hover:bg-accent/20">
            <ArrowLeft className="h-3 w-3" aria-hidden /> {t.nav.library}
          </Link>
        </div>
      ) : (
        <>
          {/*
            Tab toggle: per-edition (default) vs per-VN aggregate.
            Per-edition is what the user usually wants when they're
            counting copies / inventory ("J'ai 2 boxes de Saya no
            Uta sur 3 étagères"). Per-VN collapses those into "1 VN
            with 2 editions" so the user can see at a glance how
            many distinct titles they own physically.
          */}
          <div className="mb-4 inline-flex flex-wrap rounded-xl border border-border bg-bg-card p-1 text-sm">
            <TabLink
              href="/shelf"
              active={view === 'spatial'}
              icon={<Eye className="h-3.5 w-3.5" />}
            >
              {t.shelf.viewSpatial}
            </TabLink>
            <TabLink
              href="/shelf?view=release"
              active={view === 'release'}
              icon={<Package className="h-3.5 w-3.5" />}
            >
              {t.shelf.viewRelease}
            </TabLink>
            <TabLink
              href="/shelf?view=item"
              active={view === 'item'}
              icon={<Layers className="h-3.5 w-3.5" />}
            >
              {t.shelf.viewItem}
            </TabLink>
            <TabLink
              href="/shelf?view=layout"
              active={view === 'layout'}
              icon={<LayoutGrid className="h-3.5 w-3.5" />}
            >
              {t.shelf.viewLayout}
            </TabLink>
          </div>

          {view === 'spatial' && <ShelfSpatialView />}

          {view === 'release' &&
            sortedKeys.map((key) => {
              const list = releaseBuckets.get(key)!;
              const subtotals = list.reduce(
                (acc, e) => {
                  if (e.price_paid != null) {
                    const cur = e.currency || '?';
                    acc[cur] = (acc[cur] ?? 0) + e.price_paid;
                  }
                  return acc;
                },
                {} as Record<string, number>,
              );
              return (
                <section
                  key={key}
                  className="mb-6 rounded-xl border border-border bg-bg-card p-4 sm:p-5"
                >
                  <h2 className="mb-3 flex items-baseline justify-between gap-2 text-xs font-bold uppercase tracking-widest text-muted">
                    <span>{key === '__unsorted__' ? t.shelf.unsorted : key}</span>
                    <span className="text-[11px] font-normal text-muted">
                      {list.length}
                      {Object.entries(subtotals).map(([cur, total]) => (
                        <span key={cur} className="ml-1">
                          · {fmtMoneyLocale(total, cur === '?' ? null : cur, locale)}
                        </span>
                      ))}
                    </span>
                  </h2>
                  <ul
                    className="grid gap-3"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}
                  >
                    {list.map((e) => (
                      <li key={`${e.vn_id}-${e.release_id}`}>
                        <Link
                          href={`/vn/${e.vn_id}`}
                          className="group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                        >
                          <div className="h-20 w-14 shrink-0 overflow-hidden rounded">
                            <SafeImage
                              src={e.vn_image_url || e.vn_image_thumb}
                              localSrc={e.vn_local_image_thumb}
                              sexual={e.vn_image_sexual}
                              alt={e.vn_title}
                              className="h-full w-full"
                            />
                          </div>
                          <div className="min-w-0 flex-1 text-[11px]">
                            <p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                              {e.vn_title}
                            </p>
                            {e.edition_label && (
                              <p className="line-clamp-1 text-[11px] text-muted">{e.edition_label}</p>
                            )}
                            {/* Secondary location tags (everything past
                                the primary bucket key) so the user can
                                see "Étage 2 / Rangée 3 / Étagère gauche"
                                even when grouped by "Étage 2". */}
                            {e.physical_location.length > 1 && (
                              <p className="line-clamp-1 text-[10px] text-muted/80">
                                {e.physical_location.slice(1).join(' · ')}
                              </p>
                            )}
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted">
                              {e.box_type !== 'none' && (
                                <span className="inline-flex items-center gap-0.5">
                                  <Box className="h-2.5 w-2.5" aria-hidden /> {boxTypeLabel(e.box_type, t)}
                                </span>
                              )}
                              {e.condition && <span>{conditionLabel(e.condition, t)}</span>}
                              {e.price_paid != null && (
                                <span className="text-accent">
                                  {fmtMoneyLocale(e.price_paid, e.currency, locale)}
                                </span>
                              )}
                              {e.dumped && (
                                <span className="inline-flex items-center gap-0.5 text-status-completed">
                                  <ArrowDown className="h-2.5 w-2.5" /> {t.shelf.dumped}
                                </span>
                              )}
                              {e.release_id.startsWith('synthetic:') && (
                                <span className="inline-flex items-center gap-0.5 rounded bg-accent/15 px-1 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                                  EGS
                                </span>
                              )}
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}

          {view === 'layout' && (
            <>
              <header className="mb-3 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
                <h2 className="inline-flex items-center gap-2 text-base font-bold">
                  <LayoutGrid className="h-5 w-5 text-accent" aria-hidden /> {t.shelfLayout.title}
                </h2>
                <p className="mt-1 text-xs text-muted">{t.shelfLayout.subtitle}</p>
              </header>
              <ShelfLayoutEditor
                initialShelves={listShelves()}
                initialUnplaced={listUnplacedOwnedReleases()}
              />
            </>
          )}

          {view === 'item' && (
            <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
              <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
                {t.shelf.viewItem} · {itemBuckets.size}
              </h2>
              <ul
                className="grid gap-3"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
              >
                {Array.from(itemBuckets.values())
                  .sort((a, b) => a.vn_title.localeCompare(b.vn_title))
                  .map((b) => (
                    <li key={b.vn_id}>
                      <Link
                        href={`/vn/${b.vn_id}`}
                        className="group flex gap-3 rounded-lg border border-border bg-bg-elev/40 p-2 transition-colors hover:border-accent"
                      >
                        <div className="h-24 w-16 shrink-0 overflow-hidden rounded">
                          <SafeImage
                            src={b.vn_image_url || b.vn_image_thumb}
                            localSrc={b.vn_local_image_thumb}
                            sexual={b.vn_image_sexual}
                            alt={b.vn_title}
                            className="h-full w-full"
                          />
                        </div>
                        <div className="min-w-0 flex-1 text-[11px]">
                          <p className="line-clamp-2 text-xs font-bold transition-colors group-hover:text-accent">
                            {b.vn_title}
                          </p>
                          <p className="mt-1 text-[11px] text-muted">
                            {t.shelf.editionsForVn.replace('{n}', String(b.editions.length))}
                          </p>
                          {b.locations.size > 0 && (
                            <p className="mt-1 line-clamp-2 text-[11px] text-muted/80">
                              {Array.from(b.locations).join(' · ')}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted">
                            {Object.entries(b.totalByCurrency).map(([cur, total]) => (
                              <span key={cur} className="text-accent">
                                {fmtMoneyLocale(total, cur === '?' ? null : cur, locale)}
                              </span>
                            ))}
                            {b.anyDumped && (
                              <span className="inline-flex items-center gap-0.5 text-status-completed">
                                <ArrowDown className="h-2.5 w-2.5" /> {t.shelf.dumped}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TabLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors ${
        active ? 'bg-accent text-bg font-bold' : 'text-muted hover:bg-bg-elev'
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
