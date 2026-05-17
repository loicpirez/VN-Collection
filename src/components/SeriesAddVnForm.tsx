'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

export function SeriesAddVnForm({ seriesId }: { seriesId: number }) {
  const t = useT();
  const router = useRouter();
  const [vnId, setVnId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function add() {
    setError(null);
    const id = vnId.trim().toLowerCase();
    if (!/^v\d+$/.test(id)) {
      setError(t.series.invalidVnId);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/series/${seriesId}/vn/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.common.error);
      }
      setVnId('');
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-bg-card p-4">
      <label className="label">{t.series.addVn}</label>
      <div className="mt-1 flex gap-2">
        <input
          className="input flex-1"
          placeholder="v11, v90017…"
          value={vnId}
          onChange={(e) => setVnId(e.target.value)}
          aria-label={t.series.addVn}
        />
        <button className="btn btn-primary" onClick={add} disabled={busy || pending || !vnId.trim()}>
          <Plus className="h-4 w-4" aria-hidden /> {t.common.add}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-muted">{t.series.addVnHint}</p>
      {error && <p className="mt-2 text-sm text-status-dropped">{error}</p>}
    </div>
  );
}
