'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Loader2, Plus, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmDialog';

interface Props {
  vnId: string;
  /** When true, the VN is in the local collection; we surface a Remove button instead of Add. */
  inCollection: boolean;
}

interface WishlistState {
  loading: boolean;
  /** False when no VNDB token is set or the VN is synthetic (egs_*); we hide the heart toggle. */
  available: boolean;
  /** True when label 5 is present on the user's VNDB ulist entry for this VN. */
  onWishlist: boolean;
}

/**
 * Compact action buttons that sit on top of the VN hero cover area.
 *
 * Two independent concerns:
 *
 *   1. Local collection — "Add to my collection" / "Remove from my collection".
 *      Persisted in SQLite via /api/collection/[id].
 *
 *   2. VNDB wishlist — heart toggle that adds/removes VNDB ulist label 5.
 *      Persisted on VNDB via /api/wishlist/[id]. Never touches the local
 *      `collection` table.
 *
 * The previous build conflated "local status === planning" with "on VNDB
 * wishlist" and used DELETE /api/collection/[id] to clear the wishlist —
 * which wiped owned editions, notes, and metadata. Fixing that data-loss
 * bug is the whole point of this rewrite. The two states are now driven
 * independently: the wishlist state is fetched from VNDB on mount and
 * never derived from the local status.
 */
export function CoverQuickActions({ vnId, inCollection }: Props) {
  const t = useT();
  const toast = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [wishlist, setWishlist] = useState<WishlistState>({
    loading: true,
    available: false,
    onWishlist: false,
  });

  // VNDB wishlist isn't meaningful for synthetic egs_* VNs (no VNDB id).
  const wishlistSupported = /^v\d+$/i.test(vnId);

  useEffect(() => {
    if (!wishlistSupported) {
      setWishlist({ loading: false, available: false, onWishlist: false });
      return;
    }
    const ac = new AbortController();
    setWishlist((prev) => ({ ...prev, loading: true }));
    (async () => {
      try {
        const r = await fetch(`/api/vn/${vnId}/vndb-status`, {
          cache: 'no-store',
          signal: ac.signal,
        });
        if (!r.ok) {
          if (!ac.signal.aborted) {
            setWishlist({ loading: false, available: false, onWishlist: false });
          }
          return;
        }
        const data = (await r.json()) as {
          needsAuth?: boolean;
          entry?: { labels: { id: number }[] } | null;
        };
        if (ac.signal.aborted) return;
        if (data.needsAuth) {
          setWishlist({ loading: false, available: false, onWishlist: false });
        } else {
          const onWishlist = !!data.entry?.labels?.some((l) => l.id === 5);
          setWishlist({ loading: false, available: true, onWishlist });
        }
      } catch {
        if (!ac.signal.aborted) {
          setWishlist({ loading: false, available: false, onWishlist: false });
        }
      }
    })();
    return () => ac.abort();
  }, [vnId, wishlistSupported]);

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

  async function toggleVndbWishlist() {
    if (!wishlist.available) return;
    setBusy('wish');
    const wasOn = wishlist.onWishlist;
    try {
      const r = await fetch(`/api/wishlist/${vnId}`, {
        method: wasOn ? 'DELETE' : 'POST',
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t.common.error);
      setWishlist((prev) => ({ ...prev, onWishlist: !wasOn }));
      toast.success(wasOn ? t.coverActions.unwishlisted : t.coverActions.wishlisted);
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
      {wishlistSupported && (wishlist.loading || wishlist.available) && (
        <button
          type="button"
          className={`btn ${wishlist.onWishlist ? 'btn-primary' : ''}`}
          onClick={toggleVndbWishlist}
          disabled={busy !== null || wishlist.loading || !wishlist.available}
          title={wishlist.onWishlist ? t.coverActions.unwish : t.coverActions.wishlist}
          aria-pressed={wishlist.onWishlist}
        >
          {busy === 'wish' || wishlist.loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Heart className={`h-4 w-4 ${wishlist.onWishlist ? 'fill-current' : ''}`} />
          )}
          {wishlist.onWishlist ? t.coverActions.wishlisted : t.coverActions.wishlist}
        </button>
      )}
    </>
  );
}
