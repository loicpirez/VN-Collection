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
import { Dialog } from './Dialog';
import { useLocale, useT } from '@/lib/i18n/client';
import { useDebouncedCallback } from '@/lib/hooks';
import { formatVndbDateString } from '@/lib/locale-number';

import { readApiError } from '@/lib/api-error-read';
interface SearchHit {
  id: string;
  title: string;
  released: string | null;
  developers?: { id: string; name: string }[];
}

interface ManualLink {
  egs_id: number;
  vn_id: string | null;
  note: string | null;
  updated_at: number;
}

/**
 * Map an EGS row (anticipated / top-ranked / unlinked) to a VNDB id without
 * creating a synthetic VN first.
 *
 * - Writes to the `egs_vn_link` override table (kept reversible).
 * - Anticipated / top-ranked feed reads overlay the override at read time.
 * - "No VNDB" pins an explicit negative so we stop offering the action
 *   for entries the user has confirmed have no counterpart.
 * - Reset clears the override, returning to whatever EGS records natively.
 *
 * The companion synthetic-VN promotion flow is still available via
 * `<LinkToVndbButton>` on /vn/egs_NNN pages — that one re-keys local rows.
 * This component is the lighter, listing-page-friendly variant.
 */
export function MapEgsToVndbButton({
  egsId,
  gamename,
  /** Current best-known VNDB id (from EGS field or from a prior override). */
  vndbId,
  /** Lay out as a full-width row or as a compact icon button. */
  variant = 'inline',
}: {
  egsId: number;
  gamename: string;
  vndbId: string | null;
  variant?: 'inline' | 'compact';
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(gamename);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | 'reset' | 'none' | null>(null);
  const [link, setLink] = useState<ManualLink | null>(null);

  // Pull current mapping state when the modal opens.
  useEffect(() => {
    if (!open) return;
    const ac = new AbortController();
    (async () => {
      try {
        const r = await fetch(`/api/egs/${egsId}/vndb`, { signal: ac.signal });
        if (!r.ok) return;
        const d = (await r.json()) as { link: ManualLink | null };
        setLink(d.link);
      } catch {
        // Aborted on close; ignore.
      }
    })();
    return () => ac.abort();
  }, [open, egsId]);

  // Abort the in-flight search whenever the user types again or the
  // dialog closes; otherwise an older, slower response can stamp the
  // hit list with stale results.
  const searchAbortRef = useRef<AbortController | null>(null);
  const search = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (searchAbortRef.current) {
      searchAbortRef.current.abort();
      searchAbortRef.current = null;
    }
    if (!trimmed) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    searchAbortRef.current = ac;
    setSearching(true);
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
        cache: 'no-store',
        signal: ac.signal,
      });
      if (!r.ok || ac.signal.aborted) return;
      const d = (await r.json()) as { results?: SearchHit[] };
      if (ac.signal.aborted) return;
      setHits((d.results ?? []).slice(0, 30));
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

  async function pin(vndbIdToSet: string | null, label: string | 'reset' | 'none') {
    setBusy(label);
    try {
      let r: Response;
      if (label === 'reset') {
        r = await fetch(`/api/egs/${egsId}/vndb`, { method: 'DELETE' });
      } else {
        r = await fetch(`/api/egs/${egsId}/vndb`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vndb_id: vndbIdToSet }),
        });
      }
      if (!r.ok) {
        throw new Error(await readApiError(r, t.common.error));
      }
      toast.success(t.mapEgs.savedToast);
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
        title={t.mapEgs.title}
      >
        <Link2 className="h-3 w-3" />
        <span>{vndbId ? t.mapEgs.editCta : t.mapEgs.cta}</span>
      </button>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-primary btn-xs"
        title={t.mapEgs.title}
      >
        <Link2 className="h-3.5 w-3.5" />
        <span>{vndbId ? t.mapEgs.editCta : t.mapEgs.cta}</span>
      </button>
    );

  return (
    <>
      {trigger}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t.mapEgs.title}
        hideTitleVisually
        panelClassName="w-[min(92vw,640px)] max-h-[85vh] overflow-y-auto p-4 sm:p-5"
      >
        <div>
            <header className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold">{t.mapEgs.title}</h2>
                <p className="mt-0.5 text-[11px] text-muted">{t.mapEgs.hint}</p>
                <p className="mt-1 truncate text-[11px]" title={`EGS · #${egsId} · ${gamename}`}>
                  <span className="text-muted">EGS · </span>
                  <span className="font-mono">#{egsId}</span>
                  <span className="text-muted"> · </span>
                  <span className="font-medium">{gamename}</span>
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

            {link != null && (
              <section className="mb-3 rounded-md border border-border bg-bg-elev/40 p-2.5 text-[11px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted">{t.mapEgs.currentStatus}:</span>
                  {link.vn_id ? (
                    <span className="inline-flex items-center gap-1 text-accent">
                      <Link2 className="h-3 w-3" />
                      <a
                        href={`/vn/${link.vn_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono hover:underline"
                      >
                        {link.vn_id}
                      </a>
                      <span className="text-muted">({t.mapEgs.sourceManual})</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-status-dropped">
                      <CircleAlert className="h-3 w-3" />
                      {t.mapEgs.pinnedNone}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => pin(null, 'reset')}
                    disabled={busy != null}
                    className="btn btn-xs ml-auto"
                  >
                    {busy === 'reset' ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Link2Off className="h-3 w-3" />
                    )}
                    {t.mapEgs.reset}
                  </button>
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
                placeholder={t.mapEgs.searchPlaceholder}
                aria-label={t.mapEgs.searchPlaceholder}
                className="input w-full pl-7 text-xs"
              />
              {searching && (
                <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" aria-hidden />
              )}
            </div>

            <ul className="mb-3 space-y-1">
              {hits.length === 0 && !searching && (
                <li className="rounded-md border border-border bg-bg-elev/40 p-3 text-xs text-muted">
                  {t.mapEgs.empty}
                </li>
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
                    title={t.mapEgs.openVndb}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <button
                    type="button"
                    onClick={() => pin(h.id, h.id)}
                    disabled={busy != null}
                    className="btn btn-primary"
                  >
                    {busy === h.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                    ) : (
                      <Link2 className="h-3 w-3" />
                    )}
                    {t.mapEgs.useThis}
                  </button>
                </li>
              ))}
            </ul>

            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-[11px] text-muted">
              <span>{t.mapEgs.footerHint}</span>
              <button
                type="button"
                onClick={() => pin(null, 'none')}
                disabled={busy != null}
                className="btn btn-danger btn-xs"
              >
                {busy === 'none' ? (
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                ) : (
                  <Link2Off className="h-3 w-3" />
                )}
                {t.mapEgs.pinNoVndb}
              </button>
            </footer>
        </div>
      </Dialog>
    </>
  );
}
