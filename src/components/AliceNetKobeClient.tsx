'use client';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  BookHeart,
  Building2,
  CheckCircle2,
  Database,
  ExternalLink,
  Filter,
  Grid3X3,
  List,
  Link2,
  Link2Off,
  Loader2,
  PackageCheck,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  X,
  Zap,
} from 'lucide-react';
import { useDialogA11y } from './Dialog';
import { useConfirm } from './ConfirmDialog';
import { useToast } from './ToastProvider';
import { SafeImage } from './SafeImage';
import { SkeletonBlock } from './Skeleton';
import { useT, useLocale } from '@/lib/i18n/client';
import type { Locale } from '@/lib/i18n/dictionaries';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatVndbDateString } from '@/lib/locale-number';
import { timeAgo } from '@/lib/time-ago';
import { readApiError } from '@/lib/api-error-read';
import { CardDensitySlider } from './CardDensitySlider';
import { DensityScopeProvider } from './DensityScopeProvider';

import type {
  KobeCandidate,
  KobeItem,
  KobeStats,
  KobeSearchHit as SearchHit,
  KobeFilterTab as FilterTab,
  KobeSort,
  KobeGroup,
  KobeView,
} from './kobe-types';
import {
  KOBE_SORTS,
  KOBE_GROUPS,
  parseKobePrice as parsePrice,
  comparableKobeDate as comparableDate,
  formatKobeDate,
  formatKobePrice,
  parseKobeDevs as parseDevs,
  kobeMatchKind as matchKind,
  displayKobeTitle as displayTitle,
  displayKobeProducer as displayProducer,
} from './kobe-types';

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
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
                <ExternalLink className="h-3 w-3" />
              </a>
              <button type="button" onClick={() => link(h.id)} disabled={busy != null} className="btn btn-primary">
                {busy === h.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2 className="h-3 w-3" />}
                {t.mapEgs.useThis}
              </button>
            </li>
          ))}
        </ul>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={() => link(null)} disabled={busy != null} className="btn btn-danger btn-xs">
            {busy === 'none' ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Link2Off className="h-3 w-3" />}
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
            {busy === c.id && <Loader2 className="h-2.5 w-2.5 animate-spin" aria-hidden />}
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
  | 'vndb-from-egs'
  | 'retry-vndb-aggressive'
  | 'search-egs'
  | 'search-egs-aggressive'
  | 'download-vndb'
  | 'resolve-egs'
  | 'download-all';

interface PendingCounts { vndb_pending: number; egs_pending: number }
interface RunTotals { processed: number; matched: number }

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
export function AliceNetKobeClient() {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const { confirm } = useConfirm();
  const urlSearch = useSearchParams();
  const router = useRouter();
  const isFilterTab = (v: string | null): v is FilterTab =>
    v === 'all' || v === 'matched' || v === 'vndb' || v === 'egs_only' ||
    v === 'unmatched' || v === 'none_found' || v === 'collection' || v === 'wishlist';
  const isKobeSort = (v: string | null): v is KobeSort =>
    v != null && (KOBE_SORTS as readonly string[]).includes(v);
  const isKobeGroup = (v: string | null): v is KobeGroup =>
    v != null && (KOBE_GROUPS as readonly string[]).includes(v);
  const isKobeView = (v: string | null): v is KobeView => v === 'cards' || v === 'list';

  const KOBE_PREFS_KEY = 'vncoll.kobe.prefs.v1';
  function loadKobePrefs(): { sort?: KobeSort; group?: KobeGroup; view?: KobeView } {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(KOBE_PREFS_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw) as { sort?: unknown; group?: unknown; view?: unknown };
      return {
        sort: isKobeSort(obj.sort as string | null) ? (obj.sort as KobeSort) : undefined,
        group: isKobeGroup(obj.group as string | null) ? (obj.group as KobeGroup) : undefined,
        view: isKobeView(obj.view as string | null) ? (obj.view as KobeView) : undefined,
      };
    } catch {
      return {};
    }
  }
  const [items, setItems] = useState<KobeItem[]>([]);
  const [stats, setStats] = useState<KobeStats>({ total: 0, matched: 0, vndb_matched: 0, egs_only: 0, unmatched: 0, unprocessed: 0, none_found: 0, in_collection: 0, in_wishlist: 0 });
  const [pending, setPending] = useState<PendingCounts>({ vndb_pending: 0, egs_pending: 0 });
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeOp, setActiveOp] = useState<ActiveOp>('idle');
  const [opDone, setOpDone] = useState(0);
  const [opTotal, setOpTotal] = useState(0);
  const [opLabel, setOpLabel] = useState('');
  const [lastRun, setLastRun] = useState<{ label: string; processed: number; matched: number; error?: string } | null>(null);
  const [filter, setFilter] = useState<FilterTab>(() => {
    const v = urlSearch?.get('filter') ?? null;
    return isFilterTab(v) ? v : 'all';
  });
  const [producerFilter, setProducerFilter] = useState('');
  const [sort, setSort] = useState<KobeSort>(() => {
    const v = urlSearch?.get('sort') ?? null;
    if (isKobeSort(v)) return v;
    return loadKobePrefs().sort ?? 'match_status';
  });
  const [group, setGroup] = useState<KobeGroup>(() => {
    const v = urlSearch?.get('group') ?? null;
    if (isKobeGroup(v)) return v;
    return loadKobePrefs().group ?? 'none';
  });
  const [view, setView] = useState<KobeView>(() => {
    const v = urlSearch?.get('view') ?? null;
    if (isKobeView(v)) return v;
    return loadKobePrefs().view ?? 'cards';
  });
  const [showFilters, setShowFilters] = useState(true);
  const [yearMin, setYearMin] = useState('');
  const [yearMax, setYearMax] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const handle = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(handle);
  }, [searchInput]);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(KOBE_PREFS_KEY, JSON.stringify({ sort, group, view }));
    } catch {
      // Quota / private-mode — ignore.
    }
  }, [sort, group, view]);

  useEffect(() => {
    const params = new URLSearchParams(urlSearch?.toString() ?? '');
    let dirty = false;
    const setOrDelete = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) {
        if (params.get(key) != null) { params.delete(key); dirty = true; }
      } else if (params.get(key) !== value) {
        params.set(key, value);
        dirty = true;
      }
    };
    setOrDelete('filter', filter, 'all');
    setOrDelete('sort', sort, 'match_status');
    setOrDelete('group', group, 'none');
    setOrDelete('view', view, 'cards');
    if (dirty) {
      const next = params.toString();
      router.replace(`/alicesoft_kobe${next ? `?${next}` : ''}`, { scroll: false });
    }
  }, [filter, sort, group, view, urlSearch, router]);

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
  ): Promise<RunTotals> {
    let done = 0;
    let matched = 0;
    const runStartedAt = Date.now();
    setOpDone(0);
    setOpTotal(initialTotal);
    setOpLabel(label);
    while (!stopRef.current) {
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, batch: batchSize, run_started_at: runStartedAt }),
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const d = (await r.json()) as { processed: number; matched?: number; remaining: number };
      done += d.processed;
      matched += d.matched ?? 0;
      setOpDone(done);
      setOpTotal(done + getRemaining(d));
      if (d.processed === 0 || d.remaining === 0) break;
    }
    return { processed: done, matched };
  }

  async function runSingleOp(op: Exclude<ActiveOp, 'idle' | 'download-all'>) {
    stopRef.current = false;
    setActiveOp(op);
    let label = '';
    let totals: RunTotals = { processed: 0, matched: 0 };
    try {
      if (op === 'downloading') {
        label = t.kobe.kobeDownloading;
        setOpLabel(label);
        setOpDone(0);
        setOpTotal(0);
        await downloadStock();
      } else if (op === 'matching') {
        label = t.kobe.kobeMatchVndbEgs;
        totals = await runLoop('/api/alicesoft-kobe/match-next', { retry_none: false }, label, (d) => d.remaining, stats.unprocessed, 5);
      } else if (op === 'retrying') {
        label = t.kobe.kobeRetryNone;
        totals = await runLoop('/api/alicesoft-kobe/match-next', { retry_none: true }, label, (d) => d.remaining, stats.none_found, 4);
      } else if (op === 'vndb-from-egs') {
        label = t.kobe.kobeMatchVndbFromEgs;
        totals = await runLoop('/api/alicesoft-kobe/match-vndb-from-egs', {}, label, (d) => d.remaining, stats.egs_only, 10);
      } else if (op === 'retry-vndb-aggressive') {
        label = t.kobe.kobeRetryVndbAggressive;
        totals = await runLoop('/api/alicesoft-kobe/retry-vndb-aggressive', {}, label, (d) => d.remaining, stats.none_found, 4);
      } else if (op === 'search-egs') {
        label = t.kobe.kobeSearchEgsForNoVndb;
        totals = await runLoop('/api/alicesoft-kobe/search-egs-no-vndb', { aggressive: false }, label, (d) => d.remaining, stats.none_found, 10);
      } else if (op === 'search-egs-aggressive') {
        label = t.kobe.kobeSearchEgsForNoVndbAggressive;
        totals = await runLoop('/api/alicesoft-kobe/search-egs-no-vndb', { aggressive: true }, label, (d) => d.remaining, stats.none_found, 10);
      } else if (op === 'download-vndb') {
        label = t.kobe.kobeDownloadVndb;
        totals = await runLoop('/api/alicesoft-kobe/download-vndb', {}, label, (d) => d.remaining, pending.vndb_pending, 10);
      } else if (op === 'resolve-egs') {
        label = t.kobe.kobeResolveEgs;
        totals = await runLoop('/api/alicesoft-kobe/resolve-egs', {}, label, (d) => d.remaining, pending.egs_pending, 10);
      }
      await load();
      setLastRun({ label: label || op, ...totals });
    } catch (e) {
      const message = `${label || op}: ${(e as Error).message}`;
      setLastRun({ label: label || op, ...totals, error: (e as Error).message });
      toast.error(message, 0);
    } finally {
      setActiveOp('idle');
    }
  }

  async function runDownloadAll() {
    stopRef.current = false;
    setActiveOp('download-all');
    let label = t.kobe.kobeDownloading;
    try {
      setOpLabel(label);
      setOpDone(0);
      setOpTotal(0);
      await downloadStock();
      if (stopRef.current) return;
      label = t.kobe.kobeMatchVndbEgs;
      await runLoop('/api/alicesoft-kobe/match-next', { retry_none: false }, label, (d) => d.remaining, stats.unprocessed, 5);
      if (stopRef.current) return;
      label = t.kobe.kobeRetryNone;
      await runLoop('/api/alicesoft-kobe/match-next', { retry_none: true }, label, (d) => d.remaining, stats.none_found, 4);
      if (stopRef.current) return;
      label = t.kobe.kobeMatchVndbFromEgs;
      await runLoop('/api/alicesoft-kobe/match-vndb-from-egs', {}, label, (d) => d.remaining, stats.egs_only, 10);
      if (stopRef.current) return;
      label = t.kobe.kobeDownloadVndb;
      await runLoop('/api/alicesoft-kobe/download-vndb', {}, label, (d) => d.remaining, pending.vndb_pending, 10);
      if (stopRef.current) return;
      label = t.kobe.kobeResolveEgs;
      await runLoop('/api/alicesoft-kobe/resolve-egs', {}, label, (d) => d.remaining, pending.egs_pending, 10);
      await load();
    } catch (e) {
      toast.error(`${label}: ${(e as Error).message}`, 0);
    } finally {
      setActiveOp('idle');
    }
  }

  async function resetAutoMatches() {
    const ok = await confirm({ message: t.kobe.kobeResetConfirm, tone: 'danger' });
    if (!ok) return;
    try {
      const r = await fetch('/api/alicesoft-kobe/reset-matches', { method: 'POST' });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      await load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function clearLink(code: string) {
    const ok = await confirm({
      message: t.kobe.kobeClearMatchConfirm,
      tone: 'danger',
    });
    if (!ok) return;
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
  const showStatsSkeleton = loading && items.length === 0 && stats.total === 0;

  const producers = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const item of items) {
      const devs = parseDevs(item.vn_developers);
      for (const d of devs) {
        if (!d.id) continue;
        const prev = map.get(d.id);
        map.set(d.id, { id: d.id, name: d.name || d.id, count: (prev?.count ?? 0) + 1 });
      }
      if (devs.length === 0 && item.egs_brand) {
        const id = `egs:${item.egs_brand}`;
        const prev = map.get(id);
        map.set(id, { id, name: item.egs_brand, count: (prev?.count ?? 0) + 1 });
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (filter === 'matched') list = list.filter((i) => i.vn_id !== null || i.egs_id !== null);
    else if (filter === 'vndb') list = list.filter((i) => i.vn_id !== null);
    else if (filter === 'egs_only') list = list.filter((i) => i.vn_id === null && i.egs_id !== null);
    else if (filter === 'unmatched') list = list.filter((i) => i.vn_id === null && i.egs_id === null);
    else if (filter === 'none_found') list = list.filter((i) => i.vn_id === null && i.egs_id === null && i.vn_match_source === 'none');
    else if (filter === 'collection') list = list.filter((i) => i.in_collection === 1);
    else if (filter === 'wishlist') list = list.filter((i) => i.in_wishlist === 1);
    if (producerFilter) {
      list = list.filter((i) => {
        if (producerFilter.startsWith('egs:')) return `egs:${i.egs_brand ?? ''}` === producerFilter;
        return parseDevs(i.vn_developers).some((d) => d.id === producerFilter);
      });
    }
    const yMin = yearMin ? Number(yearMin) : null;
    const yMax = yearMax ? Number(yearMax) : null;
    const pMin = priceMin ? Number(priceMin) : null;
    const pMax = priceMax ? Number(priceMax) : null;
    if (yMin != null || yMax != null) {
      list = list.filter((i) => {
        const year = Number((i.release_date || i.egs_release_date || '').slice(0, 4));
        if (!Number.isFinite(year)) return false;
        if (yMin != null && year < yMin) return false;
        if (yMax != null && year > yMax) return false;
        return true;
      });
    }
    if (pMin != null || pMax != null) {
      list = list.filter((i) => {
        const price = parsePrice(i.sale_price);
        if (price == null) return false;
        if (pMin != null && price < pMin) return false;
        if (pMax != null && price > pMax) return false;
        return true;
      });
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          (i.egs_title?.toLowerCase().includes(q) ?? false) ||
          (i.egs_brand?.toLowerCase().includes(q) ?? false) ||
          (i.search_title?.toLowerCase().includes(q) ?? false) ||
          i.code.includes(q) ||
          (i.vn_id?.toLowerCase().includes(q) ?? false) ||
          String(i.egs_id ?? '').includes(q),
      );
    }
    return list;
  }, [items, filter, producerFilter, search, yearMin, yearMax, priceMin, priceMax]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      switch (sort) {
        case 'title':
          return displayTitle(a).localeCompare(displayTitle(b));
        case 'release_desc':
          return comparableDate(b.release_date || b.egs_release_date).localeCompare(comparableDate(a.release_date || a.egs_release_date));
        case 'release_asc':
          return comparableDate(a.release_date || a.egs_release_date).localeCompare(comparableDate(b.release_date || b.egs_release_date));
        case 'price_asc':
          return (parsePrice(a.sale_price) ?? Number.MAX_SAFE_INTEGER) - (parsePrice(b.sale_price) ?? Number.MAX_SAFE_INTEGER);
        case 'price_desc':
          return (parsePrice(b.sale_price) ?? 0) - (parsePrice(a.sale_price) ?? 0);
        case 'updated_desc':
          return (b.updated_at ?? 0) - (a.updated_at ?? 0);
        case 'match_status': {
          const rank = { unresolved: 0, new: 1, egs: 2, vndb: 3 } as const;
          return rank[matchKind(a)] - rank[matchKind(b)] || displayTitle(a).localeCompare(displayTitle(b));
        }
        default: {
          const _exhaustive: never = sort;
          return String(_exhaustive).localeCompare('');
        }
      }
    });
    return out;
  }, [filtered, sort]);

  const grouped = useMemo<{ key: string; items: KobeItem[] }[]>(() => {
    if (group === 'none') return [{ key: '', items: sorted }];
    const buckets = new Map<string, KobeItem[]>();
    for (const item of sorted) {
      let key = '';
      if (group === 'match') {
        key = matchKind(item) === 'vndb'
          ? t.kobe.kobeVndbMatched
          : matchKind(item) === 'egs'
            ? t.kobe.kobeEgsOnly
            : t.kobe.kobeNeedsMatch;
      } else if (group === 'producer') {
        key = displayProducer(item) || t.wishlist.groupUnknown;
      } else if (group === 'year') {
        key = (item.release_date || item.egs_release_date)?.slice(0, 4) || t.wishlist.groupUnknown;
      }
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);
    }
    return Array.from(buckets.entries())
      .sort(([a], [b]) => (group === 'year' ? b.localeCompare(a) : a.localeCompare(b)))
      .map(([key, items]) => ({ key, items }));
  }, [sorted, group, t.kobe.kobeVndbMatched, t.kobe.kobeEgsOnly, t.kobe.kobeNeedsMatch, t.wishlist.groupUnknown]);

  const tabs: { id: FilterTab; label: string; count: number; icon?: React.ReactNode }[] = [
    { id: 'all', label: t.kobe.kobeFilterAll, count: stats.total },
    { id: 'matched', label: t.kobe.kobeFilterMatched, count: stats.matched },
    { id: 'vndb', label: t.kobe.kobeVndbMatched, count: stats.vndb_matched },
    { id: 'egs_only', label: t.kobe.kobeEgsOnly, count: stats.egs_only },
    { id: 'unmatched', label: t.kobe.kobeFilterUnmatched, count: stats.unmatched },
    { id: 'none_found', label: t.kobe.kobeNoneFound, count: stats.none_found },
    { id: 'collection', label: t.kobe.kobeInCollection, count: stats.in_collection, icon: <BookHeart className="h-3 w-3 text-status-completed" aria-hidden /> },
    { id: 'wishlist', label: t.kobe.kobeInWishlist, count: stats.in_wishlist, icon: <BookHeart className="h-3 w-3 text-status-dropped" aria-hidden /> },
  ];

  const sortLabels: Record<KobeSort, string> = {
    match_status: t.kobe.kobeSortMatchStatus,
    release_desc: t.kobe.kobeSortReleaseDesc,
    release_asc: t.kobe.kobeSortReleaseAsc,
    price_asc: t.kobe.kobeSortPriceAsc,
    price_desc: t.kobe.kobeSortPriceDesc,
    title: t.kobe.kobeSortTitle,
    updated_desc: t.kobe.kobeSortUpdatedDesc,
  };

  const groupLabels: Record<KobeGroup, string> = {
    none: t.kobe.kobeGroupNone,
    match: t.kobe.kobeGroupMatch,
    producer: t.kobe.kobeGroupProducer,
    year: t.kobe.kobeGroupYear,
  };

  const activeFilterCount =
    (filter !== 'all' ? 1 : 0) +
    (producerFilter ? 1 : 0) +
    (yearMin ? 1 : 0) +
    (yearMax ? 1 : 0) +
    (priceMin ? 1 : 0) +
    (priceMax ? 1 : 0) +
    (searchInput ? 1 : 0);

  function resetFilters() {
    setFilter('all');
    setProducerFilter('');
    setYearMin('');
    setYearMax('');
    setPriceMin('');
    setPriceMax('');
    setSearchInput('');
  }

  function statusBadge(item: KobeItem) {
    const kind = matchKind(item);
    if (kind === 'vndb') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-status-completed/25 bg-status-completed/10 px-2 py-0.5 text-[11px] font-semibold text-status-completed">
          <CheckCircle2 className="h-3 w-3" aria-hidden />
          {t.kobe.kobeVndbMatched}
        </span>
      );
    }
    if (kind === 'egs') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-status-playing/25 bg-status-playing/10 px-2 py-0.5 text-[11px] font-semibold text-status-playing">
          <PackageCheck className="h-3 w-3" aria-hidden />
          {t.kobe.kobeEgsOnly}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-status-on_hold/25 bg-status-on_hold/10 px-2 py-0.5 text-[11px] font-semibold text-status-on_hold">
        <Search className="h-3 w-3" aria-hidden />
        {kind === 'unresolved' ? t.kobe.kobeNeedsMatch : t.kobe.kobeNotYetMatched}
      </span>
    );
  }

  function quickLinks(item: KobeItem) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {item.vn_id && (
          <a
            href={`/vn/${item.vn_id}`}
            className="inline-flex min-h-[32px] items-center gap-1 rounded border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-mono text-accent hover:bg-accent/20"
          >
            <Link2 className="h-3 w-3" aria-hidden />
            {item.vn_id}
          </a>
        )}
        {item.egs_id && (
          <a
            href={`https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=${item.egs_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[32px] items-center gap-1 rounded border border-border bg-bg-elev/50 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            title={`${t.kobe.kobeEgsId} ${item.egs_id}`}
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            EGS {item.egs_id}
          </a>
        )}
      </div>
    );
  }

  function renderKobeCard(item: KobeItem) {
    const candidates = item.vn_candidates
      ? (() => { try { return JSON.parse(item.vn_candidates) as KobeCandidate[]; } catch { return []; } })()
      : [];
    const producer = displayProducer(item);
    const image = item.vn_image_url || item.egs_image_url;
    const date = item.release_date || item.egs_release_date;
    return (
      <article key={item.code} role="listitem" className="group flex min-h-[24rem] flex-col overflow-hidden rounded-xl border border-border bg-bg-card transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-card">
        <div className="relative aspect-[2/3] bg-bg-elev">
          <SafeImage
            src={image}
            localSrc={item.vn_local_image}
            sexual={item.vn_image_sexual}
            alt={displayTitle(item)}
            className="h-full w-full"
            fit="cover"
          />
          <div className="absolute left-2 top-2 flex flex-wrap gap-1">{statusBadge(item)}</div>
          <div className="absolute bottom-2 left-2 right-2 flex flex-wrap gap-1">
            {item.in_wishlist === 1 && (
              <span className="rounded-full border border-status-dropped/25 bg-bg/85 px-2 py-0.5 text-[10px] font-semibold text-status-dropped backdrop-blur">
                {t.kobe.kobeInWishlist}
              </span>
            )}
            {item.in_collection === 1 && (
              <span className="rounded-full border border-status-completed/25 bg-bg/85 px-2 py-0.5 text-[10px] font-semibold text-status-completed backdrop-blur">
                {t.kobe.kobeInCollection}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-3">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold leading-snug" title={item.title}>{displayTitle(item)}</h3>
            {item.egs_title && item.egs_title !== item.title && (
              <p className="mt-0.5 line-clamp-1 text-[11px] text-muted" title={item.title}>{item.title}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
            {/* U-239: format the raw kobe price ('¥4,270') through
                  Intl.NumberFormat so the user sees the locale-native
                  presentation instead of the raw scraped string. */}
            {item.sale_price && <span className="font-semibold text-white">{formatKobePrice(item.sale_price, locale)}</span>}
            {/* U-238: format the raw kobe date through formatVndbDateString. */}
            {date && <span>{formatKobeDate(date, locale)}</span>}
            <span className="font-mono opacity-70">{item.code}</span>
          </div>
          {producer && (
            <button
              type="button"
              onClick={() => {
                const id = item.vn_developers ? parseDevs(item.vn_developers)[0]?.id : null;
                setProducerFilter(id || (item.egs_brand ? `egs:${item.egs_brand}` : ''));
              }}
              className="inline-flex w-fit items-center gap-1 rounded border border-border bg-bg-elev/40 px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
            >
              <Building2 className="h-3 w-3" aria-hidden />
              {producer}
            </button>
          )}
          {item.search_title && (
            <p className="line-clamp-1 text-[10px] text-muted/70" title={item.search_title}>
              {t.kobe.kobeSearchedAs.replace('{q}', item.search_title)}
            </p>
          )}
          {quickLinks(item)}
          {candidates.length > 1 && (
            <CandidateChips candidates={candidates} currentId={item.vn_id} code={item.code} onRemapped={load} />
          )}
          <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
            <button type="button" onClick={() => setLinkTarget(item)} className="btn btn-xs">
              <Search className="h-3 w-3" />
              {item.vn_id ? t.kobe.kobeRemap : t.kobe.kobeFindMatch}
            </button>
            {item.vn_id && (
              <button
                type="button"
                onClick={() => clearLink(item.code)}
                className="btn btn-xs text-muted hover:text-status-dropped"
                title={t.kobe.kobeClearMatch}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  function renderKobeRow(item: KobeItem) {
    const producer = displayProducer(item);
    const date = item.release_date || item.egs_release_date;
    return (
      <li key={item.code} className="rounded-xl border border-border bg-bg-card p-3 transition-shadow hover:shadow-card">
        <div className="flex gap-3">
          <SafeImage
            src={item.vn_image_url || item.egs_image_url}
            localSrc={item.vn_local_image}
            sexual={item.vn_image_sexual}
            alt={displayTitle(item)}
            className="h-20 w-14 shrink-0 rounded-lg"
            fit="cover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold leading-tight" title={item.title}>{displayTitle(item)}</p>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] text-muted">
                  {/* U-239 / U-238: locale-aware reformatting. */}
                  {item.sale_price && <span className="font-semibold text-white">{formatKobePrice(item.sale_price, locale)}</span>}
                  {date && <span>{formatKobeDate(date, locale)}</span>}
                  <span className="font-mono opacity-60">{item.code}</span>
                  {producer && <span>{producer}</span>}
                </div>
                {item.search_title && (
                  <p className="mt-1 text-[10px] italic text-muted/70">
                    {t.kobe.kobeSearchedAs.replace('{q}', item.search_title)}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {statusBadge(item)}
                {quickLinks(item)}
                <button type="button" onClick={() => setLinkTarget(item)} className="btn btn-xs">
                  <Search className="h-3 w-3" />
                  {item.vn_id ? t.kobe.kobeRemap : t.kobe.kobeFindMatch}
                </button>
              </div>
            </div>
          </div>
        </div>
      </li>
    );
  }

  return (
    <DensityScopeProvider scope="alicesoftKobe" className="page-space mx-auto max-w-screen-2xl px-4 py-6">

      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ShoppingBag className="h-5 w-5 text-accent" aria-hidden />
        <h1 className="text-xl font-bold">{t.kobe.kobeTitle}</h1>
        {lastFetch && (
          <span className="text-xs text-muted">
            {t.kobe.kobeLastFetch.replace('{date}', timeAgo(lastFetch, t))}
          </span>
        )}
      </div>

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {showStatsSkeleton ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <SkeletonBlock className="mx-auto mb-3 h-3 w-20" />
              <SkeletonBlock className="mx-auto h-8 w-14" />
            </div>
          ))
        ) : (
          <>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.kobe.kobeFilterAll}</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.kobe.kobeFilterMatched}</div>
              <div className="text-2xl font-bold text-status-completed">{stats.matched}</div>
              {stats.total > 0 && <div className="mt-0.5 text-[10px] text-muted">{matchPct}%</div>}
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.kobe.kobeFilterUnmatched}</div>
              <div className="text-2xl font-bold">{stats.unmatched}</div>
              {(stats.unprocessed > 0 || stats.none_found > 0) && (
                <div className="mt-0.5 text-[10px] text-status-on_hold/80">
                  {t.kobe.kobeUnmatchedBreakdown
                    .replace('{new}', String(stats.unprocessed))
                    .replace('{none}', String(stats.none_found))}
                </div>
              )}
            </div>
            <div className="rounded-xl border border-status-on_hold/20 bg-status-on_hold/5 p-4 text-center">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">{t.kobe.kobeNoneFound}</div>
              <div className="text-2xl font-bold text-status-on_hold">{stats.none_found}</div>
              {stats.unprocessed > 0 && <div className="mt-0.5 text-[10px] text-muted">{stats.unprocessed} {t.kobe.kobeNotYetMatched}</div>}
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <BookHeart className="h-3 w-3 text-status-completed" aria-hidden />
                {t.kobe.kobeInCollection}
              </div>
              <div className="text-2xl font-bold text-status-completed">{stats.in_collection}</div>
            </div>
            <div className="rounded-xl border border-border bg-bg-card p-4 text-center">
              <div className="mb-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted">
                <BookHeart className="h-3 w-3 text-status-dropped" aria-hidden />
                {t.kobe.kobeInWishlist}
              </div>
              <div className="text-2xl font-bold text-status-dropped">{stats.in_wishlist}</div>
            </div>
          </>
        )}
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
          <div className="grid gap-3 lg:grid-cols-[1.1fr_1.1fr_1.25fr_1.15fr_auto]">
            <section className="min-w-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.kobe.kobeActionPipeline}</div>
              <button
                type="button"
                onClick={runDownloadAll}
                className="btn btn-primary btn-sm w-full sm:w-auto"
                title={t.kobe.kobeDownloadAllHint}
              >
                <Zap className="h-3.5 w-3.5" />
                {t.kobe.kobeDownloadAll}
              </button>
              <p className="mt-1 text-[11px] leading-snug text-muted">{t.kobe.kobeDownloadAllHint}</p>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.kobe.kobeActionStock}</div>
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
                disabled={stats.unprocessed === 0}
                className="btn btn-sm"
              >
                <Search className="h-3.5 w-3.5" />
                {t.kobe.kobeMatchVndbEgs}
                {stats.unprocessed > 0 && (
                  <span className="ml-1 rounded bg-bg-elev px-1 text-[10px] text-muted">{stats.unprocessed}</span>
                )}
              </button>
              </div>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.kobe.kobeActionRecovery}</div>
              <button
                type="button"
                onClick={() => runSingleOp('retrying')}
                disabled={stats.none_found === 0}
                className="btn btn-sm btn-primary w-full sm:w-auto"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t.kobe.kobeRetryNone}
                {stats.none_found > 0 && (
                  <span className="ml-1 rounded bg-bg/20 px-1 text-[10px] text-bg">{stats.none_found}</span>
                )}
              </button>
              <p className="mt-1 text-[11px] leading-snug text-muted">{t.kobe.kobeSmartRetryHint}</p>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.kobe.kobeActionData}</div>
              <div className="flex flex-wrap gap-2">
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
              </div>
            </section>

            <section className="min-w-0 border-t border-border pt-3 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">{t.kobe.kobeActionMaintenance}</div>
              <button
                type="button"
                onClick={resetAutoMatches}
                disabled={stats.matched === 0}
                className="btn btn-sm text-muted hover:border-status-dropped hover:text-status-dropped"
              >
                <X className="h-3.5 w-3.5" />
                {t.kobe.kobeResetAutoMatches}
              </button>
            </section>
          </div>
        )}
      </div>

      {/* Browsing controls */}
      <div className="mb-4 rounded-xl border border-border bg-bg-card p-3">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t.kobe.kobeFilterAll}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                aria-pressed={filter === tab.id}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                  filter === tab.id
                    ? 'border-accent bg-accent/10 font-semibold text-accent'
                    : 'border-border bg-bg-elev/30 text-muted hover:border-accent hover:text-white'
                }`}
              >
                {tab.icon ?? null}
                <span>{tab.label}</span>
                <span className={`rounded px-1 text-[10px] ${filter === tab.id ? 'bg-accent/20 text-accent' : 'bg-bg text-muted'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_12rem_12rem_auto] lg:items-end">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t.kobe.kobeSearchPlaceholder}
                aria-label={t.kobe.kobeSearchPlaceholder}
                className="input min-h-[44px] w-full pl-9 text-sm"
              />
            </div>

            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.kobe.kobeSortLabel}
              <select value={sort} onChange={(e) => setSort(e.target.value as KobeSort)} className="input min-h-[44px] text-xs normal-case tracking-normal">
                {KOBE_SORTS.map((id) => <option key={id} value={id}>{sortLabels[id]}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.kobe.kobeGroupLabel}
              <select value={group} onChange={(e) => setGroup(e.target.value as KobeGroup)} className="input min-h-[44px] text-xs normal-case tracking-normal">
                {KOBE_GROUPS.map((id) => <option key={id} value={id}>{groupLabels[id]}</option>)}
              </select>
            </label>

            <div className="flex flex-wrap items-end gap-2 lg:min-w-[24rem] lg:justify-end">
              <div className="inline-flex rounded-md border border-border bg-bg-elev/40 p-1" role="group" aria-label={t.kobe.kobeViewLabel}>
                <button
                  type="button"
                  onClick={() => setView('cards')}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'cards' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                  aria-label={t.kobe.kobeViewCards}
                  title={t.kobe.kobeViewCards}
                >
                  <Grid3X3 className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setView('list')}
                  className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded px-2 ${view === 'list' ? 'bg-accent text-bg' : 'text-muted hover:text-white'}`}
                  aria-label={t.kobe.kobeViewList}
                  title={t.kobe.kobeViewList}
                >
                  <List className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={`btn btn-sm ${showFilters || activeFilterCount > 0 ? 'border-accent text-accent' : ''}`}
                aria-expanded={showFilters}
              >
                <Filter className="h-3.5 w-3.5" />
                {t.kobe.kobeFilters}
                {activeFilterCount > 0 && <span className="rounded bg-accent/15 px-1 text-[10px] text-accent">{activeFilterCount}</span>}
              </button>
              <CardDensitySlider scope="alicesoftKobe" className="min-w-[14rem] max-w-full flex-1 lg:flex-none" />
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted sm:col-span-2 lg:col-span-1">
              {t.kobe.kobeFilterProducer}
              <select value={producerFilter} onChange={(e) => setProducerFilter(e.target.value)} className="input min-h-[44px] text-xs normal-case tracking-normal">
                <option value="">{t.kobe.kobeFilterProducerAll}</option>
                {producers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.count})</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.kobe.kobeYearMin}
              <input value={yearMin} onChange={(e) => setYearMin(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="1999" />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.kobe.kobeYearMax}
              <input value={yearMax} onChange={(e) => setYearMax(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="2026" />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.kobe.kobePriceMin}
              <input value={priceMin} onChange={(e) => setPriceMin(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="0" />
            </label>
            <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              {t.kobe.kobePriceMax}
              <input value={priceMax} onChange={(e) => setPriceMax(e.target.value)} inputMode="numeric" className="input min-h-[44px] text-xs normal-case tracking-normal" placeholder="5000" />
            </label>
            <div className="flex items-end sm:col-span-2 lg:col-span-5">
              <button type="button" onClick={resetFilters} disabled={activeFilterCount === 0} className="btn btn-sm">
                <RotateCcw className="h-3.5 w-3.5" />
                {t.kobe.kobeResetFilters}
              </button>
            </div>
          </div>
        )}
      </div>

      {lastRun && (
        <div className={`mb-4 rounded-lg border p-3 text-sm ${
          lastRun.error
            ? 'border-status-dropped/40 bg-status-dropped/10 text-status-dropped'
            : 'border-border bg-bg-card text-muted'
        }`}>
          <div className="font-semibold text-white">{lastRun.label}</div>
          <div className="mt-1 text-xs">
            {lastRun.error
              ? lastRun.error
              : t.kobe.kobeLastRunSummary
                .replace('{processed}', String(lastRun.processed))
                .replace('{matched}', String(lastRun.matched))}
          </div>
        </div>
      )}

      {(filter === 'unmatched' || filter === 'none_found' || filter === 'egs_only') && (stats.none_found > 0 || stats.egs_only > 0) && (
        <div className="mb-4 grid gap-2 rounded-xl border border-border bg-bg-card p-3 md:grid-cols-2 xl:grid-cols-4">
          <button type="button" onClick={() => runSingleOp('retrying')} disabled={isBusy || stats.none_found === 0} className="btn btn-sm justify-start">
            <Search className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.kobe.kobeRetryNone}</span>
          </button>
          <button type="button" onClick={() => runSingleOp('vndb-from-egs')} disabled={isBusy || stats.egs_only === 0} className="btn btn-sm justify-start">
            <Link2 className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.kobe.kobeMatchVndbFromEgs}</span>
          </button>
          <button type="button" onClick={() => runSingleOp('search-egs')} disabled={isBusy || stats.none_found === 0} className="btn btn-sm justify-start">
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.kobe.kobeSearchEgsForNoVndb}</span>
          </button>
          <button type="button" onClick={() => runSingleOp('search-egs-aggressive')} disabled={isBusy || stats.none_found === 0} className="btn btn-sm justify-start">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="min-w-0 truncate">{t.kobe.kobeSearchEgsForNoVndbAggressive}</span>
          </button>
        </div>
      )}

      {/* Items */}
      {loading ? (
        <div
          aria-busy
          aria-live="polite"
          role="status"
          className={view === 'cards' ? 'grid gap-3' : 'space-y-2'}
          style={view === 'cards' ? { gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' } : undefined}
        >
          <span className="sr-only">{t.common.loading}</span>
          {Array.from({ length: view === 'cards' ? 12 : 10 }).map((_, i) => (
            <SkeletonBlock key={i} className={`${view === 'cards' ? 'h-96' : 'h-24'} rounded-xl`} />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg-card p-10 text-center text-sm text-muted">
          {stats.total === 0 ? (
            <p>{t.kobe.kobeEmptyNoStock ?? t.kobe.kobeUnmatched}</p>
          ) : (
            <p>{t.kobe.kobeEmptyForFilter ?? t.kobe.kobeUnmatched}</p>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((section) => (
            <section key={section.key || 'all'} className="space-y-2">
              {group !== 'none' && (
                <div className="flex items-center gap-2 border-b border-border pb-1">
                  <h2 className="min-w-0 truncate text-sm font-semibold">{section.key}</h2>
                  <span className="rounded bg-bg-elev px-1.5 py-0.5 text-[10px] text-muted">{section.items.length}</span>
                </div>
              )}
              {view === 'cards' ? (
                <div
                  role="list"
                  className="grid gap-3"
                  style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, var(--card-density-px, 220px)), 1fr))' }}
                >
                  {section.items.map(renderKobeCard)}
                </div>
              ) : (
                <ul className="space-y-2">
                  {section.items.map(renderKobeRow)}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}

      {linkTarget && (
        <LinkDialog item={linkTarget} onClose={() => setLinkTarget(null)} onLinked={load} />
      )}
    </DensityScopeProvider>
  );
}
