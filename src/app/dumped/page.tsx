import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, CheckCircle2, HardDriveDownload, LayoutGrid, MinusCircle, PackageOpen, Plus, XCircle } from 'lucide-react';
import { getDumpSummary, listDumpStatus, listVnIdsOnShelf } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { CardDensitySlider } from '@/components/CardDensitySlider';
import { DensityScopeProvider } from '@/components/DensityScopeProvider';
import { dumpedShelfHref, dumpedVnHref, dumpedEditionsAnchor } from '@/lib/dumped-links';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.dumped.pageTitle };
}

/**
 * /dumped redesign. The earlier layout collapsed two distinct
 * states into the same "Not dumped" tab: (a) VNs with owned
 * editions where none are flagged dumped, and (b) VNs in the
 * collection that have NO owned editions at all. The latter is
 * not a dump-progress signal — it's a tracking gap — so we now
 * split the tabs into five buckets and tag (b) with a CTA that
 * routes back to the VN's "My editions" anchor.
 *
 * Tabs (URL: `?tab=`):
 *   - `all` (default) — every VN being TRACKED for dump status
 *     (collection.dumped=1 OR ≥1 owned edition). The "no
 *     editions" rows are explicitly excluded so the default
 *     view stops surfacing 0/0 rows.
 *   - `complete` — fully dumped (collection.dumped=1 OR every
 *     owned edition has dumped=1).
 *   - `partial` — ≥1 dumped edition, not all.
 *   - `missing` — has ≥1 owned edition, zero dumped, and the
 *     VN-level collection.dumped flag is not set.
 *   - `none` — VN in collection with NO owned editions and
 *     collection.dumped=0. Hidden from the `all` tab.
 */
type DumpTab = 'all' | 'complete' | 'partial' | 'missing' | 'none';
const TABS: DumpTab[] = ['all', 'complete', 'partial', 'missing', 'none'];

function parseTab(raw: string | string[] | undefined): DumpTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'complete' || v === 'partial' || v === 'missing' || v === 'none') return v;
  return 'all';
}

type BucketKey = Exclude<DumpTab, 'all'>;

/**
 * Single source of truth for per-row classification. Pulled out
 * of the JSX so both the per-tab counters and the row filter
 * use the same logic — drift between the two would surface as
 * "tab says 3, list shows 4".
 */
function classify(e: ReturnType<typeof listDumpStatus>[number]): BucketKey {
  if (e.collection_dumped) return 'complete';
  if (e.total_editions === 0) return 'none';
  if (e.dumped_editions === e.total_editions) return 'complete';
  if (e.dumped_editions === 0) return 'missing';
  return 'partial';
}

export default async function DumpedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = await getDict();
  const sp = await searchParams;
  const tab = parseTab(sp.tab);

  const summary = getDumpSummary();
  const entries = listDumpStatus();
  // VN ids that have at least one placed edition on any shelf
  // (regular slot or face-out display slot). Drives the per-row
  // "Voir sur l'étagère" deep-link so the user can jump from the
  // dump tracker straight to the layout editor.
  const onShelf = listVnIdsOnShelf();

  // Pre-compute per-tab counts so the chips show "{tab} · {n}" without
  // re-filtering inside the JSX. Counts are independent of the active
  // tab. The `all` count excludes the `none` bucket (per the spec —
  // the default view shouldn't surface 0/0 rows). Every other tab
  // shows the number of rows that match its own classification.
  const counts = entries.reduce(
    (acc, e) => {
      const c = classify(e);
      acc[c] += 1;
      // `all` mirrors "every tracked VN" — the union of every
      // bucket except `none`.
      if (c !== 'none') acc.all += 1;
      return acc;
    },
    { all: 0, complete: 0, partial: 0, missing: 0, none: 0 },
  );

  // Filter entries to the active tab. The `all` tab now hides
  // `none` rows so the default view focuses on real dump
  // progress. `none` rows remain reachable via the explicit
  // tab (where the CTA invites the user to add an edition).
  const filtered = entries.filter((e) => {
    const c = classify(e);
    if (tab === 'all') return c !== 'none';
    return c === tab;
  });

  const tabPct = (key: DumpTab): string => {
    if (counts.all === 0) return '0';
    return ((counts[key] / counts.all) * 100).toFixed(0);
  };

  const tabIcon = {
    all: <HardDriveDownload className="h-3.5 w-3.5" aria-hidden />,
    complete: <CheckCircle2 className="h-3.5 w-3.5 text-status-completed" aria-hidden />,
    partial: <MinusCircle className="h-3.5 w-3.5 text-status-on_hold" aria-hidden />,
    missing: <XCircle className="h-3.5 w-3.5 text-status-dropped" aria-hidden />,
    none: <PackageOpen className="h-3.5 w-3.5 text-muted" aria-hidden />,
  } as const;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <HardDriveDownload className="h-6 w-6 text-accent" aria-hidden /> {t.dumped.pageTitle}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.dumped.pageSubtitle}</p>

        {summary.totalEditions > 0 || summary.fullyDumpedVns > 0 ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label={t.dumped.totalEditions} value={summary.totalEditions} />
              <Stat label={t.dumped.dumpedEditions} value={summary.dumpedEditions} />
              <Stat label={t.dumped.fullyDumpedVns} value={summary.fullyDumpedVns} />
              <Stat label={t.dumped.percent} value={`${summary.editionPct}%`} accent />
            </div>
            <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-bg-elev">
              <div
                className="h-full bg-accent transition-[width]"
                style={{ width: `${summary.editionPct}%` }}
              />
            </div>
          </>
        ) : (
          <p className="mt-4 text-sm text-muted">{t.dumped.empty}</p>
        )}
      </header>

      {entries.length > 0 && (
        <DensityScopeProvider scope="dumped">
          <nav
            className="mb-4 flex flex-wrap gap-2"
            aria-label={t.dumped.tabsLabel}
            role="tablist"
          >
            {TABS.map((key) => {
              const isActive = tab === key;
              return (
                <Link
                  key={key}
                  href={key === 'all' ? '/dumped' : `/dumped?tab=${key}`}
                  role="tab"
                  aria-selected={isActive}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? 'border-accent bg-accent/15 text-accent'
                      : 'border-border bg-bg-elev/40 text-muted hover:border-accent hover:text-white'
                  }`}
                >
                  {tabIcon[key]}
                  {t.dumped.tabs[key]}
                  <span className="ml-1 rounded bg-bg/40 px-1 text-[10px] font-bold tabular-nums">
                    {counts[key]}
                  </span>
                  <span className="text-[10px] opacity-70 tabular-nums">· {tabPct(key)}%</span>
                </Link>
              );
            })}
          </nav>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <CardDensitySlider scope="dumped" />
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-border bg-bg-card p-6 text-center text-sm text-muted">
              {t.dumped.tabEmpty}
            </p>
          ) : (
            <ul
              className="grid gap-3"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
            >
              {filtered.map((e) => {
                const bucket = classify(e);
                const fullyDumped = bucket === 'complete';
                const noEditions = bucket === 'none';
                const pct = e.collection_dumped
                  ? 100
                  : e.total_editions === 0
                  ? 0
                  : Math.round((e.dumped_editions / e.total_editions) * 100);
                const onShelfHere = onShelf.has(e.vn_id);
                // The "0/0" counter was visually noisy and gave no
                // dump signal — `total_editions === 0` rows route
                // through the `noEditions` branch (CTA) or the
                // `fullyDumped` branch (collection-level dumped),
                // never the bare counter line.
                const hasEditionCounter = !noEditions && !fullyDumped && e.total_editions > 0;
                return (
                  <li key={e.vn_id} className="relative">
                    {/*
                      The whole card is a single anchor to the VN
                      page (title appears once — only inside the
                      `<p>`). The shelf deep-link sits ABOVE the
                      card via `absolute` so it doesn't nest a
                      second `<a>` inside the outer Link (HTML
                      validity rule). Pointer events on the chip
                      win over the outer link via z-index.
                    */}
                    <Link
                      href={dumpedVnHref(e.vn_id)}
                      className={`group flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors ${
                        fullyDumped ? 'border-status-completed/50' : 'border-border'
                      } hover:border-accent`}
                    >
                      {/* Density-aware cover — the card column
                          scales via --card-density-px, so the cover
                          must too. Hard `h-24 w-16` previously looked
                          tiny in a wide column. */}
                      <div
                        className="shrink-0 overflow-hidden rounded"
                        style={{
                          width: 'clamp(64px, calc(var(--card-density-px, 220px) * 0.32), 160px)',
                          aspectRatio: '2 / 3',
                        }}
                      >
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
                        {noEditions ? (
                          /*
                           * The "no editions" state is a tracking
                           * gap, not a dump signal — so we replace
                           * the misleading "0/0" with an explicit
                           * label and a CTA that links to the VN's
                           * `#my-editions` anchor. Clicking the
                           * CTA used to require navigating to the
                           * VN page and scrolling manually.
                           */
                          <>
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                              <PackageOpen className="h-3 w-3" aria-hidden />
                              {t.dumped.noEditions}
                            </p>
                            <span
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-accent group-hover:underline"
                              data-dumped-editions-anchor={dumpedEditionsAnchor(e.vn_id)}
                            >
                              <Plus className="h-3 w-3" aria-hidden />
                              {t.dumped.addEditionCta}
                            </span>
                          </>
                        ) : (
                          <>
                            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                              {fullyDumped ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 text-status-completed" aria-hidden />
                                  {t.dumped.allDone}
                                </>
                              ) : hasEditionCounter ? (
                                <>
                                  <ArrowDown className="h-3 w-3" aria-hidden />
                                  {e.dumped_editions} / {e.total_editions}
                                </>
                              ) : null}
                            </p>
                            {e.total_editions > 0 && (
                              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-elev">
                                <div
                                  className={`h-full transition-[width] ${
                                    fullyDumped ? 'bg-status-completed' : 'bg-accent'
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </Link>
                    {onShelfHere && (
                      <Link
                        href={dumpedShelfHref(e.vn_id)}
                        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-md border border-border bg-bg-card/95 px-2 py-1 text-[10px] font-semibold text-muted shadow-sm transition-colors hover:border-accent hover:text-accent"
                        title={t.dumped.viewOnShelf}
                      >
                        <LayoutGrid className="h-3 w-3" aria-hidden />
                        {t.dumped.viewOnShelf}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DensityScopeProvider>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  const formatted = typeof value === 'number' ? value.toLocaleString() : value;
  return (
    <div className="rounded-lg border border-border bg-bg-elev/50 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${accent ? 'text-accent' : ''}`}>
        {formatted}
      </div>
    </div>
  );
}
