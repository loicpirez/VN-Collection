import Link from 'next/link';
import { Activity, CalendarRange, Database, Download, FileJson, FileSpreadsheet, FileUp, HardDrive, KeyRound, Sparkles } from 'lucide-react';
import { getCacheFreshness, getDbStatus } from '@/lib/db';
import { getAuthInfo } from '@/lib/vndb';
import { getDict } from '@/lib/i18n/server';
import { ImportPanel } from '@/components/ImportPanel';
import { DataMaintenance } from '@/components/DataMaintenance';
import { DropImport } from '@/components/DropImport';
import { RunTourButton } from '@/components/RunTourButton';
import { SteamSettingsBlock } from '@/components/SteamSettingsBlock';
import { EgsSyncBlock } from '@/components/EgsSyncBlock';
import { RecentActivityStrip } from '@/components/RecentActivityStrip';
import { RefreshPageButton } from '@/components/RefreshPageButton';
import { SelectiveFullDownload } from '@/components/SelectiveFullDownload';

export const dynamic = 'force-dynamic';

export default async function DataPage() {
  const t = await getDict();
  const status = getDbStatus();
  const lastUpdatedAt = getCacheFreshness(['/stats|%', '/authinfo|%', '/schema|%']);
  let auth: { id: string; username: string; permissions: string[] } | null = null;
  let authError: string | null = null;
  try {
    auth = await getAuthInfo();
  } catch (e) {
    authError = (e as Error).message;
  }
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="flex flex-wrap items-center gap-3">
        <Database className="h-7 w-7 text-accent" aria-hidden />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{t.dataMgmt.title}</h1>
          <p className="text-sm text-muted">{t.dataMgmt.subtitle}</p>
        </div>
        <RefreshPageButton lastUpdatedAt={lastUpdatedAt} />
      </header>

      <RecentActivityStrip />

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Activity className="h-5 w-5 text-accent" /> {t.dataMgmt.statusTitle}
        </h2>
        <p className="mb-4 text-xs text-muted">{t.dataMgmt.statusHint}</p>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <StatCard label={t.dataMgmt.statusDbPath} value={status.db_path} mono />
          <StatCard
            label={t.dataMgmt.statusVndbAuth}
            value={
              auth
                ? `${auth.username}`
                : status.vndb_token === 'none'
                  ? t.dataMgmt.statusVndbNone
                  : t.dataMgmt.statusVndbInvalid
            }
            tone={auth ? 'good' : status.vndb_token === 'none' ? 'muted' : 'warn'}
            sub={
              auth
                ? `${t.dataMgmt.statusVndbSource}: ${status.vndb_token === 'db' ? 'DB' : 'env'}`
                : authError ?? undefined
            }
          />
          <StatCard
            label={
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-accent" /> {t.dataMgmt.statusEgs}
              </span>
            }
            value={`${status.egs_matched} / ${status.egs_matched + status.egs_unmatched}`}
            sub={t.dataMgmt.statusEgsHint}
          />
          <StatCard
            label={t.dataMgmt.statusCache}
            value={`${status.cache_fresh} ${t.dataMgmt.statusCacheFresh} · ${status.cache_stale} ${t.dataMgmt.statusCacheStale}`}
            sub={`${status.cache_total} ${t.dataMgmt.statusCacheTotal}`}
          />
        </div>

        <details className="rounded-lg border border-border bg-bg-elev/30 px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted">
            <KeyRound className="mr-1 inline h-3 w-3" /> {t.dataMgmt.statusRows}
          </summary>
          <table className="mt-2 w-full">
            <tbody>
              {status.rows.map((r) => (
                <tr key={r.table} className="border-t border-border/40">
                  <td className="py-1 font-mono text-muted">{r.table}</td>
                  <td className="py-1 text-right font-bold tabular-nums">{r.count.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 text-base font-bold">{t.dataMgmt.exportSectionTitle}</h2>
        <p className="mb-4 text-xs text-muted">{t.dataMgmt.exportSectionHint}</p>
        <div className="flex flex-wrap gap-2">
          <Link href="/api/collection/export" className="btn" download>
            <FileJson className="h-4 w-4" /> {t.dataMgmt.exportJson}
          </Link>
          <Link href="/api/export/csv" className="btn" download>
            <FileSpreadsheet className="h-4 w-4" /> {t.dataMgmt.exportCsv}
          </Link>
          <Link href="/api/export/ics" className="btn" download>
            <CalendarRange className="h-4 w-4" /> {t.dataMgmt.exportIcs}
          </Link>
          <Link href="/api/backup" className="btn" download>
            <HardDrive className="h-4 w-4" /> {t.dataMgmt.backupDb}
          </Link>
          <Link href="/api/export/raw" className="btn" download>
            <FileJson className="h-4 w-4" /> {t.dataMgmt.exportRawCache}
          </Link>
        </div>
        <p className="mt-2 text-[11px] text-muted">{t.dataMgmt.exportRawCacheHint}</p>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <FileUp className="h-5 w-5 text-accent" /> {t.dataMgmt.importSectionTitle}
        </h2>
        <p className="mb-4 text-xs text-muted">{t.dataMgmt.importHint}</p>
        <ImportPanel />
        <p className="mt-3 text-[11px] text-muted">{t.dropImport.dragHint}</p>
      </section>

      <DataMaintenance />

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">{t.labels.title}</h2>
        <p className="mb-3 text-xs text-muted">{t.labels.hint}</p>
        <Link href="/labels" className="btn">
          🏷️ {t.labels.open}
        </Link>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">{t.steam.title}</h2>
        <p className="mb-3 text-xs text-muted">{t.steam.subtitle}</p>
        <Link href="/steam" className="btn">
          🎮 {t.steam.open}
        </Link>
        <SteamSettingsBlock />
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">{t.egsSync.title}</h2>
        <p className="mb-3 text-xs text-muted">{t.egsSync.subtitle}</p>
        <EgsSyncBlock />
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">{t.selectiveFullDownload.title}</h2>
        <p className="mb-3 text-xs text-muted">{t.selectiveFullDownload.subtitle}</p>
        <SelectiveFullDownload />
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">{t.shelf.title}</h2>
        <p className="mb-3 text-xs text-muted">{t.shelf.subtitle}</p>
        <Link href="/shelf" className="btn">
          📚 {t.shelf.open}
        </Link>
      </section>

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">{t.tour.runAgain}</h2>
        <p className="mb-3 text-xs text-muted">{t.tour.hint}</p>
        <RunTourButton />
      </section>

      <DropImport />

      <section className="rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h2 className="mb-2 flex items-center gap-2 text-base font-bold">
          <Download className="h-5 w-5 text-accent" /> {t.dataMgmt.assetsSectionTitle}
        </h2>
        <p className="mb-3 text-xs text-muted">{t.dataMgmt.assetsSectionHint}</p>
        <p className="text-xs text-muted">
          → <Link href="/" className="text-accent hover:underline">{t.dataMgmt.bulkLinkHint}</Link>
        </p>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
  mono,
}: {
  label: React.ReactNode;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'muted';
  mono?: boolean;
}) {
  const valueColor =
    tone === 'good'
      ? 'text-status-completed'
      : tone === 'warn'
        ? 'text-status-dropped'
        : tone === 'muted'
          ? 'text-muted'
          : 'text-white';
  return (
    <div className="rounded-lg border border-border bg-bg-elev/40 p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className={`mt-0.5 break-all text-sm font-bold ${valueColor} ${mono ? 'font-mono' : ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted/80">{sub}</div>}
    </div>
  );
}
