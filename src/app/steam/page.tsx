'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowLeftRight, ArrowRight, Check, Gamepad2, Link2, Loader2, Search, Settings2, X } from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { useToast } from '@/components/ToastProvider';
import { useConfirm } from '@/components/ConfirmDialog';
import { SkeletonRows } from '@/components/Skeleton';
import { ErrorAlert } from '@/components/ErrorAlert';
import { formatMinutes } from '@/lib/format';

import { readApiError } from '@/lib/api-error-read';
import { decodeCollectionFindMatches, type CollectionFindMatch } from '@/lib/collection-find-client-shape';
import {
  decodeSteamAppliedCount,
  decodeSteamLibraryResult,
  decodeSteamLinks,
  decodeSteamSyncPreview,
  type SteamLink,
  type SteamSuggestion,
  type UnlinkedSteamGame,
} from '@/lib/steam-client-shape';

export default function SteamSyncPage() {
  const t = useT();
  const locale = useLocale();
  const fmt = useCallback(
    (m: number): string =>
      formatMinutes(m, locale, t.year, { fallback: '0', emptyValue: 'allow_zero' }),
    [locale, t.year],
  );
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();

  // Suggestions (auto+manual links where Steam > local)
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionsErrorCode, setSuggestionsErrorCode] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SteamSuggestion[]>([]);
  const [picks, setPicks] = useState<Set<string>>(new Set());

  const [showAllUnlinked, setShowAllUnlinked] = useState(false);

  // Unlinked Steam games (for the manual mapper)
  const [unlinkedLoading, setUnlinkedLoading] = useState(true);
  const [unlinked, setUnlinked] = useState<UnlinkedSteamGame[]>([]);

  // Currently-stored links (auto + manual)
  const [links, setLinks] = useState<SteamLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);

  // Per-row manual-assign state: { [appid]: { query, matches[] } }
  const [assignQuery, setAssignQuery] = useState<Record<number, string>>({});
  const [assignMatches, setAssignMatches] = useState<Record<number, CollectionFindMatch[]>>({});
  const assignSequenceRef = useRef<Record<number, number>>({});
  const assignAbortRefs = useRef<Record<number, AbortController>>({});
  const refreshAbortRef = useRef<AbortController | null>(null);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const [applying, setApplying] = useState(false);
  const [linkingKey, setLinkingKey] = useState<string | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    refreshAbortRef.current?.abort();
    const ctrl = new AbortController();
    refreshAbortRef.current = ctrl;
    setSuggestionsLoading(true);
    setUnlinkedLoading(true);
    setLinksLoading(true);
    try {
      const [sync, lib, ls] = await Promise.all([
        fetch('/api/steam/sync', { cache: 'no-store', signal: ctrl.signal }).then((r) => r.json()).then(decodeSteamSyncPreview),
        fetch('/api/steam/library', { cache: 'no-store', signal: ctrl.signal }).then((r) => r.json()).then(decodeSteamLibraryResult),
        fetch('/api/steam/link', { cache: 'no-store', signal: ctrl.signal }).then(async (r) => {
          if (!r.ok) throw new Error(await readApiError(r, t.common.error));
          return decodeSteamLinks(await r.json());
        }),
      ]);
      if (!sync || !lib || !ls) throw new Error(t.common.error);
      if (ctrl.signal.aborted) return;
      if (sync.ok) {
        const sugg = sync.suggestions;
        setSuggestions(sugg);
        setPicks(new Set(sugg.map((s) => s.vn_id)));
        setSuggestionsError(null);
        setSuggestionsErrorCode(null);
      } else {
        setSuggestionsError(sync.error);
        setSuggestionsErrorCode(sync.code);
      }
      setUnlinked(lib.ok ? lib.games : []);
      if (!lib.ok && sync.ok) setSuggestionsError(lib.error);
      setLinks(ls);
      setLinksLoading(false);
    } catch (e) {
      if (ctrl.signal.aborted) return;
      console.error('[steam] refresh failed:', e);
      setSuggestionsError(e instanceof Error && e.message ? e.message : t.common.error);
    } finally {
      if (refreshAbortRef.current === ctrl) refreshAbortRef.current = null;
      if (!ctrl.signal.aborted) {
        setSuggestionsLoading(false);
        setUnlinkedLoading(false);
        setLinksLoading(false);
      }
    }
  }, [t.common.error]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
      refreshAbortRef.current?.abort();
      mutationAbortRef.current?.abort();
      for (const controller of Object.values(assignAbortRefs.current)) controller.abort();
      assignAbortRefs.current = {};
    };
  }, [refresh]);

  function beginMutation(): AbortController | null {
    if (mutationInFlightRef.current) return null;
    const controller = new AbortController();
    mutationInFlightRef.current = true;
    mutationAbortRef.current = controller;
    return controller;
  }

  function ownsMutation(controller: AbortController): boolean {
    return mountedRef.current && mutationAbortRef.current === controller && !controller.signal.aborted;
  }

  function finishMutation(controller: AbortController): void {
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
  }

  function togglePick(id: string) {
    setPicks((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function apply() {
    const applies = suggestions
      .filter((s) => picks.has(s.vn_id))
      .map((s) => ({ vn_id: s.vn_id, playtime_minutes: s.steam_minutes }));
    const controller = beginMutation();
    if (!controller) return;
    setApplying(true);
    try {
      const r = await fetch('/api/steam/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applies }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const applied = decodeSteamAppliedCount(await r.json());
      if (applied === null) throw new Error(t.common.error);
      if (!ownsMutation(controller)) return;
      toast.success(t.steam.applied.replace('{n}', String(applied)));
      await refresh();
    } catch (e) {
      if (!ownsMutation(controller)) return;
      toast.error((e as Error).message);
    } finally {
      if (ownsMutation(controller)) setApplying(false);
      finishMutation(controller);
    }
  }

  async function searchAssign(appid: number, query: string) {
    setAssignQuery((s) => ({ ...s, [appid]: query }));
    assignAbortRefs.current[appid]?.abort();
    delete assignAbortRefs.current[appid];
    const sequence = (assignSequenceRef.current[appid] ?? 0) + 1;
    assignSequenceRef.current[appid] = sequence;
    if (query.trim().length < 1) {
      setAssignMatches((s) => ({ ...s, [appid]: [] }));
      return;
    }
    const controller = new AbortController();
    assignAbortRefs.current[appid] = controller;
    try {
      const r = await fetch(`/api/collection/find?q=${encodeURIComponent(query)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      const matches = decodeCollectionFindMatches(await r.json());
      if (!matches) throw new Error(t.common.error);
      if (!mountedRef.current || controller.signal.aborted || assignAbortRefs.current[appid] !== controller || assignSequenceRef.current[appid] !== sequence) return;
      setAssignMatches((s) => ({ ...s, [appid]: matches }));
    } catch (e) {
      if (!mountedRef.current || controller.signal.aborted || assignAbortRefs.current[appid] !== controller || assignSequenceRef.current[appid] !== sequence) return;
      setAssignMatches((s) => ({ ...s, [appid]: [] }));
      toast.error((e as Error).message || t.common.error);
    } finally {
      if (assignAbortRefs.current[appid] === controller) delete assignAbortRefs.current[appid];
    }
  }

  async function link(appid: number, name: string, vnId: string) {
    const controller = beginMutation();
    if (!controller) return;
    setLinkingKey(`${appid}:${vnId}`);
    try {
      const r = await fetch('/api/steam/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: vnId, appid, steam_name: name }),
        signal: controller.signal,
      });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(controller)) return;
      toast.success(t.steam.linked);
      await refresh();
    } catch (e) {
      if (!ownsMutation(controller)) return;
      toast.error((e as Error).message);
    } finally {
      if (ownsMutation(controller)) setLinkingKey(null);
      finishMutation(controller);
    }
  }

  async function unlink(vnId: string) {
    const controller = beginMutation();
    if (!controller) return;
    const ok = await confirm({ message: t.steam.unlinkConfirm, tone: 'danger' });
    if (!ok || !ownsMutation(controller)) {
      finishMutation(controller);
      return;
    }
    setUnlinkingId(vnId);
    try {
      const r = await fetch(`/api/steam/link?vn_id=${vnId}`, { method: 'DELETE', signal: controller.signal });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(controller)) return;
      toast.success(t.steam.unlinked);
      await refresh();
    } catch (e) {
      if (!ownsMutation(controller)) return;
      toast.error((e as Error).message);
    } finally {
      if (ownsMutation(controller)) setUnlinkingId(null);
      finishMutation(controller);
    }
  }

  const totalPickedMinutes = useMemo(
    () => suggestions.filter((s) => picks.has(s.vn_id)).reduce((a, s) => a + s.delta, 0),
    [suggestions, picks],
  );

  return (
    <div className="w-full">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white md:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-4 sm:p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Gamepad2 className="h-6 w-6 text-accent" aria-hidden /> {t.steam.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.steam.subtitle}</p>
      </header>

      {suggestionsError && (
        <div className="mb-4">
          <ErrorAlert title={t.common.error}>
            <p>{suggestionsError}</p>
            {suggestionsErrorCode === 'steam_not_configured' && (
              <p className="mt-2">
                {t.steam.howToConfigure}{' '}
                <Link href="/data" className="inline-flex items-center gap-1 font-bold text-accent hover:underline">
                  {t.nav.data} <Settings2 className="h-3 w-3" aria-hidden />
                </Link>
              </p>
            )}
          </ErrorAlert>
        </div>
      )}

      {/* Section 1: Suggestions (auto + manual) */}
      <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
          {t.steam.suggestionsTitle}
        </h2>
        {suggestionsLoading ? (
          <SkeletonRows count={5} withThumb={false} />
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted">{t.steam.noSuggestions}</p>
        ) : null}
        {suggestions.length > 0 && (
          <>
            <ul className="space-y-1.5">
              {suggestions.map((s) => {
                const picked = picks.has(s.vn_id);
                return (
                  <li key={s.vn_id}>
                    {/*
                      Was a <li onClick> with no keyboard handler - Tab
                      couldn't reach the toggle, screen readers had no
                      announcement. Now the entire row is a real
                      <button> with role-appropriate aria-pressed.
                    */}
                    <button
                      type="button"
                      onClick={() => togglePick(s.vn_id)}
                      aria-pressed={picked}
                      className={`flex w-full items-center gap-3 rounded-lg border bg-bg-elev/30 p-2 text-left transition-colors ${
                        picked ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-accent/50'
                      }`}
                    >
                      <span
                        aria-hidden
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                          picked ? 'border-accent bg-accent text-bg' : 'border-border'
                        }`}
                      >
                        {picked && <Check className="h-3 w-3" aria-hidden />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-1 text-sm font-bold" title={s.vn_title}>{s.vn_title}</p>
                        <p className="line-clamp-1 text-[11px] text-muted" title={`${s.steam_name} / ${t.steam.appidLabel} ${s.steam_appid}`}>
                          {s.steam_name} / {t.steam.appidLabel} {s.steam_appid}
                        </p>
                      </div>
                      <span className="shrink-0 text-right text-[11px]">
                        <span className="block inline-flex items-center gap-1 text-muted">
                          {fmt(s.current_minutes)}
                          <ArrowRight className="h-3 w-3" aria-hidden />
                          <span className="text-accent">{fmt(s.steam_minutes)}</span>
                        </span>
                        <span className="block font-mono text-[10px] text-accent">+{fmt(s.delta)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {picks.size} {t.steam.selected} / +{fmt(totalPickedMinutes)}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPicks(new Set())} className="btn">
                  {t.steam.deselectAll}
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying || picks.size === 0}
                  className="btn btn-primary"
                >
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
                  {t.steam.apply.replace('{n}', String(picks.size))}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Section 2: Current links */}
      {linksLoading && (
        <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
          <div className="mb-3 h-3 w-28 animate-pulse rounded bg-bg-elev" />
          <SkeletonRows count={4} withThumb={false} />
        </section>
      )}
      {!linksLoading && links.length > 0 && (
        <section className="mb-8 rounded-xl border border-border bg-bg-card p-4 sm:p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {t.steam.linksTitle} <span className="ml-1 text-[10px] font-normal">/ {links.length}</span>
          </h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {links.map((l) => (
              <li
                key={l.vn_id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg-elev/30 p-2 text-[11px]"
              >
                <span className="min-w-0 flex-1">
                  <Link href={`/vn/${l.vn_id}`} className="line-clamp-1 font-bold hover:text-accent" title={l.vn_id}>
                    {l.vn_id}
                  </Link>
                  <span className="line-clamp-1 inline-flex items-center gap-1 text-muted" title={l.steam_name}>
                    <ArrowLeftRight className="h-2.5 w-2.5" aria-hidden /> {l.steam_name}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                    l.source === 'manual' ? 'bg-accent/15 text-accent' : 'bg-bg-elev text-muted'
                  }`}
                >
                  {l.source === 'manual' ? t.steam.linkSource.manual : t.steam.linkSource.auto}
                </span>
                <button
                  type="button"
                  onClick={() => unlink(l.vn_id)}
                  disabled={unlinkingId === l.vn_id}
                  className="tap-target inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:text-status-dropped disabled:opacity-50 sm:min-h-0 sm:min-w-0"
                  aria-label={t.steam.unlink}
                  title={t.steam.unlink}
                >
                  {unlinkingId === l.vn_id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 3: Unlinked Steam games → manual assign */}
      <section className="rounded-xl border border-border bg-bg-card p-4 sm:p-5">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
          {t.steam.unlinkedTitle}
        </h2>
        <p className="mb-3 text-[11px] text-muted">{t.steam.unlinkedHint}</p>
        {unlinkedLoading ? (
          <SkeletonRows count={5} withThumb={false} />
        ) : unlinked.length === 0 ? (
          <p className="text-sm text-muted">{t.steam.empty}</p>
        ) : null}
        <ul className="space-y-2">
          {(showAllUnlinked ? unlinked : unlinked.slice(0, 60)).map((g) => {
            const query = assignQuery[g.appid] ?? '';
            const matches = assignMatches[g.appid] ?? [];
            return (
              <li key={g.appid} className="rounded-lg border border-border bg-bg-elev/30 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{g.name}</span>
                    <span className="ml-2 text-[10px] text-muted">{t.steam.appidLabel} {g.appid} / {fmt(g.minutes)}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-start gap-2">
                  <div className="flex min-h-[44px] flex-1 items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 sm:min-h-0">
                    <Search className="h-3 w-3 text-muted" aria-hidden />
                    <input
                      type="search"
                      inputMode="search"
                      value={query}
                      onChange={(e) => searchAssign(g.appid, e.target.value)}
                      placeholder={t.steam.assignPlaceholder}
                      aria-label={t.steam.assignPlaceholder}
                      className="w-full bg-transparent text-xs focus:outline-none"
                    />
                  </div>
                  <Link2 className="mt-1 h-4 w-4 text-muted" aria-hidden />
                </div>
                {matches.length > 0 && (
                  <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto rounded-md border border-border bg-bg-card p-1">
                    {matches.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => link(g.appid, g.name, m.id)}
                          disabled={linkingKey !== null}
                          className="block min-h-[44px] w-full rounded px-2 py-1 text-left text-xs hover:bg-bg-elev disabled:opacity-50 sm:min-h-0"
                        >
                          {linkingKey === `${g.appid}:${m.id}` && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" aria-hidden />}
                          <span className="font-bold">{m.title}</span>
                          {m.alttitle && <span className="ml-1 text-[10px] text-muted">{m.alttitle}</span>}
                          <span className="ml-1 font-mono text-[10px] text-muted">{m.id}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        {unlinked.length > 60 && (
          <button
            type="button"
            onClick={() => setShowAllUnlinked((v) => !v)}
            className="btn btn-xs mt-3"
          >
            {showAllUnlinked
              ? t.steam.showLess
              : `${t.steam.showAll} (${unlinked.length - 60})`}
          </button>
        )}
      </section>
    </div>
  );
}
