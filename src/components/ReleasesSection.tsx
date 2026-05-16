'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Info,
  Languages,
  Mic2,
  Package,
  Plus,
  Shield,
} from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { LangFlag } from './LangFlag';
import { SkeletonRows } from './Skeleton';
import {
  OWNED_EDITIONS_EVENT,
  type OwnedEditionsChangedDetail,
} from './ReleaseOwnedToggle';
import type { VndbRelease } from '@/lib/vndb-types';

const VOICED_KEY: Record<number, 'voiced1' | 'voiced2' | 'voiced3' | 'voiced4'> = {
  1: 'voiced1',
  2: 'voiced2',
  3: 'voiced3',
  4: 'voiced4',
};

function fmtRes(r: VndbRelease['resolution']): string | null {
  if (r == null) return null;
  if (typeof r === 'string') return r;
  return `${r[0]}×${r[1]}`;
}

interface OwnedEntry { release_id: string }

export function ReleasesSection({ vnId, inCollection = false }: { vnId: string; inCollection?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState<VndbRelease[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || releases !== null) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/vn/${vnId}/releases`, { signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
        return r.json();
      })
      .then((d: { releases: VndbRelease[] }) => {
        if (!ac.signal.aborted) setReleases(d.releases);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError' || ac.signal.aborted) return;
        setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [open, vnId, releases, t.common.error]);

  const refreshOwned = useCallback(async () => {
    if (!inCollection) return;
    try {
      const r = await fetch(`/api/collection/${vnId}/owned-releases`);
      if (!r.ok) return;
      const d = (await r.json()) as { owned: OwnedEntry[] };
      setOwned(new Set(d.owned.map((o) => o.release_id)));
    } catch {
      // ignore
    }
  }, [vnId, inCollection]);

  useEffect(() => {
    if (open) refreshOwned();
  }, [open, refreshOwned]);

  // Keep the local "owned" set in sync with mutations coming from
  // elsewhere — primarily OwnedEditionsSection removing a tile, or the
  // /release/[id] page's ReleaseOwnedToggle.
  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<OwnedEditionsChangedDetail>).detail;
      if (!detail || detail.vnId !== vnId) return;
      setOwned((prev) => {
        const next = new Set(prev);
        if (detail.isNowOwned) next.add(detail.releaseId);
        else next.delete(detail.releaseId);
        return next;
      });
    }
    window.addEventListener(OWNED_EDITIONS_EVENT, onChange);
    return () => window.removeEventListener(OWNED_EDITIONS_EVENT, onChange);
  }, [vnId]);

  async function toggleOwned(releaseId: string) {
    if (!inCollection || pendingId) return;
    const isOwned = owned.has(releaseId);
    setPendingId(releaseId);
    try {
      const url = isOwned
        ? `/api/collection/${vnId}/owned-releases?release_id=${encodeURIComponent(releaseId)}`
        : `/api/collection/${vnId}/owned-releases`;
      const init: RequestInit = isOwned
        ? { method: 'DELETE' }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release_id: releaseId }) };
      const r = await fetch(url, init);
      if (!r.ok) throw new Error(t.common.error);
      const next = new Set(owned);
      if (isOwned) next.delete(releaseId);
      else next.add(releaseId);
      setOwned(next);
      // Tell OwnedEditionsSection / any other listener so the My-Editions
      // section appends/removes the tile without waiting on the user to
      // refresh the page.
      window.dispatchEvent(
        new CustomEvent<OwnedEditionsChangedDetail>(OWNED_EDITIONS_EVENT, {
          detail: { vnId, releaseId, isNowOwned: !isOwned },
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <details
      className="group rounded-xl border border-border bg-bg-card"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-6 py-4 hover:bg-bg-elev/50">
        <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted">
          <Boxes className="h-4 w-4 text-accent" /> {t.releases.section}
          {releases && <span className="text-[11px] font-normal text-muted">· {releases.length}</span>}
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
      </summary>
      <div className="border-t border-border px-6 py-5">
        {loading && <SkeletonRows count={4} withThumb={false} />}
        {error && <p className="text-sm text-status-dropped">{error}</p>}
        {!loading && releases && releases.length === 0 && <p className="text-sm text-muted">{t.releases.empty}</p>}
        {releases && releases.length > 0 && (
          <ul className="space-y-3">
            {releases.map((r) => {
              const platforms = r.platforms.join(', ');
              const flags: string[] = [];
              if (r.official) flags.push(t.releases.official);
              if (r.patch) flags.push(t.releases.patch);
              if (r.freeware) flags.push(t.releases.freeware);
              if (r.uncensored) flags.push(t.releases.uncensored);
              if (r.has_ero) flags.push(t.releases.hasEro);
              const voicedKey = r.voiced && VOICED_KEY[r.voiced] ? VOICED_KEY[r.voiced] : null;
              const rtype = r.vns.find((v) => v.id === vnId)?.rtype;
              const dev = r.producers.filter((p) => p.developer).map((p) => p.name).join(', ');
              const pub = r.producers.filter((p) => p.publisher).map((p) => p.name).join(', ');
              const res = fmtRes(r.resolution);
              const isOwned = owned.has(r.id);
              return (
                <li
                  key={r.id}
                  className={`rounded-lg border p-4 transition-colors ${
                    isOwned ? 'border-status-completed bg-status-completed/5' : 'border-border bg-bg-elev/50'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h4 className="flex flex-wrap items-baseline gap-2 text-sm font-bold">
                      {isOwned && (
                        <Check
                          className="inline h-3 w-3 shrink-0 text-status-completed"
                          aria-label={t.releases.ownedYes}
                        />
                      )}
                      <Link href={`/release/${r.id}`} className="hover:text-accent">
                        {r.title}
                      </Link>
                      {rtype && (
                        <span className="rounded-md bg-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-accent">
                          {t.releases.rtype[rtype]}
                        </span>
                      )}
                      <Link
                        href={`/release/${r.id}`}
                        className="inline-flex items-center gap-0.5 rounded bg-bg px-1.5 py-0.5 text-[10px] font-normal text-muted hover:bg-accent hover:text-bg"
                        title={t.releases.viewDetails}
                      >
                        <Info className="h-3 w-3" /> {t.releases.viewDetails}
                      </Link>
                    </h4>
                    <div className="flex items-center gap-2">
                      {r.released && <span className="text-xs text-muted tabular-nums">{r.released}</span>}
                      {inCollection && (
                        <button
                          type="button"
                          onClick={() => toggleOwned(r.id)}
                          disabled={pendingId === r.id}
                          aria-pressed={isOwned}
                          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                            isOwned
                              ? 'border-status-completed bg-status-completed/20 text-status-completed'
                              : 'border-border bg-bg text-muted hover:border-accent hover:text-white'
                          }`}
                          title={isOwned ? t.releases.removeMyEdition : t.releases.markOwned}
                        >
                          {isOwned
                            ? <Check className="h-3 w-3" aria-hidden />
                            : <Plus className="h-3 w-3" aria-hidden />}
                          {isOwned ? t.releases.ownedYes : t.releases.markOwned}
                        </button>
                      )}
                    </div>
                  </div>
                  {r.alttitle && r.alttitle !== r.title && (
                    <div className="mt-0.5 text-xs text-muted">{r.alttitle}</div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                    {r.languages.length > 0 && (
                      <span className="inline-flex items-baseline gap-1">
                        <Languages className="h-3 w-3" />
                        {r.languages.map((l) => (
                          <LangFlag key={l.lang} lang={l.lang} className="text-xs" />
                        ))}
                      </span>
                    )}
                    {platforms && (
                      <span className="inline-flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {platforms}
                      </span>
                    )}
                    {res && <span>{t.releases.resolution}: {res}</span>}
                    {r.engine && <span>{t.releases.engine}: {r.engine}</span>}
                    {voicedKey && (
                      <span className="inline-flex items-center gap-1">
                        <Mic2 className="h-3 w-3" /> {t.releases[voicedKey]}
                      </span>
                    )}
                    {r.minage != null && (
                      <span className="inline-flex items-center gap-1">
                        <Shield className="h-3 w-3" /> {t.releases.ageRating} {r.minage}+
                      </span>
                    )}
                    {r.media.length > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Package className="h-3 w-3" /> {r.media.map((m) => `${m.medium}${m.qty > 1 ? `×${m.qty}` : ''}`).join(', ')}
                      </span>
                    )}
                  </div>
                  {(dev || pub) && (
                    <div className="mt-2 text-[11px] text-muted">
                      {dev && <span><b className="text-white/80">{dev}</b></span>}
                      {dev && pub && <span> · </span>}
                      {pub && <span>{pub}</span>}
                    </div>
                  )}
                  {flags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {flags.map((f) => (
                        <span key={f} className="rounded bg-bg px-1.5 py-0.5 text-[10px] text-accent">
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                  {(r.gtin || r.catalog) && (
                    <div className="mt-2 text-[11px] text-muted">
                      {r.gtin && <span>{t.releases.gtin}: <span className="font-mono">{r.gtin}</span></span>}
                      {r.gtin && r.catalog && <span> · </span>}
                      {r.catalog && <span>{t.releases.catalog}: <span className="font-mono">{r.catalog}</span></span>}
                    </div>
                  )}
                  {r.extlinks.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.extlinks.slice(0, 6).map((l) => (
                        <a
                          key={l.url}
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
                        >
                          <ExternalLink className="h-3 w-3" /> {l.label}
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
