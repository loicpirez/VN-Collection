'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

/**
 * Custom event broadcast by every component that mutates owned-edition
 * state for a VN. Listeners (OwnedEditionsSection, ReleasesSection,
 * any future widget) re-fetch their own slice rather than waiting on a
 * full router.refresh().
 *
 * `detail.vnId` lets a strip filter out events for VNs it doesn't care
 * about. `detail.releaseId` is informative — useful for optimistic
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
  releaseId: string;
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
export function ReleaseOwnedToggle({ vnId, releaseId, initialOwned }: Props) {
  const t = useT();
  const toast = useToast();
  const [owned, setOwned] = useState(initialOwned);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const url = owned
        ? `/api/collection/${vnId}/owned-releases?release_id=${encodeURIComponent(releaseId)}`
        : `/api/collection/${vnId}/owned-releases`;
      const init: RequestInit = owned
        ? { method: 'DELETE' }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ release_id: releaseId }),
          };
      const r = await fetch(url, init);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      const nowOwned = !owned;
      setOwned(nowOwned);
      toast.success(nowOwned ? t.toast.added : t.toast.removed);
      // Broadcast so OwnedEditionsSection (and any future listener) refetches
      // immediately instead of waiting on router.refresh() — which would re-run
      // the entire server tree for a single per-edition toggle.
      window.dispatchEvent(
        new CustomEvent<OwnedEditionsChangedDetail>(OWNED_EDITIONS_EVENT, {
          detail: { vnId, releaseId, isNowOwned: nowOwned },
        }),
      );
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
        owned ? 'border-status-completed/50 bg-status-completed/5' : 'border-border bg-bg-elev/30'
      }`}
    >
      <Link href={`/vn/${vnId}`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-accent">
        <ArrowRight className="h-3 w-3" aria-hidden />
        <span className="font-mono">{vnId}</span>
      </Link>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          aria-pressed={owned}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
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
            href={`/vn/${vnId}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
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
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-status-dropped/10 hover:text-status-dropped"
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
