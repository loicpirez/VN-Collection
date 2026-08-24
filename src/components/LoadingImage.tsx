'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';
import { useT } from '@/lib/i18n/client';
import { cacheLoadedImage, isImageLoadCached } from '@/lib/image-load-cache';

export interface LoadingImageProps {
  /** Resolved image URL to render. */
  src: string;
  /** Accessible image description. Use an empty string only for decorative images. */
  alt: string;
  /** Wrapper class names. */
  className?: string;
  /** Inner image class names. */
  imageClassName?: string;
  /** Fixed rendered width in pixels. */
  width?: number;
  /** Fixed rendered height in pixels. */
  height?: number;
  /** Wrapper inline style. */
  style?: CSSProperties;
  /** Native loading hint. */
  loading?: 'eager' | 'lazy';
  /** Whether the rendered image is decorative. */
  ariaHidden?: boolean;
}

/**
 * Small image wrapper that keeps a skeleton visible until the browser
 * has decoded the image, preventing alt text and one-by-one image pops
 * on surfaces that do not need the full SafeImage feature set.
 */
export function LoadingImage({
  src,
  alt,
  className = '',
  imageClassName = 'h-full w-full object-cover',
  width,
  height,
  style,
  loading = 'lazy',
  ariaHidden = false,
}: LoadingImageProps) {
  const t = useT();
  const srcRef = useRef(src);
  const [loaded, setLoaded] = useState(() => isImageLoadCached(src));
  const [errored, setErrored] = useState(false);
  const unavailableLabel = alt
    ? `${t.common.imageUnavailable}: ${alt}`
    : t.common.imageUnavailable;

  useEffect(() => {
    srcRef.current = src;
    setLoaded(isImageLoadCached(src));
    setErrored(false);
  }, [src]);

  async function handleLoad(img: HTMLImageElement): Promise<void> {
    if (typeof img.decode === 'function') {
      try {
        await img.decode();
      } catch {
        // A failed decode should fall through to the browser's loaded image
        // state instead of leaving the skeleton mounted forever.
      }
    }
    if (srcRef.current !== src) return;
    cacheLoadedImage(src);
    setLoaded(true);
  }

  return (
    <span className={`relative inline-block overflow-hidden ${className}`} style={style}>
      {!loaded && !errored && (
        <span
          data-loading-image-skeleton
          className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-bg-elev/80 via-bg-elev/35 to-bg-elev/70"
          aria-hidden
        />
      )}
      {errored ? (
        <span
          data-loading-image-error
          role={ariaHidden ? undefined : 'img'}
          aria-label={ariaHidden ? undefined : unavailableLabel}
          aria-hidden={ariaHidden || undefined}
          className="absolute inset-0 flex items-center justify-center bg-bg-elev text-muted"
        >
          <ImageOff className="h-1/3 w-1/3" aria-hidden />
        </span>
      ) : (
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          aria-hidden={ariaHidden || undefined}
          decoding="async"
          loading={loading}
          className={`${imageClassName} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={(event) => { void handleLoad(event.currentTarget); }}
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
}
