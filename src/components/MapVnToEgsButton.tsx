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
import { useDialogA11y } from './Dialog';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum, formatIsoDateString } from '@/lib/locale-number';
import { useDebouncedCallback } from '@/lib/hooks';

import { readApiError } from '@/lib/api-error-read';
interface EgsCandidate {
  id: number;
  gamename: string;
  median: number | null;
  count: number | null;
  sellday: string | null;
}

interface MappingState {
  egs_id: number | null;
  source: 'manual' | 'manual-none' | 'extlink' | 'search' | null;
}

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
  const [state, setState] = useState<MappingState | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useDialogA11y({ open, onClose: () => setOpen(false), panelRef });

  // Pull current mapping state when the modal opens.
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/vn/${vnId}/erogamescape?search=0`, { cache: 'no-store', signal: ac.signal });
        if (!r.ok) return;
        const d = (await r.json()) as {
          game: { id?: number } | null;
          source: MappingState['source'];
          manual: { egs_id: number | null } | null;
        };
        setState({
          egs_id: d.manual?.egs_id ?? d.game?.id ?? null,
          source: d.source,
        });
      } catch {
        // Aborted on close; ignore.
      }
    })();
    return () => ac.abort();
  }, [open, vnId]);

  // Abort the in-flight EGS search when the user types again or the
  // dialog closes; an older, slower response otherwise overwrites the
  // candidate list with stale results.
  const searchAbortRef = useRef<AbortController | null>(null);
  const search = useCallback(async (q: string) => {
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
      const d = (await r.json()) as { candidates?: EgsCandidate[] };
      if (ac.signal.aborted) return;
      setCandidates(d.candidates ?? []);
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
    } finally {
      if (!ac.signal.aborted) setSearching(false);
    }
  }, []);

  const debouncedSearch = useDebouncedCallback((q: string) => search(q), 300);

  useEffect(() => {
    if (!open) return;
    debouncedSearch(query);
  }, [open, query, debouncedSearch]);

  // Cancel any in-flight search when the dialog unmounts.
  useEffect(() => () => {
    if (searchAbortRef.current) searchAbortRef.current.abort();
  }, []);

  async function pin(action: { egsId: number } | 'none' | 'reset', label: number | 'reset' | 'none') {
    setBusy(label);
    try {
      let r: Response;
      if (action === 'reset') {
        r = await fetch(`/api/vn/${vnId}/erogamescape?mode=clear-manual`, {
          method: 'DELETE',
        });
      } else if (action === 'none') {
        r = await fetch(`/api/vn/${vnId}/erogamescape?mode=manual-none`, {
          method: 'DELETE',
        });
      } else {
        r = await fetch(`/api/vn/${vnId}/erogamescape`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ egs_id: action.egsId }),
        });
      }
      if (!r.ok) {
        throw new Error(await readApiError(r, t.common.error));
      }
      toast.success(t.mapVn.savedToast);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const trigger =
    variant === 'compact' ? (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="icon-chip tap-target-tight inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[10px] font-medium text-muted hover:border-accent hover:text-accent"
        title={t.mapVn.title}
      >
        <Link2 className="h-3 w-3" />
        <span>{t.mapVn.cta}</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName ?? 'inline-flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-bg-elev hover:text-white'}
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
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          onClick={() => setOpen(false)}
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
                <p className="mt-1 truncate text-[11px]" title={`VN · ${vnId} · ${seedQuery}`}>
                  <span className="text-muted">VN · </span>
                  <span className="font-mono">{vnId}</span>
                  <span className="text-muted"> · </span>
                  <span className="font-medium">{seedQuery}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.common.close}
                className="tap-target inline-flex items-center justify-center rounded p-1 text-muted hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            {state != null && (
              <section className="mb-3 rounded-md border border-border bg-bg-elev/40 p-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">{t.mapVn.currentStatus}:</span>
                  {state.source === 'manual-none' ? (
                    <span className="inline-flex items-center gap-1 text-status-dropped">
                      <CircleAlert className="h-3 w-3" />
                      {t.mapVn.pinnedNone}
                    </span>
                  ) : state.egs_id != null ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Link2 className="h-3 w-3" />
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
                        <Link2Off className="h-3 w-3" />
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
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
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
                    <ExternalLink className="h-3 w-3" />
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
                      <Link2 className="h-3 w-3" />
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
                  <Link2Off className="h-3 w-3" />
                )}
                {t.mapVn.pinNoEgs}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}
