'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw, RotateCw } from 'lucide-react';
import { SafeImage } from './SafeImage';
import { CoverEditOverlay } from './CoverEditOverlay';
import { useT } from '@/lib/i18n/client';
import { useToast } from './ToastProvider';
import {
  VN_COVER_CHANGED_EVENT,
  type VnCoverChangedDetail,
  dispatchCoverChanged,
} from '@/lib/cover-banner-events';

interface Props {
  vnId: string;
  /** Server-rendered remote URL for the cover (VNDB / EGS / custom URL). */
  initialRemote: string | null;
  /** Server-rendered local storage path (relative to `data/storage`). */
  initialLocal: string | null;
  /** Sexual flag from `vn.image_sexual`. */
  sexual: number | null;
  /** VN title — used as the SafeImage `alt`. */
  alt: string;
  /** Persisted rotation. */
  initialRotation?: 0 | 90 | 180 | 270;
  /** True when the user is in collection — controls the rotation overlay
   *  visibility (matches CoverEditOverlay's existing gate). */
  inCollection: boolean;
  /** Extra classes for the SafeImage wrapper (aspect ratio, rounding). */
  className?: string;
}

/**
 * Client wrapper around the VN-detail cover image. Owns three pieces
 * of state that need to react to mutation events without a full page
 * reload:
 *   1. The rendered remote / local src (so MediaGallery's "Set as
 *      cover" repaints instantly).
 *   2. The current rotation (so the "↻" buttons here update the
 *      tile before the server round-trip resolves).
 *   3. The CoverEditOverlay open trigger (delegated to the existing
 *      `vn:open-cover-picker` event dispatcher).
 *
 * Listens for `vn:cover-changed` so any sibling surface (the gallery
 * kebab menu, the source picker, an upload from CoverUploader) flips
 * this hero immediately. router.refresh() runs in parallel as a
 * defensive fallback so server components also see the new state.
 */
export function CoverHero({
  vnId,
  initialRemote,
  initialLocal,
  sexual,
  alt,
  initialRotation = 0,
  inCollection,
  className = 'aspect-[2/3] w-full rounded-xl shadow-card',
}: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [remote, setRemote] = useState<string | null>(initialRemote);
  const [local, setLocal] = useState<string | null>(initialLocal);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(initialRotation);
  const [busy, setBusy] = useState(false);
  // Keep client state synced with server-rendered props on refresh.
  useEffect(() => setRemote(initialRemote), [initialRemote]);
  useEffect(() => setLocal(initialLocal), [initialLocal]);
  useEffect(() => setRotation(initialRotation), [initialRotation]);

  // The mutate-on-error-revert pattern needs a stable snapshot of the
  // previous values so an error toast can roll the UI back. Using a
  // ref keeps the closure simple without React state churn.
  const prevRef = useRef<{ remote: string | null; local: string | null }>({
    remote: initialRemote,
    local: initialLocal,
  });
  useEffect(() => {
    prevRef.current = { remote, local };
  }, [remote, local]);

  useEffect(() => {
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<VnCoverChangedDetail>).detail;
      if (!detail || detail.vnId !== vnId) return;
      // Either side may be present; respect what the producer sent.
      // For an `upload` event the local path is the truth; for a
      // "use VNDB" reset the remote URL is the truth. The empty-
      // both case is a "wait for router.refresh" no-op.
      if (detail.newLocal != null) setLocal(detail.newLocal);
      if (detail.newSrc != null) setRemote(detail.newSrc);
      if (detail.newLocal === null && detail.newSrc === null) {
        // Explicit reset to default — let the next refresh deliver.
        setLocal(null);
        setRemote(null);
      }
      if (typeof detail.rotation === 'number') {
        setRotation(detail.rotation as 0 | 90 | 180 | 270);
      }
    }
    window.addEventListener(VN_COVER_CHANGED_EVENT, onChanged as EventListener);
    return () => window.removeEventListener(VN_COVER_CHANGED_EVENT, onChanged as EventListener);
  }, [vnId]);

  async function rotateBy(delta: 90 | -90) {
    if (busy) return;
    const prev = rotation;
    const next = ((((rotation + delta) % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    setRotation(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch(`/api/collection/${vnId}/cover`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: next }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error || t.common.error);
      }
      dispatchCoverChanged({ vnId, newSrc: remote, newLocal: local, rotation: next });
      startTransition(() => router.refresh());
    } catch (e) {
      setRotation(prev);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group relative">
      <SafeImage
        src={remote}
        localSrc={local}
        alt={alt}
        sexual={sexual}
        rotation={rotation}
        className={className}
        priority
      />
      {inCollection && (
        <>
          <CoverEditOverlay vnId={vnId} />
          {/*
            Per-cover rotation buttons. Same visibility rules as
            CoverEditOverlay (hover/focus on desktop, always on touch)
            so the cover doesn't carry persistent UI clutter.
          */}
          <div className="absolute right-2 top-12 z-30 flex flex-col items-end gap-1 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
            <button
              type="button"
              onClick={() => rotateBy(-90)}
              disabled={busy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white shadow-card backdrop-blur transition-colors hover:bg-accent hover:text-bg disabled:opacity-50"
              title={t.coverActions.rotateLeft}
              aria-label={t.coverActions.rotateLeft}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => rotateBy(90)}
              disabled={busy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white shadow-card backdrop-blur transition-colors hover:bg-accent hover:text-bg disabled:opacity-50"
              title={t.coverActions.rotateRight}
              aria-label={t.coverActions.rotateRight}
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden />
            </button>
            {rotation !== 0 && (
              <button
                type="button"
                onClick={async () => {
                  if (busy) return;
                  const prev = rotation;
                  setRotation(0);
                  setBusy(true);
                  try {
                    const res = await fetch(`/api/collection/${vnId}/cover`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ rotation: 0 }),
                    });
                    if (!res.ok) {
                      const err = (await res.json().catch(() => ({}))) as { error?: string };
                      throw new Error(err.error || t.common.error);
                    }
                    dispatchCoverChanged({ vnId, newSrc: remote, newLocal: local, rotation: 0 });
                    startTransition(() => router.refresh());
                  } catch (e) {
                    setRotation(prev);
                    toast.error((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
                disabled={busy}
                className="rounded-md bg-bg-card/80 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted shadow-card backdrop-blur hover:text-white disabled:opacity-50"
                title={t.coverActions.resetRotation}
              >
                {rotation}°
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
