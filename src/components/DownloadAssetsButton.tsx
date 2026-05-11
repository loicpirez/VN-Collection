'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CloudDownload, Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

/**
 * Per-VN data downloader. Two modes:
 *   - "Missing only" (default click): hits the assets endpoint without
 *     `refresh=true`. VNDB + EGS rows are reused from cache and only files
 *     that don't already exist locally are downloaded.
 *   - "Full refresh": adds `refresh=true` — invalidates VNDB + EGS rows,
 *     re-fetches everything, re-mirrors every image whether or not the
 *     local file is present.
 */
export function DownloadAssetsButton({ vnId }: { vnId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<'missing' | 'full' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function go(full: boolean) {
    setMode(full ? 'full' : 'missing');
    setError(null);
    setInfo(null);
    try {
      const url = `/api/collection/${vnId}/assets${full ? '?refresh=true' : ''}`;
      const res = await fetch(url, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.assets.downloadError);
      }
      setInfo(full ? t.assets.downloadedFull : t.assets.downloadedMissing);
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
    </div>
  );
}
