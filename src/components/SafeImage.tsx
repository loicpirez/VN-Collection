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
}: SafeImageProps) {
  const t = useT();
  const { settings } = useDisplaySettings();
  const [reveal, setReveal] = useState(false);
  const [errored, setErrored] = useState(false);
  const [inView, setInView] = useState(priority);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const local = publicLocal(localSrc);
  const url = settings.preferLocalImages ? local || src || '' : src || local || '';
  const explicit = isExplicit(sexual, settings.nsfwThreshold);
  const shouldBlur = explicit && settings.blurR18 && !reveal;

  // Reset error / inView state when the underlying URL changes — without
  // this a recycled card in a virtualised list would inherit a stale
  // "errored" flag from the previous VN.
  useEffect(() => {
    setErrored(false);
    if (priority) setInView(true);
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

  return (
    <div ref={containerRef} className={`relative overflow-hidden ${className}`} style={style}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={inView ? url : undefined}
        alt={alt}
        decoding="async"
        // Once the observer says "in view" we want the network to start
        // immediately, so `eager`. Priority images skip the observer
        // entirely and also load eagerly from the first paint.
        loading={priority || inView ? 'eager' : 'lazy'}
        className={`h-full w-full ${fit === 'cover' ? 'object-cover' : 'object-contain'} transition-[filter,transform] duration-200 ${shouldBlur ? 'scale-105 blur-2xl' : ''}`}
        onError={() => {
          setErrored(true);
          onLoadError?.();
        }}
      />
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
