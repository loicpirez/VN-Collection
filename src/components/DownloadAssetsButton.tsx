'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CloudDownload, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

type EgsWarningKind = 'network' | 'server' | 'throttled' | 'blocked';

/**
 * Three possible data states for the VN. The button labels switch
 * based on this so the operator never sees "Tout re-télécharger" on
 * a VN that has never been downloaded.
 *
 *   - `none`     — no local cache row at all (or every key field is
 *                  empty). Primary CTA: "Télécharger les données".
 *   - `partial`  — vn row exists but `fetched_at` is stale (older
 *                  than ~24h) OR critical fields are empty. Primary
 *                  CTA: "Mettre à jour".
 *   - `complete` — vn row is fresh. Primary CTA stays the legacy
 *                  "Tout re-télécharger" for a force-refresh.
 *
 * Callers (`VnDetailActionsBar`) compute the state server-side and
 * pass it down so the button render matches the actual cache
 * state without a separate fetch.
 */
export type VnDataState = 'none' | 'partial' | 'complete';

interface Props {
  vnId: string;
  /** Defaults to 'complete' so existing call sites keep the old label set. */
  dataState?: VnDataState;
}

export function DownloadAssetsButton({ vnId, dataState = 'complete' }: Props) {
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

  // Primary-button label set per data state. The "no data" case
  // collapses the two-button row into a single "Download data" CTA
  // because "missing only" is meaningless when nothing is cached.
  const primaryLabel =
    mode === 'missing'
      ? t.assets.downloading
      : dataState === 'none'
        ? t.assets.downloadData
        : dataState === 'partial'
          ? t.assets.downloadUpdate
          : t.assets.downloadMissing;
  const primaryHint =
    dataState === 'none'
      ? t.assets.downloadDataHint
      : dataState === 'partial'
        ? t.assets.downloadUpdateHint
        : t.assets.missingHint;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        className="btn"
        onClick={() => go(false)}
        disabled={busy || pending}
        title={primaryHint}
      >
        {mode === 'missing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
        {primaryLabel}
      </button>
      {/*
        Force-refresh button is hidden when there's no data yet (the
        single "Download data" primary is enough). It re-appears once
        the VN has cached metadata so the operator can re-fetch.
      */}
      {dataState !== 'none' && (
        <button
          className="btn"
          onClick={() => go(true)}
          disabled={busy || pending}
          title={t.assets.fullHint}
        >
          {mode === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {mode === 'full' ? t.assets.downloading : t.assets.downloadFull}
        </button>
      )}
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
