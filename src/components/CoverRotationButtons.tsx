'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw, RotateCw } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import {
  VN_COVER_CHANGED_EVENT,
  type VnCoverChangedDetail,
  dispatchCoverChanged,
} from '@/lib/cover-banner-events';

interface Props {
  vnId: string;
  /** Persisted `vn.cover_rotation` from the server render. */
  initialRotation?: 0 | 90 | 180 | 270;
  /**
   * Anchor placement inside the parent `position: relative` cover
   * container. The buttons render as a small vertical stack pinned
   * to the chosen corner; default `top-right` matches the previous
   * `<CoverHero>` look so the simple-cover branch stays visually
   * identical.
   */
  anchor?: 'top-right' | 'bottom-right' | 'bottom-left';
}

export function CoverRotationButtons({
  vnId,
  initialRotation = 0,
  anchor = 'top-right',
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(initialRotation);
  const [busy, setBusy] = useState(false);

  // Re-sync on server-rendered prop change (router.refresh path).
  useEffect(() => setRotation(initialRotation), [initialRotation]);

  // Subscribe to the shared cover-changed event so a sibling
  // surface that flips rotation (the legacy `<CoverHero>` overlay
  // or the source-picker modal) keeps this control in step.
  useEffect(() => {
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<VnCoverChangedDetail>).detail;
      if (!detail || detail.vnId !== vnId) return;
      if (typeof detail.rotation === 'number') {
        setRotation(detail.rotation as 0 | 90 | 180 | 270);
      }
    }
    window.addEventListener(VN_COVER_CHANGED_EVENT, onChanged as EventListener);
    return () =>
      window.removeEventListener(VN_COVER_CHANGED_EVENT, onChanged as EventListener);
  }, [vnId]);

  async function apply(next: 0 | 90 | 180 | 270) {
    if (busy || next === rotation) return;
    const prev = rotation;
    setRotation(next);
    setBusy(true);
    try {
      const r = await fetch(`/api/collection/${vnId}/cover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: next }),
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || t.common.error);
      }
      // Tell any sibling surface (CoverHero overlay, source-picker
      // modal, Library card preview) the rotation moved. The new
      // `<SafeImage rotation={…}>` consumers read this event and
      // repaint instantly without a full router.refresh.
      dispatchCoverChanged({ vnId, newSrc: null, newLocal: null, rotation: next });
      startTransition(() => router.refresh());
    } catch (e) {
      setRotation(prev);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function rotateBy(delta: 90 | -90) {
    const next = ((((rotation + delta) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    void apply(next);
  }

  // Anchor classes. The "hover/focus reveal on desktop, always on
  // touch" gate matches `<CoverEditOverlay>` so the cover surface
  // stays visually quiet at rest. `pointer-events-auto` is needed
  // because the container may sit inside a hover-visibility gate.
  const positionClass =
    anchor === 'top-right'
      ? 'right-2 top-12'
      : anchor === 'bottom-right'
        ? 'right-2 bottom-2'
        : 'left-2 bottom-2';

  const hasRotation = rotation !== 0;
  return (
    <div
      data-testid="cover-rotation-controls"
      className={[
        'pointer-events-auto absolute z-30 flex flex-col items-end gap-1',
        positionClass,
        // Hide the WHOLE container on desktop only when there's no
        // active rotation. As soon as the user rotates, the cluster
        // stays visible (with the rotation chip as the anchor) so
        // the reset is always reachable without hovering the cover.
        hasRotation ? '' : 'can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={() => rotateBy(-90)}
        disabled={busy}
        aria-label={t.coverActions.rotateLeft}
        title={t.coverActions.rotateLeft}
        // Rotate buttons keep the hover-fade so the cover is not
        // permanently visually cluttered when no rotation is set.
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-black/70 text-white shadow-card backdrop-blur transition-colors hover:bg-accent hover:text-bg disabled:opacity-50 ${
          hasRotation ? 'can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100' : ''
        }`}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <RotateCcw className="h-3.5 w-3.5" aria-hidden />}
      </button>
      <button
        type="button"
        onClick={() => rotateBy(90)}
        disabled={busy}
        aria-label={t.coverActions.rotateRight}
        title={t.coverActions.rotateRight}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-black/70 text-white shadow-card backdrop-blur transition-colors hover:bg-accent hover:text-bg disabled:opacity-50 ${
          hasRotation ? 'can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100' : ''
        }`}
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => apply(0)}
        disabled={busy || rotation === 0}
        aria-label={t.coverActions.resetRotation}
        title={t.coverActions.resetRotation}
        data-rotation-active={hasRotation ? 'true' : 'false'}
        className="min-h-[44px] rounded-md bg-bg-card/80 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted shadow-card backdrop-blur transition-colors hover:text-white disabled:opacity-45"
      >
        {rotation}°
      </button>
    </div>
  );
}
