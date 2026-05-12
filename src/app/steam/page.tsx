'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Gamepad2, Link2, Loader2, Search, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from '@/components/ToastProvider';
import { SkeletonRows } from '@/components/Skeleton';

interface Suggestion {
  vn_id: string;
  vn_title: string;
  steam_appid: number;
  steam_name: string;
  current_minutes: number;
  steam_minutes: number;
  delta: number;
}

interface SteamLink {
  vn_id: string;
  appid: number;
  steam_name: string;
  source: 'auto' | 'manual';
  last_synced_minutes: number | null;
  created_at: number;
  updated_at: number;
}

interface UnlinkedGame {
  appid: number;
  name: string;
  minutes: number;
}

interface CollectionMatch {
  id: string;
  title: string;
  alttitle: string | null;
}

function fmt(m: number): string {
  if (m <= 0) return '0';
  const h = Math.floor(m / 60);
  const mn = m % 60;
  if (h && mn) return `${h}h ${mn}m`;
  if (h) return `${h}h`;
  return `${mn}m`;
}

export default function SteamSyncPage() {
  const t = useT();
  const toast = useToast();
  const router = useRouter();

  // Suggestions (auto+manual links where Steam > local)
  const [suggestionsLoading, setSuggestionsLoading] = useState(true);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [picks, setPicks] = useState<Set<string>>(new Set());

  // Unlinked Steam games (for the manual mapper)
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);
  const [unlinked, setUnlinked] = useState<UnlinkedGame[]>([]);

  // Currently-stored links (auto + manual)
  const [links, setLinks] = useState<SteamLink[]>([]);

  // Per-row manual-assign state: { [appid]: { query, matches[] } }
  const [assignQuery, setAssignQuery] = useState<Record<number, string>>({});
  const [assignMatches, setAssignMatches] = useState<Record<number, CollectionMatch[]>>({});

  const [applying, setApplying] = useState(false);

  const refresh = useCallback(async () => {
    setSuggestionsLoading(true);
    setUnlinkedLoading(true);
    try {
      const [sync, lib, ls] = await Promise.all([
        fetch('/api/steam/sync').then((r) => r.json()),
        fetch('/api/steam/library').then((r) => r.json()),
        fetch('/api/steam/link').then((r) => r.json()),
      ]);
      if (sync.ok) {
        const sugg: Suggestion[] = sync.suggestions ?? [];
        setSuggestions(sugg);
        setPicks(new Set(sugg.map((s) => s.vn_id)));
        setSuggestionsError(null);
      } else {
        setSuggestionsError(sync.error ?? t.common.error);
      }
      setUnlinked(lib.ok ? (lib.games ?? []) : []);
      setLinks(ls.links ?? []);
    } catch (e) {
      setSuggestionsError((e as Error).message);
    } finally {
      setSuggestionsLoading(false);
      setUnlinkedLoading(false);
    }
  }, [t.common.error]);

  useEffect(() => { refresh(); }, [refresh]);

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
    if (applies.length === 0) return;
    setApplying(true);
    try {
      const r = await fetch('/api/steam/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applies }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const d = (await r.json()) as { applied: number };
      toast.success(t.steam.applied.replace('{n}', String(d.applied)));
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  async function searchAssign(appid: number, query: string) {
    setAssignQuery((s) => ({ ...s, [appid]: query }));
    if (query.trim().length < 1) {
      setAssignMatches((s) => ({ ...s, [appid]: [] }));
      return;
    }
    const r = await fetch(`/api/collection/find?q=${encodeURIComponent(query)}`);
    const d = (await r.json()) as { matches: CollectionMatch[] };
    setAssignMatches((s) => ({ ...s, [appid]: d.matches }));
  }

  async function link(appid: number, name: string, vnId: string) {
    try {
      const r = await fetch('/api/steam/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vn_id: vnId, appid, steam_name: name }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.steam.linked);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function unlink(vnId: string) {
    if (!confirm(t.steam.unlinkConfirm)) return;
    try {
      const r = await fetch(`/api/steam/link?vn_id=${vnId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(t.common.error);
      toast.success(t.steam.unlinked);
      await refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const totalPickedMinutes = useMemo(
    () => suggestions.filter((s) => picks.has(s.vn_id)).reduce((a, s) => a + s.delta, 0),
    [suggestions, picks],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/data" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-white">
        <ArrowLeft className="h-4 w-4" /> {t.nav.data}
      </Link>

      <header className="mb-6 rounded-2xl border border-border bg-bg-card p-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold">
          <Gamepad2 className="h-6 w-6 text-accent" /> {t.steam.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{t.steam.subtitle}</p>
      </header>

      {suggestionsError && (
        <div className="mb-4 rounded-xl border border-status-on_hold/40 bg-status-on_hold/10 p-4 text-sm">
          <p className="font-semibold text-status-on_hold">{suggestionsError}</p>
          {suggestionsError.toLowerCase().includes('steam not configured') && (
            <p className="mt-2 text-xs text-muted">
              {t.steam.howToConfigure} <Link href="/data" className="font-bold text-accent hover:underline">{t.nav.data}</Link> → ⚙
            </p>
          )}
        </div>
      )}

      {/* Section 1: Suggestions (auto + manual) */}
      <section className="mb-8 rounded-xl border border-border bg-bg-card p-5">
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
                  <li
                    key={s.vn_id}
                    onClick={() => togglePick(s.vn_id)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border bg-bg-elev/30 p-2 transition-colors ${
                      picked ? 'border-accent ring-1 ring-accent/30' : 'border-border hover:border-accent/50'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                        picked ? 'border-accent bg-accent text-bg' : 'border-border'
                      }`}
                    >
                      {picked && <Check className="h-3 w-3" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-sm font-bold">{s.vn_title}</p>
                      <p className="line-clamp-1 text-[10px] text-muted">{s.steam_name} · appid {s.steam_appid}</p>
                    </div>
                    <span className="shrink-0 text-right text-[11px]">
                      <span className="block text-muted">
                        {fmt(s.current_minutes)} → <span className="text-accent">{fmt(s.steam_minutes)}</span>
                      </span>
                      <span className="block font-mono text-[10px] text-accent">+{fmt(s.delta)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
              <span>
                {picks.size} {t.steam.selected} · +{fmt(totalPickedMinutes)}
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
                  {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {t.steam.apply.replace('{n}', String(picks.size))}
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Section 2: Current links */}
      {links.length > 0 && (
        <section className="mb-8 rounded-xl border border-border bg-bg-card p-5">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
            {t.steam.linksTitle} <span className="ml-1 text-[10px] font-normal">· {links.length}</span>
          </h2>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {links.map((l) => (
              <li
                key={l.vn_id}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-bg-elev/30 p-2 text-[11px]"
              >
                <span className="min-w-0 flex-1">
                  <Link href={`/vn/${l.vn_id}`} className="line-clamp-1 font-bold hover:text-accent">
                    {l.vn_id}
                  </Link>
                  <span className="line-clamp-1 text-muted">↔ {l.steam_name}</span>
                </span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                    l.source === 'manual' ? 'bg-accent/15 text-accent' : 'bg-bg-elev text-muted'
                  }`}
                >
                  {l.source}
                </span>
                <button
                  type="button"
                  onClick={() => unlink(l.vn_id)}
                  className="rounded text-muted hover:text-status-dropped"
                  title={t.steam.unlinkConfirm}
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Section 3: Unlinked Steam games → manual assign */}
      <section className="rounded-xl border border-border bg-bg-card p-5">
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
          {unlinked.slice(0, 60).map((g) => {
            const query = assignQuery[g.appid] ?? '';
            const matches = assignMatches[g.appid] ?? [];
            return (
              <li key={g.appid} className="rounded-lg border border-border bg-bg-elev/30 p-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{g.name}</span>
                    <span className="ml-2 text-[10px] text-muted">appid {g.appid} · {fmt(g.minutes)}</span>
                  </span>
                </div>
                <div className="mt-2 flex items-start gap-2">
                  <div className="flex items-center gap-1 rounded-md border border-border bg-bg-card px-2 py-1 flex-1">
                    <Search className="h-3 w-3 text-muted" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => searchAssign(g.appid, e.target.value)}
                      placeholder={t.steam.assignPlaceholder}
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
                          className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-bg-elev"
                        >
                          <span className="font-bold">{m.title}</span>
                          {m.alttitle && <span className="ml-1 text-[10px] text-muted">{m.alttitle}</span>}
                          <span className="ml-1 font-mono text-[9px] text-muted">{m.id}</span>
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
          <p className="mt-2 text-[11px] text-muted">+ {unlinked.length - 60} {t.steam.moreUnlinked}</p>
        )}
      </section>
    </div>
  );
}
