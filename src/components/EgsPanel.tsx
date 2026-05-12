'use client';
import { useCallback, useEffect, useState } from 'react';
import { Clock, ExternalLink, Link2, Loader2, RefreshCw, Search, Sparkles, Star, Trash2, Users, X } from 'lucide-react';
import { useToast } from './ToastProvider';
import { SkeletonBlock } from './Skeleton';
import { useT } from '@/lib/i18n/client';

interface EgsGame {
  id: number;
  gamename: string;
  median: number | null;
  average: number | null;
  dispersion: number | null;
  count: number | null;
  sellday: string | null;
  playtime_median_minutes: number | null;
  url: string;
}

interface EgsCandidate {
  id: number;
  gamename: string;
  median: number | null;
  count: number | null;
  sellday: string | null;
}

type Source = 'extlink' | 'search' | 'manual' | null;

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
  initialGame?: EgsGame | null;
  initialSource?: Source;
}

function fmtMinutes(m: number | null | undefined): string | null {
  if (!m || m <= 0) return null;
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
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
  const toast = useToast();
  // Hydrate from the server payload so first paint already shows the match.
  // We skip the fetch-on-mount when initialGame is provided (the server just
  // looked it up in the DB — a client round-trip would only re-confirm).
  const [loading, setLoading] = useState(initialGame === null && initialSource === null);
  const [game, setGame] = useState<EgsGame | null>(initialGame);
  const [source, setSource] = useState<Source>(initialSource);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (force = false) => {
      try {
        const url = `/api/vn/${vnId}/erogamescape${force ? '?refresh=1' : ''}`;
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        const d = (await r.json()) as { game: EgsGame | null; source: Source };
        setGame(d.game);
        setSource(d.source);
        setError(null);
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [vnId, t.common.error],
  );

  useEffect(() => {
    // Only auto-fetch when the server didn't pre-hydrate us.
    if (initialGame !== null || initialSource !== null) return;
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load, initialGame, initialSource]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load(true);
      toast.success(t.toast.saved);
    } finally {
      setRefreshing(false);
    }
  }

  async function onUnlink() {
    if (!confirm(t.egs.unlinkConfirm)) return;
    try {
      await fetch(`/api/vn/${vnId}/erogamescape`, { method: 'DELETE' });
      setGame(null);
      setSource(null);
      toast.success(t.toast.removed);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function onPicked(picked: EgsGame, pickedSource: Source) {
    setGame(picked);
    setSource(pickedSource);
    setPickerOpen(false);
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-bg-card p-5">
        <SkeletonBlock className="mb-3 h-4 w-32" />
        <SkeletonBlock className="mb-2 h-3 w-1/2" />
        <SkeletonBlock className="mb-2 h-3 w-2/3" />
        <SkeletonBlock className="h-3 w-1/3" />
      </section>
    );
  }

  // ----- Empty / no-match branch — still surface the manual search affordance -----
  if (!game) {
    return (
      <>
        <section className="rounded-xl border border-border bg-bg-card p-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
              <Sparkles className="h-4 w-4 text-accent" /> {t.egs.section}
            </h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
                title={t.egs.refresh}
              >
                <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
                {t.egs.refresh}
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
              >
                <Search className="h-3 w-3" aria-hidden />
                {t.egs.searchEgs}
              </button>
            </div>
          </div>
          <p className="text-xs text-muted">{t.egs.noMatch}</p>
          {error && <p className="mt-1 text-[11px] text-status-dropped">{error}</p>}
        </section>
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
  const myPt = fmtMinutes(myPlaytimeMinutes || null);
  const egsPt = fmtMinutes(game.playtime_median_minutes);
  const vndbPt = fmtMinutes(vndbLengthMinutes);
  const sumPt = fmtMinutes(totalPlaytime || null);

  return (
    <>
      <section className="rounded-xl border border-border bg-bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
            <Sparkles className="h-4 w-4 text-accent" /> {t.egs.section}
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
          </h3>
          <div className="flex items-center gap-1">
            <a
              href={game.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              <ExternalLink className="h-3 w-3" /> {t.egs.openOnEgs}
            </a>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
              title={t.egs.changeLink}
            >
              <Link2 className="h-3 w-3" aria-hidden /> {t.egs.changeLink}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent disabled:opacity-50"
              title={t.egs.refresh}
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onUnlink}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-status-dropped hover:text-status-dropped"
              title={t.egs.unlink}
            >
              <Trash2 className="h-3 w-3" aria-hidden />
            </button>
          </div>
        </div>

        <div className="mb-3 line-clamp-2 text-sm font-semibold">{game.gamename}</div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<Star className="h-3 w-3" />}
            label={t.egs.median}
            value={game.median != null ? `${game.median} / 100` : '—'}
            tone="accent"
          />
          <Stat
            icon={<Star className="h-3 w-3" />}
            label={t.egs.average}
            value={game.average != null ? game.average.toFixed(1) : '—'}
          />
          <Stat
            icon={<Users className="h-3 w-3" />}
            label={t.egs.voteCount}
            value={game.count != null ? game.count.toLocaleString() : '—'}
          />
          <Stat
            icon={<Clock className="h-3 w-3" />}
            label={t.egs.playtimeMedian}
            value={egsPt ?? '—'}
          />
        </div>

        {(vndbRating != null || combined != null) && (
          <div className="mt-4 grid gap-3 rounded-lg border border-border bg-bg-elev/40 p-3 sm:grid-cols-3">
            <Stat
              label={t.egs.vndbRating}
              value={vndbRating != null ? `${(vndbRating / 10).toFixed(1)} / 10` : '—'}
              hint={vndbVoteCount != null ? `${vndbVoteCount.toLocaleString()} ${t.egs.votes}` : undefined}
            />
            <Stat
              label={t.egs.egsRating}
              value={game.median != null ? `${game.median} / 100` : '—'}
              hint={game.count != null ? `${game.count.toLocaleString()} ${t.egs.votes}` : undefined}
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
              <Clock className="h-3 w-3" /> {t.egs.playtimeTitle}
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
      </section>
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
  onPicked: (game: EgsGame, source: Source) => void;
}) {
  const t = useT();
  const toast = useToast();
  const [query, setQuery] = useState(initialQuery);
  const [candidates, setCandidates] = useState<EgsCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [linking, setLinking] = useState<number | null>(null);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setCandidates([]);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch(`/api/egs/search?q=${encodeURIComponent(q)}&limit=20`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { candidates: EgsCandidate[] };
      setCandidates(d.candidates);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [query, t.common.error, toast]);

  useEffect(() => {
    // Initial search when seeded.
    if (initialQuery.trim()) {
      run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function link(c: EgsCandidate) {
    setLinking(c.id);
    try {
      const r = await fetch(`/api/vn/${vnId}/erogamescape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ egs_id: c.id }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { game: EgsGame; source: Source };
      onPicked(d.game, d.source);
      toast.success(t.toast.saved);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLinking(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 p-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mt-12 w-full max-w-xl rounded-2xl border border-border bg-bg-card p-6 shadow-card">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-accent" aria-hidden />
            {t.egs.searchTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-bg-elev hover:text-white"
            aria-label={t.common.close}
          >
            <X className="h-4 w-4" />
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
            className="input flex-1"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.egs.searchPlaceholder}
            autoFocus
          />
          <button type="submit" className="btn btn-primary" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {t.egs.searchAction}
          </button>
        </form>
        {candidates.length === 0 && !loading && query.trim() && (
          <p className="py-6 text-center text-sm text-muted">{t.egs.noResults}</p>
        )}
        {candidates.length > 0 && (
          <ul className="max-h-[60vh] overflow-y-auto rounded-lg border border-border">
            {candidates.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 last:border-b-0 hover:bg-bg-elev/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1 text-sm font-semibold">{c.gamename}</div>
                  <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                    <span>EGS #{c.id}</span>
                    {c.sellday && <span>{c.sellday}</span>}
                    {c.median != null && (
                      <span className="inline-flex items-center gap-0.5 text-accent">
                        <Star className="h-2.5 w-2.5 fill-accent" /> {c.median}
                      </span>
                    )}
                    {c.count != null && <span>{c.count.toLocaleString()} {t.egs.votes}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn shrink-0"
                  onClick={() => link(c)}
                  disabled={linking != null}
                >
                  {linking === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
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
