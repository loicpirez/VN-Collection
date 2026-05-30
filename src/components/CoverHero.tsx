'use client';
import { useEffect, useRef, useState } from 'react';
import { SafeImage } from './SafeImage';
import { CoverEditOverlay } from './CoverEditOverlay';
import {
  VN_COVER_CHANGED_EVENT,
  type VnCoverChangedDetail,
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
 *
 * Source-resolution fallback: the server hands down a single resolved
 * source (custom > vndb > egs priority), but its remote URL can still
 * 404 at render time (a dead EGS cover proxy, a stale custom URL). When
 * the remote fails AND a mirrored `local` copy exists, the remote is
 * dropped so `SafeImage` renders the local bytes rather than its
 * no-image placeholder. The placeholder is reserved for the genuine
 * "no usable source anywhere" case, never shown while another image is
 * available.
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
  const [remote, setRemote] = useState<string | null>(initialRemote);
  const [local, setLocal] = useState<string | null>(initialLocal);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(initialRotation);
  const [remoteFailed, setRemoteFailed] = useState(false);
  // Keep client state synced with server-rendered props on refresh.
  useEffect(() => setRemote(initialRemote), [initialRemote]);
  useEffect(() => setLocal(initialLocal), [initialLocal]);
  useEffect(() => setRotation(initialRotation), [initialRotation]);
  useEffect(() => setRemoteFailed(false), [remote, local]);

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

  const effectiveRemote = remoteFailed ? null : remote;
  return (
    <div className="group relative">
      <SafeImage
        src={effectiveRemote}
        localSrc={local}
        alt={alt}
        sexual={sexual}
        rotation={rotation}
        className={className}
        priority
        onLoadError={() => {
          if (!remoteFailed && local) setRemoteFailed(true);
        }}
      />
      {inCollection && <CoverEditOverlay vnId={vnId} />}
      {/*
        The standalone `<CoverRotationButtons>` is mounted by the VN
        detail page next to this hero so both display branches
        (simple here, compare in `<CoverCompare>`) get the same
        rotation surface. We no longer carry an inline duplicate.
      */}
    </div>
  );
}
