'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Check, Loader2, Pencil, Trash2 } from 'lucide-react';
import { useToast } from './ToastProvider';
import { useT } from '@/lib/i18n/client';

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
 */
export function ReleaseOwnedToggle({ vnId, releaseId, initialOwned }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [owned, setOwned] = useState(initialOwned);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

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
      setOwned(!owned);
      toast.success(owned ? t.toast.removed : t.toast.added);
      startTransition(() => router.refresh());
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
      <Link href={`/vn/${vnId}`} className="text-xs text-muted hover:text-accent">
        → <span className="font-mono">{vnId}</span>
      </Link>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
            owned
              ? 'border-status-completed bg-status-completed/15 text-status-completed'
              : 'border-border bg-bg text-muted hover:border-accent hover:text-white'
          }`}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : owned ? (
            <Check className="h-3 w-3" />
          ) : null}
          {owned ? t.releases.ownedYes : t.releases.markOwned}
        </button>
        {owned && (
          <Link
            href={`/vn/${vnId}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-bg px-2 py-1 text-[11px] text-muted hover:border-accent hover:text-accent"
          >
            <Pencil className="h-3 w-3" />
            {t.releases.editInventory}
          </Link>
        )}
        {owned && (
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="inline-flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-status-dropped/10 hover:text-status-dropped"
            title={t.common.delete}
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}
