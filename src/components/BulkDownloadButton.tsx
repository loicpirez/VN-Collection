'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CloudDownload, Loader2, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface Failure {
  id: string;
  message: string;
}

interface Props {
  onItemDone?: () => void;
}

export function BulkDownloadButton({ onItemDone }: Props = {}) {
  const t = useT();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentTitle, setCurrentTitle] = useState<string | null>(null);
  const [failures, setFailures] = useState<Failure[]>([]);
  const [finished, setFinished] = useState(false);
  const [aborted, setAborted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setRunning(true);
    setFinished(false);
    setAborted(false);
    setError(null);
    setFailures([]);
    setDone(0);
    setTotal(0);
    setCurrentTitle(null);

    let abort = false;
    const onClickStop = () => { abort = true; };
    (window as unknown as { __vndbBulkStop?: () => void }).__vndbBulkStop = onClickStop;

    try {
      const r = await fetch('/api/collection?sort=title&order=asc', { cache: 'no-store' });
      if (!r.ok) throw new Error(t.common.error);
      const data = (await r.json()) as { items: { id: string; title: string }[] };
      const items = data.items;
      setTotal(items.length);

      const local: Failure[] = [];
      for (let i = 0; i < items.length; i++) {
        if (abort) {
          setAborted(true);
          break;
        }
        const it = items[i];
        setCurrentTitle(it.title);
        try {
          const res = await fetch(`/api/collection/${it.id}/assets?refresh=true`, { method: 'POST' });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            local.push({ id: it.id, message: err.error || `HTTP ${res.status}` });
          }
        } catch (e) {
          local.push({ id: it.id, message: (e as Error).message });
        }
        setDone(i + 1);
        onItemDone?.();
      }
      setFailures(local);
      setFinished(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
      setCurrentTitle(null);
      delete (window as unknown as { __vndbBulkStop?: () => void }).__vndbBulkStop;
    }
  }

  function stop() {
    const fn = (window as unknown as { __vndbBulkStop?: () => void }).__vndbBulkStop;
    fn?.();
  }

  function dismiss() {
    setFinished(false);
    setAborted(false);
    setError(null);
  }

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={start}
        disabled={running}
        title={t.bulk.tooltip}
      >
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudDownload className="h-4 w-4" />}
        {running ? `${done}/${total}` : t.bulk.cta}
      </button>

      {(running || finished || aborted || error) && (
        <div className="fixed bottom-12 left-1/2 z-30 w-[min(92vw,420px)] -translate-x-1/2 rounded-xl border border-border bg-bg-card p-4 shadow-card">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-widest text-muted">
                {running ? t.bulk.runningTitle : aborted ? t.bulk.abortedTitle : finished ? t.bulk.doneTitle : t.common.error}
              </div>
              {currentTitle && running && (
                <div className="mt-1 truncate text-xs text-white/80">{currentTitle}</div>
              )}
              {!running && (
                <div className="mt-1 text-xs text-muted">
                  {done}/{total} · {failures.length > 0 ? `${failures.length} ${t.bulk.failures}` : t.bulk.allOk}
                </div>
              )}
            </div>
            <div className="flex gap-1">
              {running ? (
                <button
                  type="button"
                  onClick={stop}
                  className="rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:border-status-dropped hover:text-status-dropped"
                >
                  {t.bulk.stop}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={dismiss}
                  className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:text-white"
                  aria-label={t.common.close}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elev">
            <div
              className={`h-full transition-[width] duration-200 ${aborted ? 'bg-status-on_hold' : finished ? 'bg-status-completed' : 'bg-accent'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {error && <p className="mt-2 text-xs text-status-dropped">{error}</p>}
          {failures.length > 0 && !running && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-muted hover:text-white">
                {t.bulk.viewFailures} ({failures.length})
              </summary>
              <ul className="mt-1 max-h-32 overflow-y-auto text-[10px] text-status-dropped">
                {failures.map((f) => (
                  <li key={f.id} className="truncate">{f.id}: {f.message}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </>
  );
}
