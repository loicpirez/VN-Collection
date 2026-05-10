'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Summary {
  vns_upserted: number;
  collection_upserted: number;
  series_created: number;
  series_links: number;
  errors: string[];
}

export function ImportPanel() {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/collection/import', { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.dataMgmt.importError);
      }
      const data = (await res.json()) as { ok: boolean; summary: Summary };
      setSummary(data.summary);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`mt-3 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
        drag ? 'border-accent bg-bg-elev/50' : 'border-border bg-bg-elev/20'
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) upload(f);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      <div className="flex flex-col items-center gap-2 py-2">
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
        ) : (
          <Upload className="h-6 w-6 text-muted" />
        )}
        <p className="text-xs text-muted">{busy ? t.dataMgmt.importing : t.dataMgmt.importDropFile}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={busy || pending}
        >
          {t.dataMgmt.importJson}
        </button>
      </div>
      {summary && (
        <div className="mt-3 rounded-lg border border-border bg-bg-card p-3 text-left text-xs">
          <p className="font-bold text-status-completed">✓ {t.dataMgmt.importDone}</p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-muted">
            <li>VN: <b className="text-white">{summary.vns_upserted}</b></li>
            <li>Collection: <b className="text-white">{summary.collection_upserted}</b></li>
            <li>Series: <b className="text-white">{summary.series_created}</b></li>
            <li>Series-VN: <b className="text-white">{summary.series_links}</b></li>
          </ul>
          {summary.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-status-dropped">{summary.errors.length} errors</summary>
              <ul className="mt-1 max-h-32 overflow-y-auto text-[10px]">
                {summary.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-status-dropped">{error}</p>}
    </div>
  );
}
