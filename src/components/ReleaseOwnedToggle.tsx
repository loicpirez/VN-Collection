'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

import { readApiError } from '@/lib/api-error-read';
/**
 * Custom event broadcast by every component that mutates owned-edition
 * state for a VN. Listeners (OwnedEditionsSection, ReleasesSection,
 * any future widget) re-fetch their own slice rather than waiting on a
 * full router.refresh().
 *
 * `detail.vnId` lets a strip filter out events for VNs it doesn't care
 * about. `detail.releaseId` is informative - useful for optimistic
 * highlights but not required for the refetch path.
 */
export const OWNED_EDITIONS_EVENT = 'vn:owned-editions-changed';

export interface OwnedEditionsChangedDetail {
  vnId: string;
  releaseId: string;
  isNowOwned: boolean;
}

interface Props {
  vnId: string;
  vnTitle: string;
  vnRelation: 'trial' | 'partial' | 'complete';
  releaseId: string;
  initialInCollection: boolean;
  initialOwned: boolean;
}

/**
 * Toggle owned-state for `releaseId` under `vnId`. Used on /release/[id] so a
 * user can flip the inventory state without navigating to /vn/[id] first.
 * The "Edit" button just deep-links to /vn/[vnId]#editions so they can fill in
 * location, edition_label, price etc. there.
 *
 * On success we broadcast `OWNED_EDITIONS_EVENT` so OwnedEditionsSection
 * and any other live consumer can append/remove the edition without a
 * full page reload.
 */
export function ReleaseOwnedToggle({
  vnId,
  vnTitle,
  vnRelation,
  releaseId,
  initialInCollection,
  initialOwned,
}: Props) {
  const t = useT();
  const toast = useToast();
  const [inCollection, setInCollection] = useState(initialInCollection);
  const [owned, setOwned] = useState(initialOwned);
  const [busy, setBusy] = useState(false);
  const identity = `${vnId}|${releaseId}`;
  const identityRef = useRef(identity);
  const mountedRef = useRef(true);
  const mutationAbortRef = useRef<AbortController | null>(null);
  const mutationInFlightRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    identityRef.current = identity;
    mutationAbortRef.current?.abort();
    mutationAbortRef.current = null;
    mutationInFlightRef.current = false;
    setInCollection(initialInCollection);
    setOwned(initialOwned);
    setBusy(false);
    return () => {
      mountedRef.current = false;
      mutationAbortRef.current?.abort();
      mutationAbortRef.current = null;
    };
  }, [identity, initialInCollection, initialOwned]);

  function ownsMutation(ownerIdentity: string, controller: AbortController): boolean {
    return mountedRef.current &&
      identityRef.current === ownerIdentity &&
      mutationAbortRef.current === controller &&
      !controller.signal.aborted;
  }

  async function toggle() {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const controller = new AbortController();
    mutationAbortRef.current = controller;
    const ownerIdentity = identity;
    setBusy(true);
    try {
      if (!owned && !inCollection) {
        const add = await fetch(`/api/collection/${vnId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'planning' }),
          signal: controller.signal,
        });
        if (!add.ok) throw new Error(await readApiError(add, t.common.error));
        if (!ownsMutation(ownerIdentity, controller)) return;
        setInCollection(true);
      }
      const r = owned
        ? await fetch(`/api/collection/${vnId}/owned-releases?release_id=${encodeURIComponent(releaseId)}`, {
            method: 'DELETE',
            signal: controller.signal,
          })
        : await fetch(`/api/collection/${vnId}/owned-releases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ release_id: releaseId }),
            signal: controller.signal,
          });
      if (!r.ok) throw new Error(await readApiError(r, t.common.error));
      if (!ownsMutation(ownerIdentity, controller)) return;
      const nowOwned = !owned;
      setOwned(nowOwned);
      toast.success(nowOwned ? t.toast.added : t.toast.removed);
      // Broadcast so OwnedEditionsSection (and any future listener) refetches
      // immediately instead of waiting on router.refresh() - which would re-run
      // the entire server tree for a single per-edition toggle.
      window.dispatchEvent(
        new CustomEvent<OwnedEditionsChangedDetail>(OWNED_EDITIONS_EVENT, {
          detail: { vnId, releaseId, isNowOwned: nowOwned },
        }),
      );
    } catch (e) {
      if (!ownsMutation(ownerIdentity, controller) || (e instanceof Error && e.name === 'AbortError')) return;
      toast.error((e as Error).message);
    } finally {
      if (identityRef.current === ownerIdentity && mutationAbortRef.current === controller) {
        mutationAbortRef.current = null;
        mutationInFlightRef.current = false;
        setBusy(false);
      }
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
        owned ? 'border-status-completed/50 bg-status-completed/5' : 'border-border bg-bg-elev/30'
      }`}
    >
      <Link href={`/vn/${vnId}#my-editions`} className="min-w-0 flex-1 text-xs text-muted hover:text-accent">
        <span className="inline-flex max-w-full items-center gap-1">
          <ArrowRight className="h-3 w-3 shrink-0" aria-hidden />
          <span className="truncate font-semibold text-white/90">{vnTitle}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px]">
          <span className="font-mono">{vnId}</span>
          <span className="rounded bg-bg px-1 py-0.5 uppercase tracking-wider">
            {t.releases.rtype[vnRelation]}
          </span>
        </span>
      </Link>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={owned}
          className={`inline-flex min-h-[44px] items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 sm:min-h-0 ${
            owned
              ? 'border-status-completed bg-status-completed/15 text-status-completed'
              : 'border-border bg-bg text-muted hover:border-accent hover:text-white'
          }`}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : owned ? (
            <Check className="h-3 w-3" aria-hidden />
          ) : (
            <Plus className="h-3 w-3" aria-hidden />
          )}
          {owned ? t.releases.ownedYes : t.releases.markOwned}
        </button>
        {owned && (
          <Link
            href={`/vn/${vnId}?edit_release=${encodeURIComponent(releaseId)}#my-editions`}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent sm:min-h-0"
          >
            <Pencil className="h-3 w-3" aria-hidden />
            {t.releases.editInventory}
          </Link>
        )}
        {owned && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded text-muted hover:bg-status-dropped/10 hover:text-status-dropped sm:min-h-[24px] sm:min-w-[24px]"
            title={t.releases.removeMyEdition}
            aria-label={t.releases.removeMyEdition}
          >
            <Trash2 className="h-3 w-3" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
