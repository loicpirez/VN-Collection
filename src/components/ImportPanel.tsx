'use client';
import { useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Database as DbIcon, Loader2, Upload } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum } from '@/lib/locale-number';
import { useConfirm } from './ConfirmDialog';
import { CollapsibleSummary } from './CollapsibleSummary';

interface JsonSummary {
  vns_upserted: number;
  collection_upserted: number;
  series_created: number;
  series_links: number;
  errors: string[];
}

interface DbRestoreSummary {
  tables: { name: string; rows_replaced: number }[];
  skipped: { name: string; reason: string }[];
}

type Summary =
  | { kind: 'json'; data: JsonSummary }
  | { kind: 'db'; data: DbRestoreSummary };

const SQLITE_MAGIC = 'SQLite format 3\0';

async function detectKind(file: File): Promise<'json' | 'db'> {
  const head = await file.slice(0, SQLITE_MAGIC.length).text();
  return head === SQLITE_MAGIC ? 'db' : 'json';
}

export function ImportPanel() {
  const t = useT();
  const locale = useLocale();
  const { confirm } = useConfirm();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadCtrlRef = useRef<AbortController | null>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const errorId = useId();

  async function upload(file: File) {
    uploadCtrlRef.current?.abort();
    const ctrl = new AbortController();
    uploadCtrlRef.current = ctrl;
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      const kind = await detectKind(file);
      if (kind === 'db') {
        const ok = await confirm({
          message: t.dataMgmt.restoreConfirm,
          tone: 'danger',
          requireTyping: 'RESTORE',
        });
        if (!ok) return;
      }
      const fd = new FormData();
      fd.append('file', file);
      const url = kind === 'db' ? '/api/backup/restore' : '/api/collection/import';
      const res = await fetch(url, { method: 'POST', body: fd, signal: ctrl.signal });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.dataMgmt.importError);
      }
      const data = await res.json();
      if (kind === 'db') {
        setSummary({ kind: 'db', data: data.summary as DbRestoreSummary });
      } else {
        setSummary({ kind: 'json', data: data.summary as JsonSummary });
      }
      startTransition(() => router.refresh());
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
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
        accept="application/json,application/octet-stream,.json,.db,.sqlite,.sqlite3"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      <div className="flex flex-col items-center gap-2 py-2">
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin text-accent" aria-hidden />
        ) : (
          <Upload className="h-6 w-6 text-muted" />
        )}
        <p className="text-xs text-muted">{busy ? t.dataMgmt.importing : t.dataMgmt.importDropFile}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => inputRef.current?.click()}
          disabled={busy || pending}
          aria-describedby={error ? errorId : undefined}
        >
          {t.dataMgmt.importJson}
        </button>
        <p className="text-[10px] text-muted/70">{t.dataMgmt.importHintTypes}</p>
      </div>
      {summary && summary.kind === 'json' && (
        <div className="mt-3 rounded-lg border border-border bg-bg-card p-3 text-left text-xs">
          <p className="inline-flex items-center gap-1 font-bold text-status-completed">
            <CheckCircle2 className="h-4 w-4" aria-hidden /> {t.dataMgmt.importDone}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-muted">
            <li>{t.dataMgmt.importCounts.vns}: <b className="text-white">{summary.data.vns_upserted}</b></li>
            <li>{t.dataMgmt.importCounts.collection}: <b className="text-white">{summary.data.collection_upserted}</b></li>
            <li>{t.dataMgmt.importCounts.series}: <b className="text-white">{summary.data.series_created}</b></li>
            <li>{t.dataMgmt.importCounts.seriesVn}: <b className="text-white">{summary.data.series_links}</b></li>
          </ul>
          {summary.data.errors.length > 0 && (
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-status-dropped [&::-webkit-details-marker]:hidden">
                <CollapsibleSummary>
                  {summary.data.errors.length} {t.dataMgmt.importCounts.errors}
                </CollapsibleSummary>
              </summary>
              <ul className="mt-1 max-h-32 overflow-y-auto text-[10px]">
                {summary.data.errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
      {summary && summary.kind === 'db' && (
        <div className="mt-3 rounded-lg border border-border bg-bg-card p-3 text-left text-xs">
          <p className="inline-flex items-center gap-1.5 font-bold text-status-completed">
            <DbIcon className="h-3.5 w-3.5" /> {t.dataMgmt.restoreDone}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 text-muted">
            {summary.data.tables.map((row) => (
              <li key={row.name}>
                {row.name}: <b className="text-white">{fmtNum(row.rows_replaced, locale)}</b>
              </li>
            ))}
          </ul>
          {summary.data.skipped.length > 0 && (
            <details className="group mt-2">
              <summary className="cursor-pointer list-none text-muted [&::-webkit-details-marker]:hidden">
                <CollapsibleSummary>
                  {summary.data.skipped.length} {t.dataMgmt.restoreSkipped}
                </CollapsibleSummary>
              </summary>
              <ul className="mt-1 max-h-32 overflow-y-auto text-[10px]">
                {summary.data.skipped.map((s) => (
                  <li key={s.name}>{s.name} — {s.reason}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {error && <p id={errorId} role="alert" className="mt-2 text-xs text-status-dropped">{error}</p>}
    </div>
  );
}
