'use client';
import { useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';

interface BatchResult {
  vnId: string;
  ok: boolean;
  offerCount?: number;
  error?: string;
}

const VN_ID_RE = /^(v\d+|egs_\d+)$/i;

export function StockBatchClient() {
  const t = useT();
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { valid, invalid } = useMemo(() => {
    const allLines = input.split('\n').map((l) => l.trim()).filter(Boolean);
    const v: string[] = [];
    const inv: string[] = [];
    for (const line of allLines) (VN_ID_RE.test(line) ? v : inv).push(line);
    return { valid: [...new Set(v)], invalid: inv };
  }, [input]);

  async function run() {
    if (valid.length === 0) return;
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const r = await fetch('/api/stock/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vnIds: valid }),
      });
      if (!r.ok) {
        const data = (await r.json()) as { error?: string };
        throw new Error(data.error ?? String(r.status));
      }
      const data = (await r.json()) as { queued: number; results: BatchResult[] };
      setResults(data.results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
      <h2 className="text-base font-bold text-white">{t.stock.batchPageTitle as string}</h2>
      <p className="mt-1 text-sm text-muted">{t.stock.batchPageSubtitle as string}</p>

      <div className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase tracking-widest text-muted" htmlFor="batch-ids">
            VN IDs
          </label>
          <textarea
            id="batch-ids"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.stock.batchPlaceholder as string}
            rows={6}
            className="w-full rounded-lg border border-border bg-bg-elev px-3 py-2 text-sm text-white placeholder-muted focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={run}
            disabled={running || valid.length === 0}
            className="btn btn-primary min-h-[44px]"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            {t.stock.batchRun as string}
            {valid.length > 0 && <span className="text-[10px] opacity-80">({valid.length})</span>}
          </button>
          {invalid.length > 0 && (
            <span className="text-[11px] text-amber-400" role="status">
              {(t.stock.batchInvalidCount as string).replace('{count}', String(invalid.length))}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-3 rounded-lg border border-status-dropped/40 bg-status-dropped/10 p-3 text-sm text-status-dropped">
          {error}
        </div>
      )}

      {results && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">{t.stock.batchResults as string}</h3>
          <ul className="space-y-1">
            {results.map((r) => (
              <li key={r.vnId} className="flex items-center justify-between rounded-lg border border-border bg-bg-elev/40 px-3 py-2 text-xs">
                <span className="font-mono font-semibold text-white">{r.vnId}</span>
                {r.ok ? (
                  <span className="rounded-md border border-status-completed/50 bg-status-completed/15 px-2 py-0.5 text-[10px] font-bold text-status-completed">
                    {(t.stock.batchOk as string).replace('{count}', String(r.offerCount ?? 0))}
                  </span>
                ) : (
                  <span className="rounded-md border border-status-dropped/50 bg-status-dropped/10 px-2 py-0.5 text-[10px] font-bold text-status-dropped">
                    {t.stock.batchError as string}: {r.error}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
