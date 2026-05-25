'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BookHeart,
  Database,
  ExternalLink,
  Link2,
  Link2Off,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  X,
  Zap,
} from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { useToast } from './ToastProvider';
import { SafeImage } from './SafeImage';
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
  vn_image_url: string | null;
  vn_local_image: string | null;
  vn_image_sexual: number | null;
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
      const r = await fetch(`/api/alicesoft-kobe/${encodeURIComponent(code)}/link`, {
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
    <div className="mt-2 flex flex-wrap items-center gap-1">
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

type ActiveOp =
  | 'idle'
  | 'downloading'
  | 'matching'
  | 'retrying'
  | 'download-vndb'
  | 'resolve-egs'
  | 'download-all';

interface PendingCounts { vndb_pending: number; egs_pending: number }

/**
 * Client-side page for the Alice Kobe second-hand stock browser.
 *
 * Download sequence (manual or via "Download all"):
 *   1. Download stock from AliceNET (uses configured proxy if set)
 *   2. Find VNDB + EGS matches (VNDB throttled at 1 req/s; EGS runs concurrently)
 *   3. Download VNDB metadata for matched VNs
 *   4. Resolve EGS via VNDB ext-links + title search
 *
 * All steps can be run individually or chained with "Download all".
 * Any step can be stopped with the Stop button.
 */
export function KobeClient() {
  const t = useT();
  const toast = useToast();
  const [items, setItems] = useState<KobeItem[]>([]);
  const [stats, setStats] = useState<KobeStats>({ total: 0, matched: 0, unmatched: 0, none_found: 0, in_wishlist: 0 });
  const [pending, setPending] = useState<PendingCounts>({ vndb_pending: 0, egs_pending: 0 });
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOp, setActiveOp] = useState<ActiveOp>('idle');
  const [opDone, setOpDone] = useState(0);
  const [opTotal, setOpTotal] = useState(0);
  const [opLabel, setOpLabel] = useState('');
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [linkTarget, setLinkTarget] = useState<KobeItem | null>(null);
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/alicesoft-kobe', { cache: 'no-store' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = (await r.json()) as {
        items: KobeItem[];
        stats: KobeStats;
        pending: PendingCounts;
        last_fetch: number | null;
      };
      setItems(d.items);
      setStats(d.stats);
      setPending(d.pending);
      setLastFetch(d.last_fetch);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => { load(); }, [load]);

  async function downloadStock() {
    const r = await fetch('/api/alicesoft-kobe/fetch', { method: 'POST' });
    if (!r.ok) throw new Error(await readApiError(r, t.common.error));
    const d = (await r.json()) as { count: number; added: number; updated: number; removed: number };
    if (d.removed > 0) {
      toast.success(t.kobe.kobeStockRemoved.replace('{n}', String(d.removed)));
    }
  }

  async function runLoop(
    endpoint: string,
    body: Record<string, unknown>,
    label: string,
    getRemaining: (d: { processed: number; remaining: number }) => number,
    initialTotal = 0,
    batchSize = 5,
  ) {
    let done = 0;
    setOpDone(0);
    setOpTotal(initialTotal);
    setOpLabel(label);
    while (!stopRef.current) {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch: batchSize, ...body }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = (await r.json()) as { processed: number; remaining: number };
      done += d.processed;
      setOpDone(done);
      setOpTotal(done + getRemaining(d));
      if (d.processed === 0 || d.remaining === 0) break;
    }
  }

  async function runSingleOp(op: Exclude<ActiveOp, 'idle' | 'download-all'>) {
    stopRef.current = false;
    setActiveOp(op);
    try {
      if (op === 'downloading') {
        setOpLabel(t.kobe.kobeDownloading);
        setOpDone(0);
        setOpTotal(0);
        await downloadStock();
      } else if (op === 'matching') {
        await runLoop('/api/alicesoft-kobe/match-next', { retry_none: false }, t.kobe.kobeMatchVndbEgs, (d) => d.remaining, stats.unmatched, 5);
      } else if (op === 'retrying') {
        await runLoop('/api/alicesoft-kobe/match-next', { retry_none: true }, t.kobe.kobeRetryNone, (d) => d.remaining, stats.none_found, 5);
      } else if (op === 'download-vndb') {
        await runLoop('/api/alicesoft-kobe/download-vndb', {}, t.kobe.kobeDownloadVndb, (d) => d.remaining, pending.vndb_pending, 10);
      } else if (op === 'resolve-egs') {
        await runLoop('/api/alicesoft-kobe/resolve-egs', {}, t.kobe.kobeResolveEgs, (d) => d.remaining, pending.egs_pending, 10);
      }
      await load();
    } catch (e) {
      toast.error(`${opLabel}: ${(e as Error).message}`);
    } finally {
      setActiveOp('idle');
    }
  }

  async function runDownloadAll() {
    stopRef.current = false;
    setActiveOp('download-all');
    try {
      setOpLabel(t.kobe.kobeDownloading);
      setOpDone(0);
      setOpTotal(0);
      await downloadStock();
      if (stopRef.current) return;
      await runLoop('/api/alicesoft-kobe/match-next', { retry_none: false }, t.kobe.kobeMatchVndbEgs, (d) => d.remaining, stats.unmatched, 5);
      if (stopRef.current) return;
      await runLoop('/api/alicesoft-kobe/download-vndb', {}, t.kobe.kobeDownloadVndb, (d) => d.remaining, pending.vndb_pending, 10);
      if (stopRef.current) return;
      await runLoop('/api/alicesoft-kobe/resolve-egs', {}, t.kobe.kobeResolveEgs, (d) => d.remaining, pending.egs_pending, 10);
      await load();
    } catch (e) {
      toast.error(`${opLabel}: ${(e as Error).message}`);
    } finally {
      setActiveOp('idle');
    }
  }

  async function resetAutoMatches() {
    if (!window.confirm(t.kobe.kobeResetConfirm)) return;
    try {
      const r = await fetch('/api/alicesoft-kobe/reset-matches', { method: 'POST' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function clearLink(code: string) {
    try {
      const r = await fetch(`/api/alicesoft-kobe/${encodeURIComponent(code)}/link`, { method: 'DELETE' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const isBusy = activeOp !== 'idle';
  const opPct = opTotal > 0 ? Math.round((opDone / opTotal) * 100) : 0;
  const matchPct = stats.total > 0 ? Math.round((stats.matched / stats.total) * 100) : 0;

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'matched') list = list.filter((i) => i.vn_id !== null);
    else if (filter === 'unmatched') list = list.filter((i) => i.vn_id === null && i.vn_match_source !== 'none');
    else if (filter === 'none_found') list = list.filter((i) => i.vn_match_source === 'none');
    else if (filter === 'wishlist') list = list.filter((i) => i.in_wishlist === 1);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.search_title?.toLowerCase().includes(q) ?? false) ||
          i.code.includes(q) ||
          (i.vn_id?.toLowerCase().includes(q) ?? false),
      );
    }
    return list;
  }, [items, filter, search]);

  const tabs: { id: FilterTab; label: string; count: number }[] = [
    { id: 'all', label: t.kobe.kobeFilterAll, count: stats.total },
    { id: 'matched', label: t.kobe.kobeFilterMatched, count: stats.matched },
    { id: 'unmatched', label: t.kobe.kobeFilterUnmatched, count: stats.unmatched },
    { id: 'none_found', label: t.kobe.kobeNoneFound, count: stats.none_found },
    { id: 'wishlist', label: t.kobe.kobeInCollection, count: stats.in_wishlist },
  ];

  return (
    <div className="page-space mx-auto max-w-screen-xl px-4 py-6">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ShoppingBag className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-xl font-bold">{t.kobe.kobeTitle}</h1>
        {lastFetch && (
          <span className="text-xs text-muted">
            {t.kobe.kobeLastFetch.replace('{date}', new Date(lastFetch).toLocaleString())}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.kobe.kobeFilterAll}</div>
          <div className="text-2xl font-bold">{stats.total}</div>
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.kobe.kobeFilterMatched}</div>
          <div className="text-2xl font-bold text-green-400">{stats.matched}</div>
          {stats.total > 0 && <div className="mt-0.5 text-[10px] text-muted">{matchPct}%</div>}
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.kobe.kobeFilterUnmatched}</div>
          <div className="text-2xl font-bold">{stats.unmatched}</div>
          {stats.none_found > 0 && <div className="mt-0.5 text-[10px] text-amber-400/80">{stats.none_found} none</div>}
        </div>
        <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
          <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
            <BookHeart className="h-3 w-3 text-green-400" aria-hidden />
            {t.kobe.kobeInCollection}
          </div>
          <div className="text-2xl font-bold text-green-400">{stats.in_wishlist}</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-5 rounded-xl border border-border bg-bg-card p-3">
        {isBusy ? (
          <div className="flex flex-wrap items-start gap-3">
            <button
              type="button"
              onClick={() => { stopRef.current = true; }}
              className="shrink-0 rounded-md border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:border-status-dropped hover:text-status-dropped"
            >
              {t.kobe.kobeStopMatch}
            </button>
            <div className="min-w-0 flex-1" role="status" aria-live="polite">
              <div className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden />
                <span className="truncate">{opLabel}</span>
                {opTotal > 0 && (
                  <span className="ml-auto shrink-0 tabular-nums">{opDone}/{opTotal}</span>
                )}
              </div>
              {opTotal > 0 && (
                <div
                  role="progressbar"
                  aria-valuenow={Math.round(opPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={opLabel}
                  className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-bg-elev"
                >
                  <div
                    className="h-full bg-accent transition-[width] duration-200"
                    style={{ width: `${opPct}%` }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Primary action */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={runDownloadAll}
                className="btn btn-primary btn-sm"
                title={t.kobe.kobeDownloadAllHint}
              >
                <Zap className="h-3.5 w-3.5" />
                {t.kobe.kobeDownloadAll}
              </button>
            </div>
            {/* Individual steps */}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => runSingleOp('downloading')}
                className="btn btn-sm"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t.kobe.kobeSyncStock}
              </button>
              <button
                type="button"
                onClick={() => runSingleOp('matching')}
                disabled={stats.unmatched === 0}
                className="btn btn-sm"
              >
                <Search className="h-3.5 w-3.5" />
                {t.kobe.kobeMatchVndbEgs}
                {stats.unmatched > 0 && (
                  <span className="ml-1 rounded bg-bg-elev px-1 text-[10px] text-muted">{stats.unmatched}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => runSingleOp('download-vndb')}
                disabled={pending.vndb_pending === 0}
                className="btn btn-sm"
              >
                <Database className="h-3.5 w-3.5" />
                {t.kobe.kobeDownloadVndb}
                {pending.vndb_pending > 0 && (
                  <span className="ml-1 rounded bg-bg-elev px-1 text-[10px] text-muted">{pending.vndb_pending}</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => runSingleOp('resolve-egs')}
                disabled={pending.egs_pending === 0}
                className="btn btn-sm"
              >
                <Link2 className="h-3.5 w-3.5" />
                {t.kobe.kobeResolveEgs}
                {pending.egs_pending > 0 && (
                  <span className="ml-1 rounded bg-bg-elev px-1 text-[10px] text-muted">{pending.egs_pending}</span>
                )}
              </button>
              <div className="my-auto h-5 w-px bg-border" aria-hidden />
              <button
                type="button"
                onClick={() => runSingleOp('retrying')}
                disabled={stats.none_found === 0}
                className="btn btn-sm"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t.kobe.kobeRetryNone}
              </button>
              <button
                type="button"
                onClick={resetAutoMatches}
                disabled={stats.matched === 0}
                className="btn btn-sm text-muted hover:text-red-400"
              >
                <X className="h-3.5 w-3.5" />
                {t.kobe.kobeResetAutoMatches}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filter tabs + search */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-1 flex-wrap gap-1 border-b border-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 text-sm transition-colors ${
                filter === tab.id
                  ? 'border-b-2 border-accent font-medium text-accent'
                  : 'text-muted hover:text-white'
              }`}
            >
              {tab.id === 'wishlist' && <BookHeart className="h-3 w-3" aria-hidden />}
              {tab.label}
              <span className={`rounded px-1 text-[10px] ${filter === tab.id ? 'bg-accent/20 text-accent' : 'bg-bg-elev text-muted'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.kobe.kobeSearchPlaceholder}
            aria-label={t.kobe.kobeSearchPlaceholder}
            className="input w-full pl-8 text-sm"
          />
        </div>
      </div>

      {/* Item list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-bg-elev/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t.kobe.kobeUnmatched}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((item) => {
            const candidates = item.vn_candidates
              ? (() => { try { return JSON.parse(item.vn_candidates) as KobeCandidate[]; } catch { return []; } })()
              : [];
            const showSearched = item.search_title && item.search_title !== item.title;
            return (
              <li key={item.code} className="rounded-xl border border-border bg-bg-card p-3 transition-shadow hover:shadow-card">
                <div className="flex gap-3">
                  <SafeImage
                    src={item.vn_image_url}
                    localSrc={item.vn_local_image}
                    sexual={item.vn_image_sexual}
                    alt={item.title}
                    className="h-16 w-11 shrink-0 rounded-lg"
                    fit="cover"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">

                      {/* Title + metadata */}
                      <div className="min-w-0">
                        <p className="truncate font-semibold leading-tight" title={item.title}>{item.title}</p>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-muted">
                          {item.sale_price && <span>{item.sale_price}</span>}
                          {item.release_date && <span>{item.release_date}</span>}
                          <span className="font-mono opacity-50">{item.code}</span>
                        </div>
                        {showSearched && (
                          <p className="mt-0.5 text-[10px] italic text-muted/60">
                            {t.kobe.kobeSearchedAs.replace('{q}', item.search_title!)}
                          </p>
                        )}
                      </div>

                      {/* Match status + actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        {item.in_wishlist === 1 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-[10px] text-green-400">
                            <BookHeart className="h-2.5 w-2.5" aria-hidden />
                            {t.kobe.kobeInCollection}
                          </span>
                        )}

                        {item.vn_id ? (
                          <>
                            <a
                              href={`/vn/${item.vn_id}`}
                              className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-mono text-accent hover:bg-accent/20"
                            >
                              <Link2 className="h-3 w-3" />
                              {item.vn_id}
                            </a>
                            {item.vn_match_source === 'manual' && (
                              <span className="rounded-full border border-accent/20 bg-accent/10 px-1.5 py-0.5 text-[10px] text-accent">
                                manual
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => clearLink(item.code)}
                              className="btn btn-xs text-muted hover:text-red-400"
                              title={t.kobe.kobeClearMatch}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        ) : (
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            item.vn_match_source === 'none'
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-400'
                              : 'border-border bg-bg-elev text-muted'
                          }`}>
                            {item.vn_match_source === 'none' ? t.kobe.kobeNoneFound : t.kobe.kobeNotYetMatched}
                          </span>
                        )}

                        {item.egs_id && (
                          <a
                            href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${item.egs_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-elev/50 px-2 py-0.5 text-[10px] text-muted hover:border-accent hover:text-accent"
                            title={`${t.kobe.kobeEgsId} ${item.egs_id}`}
                          >
                            <ExternalLink className="h-2.5 w-2.5" />
                            EGS{item.egs_match_source === 'manual' ? ' ✓' : ''}
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={() => setLinkTarget(item)}
                          className="btn btn-xs"
                        >
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
                  </div>
                </div>
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
