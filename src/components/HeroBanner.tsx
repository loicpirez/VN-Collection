'use client';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Crosshair, Loader2, RotateCcw, RotateCw, ShieldAlert, X } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { isExplicit, useDisplaySettings } from '@/lib/settings/client';
import { useToast } from './ToastProvider';
import {
  VN_BANNER_CHANGED_EVENT,
  type VnBannerChangedDetail,
  dispatchBannerChanged,
} from '@/lib/cover-banner-events';
import { buildRotationStyle } from './SafeImage';
import { ErrorAlert } from './ErrorAlert';

interface Props {
  vnId: string;
  src: string | null;
  /** True if a user-selected banner is set. */
  customBanner: boolean;
  initialPosition: string | null;
  inCollection: boolean;
  /** Sexual content flag of the underlying image, for blur-R18 handling. */
  sexual?: number | null;
  /** Persisted rotation (0/90/180/270). Default 0. */
  initialRotation?: 0 | 90 | 180 | 270;
}

const DEFAULT_POSITION = '50% 50%';

function clamp(n: number): number {
  if (Number.isNaN(n)) return 50;
  return Math.max(0, Math.min(100, n));
}

export function HeroBanner({ vnId, src, customBanner, initialPosition, inCollection, sexual, initialRotation = 0 }: Props) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const { settings } = useDisplaySettings();
  const [r18Reveal, setR18Reveal] = useState(false);
  const explicit = isExplicit(sexual ?? null, settings.nsfwThreshold);
  const shouldBlurR18 = explicit && settings.blurR18 && !r18Reveal;
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [position, setPosition] = useState<string>(initialPosition || DEFAULT_POSITION);
  const [draftPosition, setDraftPosition] = useState<string>(position);
  const [error, setError] = useState<string | null>(null);
  // Optimistic local mirror of the banner src + rotation so cover/banner
  // mutations from elsewhere (MediaGallery, BannerSourcePicker) repaint
  // the hero immediately, before router.refresh() has resolved the
  // server tree. The "Set as banner" event payload includes `newSrc`
  // and `newLocal`; we prefer `newLocal` (served via /api/files/<path>)
  // when it's present, falling back to `newSrc`.
  const [liveSrc, setLiveSrc] = useState<string | null>(src);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(initialRotation);
  const [bannerLoaded, setBannerLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    setPosition(initialPosition || DEFAULT_POSITION);
  }, [initialPosition]);

  // Keep `liveSrc` and `rotation` synced with the server-rendered prop
  // whenever a router.refresh() lands new data. Without this the
  // optimistic state from a previous event would survive past a real
  // server update.
  useEffect(() => {
    setLiveSrc(src);
    setRotation(initialRotation);
  }, [src, initialRotation]);
  useEffect(() => {
    setBannerLoaded(false);
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setBannerLoaded(true);
    }
  }, [liveSrc]);

  // Listen for vn:banner-changed dispatched by sibling mutation
  // surfaces. Scoped to this vnId so navigating to another VN in the
  // same session doesn't accidentally re-skin the wrong banner.
  useEffect(() => {
    function onChanged(e: Event) {
      const detail = (e as CustomEvent<VnBannerChangedDetail>).detail;
      if (!detail || detail.vnId !== vnId) return;
      // `newLocal` is a relative storage path → served via /api/files/.
      // Otherwise fall back to the remote URL or `null` for reset.
      const next = detail.newLocal ? `/api/files/${detail.newLocal}` : (detail.newSrc ?? null);
      setLiveSrc(next);
      if (typeof detail.rotation === 'number') {
        setRotation(detail.rotation as 0 | 90 | 180 | 270);
      }
      if (typeof detail.position === 'string' || detail.position === null) {
        setPosition(detail.position || DEFAULT_POSITION);
      }
    }
    window.addEventListener(VN_BANNER_CHANGED_EVENT, onChanged as EventListener);
    return () => window.removeEventListener(VN_BANNER_CHANGED_EVENT, onChanged as EventListener);
  }, [vnId]);

  // Local size snapshot for rotation scaling math. Matches what
  // SafeImage's ResizeObserver does internally; here we measure the
  // hero container directly because the hero uses a plain `<img>`
  // (not SafeImage) for object-position drag support.
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    if (rotation !== 90 && rotation !== 270) {
      setContainerSize(null);
      return;
    }
    const el = ref.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') {
      const r = el.getBoundingClientRect();
      setContainerSize({ w: r.width, h: r.height });
      return;
    }
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const r = entry.contentRect;
        setContainerSize({ w: r.width, h: r.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [rotation]);

  async function rotateBy(delta: 90 | -90) {
    if (busy) return;
    const prevRotation = rotation;
    const next = (((rotation + delta) % 360) + 360) % 360 as 0 | 90 | 180 | 270;
    // Optimistic update first; revert on failure.
    setRotation(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/banner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rotation: next }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || t.common.error);
      }
      dispatchBannerChanged({ vnId, newSrc: liveSrc, newLocal: null, rotation: next });
      toast.success(t.toast.bannerSaved);
      startTransition(() => router.refresh());
    } catch (e) {
      setRotation(prevRotation);
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  function fromEvent(e: { clientX: number; clientY: number }): string | null {
    const el = ref.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = clamp(((e.clientX - rect.left) / rect.width) * 100);
    const y = clamp(((e.clientY - rect.top) / rect.height) * 100);
    return `${Math.round(x * 10) / 10}% ${Math.round(y * 10) / 10}%`;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!editing) return;
    e.preventDefault();
    draggingRef.current = true;
    // Capture on the container so subsequent move events keep coming here
    // even if the pointer leaves the element.
    ref.current?.setPointerCapture(e.pointerId);
    const p = fromEvent(e);
    if (p) setDraftPosition(p);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!editing || !draggingRef.current) return;
    const p = fromEvent(e);
    if (p) setDraftPosition(p);
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!editing) return;
    draggingRef.current = false;
    ref.current?.releasePointerCapture?.(e.pointerId);
  }
  // Keyboard equivalent of pointer-drag focal-point adjustment
  // (WCAG 2.1.1 — Keyboard). Arrow keys nudge 1% per press; Shift+
  // Arrow nudges 10% per press; PageUp/PageDown jump 25%; Home/End
  // jump to the edges along the X axis.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!editing) return;
    const [xRawK, yRawK] = draftPosition.split(' ');
    let x = parseFloat(xRawK);
    let y = parseFloat(yRawK);
    if (!Number.isFinite(x)) x = 50;
    if (!Number.isFinite(y)) y = 50;
    const step = e.shiftKey ? 10 : 1;
    let handled = true;
    switch (e.key) {
      case 'ArrowLeft': x = clamp(x - step); break;
      case 'ArrowRight': x = clamp(x + step); break;
      case 'ArrowUp': y = clamp(y - step); break;
      case 'ArrowDown': y = clamp(y + step); break;
      case 'PageUp': y = clamp(y - 25); break;
      case 'PageDown': y = clamp(y + 25); break;
      case 'Home': x = 0; break;
      case 'End': x = 100; break;
      default: handled = false;
    }
    if (handled) {
      e.preventDefault();
      setDraftPosition(`${Math.round(x * 10) / 10}% ${Math.round(y * 10) / 10}%`);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/banner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: draftPosition }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t.common.error);
      }
      setPosition(draftPosition);
      setEditing(false);
      toast.success(t.toast.bannerSaved);
      startTransition(() => router.refresh());
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collection/${vnId}/banner`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: null }),
      });
      if (!res.ok) throw new Error(t.common.error);
      setPosition(DEFAULT_POSITION);
      setDraftPosition(DEFAULT_POSITION);
      setEditing(false);
      toast.success(t.toast.bannerReset);
      startTransition(() => router.refresh());
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  const activePos = editing ? draftPosition : position;
  const { xPct, yPct } = useMemo(() => {
    const [xRaw, yRaw] = activePos.split(' ');
    return { xPct: parseFloat(xRaw), yPct: parseFloat(yRaw) };
  }, [activePos]);
  const focalAnnouncement = useMemo(() => {
    if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return '';
    return t.banner.focalPointPosition
      .replace('{x}', String(Math.round(xPct)))
      .replace('{y}', String(Math.round(yPct)));
  }, [xPct, yPct, t.banner.focalPointPosition]);
  const rotatedStyle = buildRotationStyle(rotation, containerSize?.w ?? null, containerSize?.h ?? null);

  if (settings.hideImages && !editing) {
    return (
      <div className="group relative h-64 w-full overflow-hidden bg-bg-elev/40">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/60 to-transparent" />
        {liveSrc && (
          <div
            className="absolute right-3 top-3 z-10 flex items-center gap-1.5 can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {inCollection && (
              <button
                type="button"
                onClick={() => { setDraftPosition(position); setEditing(true); }}
                className="inline-flex items-center gap-1 rounded-md bg-bg-card/90 px-2 py-1 text-[11px] font-semibold text-white shadow-card backdrop-blur transition-colors hover:bg-accent hover:text-bg"
                title={t.banner.adjust}
                aria-label={t.banner.adjust}
              >
                <Crosshair className="h-3 w-3" aria-hidden /> {t.banner.adjust}
              </button>
            )}
            {inCollection && (
              <>
                <button
                  type="button"
                  onClick={() => rotateBy(-90)}
                  disabled={busy}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-bg-card/90 text-muted shadow-card backdrop-blur transition-colors hover:text-white disabled:opacity-50"
                  title={t.coverActions.rotateLeft}
                  aria-label={t.coverActions.rotateLeft}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => rotateBy(90)}
                  disabled={busy}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-bg-card/90 text-muted shadow-card backdrop-blur transition-colors hover:text-white disabled:opacity-50"
                  title={t.coverActions.rotateRight}
                  aria-label={t.coverActions.rotateRight}
                >
                  <RotateCw className="h-3.5 w-3.5" aria-hidden />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      tabIndex={editing ? 0 : -1}
      role={editing ? 'application' : undefined}
      aria-label={editing ? t.banner.focalPointLabel : undefined}
      aria-describedby={editing ? `${vnId}-focal-pos` : undefined}
      aria-keyshortcuts={editing ? 'ArrowLeft ArrowRight ArrowUp ArrowDown PageUp PageDown Home End' : undefined}
      className={`group relative h-64 w-full overflow-hidden ${
        editing ? 'cursor-crosshair touch-none focus:outline focus:outline-2 focus:outline-accent' : ''
      }`}
    >
      {liveSrc ? (
        <>
          {!bannerLoaded && (
            <div
              data-hero-banner-skeleton
              className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-bg-elev/80 via-bg-card/55 to-bg-elev/70"
              aria-hidden
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={liveSrc}
            alt=""
            aria-hidden
            draggable={false}
            className={`pointer-events-none h-full w-full select-none object-cover transition-[object-position,filter,opacity,transform] duration-200 ${
              bannerLoaded
                ? editing
                  ? ''
                  : shouldBlurR18
                    ? 'scale-110 blur-2xl opacity-70'
                    : !customBanner
                      ? 'scale-110 blur-xl opacity-50'
                      : 'opacity-100'
                : 'opacity-0'
            }`}
            style={{
              objectPosition: activePos,
              // Rotation transform is composed onto whatever scale/blur
              // the className above adds. `buildRotationStyle` returns
              // `{}` when rotation is 0 so the existing blur classes
              // keep working unchanged.
              ...rotatedStyle,
            }}
            onLoad={() => setBannerLoaded(true)}
          />
          {!customBanner && bannerLoaded && !editing && !shouldBlurR18 && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={liveSrc}
              alt=""
              aria-hidden
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain object-center opacity-95 drop-shadow-[0_16px_32px_rgba(0,0,0,0.45)]"
              style={rotatedStyle}
            />
          )}
        </>
      ) : (
        <div className="pointer-events-none h-full w-full bg-gradient-to-b from-bg-elev to-bg-card" />
      )}

      {shouldBlurR18 && !editing && (
        <button
          type="button"
          aria-label={t.settings.r18Blurred}
          onClick={(e) => {
            e.stopPropagation();
            setR18Reveal(true);
          }}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/40 text-white backdrop-blur-sm hover:bg-black/30"
        >
          <ShieldAlert className="h-5 w-5 text-accent" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider">{t.settings.r18Blurred}</span>
          <span className="text-[10px] opacity-80">{t.settings.clickToReveal}</span>
        </button>
      )}

      <div
        className={`pointer-events-none absolute inset-0 bg-gradient-to-t from-bg-card via-bg-card/70 to-transparent ${
          editing ? 'opacity-30' : ''
        }`}
      />

      {editing && Number.isFinite(xPct) && Number.isFinite(yPct) && (
        <>
          {/* horizontal/vertical guide lines */}
          <div className="pointer-events-none absolute inset-y-0" style={{ left: `${xPct}%` }}>
            <div className="h-full w-px bg-accent/70" />
          </div>
          <div className="pointer-events-none absolute inset-x-0" style={{ top: `${yPct}%` }}>
            <div className="h-px w-full bg-accent/70" />
          </div>
          {/* focal point marker */}
          <div
            className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-accent/30 shadow-[0_0_0_2px_rgba(0,0,0,0.6)]"
            style={{ left: `${xPct}%`, top: `${yPct}%` }}
          />
        </>
      )}

      {editing && (
        <p id={`${vnId}-focal-pos`} className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {focalAnnouncement}
        </p>
      )}

      {liveSrc && (
        <div
          className={`absolute right-3 top-3 z-10 flex flex-wrap items-center gap-1.5 transition-opacity ${
            editing
              ? 'opacity-100'
              : 'can-hover:md:opacity-0 can-hover:md:group-hover:opacity-100 md:group-focus-within:opacity-100 can-hover:md:hover:opacity-100'
          }`}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {!editing ? (
            <>
              {inCollection && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftPosition(position);
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-bg-card/90 px-2 py-1 text-[11px] font-semibold text-white shadow-card backdrop-blur transition-colors hover:bg-accent hover:text-bg"
                  title={t.banner.adjust}
                  aria-label={t.banner.adjust}
                >
                  <Crosshair className="h-3 w-3" aria-hidden /> {t.banner.adjust}
                </button>
              )}
              {inCollection && (
                <>
                  <button
                    type="button"
                    onClick={() => rotateBy(-90)}
                    disabled={busy}
                    className="tap-target inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-card/90 text-muted shadow-card backdrop-blur transition-colors hover:text-white disabled:opacity-50"
                    title={t.coverActions.rotateLeft}
                    aria-label={t.coverActions.rotateLeft}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateBy(90)}
                    disabled={busy}
                    className="tap-target inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-card/90 text-muted shadow-card backdrop-blur transition-colors hover:text-white disabled:opacity-50"
                    title={t.coverActions.rotateRight}
                    aria-label={t.coverActions.rotateRight}
                  >
                    <RotateCw className="h-3 w-3" aria-hidden />
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="rounded-md bg-bg-card/90 px-2 py-1 font-mono text-[10px] text-muted shadow-card backdrop-blur">
                {draftPosition}
              </span>
              {inCollection ? (
                <>
                  <button
                    type="button"
                    onClick={save}
                    disabled={busy || pending}
                    className="tap-target inline-flex h-7 items-center gap-1 rounded-md bg-accent px-3 text-[11px] font-bold text-bg shadow-card transition-colors hover:bg-accent/90 disabled:opacity-50"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <Check className="h-3 w-3" aria-hidden />}
                    {t.common.save}
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    disabled={busy || pending}
                    className="tap-target inline-flex h-7 items-center gap-1 rounded-md bg-bg-card/90 px-2 text-[11px] font-semibold text-muted shadow-card backdrop-blur transition-colors hover:text-white"
                    title={t.banner.resetPosition}
                    aria-label={t.banner.resetPosition}
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden />
                  </button>
                </>
              ) : (
                <span className="rounded-md bg-bg-card/90 px-2 py-1 text-[10px] text-muted shadow-card backdrop-blur">
                  {t.form.notInCollection}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setDraftPosition(position);
                  setEditing(false);
                }}
                className="tap-target inline-flex h-7 w-7 items-center justify-center rounded-md bg-bg-card/90 text-muted shadow-card backdrop-blur transition-colors hover:text-white"
                title={t.common.cancel}
                aria-label={t.common.cancel}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </>
          )}
          {error && (
            <ErrorAlert title={t.common.error}>{error}</ErrorAlert>
          )}
        </div>
      )}

      {editing && (
        <div
          className="pointer-events-none absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-md bg-bg-card/90 px-3 py-1 text-[11px] text-white shadow-card backdrop-blur"
        >
          <span className="block">{t.banner.editHint}</span>
          <span className="block opacity-80">{t.banner.editKeyboardHint}</span>
        </div>
      )}
    </div>
  );
}
