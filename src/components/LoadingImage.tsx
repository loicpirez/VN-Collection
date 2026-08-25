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
 * has loaded the image, preventing alt text and one-by-one image pops
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
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [loaded, setLoaded] = useState(() => isImageLoadCached(src));
  const [errored, setErrored] = useState(false);
  const unavailableLabel = alt
    ? `${t.common.imageUnavailable}: ${alt}`
    : t.common.imageUnavailable;

  useEffect(() => {
    setLoaded(isImageLoadCached(src));
    setErrored(false);
  }, [src]);

  function handleLoad(img: HTMLImageElement): void {
    cacheLoadedImage(src);
    setLoaded(true);
    if (typeof img.decode === 'function') {
      try {
        void img.decode().catch(() => undefined);
      } catch {
        // Some browser implementations can throw before returning a promise.
      }
    }
  }

  useEffect(() => {
    const image = imageRef.current;
    if (!image?.complete) return;
    if (image.naturalWidth > 0) handleLoad(image);
    else setErrored(true);
  }, [src]);

  return (
    <span className={`relative inline-block overflow-hidden ${className}`} style={style}>
      {!loaded && !errored && (
        <span
          data-loading-image-skeleton
          className="pointer-events-none absolute inset-0 animate-pulse bg-bg-elev/60"
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
          ref={imageRef}
          src={src}
          alt={alt}
          width={width}
          height={height}
          aria-hidden={ariaHidden || undefined}
          decoding="async"
          loading={loading}
          className={`${imageClassName} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={(event) => handleLoad(event.currentTarget)}
          onError={() => setErrored(true)}
        />
      )}
    </span>
  );
}
