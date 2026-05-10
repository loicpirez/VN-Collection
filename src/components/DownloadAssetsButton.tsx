'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CloudDownload, Loader2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export function DownloadAssetsButton({ vnId }: { vnId: string }) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/assets`, { method: 'POST' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.assets.downloadError);
      }
      setInfo(t.assets.downloaded);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button className="btn" onClick={go} disabled={busy || pending}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
        {busy ? t.assets.downloading : t.assets.download}
      </button>
      {error && <span className="text-xs text-status-dropped">{error}</span>}
      {info && <span className="text-xs text-status-completed">{info}</span>}
    </div>
  );
}
