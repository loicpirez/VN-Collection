'use client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  BookHeart,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Square,
  X,
  Zap,
} from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { useToast } from './ToastProvider';
import { useT, useLocale } from '@/lib/i18n/client';
import { formatVndbDateString } from '@/lib/locale-number';
import { readApiError } from '@/lib/api-error-read';

interface KobeCandidate {
  id: string;
  title: string;
  alttitle: string | null;
  released: string | null;
}

interface KobeItem {
  code: string;
  title: string;
  jan: string | null;
  release_date: string | null;
  list_price: string | null;
  sale_price: string | null;
  vn_id: string | null;
  vn_match_source: 'auto' | 'manual' | 'none' | null;
  vn_candidates: string | null;
  search_title: string | null;
  egs_id: number | null;
  egs_match_source: 'auto' | 'manual' | null;
  in_wishlist: number;
  last_matched_at: number | null;
  fetched_at: number;
  updated_at: number;
}

interface KobeStats {
  total: number;
  matched: number;
  unmatched: number;
  none_found: number;
  in_wishlist: number;
}

interface SearchHit {
  id: string;
  title: string;
  released: string | null;
  developers?: { id: string; name: string }[];
}

type FilterTab = 'all' | 'matched' | 'unmatched' | 'none_found' | 'wishlist';

interface LinkDialogProps {
  item: KobeItem;
  onClose: () => void;
  onLinked: () => void;
}

function LinkDialog({ item, onClose, onLinked }: LinkDialogProps) {
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
      const r = await fetch(`/api/alice-kobe/${encodeURIComponent(item.code)}/link`, {
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
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-bg/80 backdrop-blur" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-[min(92vw,640px)] max-h-[85vh] overflow-y-auto rounded-2xl border border-border bg-bg-card p-4 sm:p-5 shadow-card"
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold">{t.kobe.kobeFindMatch}</h2>
            <p className="mt-1 truncate text-[11px] text-muted" title={item.title}>{item.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t.common.close} className="text-muted hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </header>

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
          {searching && <Loader2 className="absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-muted" />}
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
                {busy === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                {t.mapEgs.useThis}
              </button>
            </li>
          ))}
        </ul>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={() => link(null)} disabled={busy != null} className="btn btn-danger btn-xs">
            {busy === 'none' ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
            {t.kobe.kobeNoMatch}
          </button>
        </footer>
      </div>
    </div>
  );
}

interface CandidateChipsProps {
  candidates: KobeCandidate[];
  currentId: string | null;
  code: string;
  onRemapped: () => void;
}

function CandidateChips({ candidates, currentId, code, onRemapped }: CandidateChipsProps) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  if (candidates.length === 0) return null;

  async function pick(vnId: string) {
    setBusy(vnId);
    try {
      const r = await fetch(`/api/alice-kobe/${encodeURIComponent(code)}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: vnId }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      onRemapped();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-muted">{t.kobe.kobeCandidates}:</span>
      {candidates.map((c) => {
        const isActive = c.id === currentId;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c.id)}
            disabled={busy != null || isActive}
            title={`${c.title}${c.alttitle ? ` / ${c.alttitle}` : ''}${c.released ? ` (${formatVndbDateString(c.released, locale)})` : ''}`}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-mono transition-colors ${
              isActive
                ? 'bg-accent/20 text-accent cursor-default'
                : 'border border-border bg-bg-elev/30 text-muted hover:border-accent hover:text-white'
            }`}
          >
            {busy === c.id && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
            {c.id}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Client-side page for the Alice Kobe second-hand stock browser.
 *
 * - Stock is fetched from AliceNet ONLY on manual Download button click.
 * - VNDB/EGS matching uses a 1 500ms inter-item delay server-side; cached
 *   results are free (no extra request). Both can be stopped mid-run.
 * - Auto-matched items show top-3 candidate chips for one-click remapping.
 * - Wishlist tab cross-references matched VN IDs against local collection
 *   entries with status = 'planning'.
 */
export function KobeClient() {
  const t = useT();
  const toast = useToast();
  const [items, setItems] = useState<KobeItem[]>([]);
  const [stats, setStats] = useState<KobeStats>({ total: 0, matched: 0, unmatched: 0, none_found: 0, in_wishlist: 0 });
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [matchMode, setMatchMode] = useState<'idle' | 'matching' | 'retrying'>('idle');
  const [matchDone, setMatchDone] = useState(0);
  const [matchTotal, setMatchTotal] = useState(0);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [linkTarget, setLinkTarget] = useState<KobeItem | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/alice-kobe', { cache: 'no-store' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = (await r.json()) as { items: KobeItem[]; stats: KobeStats; last_fetch: number | null };
      setItems(d.items);
      setStats(d.stats);
      setLastFetch(d.last_fetch);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);

  async function download() {
    setDownloading(true);
    try {
      const r = await fetch('/api/alice-kobe/fetch', { method: 'POST' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDownloading(false);
    }
  }

  async function runMatchLoop(retryNone: boolean) {
    stopRef.current = false;
    setMatchMode(retryNone ? 'retrying' : 'matching');
    setMatchDone(0);
    setMatchTotal(retryNone ? stats.unmatched + stats.none_found : stats.unmatched);
    let done = 0;
    try {
      while (!stopRef.current) {
        const r = await fetch('/api/alice-kobe/match-next', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batch: 5, retry_none: retryNone }),
        });
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        const d = (await r.json()) as { processed: number; remaining: number };
        done += d.processed;
        setMatchDone(done);
        setMatchTotal(done + d.remaining);
        if (d.processed === 0 || d.remaining === 0) break;
      }
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setMatchMode('idle');
    }
  }

  async function resetAutoMatches() {
    if (!window.confirm(t.kobe.kobeResetConfirm)) return;
    try {
      const r = await fetch('/api/alice-kobe/reset-matches', { method: 'POST' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function clearLink(code: string) {
    try {
      const r = await fetch(`/api/alice-kobe/${encodeURIComponent(code)}/link`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const isBusy = downloading || matchMode !== 'idle';

  const filtered = items.filter((item) => {
    if (filter === 'matched') return item.vn_id !== null;
    if (filter === 'unmatched') return item.vn_id === null && item.vn_match_source !== 'none';
    if (filter === 'none_found') return item.vn_match_source === 'none';
    if (filter === 'wishlist') return item.in_wishlist === 1;
    return true;
  });

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: t.kobe.kobeFilterAll, count: stats.total },
    { id: 'matched', label: t.kobe.kobeFilterMatched, count: stats.matched },
    { id: 'unmatched', label: t.kobe.kobeFilterUnmatched, count: stats.unmatched },
    { id: 'none_found', label: t.kobe.kobeNoneFound, count: stats.none_found },
    { id: 'wishlist', label: t.kobe.kobeFilterWishlist, count: stats.in_wishlist },
  ];

  const matchProgressPct = matchTotal > 0 ? Math.round((matchDone / matchTotal) * 100) : 0;

  const lastFetchLabel = lastFetch
    ? t.kobe.kobeLastFetch.replace('{date}', new Date(lastFetch).toLocaleString())
    : null;

  const statsLabel = t.kobe.kobeStats
    .replace('{matched}', String(stats.matched))
    .replace('{total}', String(stats.total));

  return (
    <div className="page-space mx-auto max-w-screen-xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ShoppingBag className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-xl font-bold">{t.kobe.kobeTitle}</h1>
        <span className="text-sm text-muted">{statsLabel}</span>
        {lastFetchLabel && <span className="text-xs text-muted">{lastFetchLabel}</span>}
      </div>

      {/* Action bar */}
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={download}
          disabled={isBusy}
          className="btn btn-primary btn-sm"
        >
          {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {downloading ? t.kobe.kobeDownloading : t.kobe.kobeDownload}
        </button>

        {matchMode !== 'idle' ? (
          <button
            type="button"
            onClick={() => { stopRef.current = true; }}
            className="btn btn-danger btn-sm"
          >
            <Square className="h-3.5 w-3.5" />
            {t.kobe.kobeStopMatch}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => runMatchLoop(false)}
              disabled={isBusy || stats.unmatched === 0}
              className="btn btn-sm"
            >
              <Zap className="h-3.5 w-3.5" />
              {t.kobe.kobeMatchVndbEgs}
            </button>
            <button
              type="button"
              onClick={() => runMatchLoop(true)}
              disabled={isBusy || stats.none_found === 0}
              className="btn btn-sm"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.kobe.kobeRetryNone}
            </button>
            <button
              type="button"
              onClick={resetAutoMatches}
              disabled={isBusy || stats.matched === 0}
              className="btn btn-sm btn-xs text-muted hover:text-red-400"
            >
              <X className="h-3.5 w-3.5" />
              {t.kobe.kobeResetAutoMatches}
            </button>
          </>
        )}
      </div>

      {/* Match progress bar */}
      {matchMode !== 'idle' && (
        <div className="mb-4 space-y-1">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {matchMode === 'retrying'
                ? t.kobe.kobeRetryingNone
                : t.kobe.kobeMatchingVndbEgs
                    .replace('{done}', String(matchDone))
                    .replace('{total}', String(matchTotal))}
            </span>
            <span>{matchProgressPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg-elev">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${matchProgressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 text-sm transition-colors ${filter === tab.id ? 'border-b-2 border-accent font-medium text-accent' : 'text-muted hover:text-white'}`}
          >
            {tab.id === 'wishlist' && <BookHeart className="h-3 w-3" aria-hidden />}
            {tab.label}
            <span className={`rounded px-1 text-[10px] ${filter === tab.id ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Item list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-md bg-bg-elev/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted">{t.kobe.kobeUnmatched}</p>
      ) : (
        <ul className="divide-y divide-border">
          {filtered.map((item) => {
            const candidates = item.vn_candidates
              ? (() => { try { return JSON.parse(item.vn_candidates) as KobeCandidate[]; } catch { return []; } })()
              : [];
            const showSearched = item.search_title && item.search_title !== item.title;
            return (
              <li key={item.code} className="py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium" title={item.title}>{item.title}</span>
                      {item.in_wishlist === 1 && (
                        <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] bg-rose-500/20 text-rose-400">
                          <BookHeart className="h-2.5 w-2.5" aria-hidden />
                          {t.kobe.kobeInWishlist}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                      {item.sale_price && <span>{item.sale_price}</span>}
                      {item.release_date && <span>{item.release_date}</span>}
                      <span className="font-mono opacity-60">{item.code}</span>
                    </div>
                    {showSearched && (
                      <div className="mt-0.5 text-[10px] text-muted/60 italic">
                        {t.kobe.kobeSearchedAs.replace('{q}', item.search_title!)}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.vn_id ? (
                      <>
                        <a
                          href={`/vn/${item.vn_id}`}
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-mono text-accent hover:underline"
                        >
                          <Link2 className="h-3 w-3" />
                          {item.vn_id}
                        </a>
                        {item.vn_match_source && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] ${item.vn_match_source === 'manual' ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'}`}>
                            {item.vn_match_source}
                          </span>
                        )}
                        <button type="button" onClick={() => clearLink(item.code)} className="btn btn-xs" title={t.kobe.kobeClearMatch}>
                          <X className="h-3 w-3" />
                          {t.kobe.kobeClearMatch}
                        </button>
                      </>
                    ) : (
                      <span className={`text-[11px] ${item.vn_match_source === 'none' ? 'text-amber-500/80' : 'text-muted'}`}>
                        {item.vn_match_source === 'none' ? t.kobe.kobeNoneFound : t.kobe.kobeNotYetMatched}
                      </span>
                    )}

                    {item.egs_id && (
                      <a
                        href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${item.egs_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted hover:text-accent"
                        title={`${t.kobe.kobeEgsId} ${item.egs_id}`}
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        {t.kobe.kobeEgsId} {item.egs_match_source === 'manual' ? '✓' : '~'}
                      </a>
                    )}

                    <button type="button" onClick={() => setLinkTarget(item)} className="btn btn-xs">
                      <Search className="h-3 w-3" />
                      {item.vn_id ? t.kobe.kobeRemap : t.kobe.kobeFindMatch}
                    </button>
                  </div>
                </div>

                {candidates.length > 1 && (
                  <CandidateChips
                    candidates={candidates}
                    currentId={item.vn_id}
                    code={item.code}
                    onRemapped={load}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {linkTarget && (
        <LinkDialog item={linkTarget} onClose={() => setLinkTarget(null)} onLinked={load} />
      )}
    </div>
  );
}
