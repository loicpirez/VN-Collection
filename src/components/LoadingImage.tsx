'use client';
import { useEffect, useState, type CSSProperties } from 'react';

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
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setErrored(false);
  }, [src]);

  return (
    <span className={`relative inline-block overflow-hidden ${className}`} style={style}>
      {!loaded && !errored && (
        <span
          data-loading-image-skeleton
          className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-br from-bg-elev/80 via-bg-elev/35 to-bg-elev/70"
          aria-hidden
        />
      )}
      <img
        src={src}
        alt={alt}
        width={width}
        height={height}
        aria-hidden={ariaHidden || undefined}
        decoding="async"
        loading={loading}
        className={`${imageClassName} transition-opacity duration-200 ${loaded && !errored ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />
    </span>
  );
}
