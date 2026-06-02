'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CircleAlert,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { useToast } from './ToastProvider';
import { DialogPortal, useDialogA11y } from './Dialog';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum, formatIsoDateString } from '@/lib/locale-number';
import { useDebouncedCallback } from '@/lib/hooks';

import { readApiError } from '@/lib/api-error-read';
import type { EgsCandidate } from '@/lib/erogamescape';
import {
  decodeEgsSearchCandidates,
  decodeVnEgsMappingState,
  type VnEgsMappingState,
} from '@/lib/search-client-shape';

/**
 * Map a VNDB VN to an EGS entry without leaving the page.
 *
 * Used from /egs unlinked rows and any other listing where a VN has no EGS
 * counterpart yet. Symmetric to `<MapEgsToVndbButton>`; this side writes the
 * "VN -> EGS" pin via `POST /api/vn/[id]/erogamescape`, which also lands in
 * the `vn_egs_link` override table so the choice survives auto-rematch.
 */
export function MapVnToEgsButton({
  vnId,
  seedQuery,
  variant = 'inline',
  triggerClassName,
  keepMenuOpen,
}: {
  vnId: string;
  seedQuery: string;
  /** Lay out as a full-width row or as a compact icon button. */
  variant?: 'inline' | 'compact';
  /** Override the trigger button class (inline variant only). */
  triggerClassName?: string;
  /** Add data-menu-keep-open so an ancestor ActionMenu stays mounted. */
  keepMenuOpen?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(seedQuery);
  const [candidates, setCandidates] = useState<EgsCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | 'reset' | 'none' | null>(null);
  const [state, setState] = useState<VnEgsMappingState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const identity = `${vnId}|${seedQuery}`;
  const identityRef = useRef<string | null>(identity);
  const hydrationAbortRef = useRef<AbortController | null>(null);
  const mutationRef = useRef(false);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useDialogA11y({ open, onClose: () => { if (!mutationRef.current) setOpen(false); }, panelRef });

  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    hydrationAbortRef.current?.abort();
    hydrationAbortRef.current = ac;
    const ownerIdentity = identity;
    (async () => {
      try {
        const r = await fetch(`/api/vn/${vnId}/erogamescape?search=0`, { cache: 'no-store', signal: ac.signal });
        if (!r.ok) return;
        const state = decodeVnEgsMappingState(await r.json());
        if (ac.signal.aborted || identityRef.current !== ownerIdentity || hydrationAbortRef.current !== ac) return;
        if (state) setState(state);
      } catch {
        return;
      }
    })();
    return () => ac.abort();
  }, [open, vnId, identity]);

  const searchAbortRef = useRef<AbortController | null>(null);
  const search = useCallback(async (q: string) => {
    if (identityRef.current !== identity) return;
    const trimmed = q.trim();
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    if (!trimmed) {
      setCandidates([]);
      return;
    }
    const ac = new AbortController();
    searchAbortRef.current = ac;
    setSearching(true);
    try {
      const r = await fetch(`/api/egs/search?q=${encodeURIComponent(trimmed)}&limit=20`, {
        cache: 'no-store',
        signal: ac.signal,
      });
      if (!r.ok || ac.signal.aborted) return;
      const candidates = decodeEgsSearchCandidates(await r.json());
      if (ac.signal.aborted || identityRef.current !== identity) return;
      if (candidates) setCandidates(candidates);
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
    hydrationAbortRef.current?.abort();
    hydrationAbortRef.current = null;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setOpen(false);
    setQuery(seedQuery);
    setCandidates([]);
    setSearching(false);
    setBusy(null);
    setState(null);
    return () => {
      identityRef.current = null;
      mutationRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
      hydrationAbortRef.current?.abort();
      searchAbortRef.current?.abort();
    };
  }, [identity, seedQuery]);

  const debouncedSearch = useDebouncedCallback((q: string) => void search(q), 300);

  useEffect(() => {
    if (!open) return;
    debouncedSearch(query);
  }, [open, query, debouncedSearch]);

  useEffect(() => {
    if (open) return;
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    setSearching(false);
  }, [open]);

  useEffect(() => () => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
  }, []);

  async function pin(action: { egsId: number } | 'none' | 'reset', label: number | 'reset' | 'none') {
    if (mutationRef.current) return;
    mutationRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    const ownerIdentity = identity;
    setBusy(label);
    try {
      let r: Response;
      if (action === 'reset') {
        r = await fetch(`/api/vn/${vnId}/erogamescape?mode=clear-manual`, {
          method: 'DELETE',
          signal: controller.signal,
        });
      } else if (action === 'none') {
        r = await fetch(`/api/vn/${vnId}/erogamescape?mode=manual-none`, {
          method: 'DELETE',
          signal: controller.signal,
        });
      } else {
        r = await fetch(`/api/vn/${vnId}/erogamescape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ egs_id: action.egsId }),
          signal: controller.signal,
        });
      }
      if (!r.ok) {
        throw new Error(await readApiError(r, t.common.error));
      }
      if (identityRef.current !== ownerIdentity || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      toast.success(t.mapVn.savedToast);
      setOpen(false);
      router.refresh();
    } catch (e) {
      if (identityRef.current === ownerIdentity && mutationAbortRef.current === controller && !controller.signal.aborted) toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerIdentity && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationRef.current = false;
        setBusy(null);
      }
    }
  }

  const trigger =
    variant === 'compact' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="icon-chip inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[10px] font-medium text-muted hover:border-accent hover:text-accent sm:min-h-0"
        title={t.mapVn.title}
      >
        <Link2 className="h-3 w-3" aria-hidden />
        <span>{t.mapVn.cta}</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'inline-flex min-h-[44px] w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white sm:min-h-0'}
        title={t.mapVn.title}
        {...(keepMenuOpen ? { 'data-menu-keep-open': '' } : {})}
      >
        <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t.mapVn.cta}</span>
      </button>
    );

  return (
    <>
      {trigger}
      {open && (
        <DialogPortal>
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center"
            onClick={() => { if (busy == null) setOpen(false); }}
          >
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
                <h2 id={titleId} className="text-base font-bold">{t.mapVn.title}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t.mapVn.hint}</p>
                <p className="mt-1 truncate text-[11px]" title={`VN / ${vnId} / ${seedQuery}`}>
                  <span className="text-muted">VN / </span>
                  <span className="font-mono">{vnId}</span>
                  <span className="text-muted"> / </span>
                  <span className="font-medium">{seedQuery}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy != null}
                aria-label={t.common.close}
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-1 text-muted hover:text-white sm:min-h-0 sm:min-w-0"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </header>

            {state != null && (
              <section className="mb-3 rounded-md border border-border bg-bg-elev/40 p-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">{t.mapVn.currentStatus}:</span>
                  {state.source === 'manual-none' ? (
                    <span className="inline-flex items-center gap-1 text-status-dropped">
                      <CircleAlert className="h-3 w-3" aria-hidden />
                      {t.mapVn.pinnedNone}
                    </span>
                  ) : state.egs_id != null ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Link2 className="h-3 w-3" aria-hidden />
                      <a
                        href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${state.egs_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono hover:underline"
                      >
                        EGS #{state.egs_id}
                      </a>
                      <span className="text-muted">
                        ({state.source === 'manual' ? t.mapVn.sourceManual : t.mapVn.sourceAuto})
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted">{t.mapVn.empty}</span>
                  )}
                  {(state.source === 'manual' || state.source === 'manual-none') && (
                    <button
                      type="button"
                      onClick={() => pin('reset', 'reset')}
                      disabled={busy != null}
                      className="btn btn-xs ml-auto"
                    >
                      {busy === 'reset' ? (
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                      ) : (
                        <Link2Off className="h-3 w-3" aria-hidden />
                      )}
                      {t.mapVn.reset}
                    </button>
                  )}
                </div>
              </section>
            )}

            <div className="relative mb-3">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="text"
                inputMode="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={busy != null}
                placeholder={t.mapVn.searchPlaceholder}
                aria-label={t.mapVn.searchPlaceholder}
                className="input w-full pl-7 text-sm"
              />
              {searching && (
                <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" aria-hidden />
              )}
            </div>

            <ul className="mb-3 space-y-1">
              {candidates.length === 0 && !searching && (
                <li className="rounded-md border border-border bg-bg-elev/40 p-3 text-xs text-muted">
                  {t.mapVn.empty}
                </li>
              )}
              {candidates.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-bg-elev/30 px-3 py-2 text-xs hover:border-accent"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-bold" title={c.gamename}>{c.gamename}</div>
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-muted">
                      <span className="font-mono">EGS #{c.id}</span>
                      {c.sellday && <span>{formatIsoDateString(c.sellday, locale)}</span>}
                      {c.median != null && <span>{c.median}/100</span>}
                      {c.count != null && <span>{fmtNum(c.count, locale)} {t.egs.votes}</span>}
                    </div>
                  </div>
                  <a
                    href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2 text-muted hover:text-accent"
                    title={t.mapVn.openEgs}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                  <button
                    type="button"
                    onClick={() => pin({ egsId: c.id }, c.id)}
                    disabled={busy != null}
                    className="btn btn-primary"
                  >
                    {busy === c.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Link2 className="h-3 w-3" aria-hidden />
                    )}
                    {t.mapVn.useThis}
                  </button>
                </li>
              ))}
            </ul>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted">
              <span>{t.mapVn.footerHint}</span>
              <button
                type="button"
                onClick={() => pin('none', 'none')}
                disabled={busy != null}
                className="btn btn-danger btn-xs"
              >
                {busy === 'none' ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Link2Off className="h-3 w-3" aria-hidden />
                )}
                {t.mapVn.pinNoEgs}
              </button>
            </footer>
            </div>
          </div>
        </DialogPortal>
      )}
    </>
  );
}
