'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { ErrorAlert } from './ErrorAlert';

import { isVndbVnId } from '@/lib/vn-id-shape';
import { readApiError } from '@/lib/api-error-read';
export function SeriesAddVnForm({ seriesId }: { seriesId: number }) {
  const t = useT();
  const router = useRouter();
  const [vnId, setVnId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const identityRef = useRef<number | null>(seriesId);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    inFlightRef.current = false;
    identityRef.current = seriesId;
    setVnId('');
    setError(null);
    setBusy(false);
    return () => {
      identityRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      inFlightRef.current = false;
    };
  }, [seriesId]);

  async function add() {
    if (inFlightRef.current) return;
    const ownerSeriesId = seriesId;
    setError(null);
    const id = vnId.trim().toLowerCase();
    if (!isVndbVnId(id)) {
      setError(t.series.invalidVnId);
      return;
    }
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    inFlightRef.current = true;
    setBusy(true);
    try {
      const res = await fetch(`/api/series/${ownerSeriesId}/vn/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}', signal: controller.signal });
      if (!res.ok) throw new Error(await readApiError(res, t.common.error));
      if (identityRef.current !== ownerSeriesId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setVnId('');
      startTransition(() => router.refresh());
    } catch (e) {
      if (identityRef.current !== ownerSeriesId || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setError((e as Error).message);
    } finally {
      if (identityRef.current === ownerSeriesId && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        inFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <label className="label">{t.series.addVn}</label>
      <div className="mt-1 flex gap-2">
        <input
          className="input flex-1"
          placeholder={t.series.addVnPlaceholder}
          value={vnId}
          onChange={(e) => setVnId(e.target.value)}
          aria-label={t.series.addVn}
        />
        <button type="button" className="btn btn-primary" onClick={add} disabled={busy || pending || !vnId.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> {t.common.add}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">{t.series.addVnHint}</p>
      {error && (
        <div className="mt-2">
          <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
        </div>
      )}
    </div>
  );
}
