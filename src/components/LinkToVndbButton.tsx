'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, Link2, Loader2, Search, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { useDialogA11y } from './Dialog';
import { useLocale, useT } from '@/lib/i18n/client';
import { useDebouncedCallback } from '@/lib/hooks';
import { formatVndbDateString } from '@/lib/locale-number';

import { readApiError } from '@/lib/api-error-read';
import { decodeVndbPickerResults, type VndbPickerHit } from '@/lib/search-client-shape';

/**
 * Shown on /vn/egs_NNN pages. Lets the user search VNDB by title and
 * link the synthetic EGS-only entry to a real VNDB id. On confirm the
 * server migrates every reference (collection / editions / quotes /
 * routes / EGS link / credits / activity) to the new id and drops the
 * synthetic vn row.
 *
 * Symmetric to the existing EGS picker on VNDB-only VNs - the other
 * half of "link both directions".
 */
export function LinkToVndbButton({ vnId, seedQuery, triggerClassName, keepMenuOpen }: { vnId: string; seedQuery: string; triggerClassName?: string; keepMenuOpen?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(seedQuery);
  const [hits, setHits] = useState<VndbPickerHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const identity = `${vnId}|${seedQuery}`;
  const identityRef = useRef<string | null>(identity);
  const mutationRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);
  useDialogA11y({ open, onClose: () => { if (!mutationRef.current) setOpen(false); }, panelRef });

  // Abort the in-flight VNDB search whenever the user types again or
  // the dialog closes; otherwise a stale slower response overwrites the
  // hit list after a newer query has already rendered.
  const searchAbortRef = useRef<AbortController | null>(null);
  const search = useCallback(async (q: string) => {
    if (identityRef.current !== identity) return;
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    if (!q.trim()) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    searchAbortRef.current = ac;
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`, {
        cache: 'no-store',
        signal: ac.signal,
      });
      if (!r.ok || ac.signal.aborted) return;
      const results = decodeVndbPickerResults(await r.json());
      if (ac.signal.aborted || identityRef.current !== identity) return;
      if (results) setHits(results.slice(0, 30));
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
    } finally {
      if (searchAbortRef.current === ac && identityRef.current === identity) {
        searchAbortRef.current = null;
        setSearching(false);
      }
    }
  }, [identity]);

  useEffect(() => {
    identityRef.current = identity;
    mutationRef.current = false;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setOpen(false);
    setQuery(seedQuery);
    setHits([]);
    setSearching(false);
    setLinkingId(null);
    return () => {
      identityRef.current = null;
      mutationRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      searchAbortRef.current?.abort();
    };
  }, [identity, seedQuery]);

  const debouncedSearch = useDebouncedCallback((q: string) => search(q), 300);

  useEffect(() => {
    if (!open) return;
    debouncedSearch(query);
  }, [open, query, debouncedSearch]);

  useEffect(() => {
    if (open && hits.length === 0) {
      search(query);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) return;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearching(false);
  }, [open]);

  // Cancel any in-flight search when the dialog unmounts.
  useEffect(() => () => {
    if (searchAbortRef.current) searchAbortRef.current.abort();
  }, []);

  async function link(targetId: string) {
    if (mutationRef.current) return;
    mutationRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    const ownerIdentity = identity;
    try {
      const ok = await confirm({
        message: t.linkVndb.confirm.replace('{id}', targetId),
        tone: 'danger',
      });
      if (!ok || identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setLinkingId(targetId);
      const r = await fetch(`/api/vn/${vnId}/link-vndb`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vndb_id: targetId }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.linkVndb.done);
      // The synthetic vn row is gone - navigate to the real one.
      router.replace(`/vn/${targetId}`);
    } catch (e) {
      if (identityRef.current === ownerIdentity && mutationAbortRef.current === controller && !controller.signal.aborted) toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerIdentity && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationRef.current = false;
        setLinkingId(null);
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'btn'}
        title={t.linkVndb.title}
        {...(keepMenuOpen ? { 'data-menu-keep-open': '' } : {})}
      >
        <Link2 className="h-4 w-4" aria-hidden /> {t.linkVndb.cta}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => { if (!mutationRef.current) setOpen(false); }}>
          <div className="absolute inset-0 bg-bg/80 backdrop-blur" aria-hidden />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[80vh] w-[min(92vw,640px)] overflow-y-auto rounded-2xl border border-border bg-bg-card p-4 shadow-card outline-none sm:p-5"
          >
            <header className="mb-3 flex items-baseline justify-between gap-3">
              <div>
                <h2 id={titleId} className="text-base font-bold">{t.linkVndb.title}</h2>
                <p className="text-[11px] text-muted">{t.linkVndb.hint}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={linkingId !== null}
                aria-label={t.common.close}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-white"
              >
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
                disabled={linkingId !== null}
                placeholder={t.linkVndb.searchPlaceholder}
                aria-label={t.linkVndb.searchPlaceholder}
                className="input w-full pl-7 text-xs"
              />
              {searching && <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
            </div>
            <ul className="space-y-1">
              {hits.length === 0 && !searching && (
                <li className="p-3 text-xs text-muted">{t.linkVndb.empty}</li>
              )}
              {hits.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-bg-elev/30 px-3 py-2 text-xs hover:border-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold" title={h.title}>{h.title}</div>
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-muted">
                      <span className="font-mono">{h.id}</span>
                      {h.released && <span>{formatVndbDateString(h.released, locale)}</span>}
                      {h.developers?.slice(0, 2).map((d) => (
                        <span key={d.id}>{d.name}</span>
                      ))}
                    </div>
                  </div>
                  <a
                    href={`https://vndb.org/${h.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-muted hover:text-accent"
                    title={t.linkVndb.openVndb}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                  <button
                    type="button"
                    onClick={() => link(h.id)}
                    disabled={linkingId !== null}
                    className="btn btn-primary"
                  >
                    {linkingId === h.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2 className="h-3 w-3" aria-hidden />}
                    {t.linkVndb.useThis}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
