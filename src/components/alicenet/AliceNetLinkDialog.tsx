'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Link2, Link2Off, Loader2, Search, X } from 'lucide-react';
import { DialogPortal, useDialogA11y } from '../Dialog';
import { useToast } from '../ToastProvider';
import { useT, useLocale } from '@/lib/i18n/client';
import { formatVndbDateString } from '@/lib/locale-number';
import { readApiError } from '@/lib/api-error-read';
import { decodeVndbPickerResults, type VndbPickerHit } from '@/lib/search-client-shape';
import type { AliceNetItem } from '../alicenet-types';

interface LinkDialogProps {
  item: AliceNetItem;
  onClose: () => void;
  onLinked: () => void;
}

function initialQuery(item: AliceNetItem): string {
  return item.search_title ??
    item.title
      .replace(/[【〔\[（(][^\]】〕)）]*中古[^\]】〕)）]*[\]】〕)）]/g, '')
      .replace(/中古品?/g, '')
      .replace(/\s*(通常版|限定版|初回限定版|初回版|特典付き?|豪華版|スペシャル版|コレクターズ版|デラックス版|完全版)\s*/g, '')
      .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .replace(/　/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
}

/**
 * Match/remap modal for a single AliceNet stock row. Debounces a VNDB
 * title search, lists hits, and links the chosen VN (or "no match") via
 * the alicenet link API. Rendered only while a target item is selected, so it
 * is lazy-loaded by `AliceNetClient` and kept out of the initial chunk.
 */
export function AliceNetLinkDialog({ item, onClose, onLinked }: LinkDialogProps) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [query, setQuery] = useState(() => initialQuery(item));
  const [hits, setHits] = useState<VndbPickerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const itemCodeRef = useRef(item.code);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogA11y({ open: true, onClose, panelRef });

  useEffect(() => {
    mountedRef.current = true;
    itemCodeRef.current = item.code;
    searchAbortRef.current?.abort();
    mutationAbortRef.current?.abort();
    mutationInFlightRef.current = false;
    setQuery(initialQuery(item));
    setHits([]);
    setSearching(false);
    setBusy(null);
    return () => {
      mountedRef.current = false;
      searchAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
    };
  }, [item]);

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) { setHits([]); return; }
    const owner = itemCodeRef.current;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (controller.signal.aborted || !mountedRef.current || itemCodeRef.current !== owner || searchAbortRef.current !== controller) return;
      const results = decodeVndbPickerResults(await r.json());
      if (!results) throw new Error(t.common.error);
      if (controller.signal.aborted || !mountedRef.current || itemCodeRef.current !== owner || searchAbortRef.current !== controller) return;
      setHits(results.slice(0, 30));
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        toast.error(error instanceof Error ? error.message : t.common.error);
      }
    } finally {
      if (mountedRef.current && itemCodeRef.current === owner && searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  }, [t.common.error, toast]);

  useEffect(() => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      searchAbortRef.current?.abort();
    };
  }, [query, search]);

  async function link(vnId: string | null) {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const owner = item.code;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    const key = vnId ?? 'none';
    setBusy(key);
    try {
      const r = await fetch(`/api/alicenet/${encodeURIComponent(item.code)}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: vnId }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (controller.signal.aborted || !mountedRef.current || itemCodeRef.current !== owner || mutationAbortRef.current !== controller) return;
      toast.success(t.mapEgs.savedToast);
      onLinked();
      onClose();
    } catch (e) {
      if (controller.signal.aborted || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      if (mountedRef.current && itemCodeRef.current === owner && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(null);
      }
    }
  }

  return (
    <DialogPortal>
      <div className="fixed inset-0 z-[1000] flex items-center justify-center" onClick={onClose}>
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
            <h2 id={titleId} className="text-base font-bold">{t.alicenet.alicenetFindMatch}</h2>
            <p className="mt-1 truncate text-[11px] text-muted" title={item.title}>{item.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="tap-target rounded-md p-1 text-muted hover:bg-bg-elev hover:text-white">
            <X className="h-4 w-4" aria-hidden />
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
            className="input min-h-[44px] w-full pl-7 text-xs"
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
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
              <button type="button" onClick={() => link(h.id)} disabled={busy != null} className="btn btn-primary min-h-[44px] sm:min-h-0">
                {busy === h.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2 className="h-3 w-3" aria-hidden />}
                {t.mapEgs.useThis}
              </button>
            </li>
          ))}
        </ul>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={() => link(null)} disabled={busy != null} className="btn btn-danger btn-xs min-h-[44px] sm:min-h-0">
            {busy === 'none' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2Off className="h-3 w-3" aria-hidden />}
            {t.alicenet.alicenetNoMatch}
          </button>
        </footer>
        </div>
      </div>
    </DialogPortal>
  );
}
