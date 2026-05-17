'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Eye, EyeOff, ImageOff, ShieldAlert } from 'lucide-react';
import { isExplicit, useDisplaySettings } from '@/lib/settings/client';
import { useT } from '@/lib/i18n/client';

export interface SafeImageProps {
  src?: string | null;
  localSrc?: string | null;
  alt: string;
  sexual?: number | null;
  className?: string;
  style?: CSSProperties;
  fit?: 'cover' | 'contain';
  onLoadError?: () => void;
  /**
   * When true, skip the IntersectionObserver-based lazy preload and request
   * the image immediately. Use for above-the-fold imagery (the cover on
   * the VN detail page, the lightbox).
   */
  priority?: boolean;
  /**
   * Rotation in degrees clockwise. Only 0/90/180/270 are honoured —
   * other values fall back to 0. For 90/270 rotations the image is
   * rotated AND scaled by the container's aspect ratio so the rotated
   * landscape still fills a portrait container without leaving black
   * bars. The parent container is already `overflow-hidden` per the
   * existing `relative overflow-hidden` wrapper, so the rotated image
   * is safely clipped on the long axis.
   */
  rotation?: 0 | 90 | 180 | 270;
}

function publicLocal(rel: string | null | undefined): string | null {
  if (!rel) return null;
  return `/api/files/${rel}`;
}

/**
 * Image with three responsibilities:
 *   1. NSFW gating (hideImages / blurR18 / nsfwThreshold from settings).
 *   2. Local-first source resolution: when `localSrc` is provided and the
 *      "Prefer local images" setting is on, render the mirrored copy from
 *      /api/files/{path} instead of the remote VNDB CDN.
 *   3. Lazy loading via IntersectionObserver. Native `loading="lazy"`
 *      ships in every modern browser but breaks subtly on grids inside
 *      overflow-scroll containers, transformed parents, and SSR/hydration
 *      mismatches — symptom: image stays blank while the user scrolls past.
 *      We replace it with a hand-rolled observer that triggers when the
 *      element comes within 500 px of the viewport, then sets `src`
 *      directly so the browser fetches eagerly with a known intent.
 */
/**
 * Build the inline transform style + container measurer for a rotated
 * image. Exported so unit tests can pin the contract without rendering
 * the React component. The CSS contract:
 *
 *   - 0 / 180     → plain `rotate(<deg>)`; container aspect unchanged.
 *   - 90 / 270    → `rotate(<deg>)` plus a `scale(W/H)` to swap the
 *     effective aspect inside a fixed-aspect container. The scale is
 *     applied to the larger dimension so a 90deg-rotated landscape
 *     fills a portrait wrapper. When width/height aren't available
 *     yet (SSR / first paint) we skip the scale; the user sees the
 *     rotated image with a brief letterbox until the container is
 *     measured, which the layout shifts away on the first
 *     ResizeObserver tick.
 */
export function buildRotationStyle(
  rotation: number,
  width: number | null,
  height: number | null,
): CSSProperties {
  const r = rotation % 360;
  if (r === 0) return {};
  if (r === 180) return { transform: 'rotate(180deg)' };
  if (r !== 90 && r !== 270) return {};
  if (!width || !height) return { transform: `rotate(${r}deg)` };
  // When the image is rotated 90/270 inside a CSS box, the rotated
  // image's "effective width" becomes the container's HEIGHT (and
  // vice versa). To cover the container we need to scale the rotated
  // image by max(W/H, H/W). The image's native object-fit handles
  // the rest.
  const scale = Math.max(width / height, height / width);
  return { transform: `rotate(${r}deg) scale(${scale})` };
}

export function SafeImage({
  src,
  localSrc,
  alt,
  sexual,
  className = '',
  style,
  fit = 'cover',
  onLoadError,
  priority = false,
  rotation = 0,
}: SafeImageProps) {
  const t = useT();
  const { settings } = useDisplaySettings();
  const [reveal, setReveal] = useState(false);
  const [errored, setErrored] = useState(false);
  const [inView, setInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Track the container's rendered size so 90/270 rotations can scale
  // up to fill the box. The state is only "live" when rotation is
  // 90/270 — keeps the ResizeObserver out of the hot path for the
  // 99% of images that aren't rotated.
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const rotationActive = rotation === 90 || rotation === 270;
  useEffect(() => {
    if (!rotationActive) {
      setContainerSize(null);
      return;
    }
    const el = containerRef.current;
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
  }, [rotationActive]);

  const local = publicLocal(localSrc);
  const url = settings.preferLocalImages ? local || src || '' : src || local || '';
  const explicit = isExplicit(sexual, settings.nsfwThreshold);
  const shouldBlur = explicit && settings.blurR18 && !reveal;

  // Reset error / inView state when the underlying URL changes — without
  // this a recycled card in a virtualised list would inherit a stale
  // "errored" flag AND a stale "in view" flag from the previous VN
  // (the previous version only reset `inView` when `priority` was set,
  // so non-priority recycled cards eagerly loaded without the lazy
  // gating actually firing).
  useEffect(() => {
    setErrored(false);
    setInView(!!priority);
  }, [url, priority]);

  useEffect(() => {
    if (priority || inView) return;
    const el = containerRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: '500px 0px', threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [priority, inView]);

  if (settings.hideImages) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-bg-elev text-muted ${className}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <EyeOff className="h-6 w-6" aria-hidden />
        <span className="text-[11px]">{t.settings.hiddenImage}</span>
      </div>
    );
  }

  if (errored || !url) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-1 bg-bg-elev text-muted ${className}`}
        style={style}
        role="img"
        aria-label={alt}
      >
        <ImageOff className="h-6 w-6" aria-hidden />
        <span className="text-[11px]">{t.common.noImage}</span>
      </div>
    );
  }

  const rotationStyle = buildRotationStyle(rotation, containerSize?.w ?? null, containerSize?.h ?? null);

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`} style={style}>
      {/* Omit the src attribute entirely until the element is in
          view. Setting src=undefined caused some browsers to
          interpret the prop as the document URL and issue a
          spurious request for the host page. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {inView ? (
        <img
          src={url}
          alt={alt}
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} transition-[filter,transform] duration-200 ${shouldBlur ? 'scale-105 blur-2xl' : ''}`}
          style={rotationStyle}
          onError={() => {
            setErrored(true);
            onLoadError?.();
          }}
        />
      ) : (
        <div
          className={`h-full w-full bg-bg-elev/40 transition-[filter,transform] duration-200 ${shouldBlur ? 'scale-105 blur-2xl' : ''}`}
          aria-hidden
        />
      )}
      {shouldBlur && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setReveal(true);
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 text-white backdrop-blur-sm hover:bg-black/40"
        >
          <ShieldAlert className="h-6 w-6 text-accent" aria-hidden />
          <span className="text-xs font-bold uppercase tracking-wider">{t.settings.r18Blurred}</span>
          <span className="inline-flex items-center gap-1 text-[11px] opacity-80">
            <Eye className="h-3 w-3" /> {t.settings.clickToReveal}
          </span>
        </button>
      )}
    </div>
  );
}
