'use client';
import { useCallback, useEffect, useId, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, ExternalLink, Link2, Loader2, RefreshCw, Search, Sparkles, Star, Trash2, Users, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';
import { useDialogA11y } from './Dialog';
import { SkeletonBlock } from './Skeleton';
import { ErrorAlert } from './ErrorAlert';
import { useLocale, useT } from '@/lib/i18n/client';
import { fmtNum, formatIsoDateString } from '@/lib/locale-number';
import { formatMinutesOrNull as fmtMinutes } from '@/lib/format';
import { brandHref, yearHref } from '@/lib/egs-links';
import { safeHref } from '@/lib/safe-href';

import { readApiError } from '@/lib/api-error-read';
import type { EgsCandidate } from '@/lib/erogamescape';
import {
  decodeEgsSearchCandidates,
  decodeVnEgsGameSnapshot,
  type VnEgsMappingSource as Source,
} from '@/lib/search-client-shape';

interface EgsPanelGame {
  id: number;
  gamename: string;
  brand_name?: string | null;
  brand_id?: number | null;
  model?: string | null;
  median: number | null;
  average: number | null;
  dispersion: number | null;
  count: number | null;
  sellday: string | null;
  playtime_median_minutes: number | null;
  url: string;
}

/**
 * Broadcast after the EGS link for a VN changes (refresh / relink /
 * unlink). The client-island VNDB status panel listens for this to
 * refetch, since it otherwise only fetches on mount and would
 * otherwise show stale data when the underlying EGS match moves.
 */
export const EGS_CHANGED_EVENT = 'vn:egs-changed';

export interface EgsChangedDetail {
  vnId: string;
}

/**
 * Single source of truth for the EGS lookup result. Folding the
 * loading / game / source trio into one object updated atomically
 * keeps the panel out of impossible intermediate states (e.g.
 * `loading: false` with a stale `game` mid-swap) and collapses what
 * used to be three separate setState calls into one render.
 */
interface FetchState {
  loading: boolean;
  game: EgsPanelGame | null;
  source: Source;
}

interface Props {
  vnId: string;
  /** VNDB rating on the 0-100 scale. */
  vndbRating: number | null;
  vndbVoteCount: number | null;
  vndbLengthMinutes: number | null;
  /** User-recorded playtime in minutes. */
  myPlaytimeMinutes: number;
  /** Title to seed the manual search dialog with. */
  searchSeed?: string | null;
  /**
   * Server-rendered initial EGS payload, so the first paint already shows the
   * data without a client fetch. Avoids "no match" flashing while the API
   * round-trips, and works even if /api/vn/[id]/erogamescape is briefly slow.
   */
  initialGame?: EgsPanelGame | null;
  initialSource?: Source;
}

function combinedScore(vndb: number | null, egs: number | null): number | null {
  if (vndb == null && egs == null) return null;
  if (vndb == null) return egs;
  if (egs == null) return vndb;
  return Math.round((vndb + egs) / 2);
}

export function EgsPanel({
  vnId,
  vndbRating,
  vndbVoteCount,
  vndbLengthMinutes,
  myPlaytimeMinutes,
  searchSeed,
  initialGame = null,
  initialSource = null,
}: Props) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { confirm } = useConfirm();
  // Hydrate from the server payload so first paint already shows the match.
  // We skip the fetch-on-mount when initialGame is provided (the server just
  // looked it up in the DB - a client round-trip would only re-confirm).
  const [fetchState, setFetchState] = useState<FetchState>(() => ({
    loading: initialGame === null && initialSource === null,
    game: initialGame,
    source: initialSource,
  }));
  const { loading, game, source } = fetchState;
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const loadAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const operationInFlightRef = useRef(false);
  const identityRef = useRef(vnId);
  const mountedRef = useRef(true);

  function ownsPanel(ownerVnId: string): boolean {
    return mountedRef.current && identityRef.current === ownerVnId;
  }

  function finishMutation(ownerVnId: string, controller: AbortController) {
    if (identityRef.current !== ownerVnId || mutationAbortRef.current !== controller) return;
    mutationAbortRef.current = null;
    operationInFlightRef.current = false;
    if (mountedRef.current) setUnlinking(false);
  }

  const load = useCallback(
    async (force = false, showLoading = false): Promise<boolean> => {
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      if (showLoading) setFetchState((prev) => ({ ...prev, loading: true }));
      try {
        const url = `/api/vn/${vnId}/erogamescape${force ? '?refresh=1' : ''}`;
        const r = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const d = decodeVnEgsGameSnapshot(await r.json());
        if (!d) throw new Error(t.common.error);
        if (controller.signal.aborted || loadAbortRef.current !== controller) return false;
        setFetchState((prev) => ({ ...prev, game: d.game, source: d.source }));
        setError(null);
        return true;
      } catch (e) {
        if ((e as Error).name === 'AbortError' || controller.signal.aborted || loadAbortRef.current !== controller) {
          return false;
        }
        setError((e as Error).message);
        return false;
      } finally {
        if (loadAbortRef.current === controller) {
          loadAbortRef.current = null;
          if (showLoading) setFetchState((prev) => ({ ...prev, loading: false }));
        }
      }
    },
    [vnId, t.common.error],
  );

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = vnId;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    operationInFlightRef.current = false;
    setFetchState({
      loading: initialGame === null && initialSource === null,
      game: initialGame,
      source: initialSource,
    });
    setError(null);
    setPickerOpen(false);
    setRefreshing(false);
    setUnlinking(false);
    if (initialGame === null && initialSource === null) void load(false, true);
    return () => {
      mountedRef.current = false;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [load, vnId, initialGame, initialSource]);

  async function onRefresh() {
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    const ownerVnId = vnId;
    setRefreshing(true);
    try {
      const refreshed = await load(true);
      if (!refreshed || !ownsPanel(ownerVnId)) return;
      toast.success(t.toast.saved);
      window.dispatchEvent(new CustomEvent<EgsChangedDetail>(EGS_CHANGED_EVENT, { detail: { vnId } }));
      startTransition(() => router.refresh());
    } finally {
      if (identityRef.current === ownerVnId) {
        operationInFlightRef.current = false;
        if (mountedRef.current) setRefreshing(false);
      }
    }
  }

  async function onUnlink() {
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    setUnlinking(true);
    try {
      const ok = await confirm({ message: t.egs.unlinkConfirm, tone: 'danger' });
      if (!ok || !ownsPanel(ownerVnId) || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
      const r = await fetch(`/api/vn/${vnId}/erogamescape`, {
        method: 'DELETE',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsPanel(ownerVnId) || mutationAbortRef.current !== controller || controller.signal.aborted) return;
      setFetchState((prev) => ({ ...prev, game: null, source: null }));
      toast.success(t.toast.removed);
      window.dispatchEvent(new CustomEvent<EgsChangedDetail>(EGS_CHANGED_EVENT, { detail: { vnId } }));
      startTransition(() => router.refresh());
    } catch (e) {
      if (
        (e as Error).name === 'AbortError' ||
        !ownsPanel(ownerVnId) ||
        mutationAbortRef.current !== controller ||
        controller.signal.aborted
      ) return;
      toast.error((e as Error).message);
    } finally {
      finishMutation(ownerVnId, controller);
    }
  }

  function onPicked(picked: EgsPanelGame, pickedSource: Source) {
    if (!ownsPanel(vnId)) return;
    loadAbortRef.current?.abort();
    loadAbortRef.current = null;
    setFetchState((prev) => ({ ...prev, game: picked, source: pickedSource }));
    setPickerOpen(false);
    window.dispatchEvent(new CustomEvent<EgsChangedDetail>(EGS_CHANGED_EVENT, { detail: { vnId } }));
    startTransition(() => router.refresh());
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-5">
        <SkeletonBlock className="mb-3 h-4 w-32" />
        <SkeletonBlock className="mb-2 h-3 w-1/2" />
        <SkeletonBlock className="mb-2 h-3 w-2/3" />
        <SkeletonBlock className="h-3 w-1/3" />
      </div>
    );
  }
  const operationBusy = refreshing || unlinking;

  // ----- Empty / no-match branch - still surface the manual search affordance -----
  if (!game) {
    return (
      <>
        <div className="p-4 sm:p-5">
          <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onRefresh}
                disabled={operationBusy}
                className="btn btn-xs"
                title={t.egs.refresh}
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
                {t.egs.refresh}
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                disabled={operationBusy}
                className="btn btn-xs"
              >
                <Search className="h-3 w-3" aria-hidden />
                {t.egs.searchEgs}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">{t.egs.noMatch}</p>
          {error && <div className="mt-1"><ErrorAlert title={t.common.error}>{error}</ErrorAlert></div>}
        </div>
        {pickerOpen && (
          <EgsPicker
            vnId={vnId}
            initialQuery={searchSeed ?? ''}
            onClose={() => setPickerOpen(false)}
            onPicked={onPicked}
          />
        )}
      </>
    );
  }

  // ----- Matched branch -----
  const combined = combinedScore(vndbRating, game.median);
  const totalPlaytime = (myPlaytimeMinutes || 0) + (game.playtime_median_minutes ?? 0);
  const myPt = fmtMinutes(myPlaytimeMinutes || null, locale, t.year);
  const egsPt = fmtMinutes(game.playtime_median_minutes, locale, t.year);
  const vndbPt = fmtMinutes(vndbLengthMinutes, locale, t.year);
  const sumPt = fmtMinutes(totalPlaytime || null, locale, t.year);
  const gameHref = safeHref(game.url);

  return (
    <>
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {source === 'search' && (
              <span className="rounded bg-bg-elev/60 px-1.5 py-0.5 text-[10px] font-normal text-muted">
                {t.egs.fuzzyMatch}
              </span>
            )}
            {source === 'manual' && (
              <span className="rounded bg-accent/15 px-1.5 py-0.5 text-[10px] font-normal text-accent">
                {t.egs.manualMatch}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {gameHref && (
              <a
                href={gameHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> {t.egs.openOnEgs}
              </a>
            )}
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={operationBusy}
              className="btn btn-xs"
              title={t.egs.changeLink}
            >
              <Link2 className="h-3 w-3" aria-hidden /> {t.egs.changeLink}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={operationBusy}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50 sm:min-h-0"
              title={t.egs.refresh}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onUnlink}
              disabled={operationBusy}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped disabled:opacity-50 sm:min-h-0"
              title={t.egs.unlink}
            >
              {unlinking ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Trash2 className="h-3 w-3" aria-hidden />}
            </button>
          </div>
        </div>

        <div className="mb-2 line-clamp-2 text-sm font-semibold" title={game.gamename}>{game.gamename}</div>

        {/*
          Clickable metadata strip - brand and release year are first-
          class tokens on every EGS surface now. The brand chip routes
          to the matching `/producer/<id>` when the EGS row carries a
          VNDB-mapped producer id; otherwise it falls back to a name
          search so the user lands on the right candidate set. Year
          deep-links into the Library year filter. The strip stays
          hidden when no token is renderable.
        */}
        {(game.brand_name || game.sellday) && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            {game.brand_name && (() => {
              const href = brandHref(null, game.brand_name);
              return href ? (
                <Link
                  href={href}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 text-muted hover:border-accent hover:text-accent sm:min-h-0"
                  title={game.brand_name}
                >
                  {game.brand_name}
                </Link>
              ) : (
                <span className="text-muted">{game.brand_name}</span>
              );
            })()}
            {game.sellday && (() => {
              const href = yearHref(game.sellday);
              return href ? (
                <Link
                  href={href}
                  className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-bg-elev/40 px-2 py-0.5 tabular-nums text-muted hover:border-accent hover:text-accent sm:min-h-0"
                >
                  {game.sellday.slice(0, 4)}
                </Link>
              ) : (
                <span className="tabular-nums text-muted">{formatIsoDateString(game.sellday, locale)}</span>
              );
            })()}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<Star className="h-3 w-3" aria-hidden />}
            label={t.egs.median}
            value={game.median != null ? `${game.median} / 100` : '-'}
            tone="accent"
          />
          <Stat
            icon={<Star className="h-3 w-3" aria-hidden />}
            label={t.egs.average}
            value={game.average != null ? fmtNum(game.average, locale, 1) : '-'}
          />
          <Stat
            icon={<Users className="h-3 w-3" aria-hidden />}
            label={t.egs.voteCount}
            value={game.count != null ? fmtNum(game.count, locale) : '-'}
          />
          <Stat
            icon={<Clock className="h-3 w-3" aria-hidden />}
            label={t.egs.playtimeMedian}
            value={egsPt ?? '-'}
          />
        </div>

        {(vndbRating != null || combined != null) && (
          <div className="mt-4 grid gap-3 rounded-lg border border-border bg-bg-elev/40 p-3 sm:grid-cols-3">
            <Stat
              label={t.egs.vndbRating}
              value={vndbRating != null ? `${fmtNum(vndbRating / 10, locale, 1)} / 10` : '-'}
              hint={vndbVoteCount != null ? `${fmtNum(vndbVoteCount, locale)} ${t.egs.votes}` : undefined}
            />
            <Stat
              label={t.egs.egsRating}
              value={game.median != null ? `${game.median} / 100` : '-'}
              hint={game.count != null ? `${fmtNum(game.count, locale)} ${t.egs.votes}` : undefined}
            />
            {combined != null && (
              <Stat
                label={t.egs.combined}
                value={`${combined} / 100`}
                tone="accent"
                hint={t.egs.combinedHint}
              />
            )}
          </div>
        )}

        {(myPt || egsPt || vndbPt || sumPt) && (
          <div className="mt-4">
            <div className="mb-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
              <Clock className="h-3 w-3" aria-hidden /> {t.egs.playtimeTitle}
            </div>
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
              {vndbPt && <span><b className="text-white">{vndbPt}</b> <span className="text-muted">{t.egs.playtimeVndb}</span></span>}
              {egsPt && <span><b className="text-white">{egsPt}</b> <span className="text-muted">{t.egs.playtimeEgs}</span></span>}
              {myPt && <span><b className="text-white">{myPt}</b> <span className="text-muted">{t.egs.playtimeMine}</span></span>}
              {sumPt && (myPlaytimeMinutes > 0 || (game.playtime_median_minutes ?? 0) > 0) && (
                <span className="rounded-md bg-accent/15 px-2 py-0.5 text-accent">
                  {t.egs.playtimeSum}: <b>{sumPt}</b>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
      {pickerOpen && (
        <EgsPicker
          vnId={vnId}
          initialQuery={searchSeed ?? game.gamename}
          onClose={() => setPickerOpen(false)}
          onPicked={onPicked}
        />
      )}
    </>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'accent';
}) {
  return (
    <div>
      <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted">
        {icon}
        {label}
      </div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${tone === 'accent' ? 'text-accent' : ''}`}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-muted/80">{hint}</div>}
    </div>
  );
}

function EgsPicker({
  vnId,
  initialQuery,
  onClose,
  onPicked,
}: {
  vnId: string;
  initialQuery: string;
  onClose: () => void;
  onPicked: (game: EgsPanelGame, source: Source) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<EgsCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const linkAbortRef = useRef<AbortController | null>(null);
  const linkInFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const titleId = useId();
  useDialogA11y({ open: true, onClose, panelRef });

  const run = useCallback(async () => {
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    const q = query.trim();
    if (!q) {
      setCandidates([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setLoading(true);
    try {
      const r = await fetch(`/api/egs/search?q=${encodeURIComponent(q)}&limit=20`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const candidates = decodeEgsSearchCandidates(await r.json());
      if (!candidates) throw new Error(t.common.error);
      if (controller.signal.aborted || searchAbortRef.current !== controller) return;
      setCandidates(candidates);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || controller.signal.aborted || searchAbortRef.current !== controller) {
        return;
      }
      toast.error((e as Error).message);
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [query, t.common.error, toast]);

  useEffect(() => {
    if (initialQuery.trim()) void run();
    return () => {
      mountedRef.current = false;
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      linkAbortRef.current?.abort();
      linkAbortRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function link(c: EgsCandidate) {
    if (linkInFlightRef.current) return;
    linkInFlightRef.current = true;
    const controller = new AbortController();
    linkAbortRef.current = controller;
    setLinking(c.id);
    try {
      const r = await fetch(`/api/vn/${vnId}/erogamescape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egs_id: c.id }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = decodeVnEgsGameSnapshot(await r.json());
      if (!d?.game) throw new Error(t.common.error);
      if (controller.signal.aborted || !mountedRef.current || linkAbortRef.current !== controller) return;
      onPicked(d.game, d.source);
      toast.success(t.toast.saved);
    } catch (e) {
      if ((e as Error).name === 'AbortError' || controller.signal.aborted || !mountedRef.current || linkAbortRef.current !== controller) return;
      toast.error((e as Error).message);
    } finally {
      if (linkAbortRef.current === controller) {
        linkAbortRef.current = null;
        linkInFlightRef.current = false;
        if (mountedRef.current) setLinking(null);
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto p-2 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mt-6 w-full max-w-xl rounded-2xl border border-border bg-bg-card p-4 shadow-card outline-none sm:mt-12 sm:p-6"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id={titleId} className="inline-flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-accent" aria-hidden />
            {t.egs.searchTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="tap-target inline-flex items-center justify-center rounded-full text-muted hover:bg-bg-elev hover:text-white"
            aria-label={t.common.close}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <p className="mb-3 text-xs text-muted">{t.egs.searchHint}</p>
        <form
          className="mb-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
        >
          <input
            className="input min-h-[44px] flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.egs.searchPlaceholder}
            aria-label={t.egs.searchPlaceholder}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            {t.egs.searchAction}
          </button>
        </form>
        {candidates.length === 0 && !loading && query.trim() && (
          <p className="py-6 text-center text-sm text-muted">{t.egs.noResults}</p>
        )}
        {candidates.length === 20 && (
          <p className="mb-1 text-right text-[11px] text-muted">{t.egs.top20Notice}</p>
        )}
        {candidates.length > 0 && (
          <ul className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-bg-elev/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-semibold" title={c.gamename}>{c.gamename}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                    <span>EGS #{c.id}</span>
                    {c.sellday && <span>{formatIsoDateString(c.sellday, locale)}</span>}
                    {c.median != null && (
                      <span className="inline-flex items-center gap-0.5 text-accent">
                        <Star className="h-2.5 w-2.5 fill-accent" aria-hidden /> {c.median}
                      </span>
                    )}
                    {c.count != null && <span>{fmtNum(c.count, locale)} {t.egs.votes}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn shrink-0"
                  onClick={() => link(c)}
                  disabled={linking != null}
                >
                  {linking === c.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2 className="h-3 w-3" aria-hidden />}
                  {t.egs.linkAction}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
