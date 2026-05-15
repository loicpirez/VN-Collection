'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Loader2, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

interface Props {
  vnId: string;
  /** When true, the VN is in the local collection; we surface a Remove button instead of Add. */
  inCollection: boolean;
  /** Current local status if any — drives the "Add to wishlist" vs "Wishlisted" affordance. */
  status: string | null | undefined;
}

/**
 * Three compact buttons that sit on top of the hero cover area:
 *
 *   - "Add to collection" — when the VN isn't in the local collection
 *     yet. Uses status=planning (= VNDB Wishlist semantic).
 *   - "Remove from collection" — when in-collection. Deletes the row.
 *   - "Wishlist toggle" — flips between status=planning and clearing
 *     the status. Lets the user mark wishlist without going through
 *     the form below.
 *
 * The buttons live in the action bar next to "View on VNDB" etc. — see
 * /vn/[id]/page.tsx for placement.
 */
export function CoverQuickActions({ vnId, inCollection, status }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function addToCollection() {
    setBusy('add');
    try {
      const r = await fetch(`/api/collection/${vnId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.toast.added);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function removeFromCollection() {
    const ok = await confirm({ message: t.coverActions.removeConfirm, tone: 'danger' });
    if (!ok) return;
    setBusy('remove');
    try {
      const r = await fetch(`/api/collection/${vnId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error(t.common.error);
      toast.success(t.coverActions.removed);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function toggleWishlist() {
    setBusy('wish');
    try {
      if (status === 'planning') {
        // Already wishlisted — clearing local status by removing is the
        // simplest semantic. The user can always re-add. Inline the DELETE
        // here so we don't ask for two confirmations (the inner one warns
        // about the collection again, which is what we already confirmed).
        const ok = await confirm({ message: t.coverActions.unwishConfirm, tone: 'danger' });
        if (!ok) {
          setBusy(null);
          return;
        }
        const r = await fetch(`/api/collection/${vnId}`, { method: 'DELETE' });
        if (!r.ok) throw new Error(t.common.error);
        toast.success(t.coverActions.unwishlisted);
        startTransition(() => router.refresh());
        return;
      }
      // Not in collection or different status — set to planning.
      const method = inCollection ? 'PATCH' : 'POST';
      const r = await fetch(`/api/collection/${vnId}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'planning' }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      toast.success(t.coverActions.wishlisted);
      startTransition(() => router.refresh());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {!inCollection ? (
        <button type="button" className="btn btn-primary" onClick={addToCollection} disabled={busy !== null}>
          {busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t.coverActions.addToCollection}
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={removeFromCollection}
          disabled={busy !== null}
          title={t.coverActions.removeFromCollection}
        >
          {busy === 'remove' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-status-dropped" />}
          {t.coverActions.removeFromCollection}
        </button>
      )}
      <button
        type="button"
        className={`btn ${status === 'planning' ? 'btn-primary' : ''}`}
        onClick={toggleWishlist}
        disabled={busy !== null}
        title={status === 'planning' ? t.coverActions.unwish : t.coverActions.wishlist}
      >
        {busy === 'wish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Heart className={`h-4 w-4 ${status === 'planning' ? 'fill-current' : ''}`} />}
        {status === 'planning' ? t.coverActions.wishlisted : t.coverActions.wishlist}
      </button>
    </>
  );
}
