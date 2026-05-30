'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Link2, Link2Off, Loader2, Search, X } from 'lucide-react';
import { useDialogA11y } from '../Dialog';
import { useToast } from '../ToastProvider';
import { useT, useLocale } from '@/lib/i18n/client';
import { formatVndbDateString } from '@/lib/locale-number';
import { readApiError } from '@/lib/api-error-read';
import type { KobeItem, KobeSearchHit as SearchHit } from '../kobe-types';

interface LinkDialogProps {
  item: KobeItem;
  onClose: () => void;
  onLinked: () => void;
}

/**
 * Match/remap modal for a single Alice Kobe stock row. Debounces a VNDB
 * title search, lists hits, and links the chosen VN (or "no match") via
 * the kobe link API. Rendered only while a target item is selected, so it
 * is lazy-loaded by `AliceNetKobeClient` and kept out of the initial chunk.
 */
export function KobeLinkDialog({ item, onClose, onLinked }: LinkDialogProps) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [query, setQuery] = useState(() =>
    item.search_title ??
    item.title
      .replace(/[【〔\[（(][^\]】〕)）]*中古[^\]】〕)）]*[\]】〕)）]/g, '')
      .replace(/中古品?/g, '')
      .replace(/\s*(通常版|限定版|初回限定版|初回版|特典付き?|豪華版|スペシャル版|コレクターズ版|デラックス版|完全版)\s*/g, '')
      .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim(),
  );
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogA11y({ open: true, onClose, panelRef });

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setHits([]); return; }
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store' });
      if (!r.ok) return;
      const d = (await r.json()) as { results?: SearchHit[] };
      setHits((d.results ?? []).slice(0, 30));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  async function link(vnId: string | null) {
    const key = vnId ?? 'none';
    setBusy(key);
    try {
      const r = await fetch(`/api/alicesoft-kobe/${encodeURIComponent(item.code)}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: vnId }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      toast.success(t.mapEgs.savedToast);
      onLinked();
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-bg/80 backdrop-blur" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="relative w-[min(92vw,640px)] max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-bg-card p-4 sm:p-5 shadow-card"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold">{t.kobe.kobeFindMatch}</h2>
            <p className="mt-1 truncate text-[11px] text-muted" title={item.title}>{item.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="tap-target rounded-md p-1 text-muted hover:bg-bg-elev hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="text"
            inputMode="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.mapEgs.searchPlaceholder}
            aria-label={t.mapEgs.searchPlaceholder}
            className="input w-full pl-7 text-xs"
          />
          {searching && <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
        </div>

        <ul className="mb-3 space-y-1">
          {hits.length === 0 && !searching && (
            <li className="rounded-md border border-border bg-bg-elev/40 p-3 text-xs text-muted">{t.mapEgs.empty}</li>
          )}
          {hits.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-elev/30 px-3 py-2 text-xs hover:border-accent">
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold" title={h.title}>{h.title}</div>
                <div className="flex flex-wrap gap-x-2 text-[10px] text-muted">
                  <span className="font-mono">{h.id}</span>
                  {h.released && <span>{formatVndbDateString(h.released, locale)}</span>}
                  {h.developers?.slice(0, 2).map((d) => <span key={d.id}>{d.name}</span>)}
                </div>
              </div>
              <a
                href={`https://vndb.org/${h.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-muted hover:text-accent"
                title={t.mapEgs.openVndb}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
              <button type="button" onClick={() => link(h.id)} disabled={busy != null} className="btn btn-primary">
                {busy === h.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2 className="h-3 w-3" />}
                {t.mapEgs.useThis}
              </button>
            </li>
          ))}
        </ul>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={() => link(null)} disabled={busy != null} className="btn btn-danger btn-xs">
            {busy === 'none' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2Off className="h-3 w-3" />}
            {t.kobe.kobeNoMatch}
          </button>
        </footer>
      </div>
    </div>
  );
}
