'use client';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ExternalLink,
  Globe,
  Info,
  Languages,
  Mic2,
  Package,
  Plus,
  Shield,
} from 'lucide-react';
import { useLocale, useT } from '@/lib/i18n/client';
import { useSectionCount } from './vn-detail/DetailSectionFrame';
import { platformLabel } from '@/lib/platform-label';
import { formatVndbDateString } from '@/lib/locale-number';
import { SkeletonRows } from './Skeleton';
import { ErrorAlert } from './ErrorAlert';
import {
  OWNED_EDITIONS_EVENT,
  type OwnedEditionsChangedDetail,
} from './ReleaseOwnedToggle';
import type { VndbRelease } from '@/lib/vndb-types';
import { safeHref } from '@/lib/safe-href';

import { readApiError } from '@/lib/api-error-read';
import { decodeOwnedEditionsResponse, decodeVnDetailReleasesResponse } from '@/lib/vn-detail-client-shape';
const VOICED_KEY: Record<number, 'voiced1' | 'voiced2' | 'voiced3' | 'voiced4'> = {
  1: 'voiced1',
  2: 'voiced2',
  3: 'voiced3',
  4: 'voiced4',
};

function fmtRes(r: VndbRelease['resolution']): string | null {
  if (r == null) return null;
  if (typeof r === 'string') return r;
  return `${r[0]}x${r[1]}`;
}

/**
 * One release entry in the list. Memoized so toggling a single
 * release's owned state or the section's loading flags only re-renders
 * the rows whose own props changed.
 */
const ReleaseRow = memo(function ReleaseRow({
  r,
  vnId,
  locale,
  t,
  inCollection,
  isOwned,
  pending,
  onToggle,
}: {
  r: VndbRelease;
  vnId: string;
  locale: ReturnType<typeof useLocale>;
  t: ReturnType<typeof useT>;
  inCollection: boolean;
  isOwned: boolean;
  pending: boolean;
  onToggle: (releaseId: string, isOwned: boolean) => void;
}) {
  const flags: string[] = [];
  if (r.official) flags.push(t.releases.official);
  if (r.patch) flags.push(t.releases.patch);
  if (r.freeware) flags.push(t.releases.freeware);
  if (r.uncensored) flags.push(t.releases.uncensored);
  if (r.has_ero) flags.push(t.releases.hasEro);
  const voicedKey = r.voiced && VOICED_KEY[r.voiced] ? VOICED_KEY[r.voiced] : null;
  const rtype = r.vns.find((v) => v.id === vnId)?.rtype;
  const devList = r.producers.filter((p) => p.developer);
  const pubList = r.producers.filter((p) => p.publisher);
  const res = fmtRes(r.resolution);
  return (
    <li
      className={`rounded-lg border p-4 transition-colors ${
        isOwned ? 'border-status-completed bg-status-completed/5' : 'border-border bg-bg-elev/50'
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex flex-wrap items-baseline gap-2 text-sm font-bold">
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
            <Info className="h-3 w-3" aria-hidden /> {t.releases.viewDetails}
          </Link>
        </h3>
        <div className="flex items-center gap-2">
          {r.released && (
            <span className="text-xs text-muted tabular-nums">
              {formatVndbDateString(r.released, locale)}
            </span>
          )}
          {inCollection && (
            <button
              type="button"
              onClick={() => onToggle(r.id, isOwned)}
              disabled={pending}
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {r.languages.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1">
            <Languages className="h-3 w-3 shrink-0" aria-hidden />
            {r.languages.map((l) => (
              <Link
                key={l.lang}
                href={`/search?langs=${encodeURIComponent(l.lang)}`}
                className="inline-flex items-center rounded border border-border bg-bg-elev/40 px-1 py-0.5 text-[10px] uppercase tracking-wide text-muted transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
              >
                {l.lang}
              </Link>
            ))}
          </span>
        )}
        {r.platforms.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1">
            <Globe className="h-3 w-3 shrink-0" aria-hidden />
            {r.platforms.map((p) => (
              <Link
                key={p}
                href={`/search?platforms=${encodeURIComponent(p)}`}
                title={p}
                aria-label={p}
                className="inline-flex items-center rounded border border-border bg-bg-elev/40 px-1 py-0.5 text-[10px] tracking-wide text-muted transition-colors hover:border-accent hover:bg-accent/10 hover:text-accent"
              >
                {platformLabel(p)}
              </Link>
            ))}
          </span>
        )}
        {res && <span>{t.releases.resolution}: {res}</span>}
        {r.engine && <span>{t.releases.engine}: {r.engine}</span>}
        {voicedKey && (
          <span className="inline-flex items-center gap-1">
            <Mic2 className="h-3 w-3" aria-hidden /> {t.releases[voicedKey]}
          </span>
        )}
        {r.minage != null && (
          <span className="inline-flex items-center gap-1">
            <Shield className="h-3 w-3" aria-hidden /> {t.releases.ageRating} {r.minage}+
          </span>
        )}
        {r.media.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Package className="h-3 w-3" aria-hidden /> {r.media.map((m) => `${m.medium}${m.qty > 1 ? `x${m.qty}` : ''}`).join(', ')}
          </span>
        )}
      </div>
      {(devList.length > 0 || pubList.length > 0) && (
        <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] text-muted">
          {devList.map((p, i) => (
            <span key={`dev-${p.id}`} className="inline-flex items-baseline gap-1">
              {i > 0 && <span aria-hidden>/</span>}
              <Link
                href={`/producer/${p.id}`}
                className="font-bold text-white/80 transition-colors hover:text-accent"
                title={p.name}
              >
                {p.name}
              </Link>
            </span>
          ))}
          {devList.length > 0 && pubList.length > 0 && <span aria-hidden>/</span>}
          {pubList.map((p, i) => (
            <span key={`pub-${p.id}`} className="inline-flex items-baseline gap-1">
              {i > 0 && <span aria-hidden>/</span>}
              <Link
                href={`/producer/${p.id}`}
                className="transition-colors hover:text-accent"
                title={p.name}
              >
                {p.name}
              </Link>
            </span>
          ))}
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
          {r.gtin && r.catalog && <span> / </span>}
          {r.catalog && <span>{t.releases.catalog}: <span className="font-mono">{r.catalog}</span></span>}
        </div>
      )}
      {r.extlinks.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {r.extlinks.slice(0, 6).map((l) => {
            const href = safeHref(l.url);
            if (!href) return null;
            return (
              <a
                key={l.url}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-0.5 text-[11px] text-muted hover:border-accent hover:text-accent"
              >
                <ExternalLink className="h-3 w-3" aria-hidden /> {l.label}
              </a>
            );
          })}
        </div>
      )}
    </li>
  );
});

export function ReleasesSection({
  vnId,
  inCollection = false,
}: {
  vnId: string;
  inCollection?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [releases, setReleases] = useState<VndbRelease[] | null>(null);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const identityRef = useRef<string | null>(vnId);
  const mutationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    identityRef.current = vnId;
    pendingRef.current = false;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    setPendingId(null);
    setOwned(new Set());
    return () => {
      identityRef.current = null;
      pendingRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [vnId]);

  useEffect(() => {
    const ac = new AbortController();
    setReleases(null);
    setLoading(true);
    setError(null);
    fetch(`/api/vn/${vnId}/releases`, { cache: 'no-store', signal: ac.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(await readApiError(r, t.common.error));
        return r.json();
      })
      .then((d) => {
        const releases = decodeVnDetailReleasesResponse(d);
        if (!releases) throw new Error(t.common.error);
        if (!ac.signal.aborted) setReleases(releases);
      })
      .catch((e: Error) => {
        if (e.name === 'AbortError' || ac.signal.aborted) return;
        setError(e.message);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [vnId, t.common.error]);

  const refreshOwned = useCallback(async (signal?: AbortSignal) => {
    const ownerVnId = vnId;
    if (!inCollection) {
      if (identityRef.current === ownerVnId) setOwned(new Set());
      return;
    }
    try {
      const r = await fetch(`/api/collection/${vnId}/owned-releases`, { cache: 'no-store', signal });
      if (!r.ok) return;
      const d = decodeOwnedEditionsResponse(await r.json());
      if (!d) return;
      if (signal?.aborted || identityRef.current !== ownerVnId) return;
      setOwned(new Set(d.map((o) => o.release_id)));
    } catch (e) {
      if ((e as Error).name === 'AbortError' || signal?.aborted) return;
      // ignore
    }
  }, [vnId, inCollection]);

  useEffect(() => {
    const ctrl = new AbortController();
    refreshOwned(ctrl.signal);
    return () => ctrl.abort();
  }, [refreshOwned]);

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

  const toggleOwned = useCallback(async (releaseId: string, isOwned: boolean) => {
    if (!inCollection || pendingRef.current) return;
    const ownerVnId = vnId;
    const controller = new AbortController();
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = controller;
    pendingRef.current = true;
    setPendingId(releaseId);
    try {
      const url = isOwned
        ? `/api/collection/${vnId}/owned-releases?release_id=${encodeURIComponent(releaseId)}`
        : `/api/collection/${vnId}/owned-releases`;
      const init: RequestInit = isOwned
        ? { method: 'DELETE', signal: controller.signal }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ release_id: releaseId }), signal: controller.signal };
      const r = await fetch(url, init);
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (controller.signal.aborted || mutationAbortRef.current !== controller || identityRef.current !== ownerVnId) return;
      setOwned((prev) => {
        const next = new Set(prev);
        if (isOwned) next.delete(releaseId);
        else next.add(releaseId);
        return next;
      });
      window.dispatchEvent(
        new CustomEvent<OwnedEditionsChangedDetail>(OWNED_EDITIONS_EVENT, {
          detail: { vnId, releaseId, isNowOwned: !isOwned },
        }),
      );
    } catch (e) {
      if (controller.signal.aborted || mutationAbortRef.current !== controller || identityRef.current !== ownerVnId || (e instanceof Error && e.name === 'AbortError')) return;
      setError((e as Error).message);
    } finally {
      if (mutationAbortRef.current !== controller || identityRef.current !== ownerVnId) return;
      mutationAbortRef.current = null;
      pendingRef.current = false;
      setPendingId(null);
    }
  }, [inCollection, vnId, t.common.error]);

  useSectionCount(releases ? releases.length : null);

  return (
    <div className="px-6 py-5" aria-busy={loading || undefined}>
      {loading && <SkeletonRows count={4} withThumb={false} />}
      {error && <ErrorAlert title={t.common.error}>{error}</ErrorAlert>}
      {!loading && releases && releases.length === 0 && <p className="text-sm text-muted">{t.releases.empty}</p>}
      {releases && releases.length > 0 && (
        <ul className="space-y-3">
          {releases.map((r) => (
            <ReleaseRow
              key={r.id}
              r={r}
              vnId={vnId}
              locale={locale}
              t={t}
              inCollection={inCollection}
              isOwned={owned.has(r.id)}
              pending={pendingId !== null}
              onToggle={toggleOwned}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
