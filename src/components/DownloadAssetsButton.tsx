'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CloudDownload, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

type EgsWarningKind = 'network' | 'server' | 'throttled' | 'blocked';

/**
 * Per-VN data downloader. Two modes:
 *   - "Missing only" (default click): hits the assets endpoint without
 *     `refresh=true`. VNDB + EGS rows are reused from cache and only files
 *     that don't already exist locally are downloaded.
 *   - "Full refresh": adds `refresh=true` — invalidates VNDB + EGS rows,
 *     re-fetches everything, re-mirrors every image whether or not the
 *     local file is present.
 *
 * A successful VNDB-side download may still surface an EGS warning when EGS
 * itself was unreachable — kept visible so the user knows their data didn't
 * silently desync.
 */
export function DownloadAssetsButton({ vnId }: { vnId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'missing' | 'full' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [egsWarning, setEgsWarning] = useState<{ kind: EgsWarningKind; status: number | null } | null>(null);

  async function go(full: boolean) {
    setMode(full ? 'full' : 'missing');
    setError(null);
    setInfo(null);
    setEgsWarning(null);
    try {
      const url = `/api/collection/${vnId}/assets${full ? '?refresh=true' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        egs_warning?: { kind: EgsWarningKind; status: number | null } | null;
      };
      if (!res.ok) {
        throw new Error(body.error || t.assets.downloadError);
      }
      setInfo(full ? t.assets.downloadedFull : t.assets.downloadedMissing);
      if (body.egs_warning) setEgsWarning({ kind: body.egs_warning.kind, status: body.egs_warning.status });
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMode(null);
    }
  }

  const busy = mode !== null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="btn"
        onClick={() => go(false)}
        disabled={busy || pending}
        title={t.assets.missingHint}
      >
        {mode === 'missing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
        {mode === 'missing' ? t.assets.downloading : t.assets.downloadMissing}
      </button>
      <button
        className="btn"
        onClick={() => go(true)}
        disabled={busy || pending}
        title={t.assets.fullHint}
      >
        {mode === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {mode === 'full' ? t.assets.downloading : t.assets.downloadFull}
      </button>
      {error && <span className="text-xs text-status-dropped">{error}</span>}
      {info && <span className="text-xs text-status-completed">{info}</span>}
      {egsWarning && (
        <span className="inline-flex items-center gap-1 rounded-md border border-status-on_hold/40 bg-status-on_hold/10 px-2 py-1 text-[11px] text-status-on_hold">
          <AlertTriangle className="h-3 w-3" aria-hidden />
          {t.bulk.egsWarning[egsWarning.kind]}
          {egsWarning.status != null && <span className="opacity-70">({egsWarning.status})</span>}
        </span>
      )}
    </div>
  );
}
