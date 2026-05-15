import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, ArrowDown, CheckCircle2, HardDriveDownload } from 'lucide-react';
import { getDumpSummary, listDumpStatus } from '@/lib/db';
import { getDict } from '@/lib/i18n/server';
import { SafeImage } from '@/components/SafeImage';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.dumped.pageTitle };
}

export default async function DumpedPage() {
  const t = await getDict();
  const summary = getDumpSummary();
  const entries = listDumpStatus();

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

        {summary.totalEditions > 0 ? (
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
        <ul
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {entries.map((e) => {
            const fullyDumped =
              e.total_editions > 0 && e.dumped_editions === e.total_editions;
            const pct =
              e.total_editions === 0
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
