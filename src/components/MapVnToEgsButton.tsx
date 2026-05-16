'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import { useT } from '@/lib/i18n/client';

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
  /** Lay out as a full-width row or as a compact icon button. */
  variant = 'inline',
}: {
  vnId: string;
  seedQuery: string;
  variant?: 'inline' | 'compact';
}) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(seedQuery);
  const [candidates, setCandidates] = useState<EgsCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<number | 'reset' | 'none' | null>(null);
  const [state, setState] = useState<MappingState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogA11y({ open, onClose: () => setOpen(false), panelRef });

  // Pull current mapping state when the modal opens.
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/vn/${vnId}/erogamescape?search=0`, { signal: ac.signal });
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

  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setCandidates([]);
      return;
    }
    setSearching(true);
    try {
      const r = await fetch(`/api/egs/search?q=${encodeURIComponent(trimmed)}&limit=20`);
      if (!r.ok) return;
      const d = (await r.json()) as { candidates?: EgsCandidate[] };
      setCandidates(d.candidates ?? []);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [open, query, search]);

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
        throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
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
        className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1.5 text-[11px] font-medium text-accent hover:bg-accent/20"
        title={t.mapVn.title}
      >
        <Link2 className="h-3.5 w-3.5" />
        <span>{t.mapVn.cta}</span>
      </button>
    );

  return (
    <>
      {trigger}
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/80 backdrop-blur"
          onClick={() => setOpen(false)}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-vn-title"
            onClick={(e) => e.stopPropagation()}
            className="w-[min(92vw,640px)] max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-bg-card p-4 sm:p-5 shadow-card"
          >
            <header className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 id="map-vn-title" className="text-base font-bold">{t.mapVn.title}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t.mapVn.hint}</p>
                <p className="mt-1 truncate text-[11px]">
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
                className="text-muted hover:text-white"
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
                      className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[10px] font-medium text-muted hover:border-accent hover:text-accent"
                    >
                      {busy === 'reset' ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
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
                className="input w-full pl-7 text-xs"
              />
              {searching && (
                <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" />
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
                    <div className="truncate font-bold">{c.gamename}</div>
                    <div className="flex flex-wrap gap-x-2 text-[10px] text-muted">
                      <span className="font-mono">EGS #{c.id}</span>
                      {c.sellday && <span>{c.sellday}</span>}
                      {c.median != null && <span>{(c.median / 100).toFixed(2)}</span>}
                      {c.count != null && <span>{c.count} votes</span>}
                    </div>
                  </div>
                  <a
                    href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${c.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded p-1 text-muted hover:text-accent"
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
                      <Loader2 className="h-3 w-3 animate-spin" />
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
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 text-[10px] font-medium hover:border-status-dropped hover:text-status-dropped"
              >
                {busy === 'none' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
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
