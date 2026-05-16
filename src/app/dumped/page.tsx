import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, CheckCircle2, HardDriveDownload, MinusCircle, XCircle } from 'lucide-react';
import { getDumpSummary, listDumpStatus } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';
import { CardDensitySlider } from '@/components/CardDensitySlider';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.dumped.pageTitle };
}

type DumpTab = 'all' | 'complete' | 'partial' | 'none';
const TABS: DumpTab[] = ['all', 'complete', 'partial', 'none'];

function parseTab(raw: string | string[] | undefined): DumpTab {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === 'complete' || v === 'partial' || v === 'none') return v;
  return 'all';
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

  // Classify each VN as 'complete' | 'partial' | 'none'. A VN is
  // 'complete' when EITHER its owned editions are all dumped OR
  // `collection.dumped = 1` is set on the VN itself. The latter is
  // the same flag the Library `?dumped=1` filter reads — without
  // it, the dumped page used to say 0 while Library showed several
  // dumped VNs.
  function classify(e: typeof entries[number]): 'complete' | 'partial' | 'none' {
    if (e.collection_dumped) return 'complete';
    if (e.total_editions === 0) return 'none';
    if (e.dumped_editions === e.total_editions) return 'complete';
    if (e.dumped_editions === 0) return 'none';
    return 'partial';
  }

  // Pre-compute per-tab counts so the chips show "{tab} · {n}" without
  // re-filtering inside the JSX. Counts are independent of the active
  // tab — they represent the underlying distribution.
  const counts = entries.reduce(
    (acc, e) => {
      acc.all += 1;
      const c = classify(e);
      acc[c] += 1;
      return acc;
    },
    { all: 0, complete: 0, partial: 0, none: 0 },
  );

  // Filter entries to the active tab. `none` includes both
  // "no editions tracked yet" and "all editions undumped" because the
  // user's mental model is "haven't dumped this VN".
  const filtered = entries.filter((e) => {
    if (tab === 'all') return true;
    return classify(e) === tab;
  });

  const tabPct = (key: DumpTab): string => {
    if (counts.all === 0) return '0';
    return ((counts[key] / counts.all) * 100).toFixed(0);
  };

  const tabIcon = {
    all: <HardDriveDownload className="h-3.5 w-3.5" aria-hidden />,
    complete: <CheckCircle2 className="h-3.5 w-3.5 text-status-completed" aria-hidden />,
    partial: <MinusCircle className="h-3.5 w-3.5 text-status-on_hold" aria-hidden />,
    none: <XCircle className="h-3.5 w-3.5 text-status-dropped" aria-hidden />,
  } as const;

  return (
    <div className="mx-auto max-w-6xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
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
        <>
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
            <CardDensitySlider />
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
                // Reflect the same classification the tabs use:
                // collection.dumped=1 is a complete signal even
                // when the user has zero owned editions.
                const fullyDumped =
                  e.collection_dumped ||
                  (e.total_editions > 0 && e.dumped_editions === e.total_editions);
                const pct = e.collection_dumped
                  ? 100
                  : e.total_editions === 0
                  ? 0
                  : Math.round((e.dumped_editions / e.total_editions) * 100);
                return (
                  <li key={e.vn_id}>
                    <Link
                      href={`/vn/${e.vn_id}`}
                      className={`group flex gap-3 rounded-lg border bg-bg-elev/40 p-2 transition-colors ${
                        fullyDumped ? 'border-status-completed/50' : 'border-border'
                      } hover:border-accent`}
                    >
                      <div className="h-24 w-16 shrink-0 overflow-hidden rounded">
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
                        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted">
                          {fullyDumped ? (
                            <>
                              <CheckCircle2 className="h-3 w-3 text-status-completed" aria-hidden />
                              {t.dumped.allDone}
                            </>
                          ) : (
                            <>
                              <ArrowDown className="h-3 w-3" aria-hidden />
                              {e.dumped_editions} / {e.total_editions}
                            </>
                          )}
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
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
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
