'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CloudDownload, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { ErrorAlert } from './ErrorAlert';
import { decodeAssetDownloadResult, type AssetDownloadWarning } from '@/lib/asset-download-shape';

/**
 * Three possible data states for the VN. The button labels switch
 * based on this so the operator never sees "Tout re-télécharger" on
 * a VN that has never been downloaded.
 *
 *   - `none`     - no local cache row at all (or every key field is
 *                  empty). Primary CTA: "Télécharger les données".
 *   - `partial`  - vn row exists but `fetched_at` is stale (older
 *                  than ~24h) OR critical fields are empty. Primary
 *                  CTA: "Mettre à jour".
 *   - `complete` - vn row is fresh. Primary CTA stays the legacy
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
  /**
   * `'standalone'` (default) - renders side-by-side `btn` buttons suitable
   * for use outside a dropdown.
   * `'menu'` - renders full-width menu-item rows, suitable inside a dropdown.
   */
  variant?: 'standalone' | 'menu';
}

const MENU_ITEM = 'inline-flex min-h-[44px] w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0';

export function DownloadAssetsButton({ vnId, dataState = 'complete', variant = 'standalone' }: Props) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'missing' | 'full' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [egsWarning, setEgsWarning] = useState<AssetDownloadWarning | null>(null);
  const identityRef = useRef<string | null>(vnId);
  const inFlightRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    identityRef.current = vnId;
    inFlightRef.current = false;
    setMode(null);
    setError(null);
    setInfo(null);
    setEgsWarning(null);
    return () => {
      identityRef.current = null;
      inFlightRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [vnId]);

  async function go(full: boolean) {
    if (inFlightRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setMode(full ? 'full' : 'missing');
    setError(null);
    setInfo(null);
    setEgsWarning(null);
    try {
      const url = `/api/collection/${ownerVnId}/assets${full ? '?refresh=true' : ''}`;
      const res = await fetch(url, { method: 'POST', signal: controller.signal });
      const body = decodeAssetDownloadResult(await res.json().catch(() => null));
      if (!res.ok) {
        throw new Error(body?.error || t.assets.downloadError);
      }
      if (!body?.ok) throw new Error(t.assets.downloadError);
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setInfo(full ? t.assets.downloadedFull : t.assets.downloadedMissing);
      if (body.egs_warning) setEgsWarning({ kind: body.egs_warning.kind, status: body.egs_warning.status });
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setError((e as Error).message);
    } finally {
      if (identityRef.current === ownerVnId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        inFlightRef.current = false;
        setMode(null);
      }
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

  const btnCls = variant === 'menu' ? MENU_ITEM : 'btn';
  const iconCls = variant === 'menu' ? 'h-3.5 w-3.5 shrink-0' : 'h-4 w-4';

  return (
    <div className={variant === 'menu' ? 'flex flex-col gap-0.5' : 'flex flex-wrap items-center gap-2'}>
      <button
        type="button"
        className={btnCls}
        onClick={() => go(false)}
        disabled={busy || pending}
        title={primaryHint}
      >
        {mode === 'missing'
          ? <Loader2 className={`${iconCls} animate-spin`} aria-hidden />
          : <CloudDownload className={iconCls} aria-hidden />
        }
        {primaryLabel}
      </button>
      {dataState !== 'none' && (
        <button
          type="button"
          className={btnCls}
          onClick={() => go(true)}
          disabled={busy || pending}
          title={t.assets.fullHint}
        >
          {mode === 'full'
            ? <Loader2 className={`${iconCls} animate-spin`} aria-hidden />
            : <RefreshCw className={iconCls} aria-hidden />
          }
          {mode === 'full' ? t.assets.downloading : t.assets.downloadFull}
        </button>
      )}
      {error && <ErrorAlert title={t.common.error}>{error}</ErrorAlert>}
      {info && <span role="status" className="text-xs text-status-completed">{info}</span>}
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
